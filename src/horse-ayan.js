import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeRacingTack } from './horse.js';
import { bodyMotion, makeGallop } from './gallop.js';
import { launchWeight, strideCount } from './stride.js';

const SCALE = 0.444;
const REST_GROUND = 2.217;
let assetPromise;
let asset;

// Extremal skinned vertices sampled across the gallop and the gate transition.
const soleVertices = [
  202, 210, 1135, 1143, 2355, 2607, 3273, 3281, 4524, 4573, 4575,
  4584, 4974, 6138, 6145, 6168, 6174, 8416, 8804, 9938, 9945, 9967,
  9973, 11901, 12585, 13645, 14273,
];
const muzzleVertices = [1879, 1970, 3998, 4087, 7524, 7733, 11244, 11446];

export async function loadAyanHorse(url = new URL('models/horse-ayan.glb', document.baseURI).href) {
  if (!assetPromise) {
    assetPromise = new GLTFLoader().loadAsync(url).then(gltf => {
      const stride = THREE.AnimationClip.findByName(gltf.animations, 'metarigAction.003');
      if (!stride) throw new Error('Ayan running animation is missing');
      // Preserve the authored standing pose for fitting tack and waiting in the gate.
      const rest = new THREE.AnimationMixer(gltf.scene);
      rest.clipAction(stride).play();
      rest.setTime(0);
      asset = { scene: gltf.scene, stride: makeGallop(gltf.scene, SCALE, REST_GROUND) };
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
  stride.weight = 0;
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
  const { tack, waist, breeches } = makeRacingTack(spec);
  tack.scale.set(1.025, 1, 1.02);
  tack.position.set(0,0.044,-0.05);
  mount.add(tack);
  group.updateMatrixWorld(true);
  horse.getObjectByName('spine008_50').attach(tack);
  let travelled = 0;
  const bodyToMount = new THREE.Matrix4(), contact = new THREE.Vector3();
  let noseLead = 0;
  function placeRider(phase, weight) {
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
    const yawCos = Math.cos(group.rotation.y), yawSin = Math.sin(group.rotation.y);
    noseLead = -Infinity;
    for (const vertex of muzzleVertices) {
      body.getVertexPosition(vertex, contact).applyMatrix4(bodyToMount);
      noseLead = Math.max(noseLead, contact.z * yawCos - contact.x * yawSin);
    }
    const {heave, pitch} = bodyMotion(phase);
    const lift = weight * (0.052 - 0.68 * (heave + 0.155));
    breeches.morphTargetInfluences[0] = lift / 0.12;
    waist.position.y = 1.78 + lift;
    waist.position.z = -0.10 - 0.30 * lift;
    waist.rotation.x = weight * (0.26 - pitch + 0.075 * Math.sin(phase * Math.PI * 2 - 1.1));
  }
  function pose(distance, weight) {
    travelled = distance;
    const phase = THREE.MathUtils.euclideanModulo(strideCount(spec.number, distance), 1);
    stride.weight = weight;
    mixer.setTime(phase);
    placeRider(phase, weight);
  }
  function seekDistance(distance, running) {
    pose(distance, running ? launchWeight(distance) : 0);
  }
  function seek(time, running = false, speed = 0) {
    pose(running ? time * speed : 0, running ? 1 : 0);
  }
  function update(dt, running = false, speed = 0) {
    pose(running ? travelled + dt * speed : 0, running ? 1 : 0);
  }
  seek(0);
  return { group, update, seek, seekDistance, get noseLead() { return noseLead; } };
}
