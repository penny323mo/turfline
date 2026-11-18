import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeRacingTack } from './horse.js';

const SCALE = 0.444;
const REST_GROUND = 2.217;
const RETURN_TIME = 0.19;
let assetPromise;
let asset;

// These sole vertices reached the turf in a 360-pose sweep of Ayan's full
// animation and its loop transition. Re-skinning them tracks actual contact
// between samples while preserving the stride's natural flight phase.
const soleVertices = [
  11901, 13645, 2355, 8804, 3273, 9973, 9938, 3281, 9967, 202, 4573,
  4584, 210, 4974, 2607, 1143, 12585, 6138, 1135, 6174, 4524,
];

function closeStride(clip) {
  // The export ends mid-stride. Bridge its final pose to the initial one
  // with the track's native quaternion/linear interpolation.
  const duration = clip.duration + RETURN_TIME;
  const tracks = clip.tracks.map(track => {
    const result = track.clone(), size = track.getValueSize();
    result.times = new Float32Array([...track.times, duration]);
    result.values = new Float32Array([...track.values, ...track.values.slice(0, size)]);
    return result;
  });
  return new THREE.AnimationClip('Ayan running stride', duration, tracks);
}

export async function loadAyanHorse(url = new URL('models/horse-ayan.glb', document.baseURI).href) {
  if (!assetPromise) {
    assetPromise = new GLTFLoader().loadAsync(url).then(gltf => {
      const stride = THREE.AnimationClip.findByName(gltf.animations, 'metarigAction.003');
      if (!stride) throw new Error('Ayan running animation is missing');
      asset = { scene: gltf.scene, stride: closeStride(stride) };
      return asset;
    }).catch(error => {
      assetPromise = undefined;
      throw error;
    });
  }
  return assetPromise;
}

function finishCoat(body, coat) {
  const geometry = body.geometry.clone(), material = body.material.clone();
  const pos = geometry.attributes.position, joints = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
  const base = new THREE.Color(coat), dark = new THREE.Color('#292321'), color = new THREE.Color();
  const rgb = new Float32Array(pos.count * 3), sourcePoint = new THREE.Vector3();
  const boneNames = body.skeleton.bones.map(bone => bone.name);
  for (let i = 0; i < pos.count; i++) {
    body.getVertexPosition(i, sourcePoint).applyMatrix4(body.matrixWorld);
    let maneWeight = 0;
    for (let k = 0; k < 4; k++) {
      const name = boneNames[joints.getComponent(i, k)];
      if (name.startsWith('hair_') || /^(spine_1|spine00[1-4]_)/.test(name))
        maneWeight += weights.getComponent(i, k);
    }
    const sock = 1 - THREE.MathUtils.smoothstep(sourcePoint.y, -1.90, -1.14);
    const muzzle = (1 - THREE.MathUtils.smoothstep(sourcePoint.x, -2.85, -2.50)) * 0.45;
    color.copy(base).lerp(dark, Math.max(sock * 0.92, Math.min(1, maneWeight * 1.25), muzzle));
    color.toArray(rgb, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  material.vertexColors = true;
  material.color.set('#ffffff');
  material.roughness = 0.69;
  body.geometry = geometry;
  body.material = material;
}

export function makeAyanHorse(spec) {
  if (!asset) throw new Error('Call loadAyanHorse() before makeAyanHorse().');
  const group = new THREE.Group(), mount = new THREE.Group(), horse = clone(asset.scene);
  group.name = 'Ayan mounted racehorse';
  mount.add(horse);
  group.add(mount);
  const mixer = new THREE.AnimationMixer(horse);
  const stride = mixer.clipAction(asset.stride).play();
  mixer.update(0);
  horse.updateMatrixWorld(true);
  const body = horse.getObjectByName('Object_11');
  finishCoat(body, spec.coat);
  horse.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  // Replace the source's overlapping western saddle and projecting saddle bag
  // with the fitted racing saddle and number cloth. Keep Ayan's original bridle.
  horse.getObjectByName('Object_7').visible = false;
  horse.getObjectByName('Object_9').visible = false;
  horse.rotation.y = Math.PI / 2;
  horse.scale.setScalar(SCALE);
  horse.position.y = REST_GROUND * SCALE;
  const { tack, waist } = makeRacingTack(spec);
  tack.scale.set(1.025, 1, 1.02);
  tack.position.set(0,0.044,-0.05);
  mount.add(tack);
  group.updateMatrixWorld(true);
  horse.getObjectByName('spine008_50').attach(tack);
  const playbackRate = speed => THREE.MathUtils.clamp(0.9 + speed * 0.025, 0.95, 1.72);
  const bodyToMount = new THREE.Matrix4(), contact = new THREE.Vector3();
  function placeRider(running) {
    // SkinnedMesh refreshes its bind inverse in updateMatrixWorld. Start each
    // solve from the same mount origin so scrubbing also works between renders.
    mount.position.y = 0;
    group.updateWorldMatrix(true, false);
    mount.updateMatrixWorld(true);
    bodyToMount.copy(mount.matrixWorld).invert().multiply(body.matrixWorld);
    let lowest = Infinity;
    for (const vertex of soleVertices) {
      body.getVertexPosition(vertex, contact).applyMatrix4(bodyToMount);
      lowest = Math.min(lowest, contact.y);
    }
    mount.position.y = Math.max(0, -lowest);
    const phase = stride.time / asset.stride.duration * Math.PI * 2;
    waist.rotation.x = running ? 0.34 + Math.sin(phase) * 0.055 : 0;
  }
  function seek(time, running = false, speed = 0) {
    stride.timeScale = 1;
    const phase = running ? THREE.MathUtils.euclideanModulo(time * playbackRate(speed), asset.stride.duration) : 0;
    mixer.setTime(phase);
    placeRider(running);
  }
  function update(dt, running = false, speed = 0) {
    if (!running) {
      seek(0);
      return;
    }
    stride.timeScale = playbackRate(speed);
    mixer.update(dt);
    placeRider(true);
  }
  seek(0);
  return { group, update, seek };
}
