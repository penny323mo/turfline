import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeRacingTack } from './horse.js';
import { bodyMotion, limbs, makeGallop, muzzleVertices, soleVertices } from './gallop.js';
import { raceStride, strideCount, strideLength } from './stride.js';
import { hoofPlant } from './hoof-plant.js';

const SCALE = 0.444;
const REST_GROUND = 2.217;
const collections = [0, 0.25, 0.5, 0.75, 1];
let assetPromise;
let asset;


export async function loadAyanHorse(url = new URL('models/horse-ayan.glb', document.baseURI).href) {
  if (!assetPromise) {
    assetPromise = new GLTFLoader().loadAsync(url).then(gltf => {
      const stride = THREE.AnimationClip.findByName(gltf.animations, 'metarigAction.003');
      if (!stride) throw new Error('Ayan running animation is missing');
      // Preserve the authored standing pose for fitting tack and waiting in the gate.
      const rest = new THREE.AnimationMixer(gltf.scene);
      rest.clipAction(stride).play();
      rest.setTime(0);
      const length = strideLength(1);
      const clips = collections.map(w => makeGallop(gltf.scene, SCALE, REST_GROUND, w, length));
      asset = { scene: gltf.scene, stride: clips[0], clips, byLength: new Map([[length, clips]]) };
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
  const length = strideLength(spec.number);
  if (!asset.byLength.has(length)) asset.byLength.set(length,
    collections.map(w => makeGallop(asset.scene, SCALE, REST_GROUND, w, length)));
  const strides = asset.byLength.get(length).map(clip => mixer.clipAction(clip));
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
  const { tack, waist, upperBody, breeches } = makeRacingTack(spec);
  tack.scale.set(1.025, 1, 1.02);
  tack.position.set(0,0.044,-0.05);
  mount.add(tack);
  group.updateMatrixWorld(true);
  horse.getObjectByName('spine008_50').attach(tack);
  const restPoint = new THREE.Vector3();
  const restNose = Math.max(...muzzleVertices.map(v =>
    body.getVertexPosition(v, restPoint).applyMatrix4(body.matrixWorld).z));
  const plant = hoofPlant(horse, body, mount, spec.number, restNose);
  let travelled = 0;
  const bodyToMount = new THREE.Matrix4(), contact = new THREE.Vector3();
  let noseLead = 0;
  function placeRider(phase, weight, short) {
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
    const {heave, pitch, shoulderRoll} = bodyMotion(phase);
    const a = phase * Math.PI * 2;
    const lift = weight * (1 - 0.58 * short) * (0.055 - 0.72 * (heave + 0.155) + 0.009 * Math.sin(a - 0.65));
    breeches.morphTargetInfluences[0] = lift / 0.12;
    waist.position.y = 1.78 + lift;
    waist.position.z = -0.10 - 0.30 * lift;
    waist.rotation.x = weight * (1 - 0.72 * short) * (0.26 - pitch + 0.09 * Math.sin(a - 1.28));
    waist.rotation.z = -0.6 * shoulderRoll * weight * (1 - 0.64 * short);
    upperBody.morphTargetInfluences[0] = weight * (1 - 0.55 * short) * (0.5 + 0.5 * Math.sin(a - 0.62));
  }
  function pose(distance, weight, count = strideCount(spec.number, distance), short = 0, lean = 0) {
    travelled = distance;
    plant.restore();
    const phase = THREE.MathUtils.euclideanModulo(count, 1);
    // Interpolate adjacent IK solutions. Blending the two extremes lifts the
    // planted forefoot off the turf as the stride length changes.
    const sample = short * (strides.length - 1);
    for (const [i, action] of strides.entries()) {
      action.weight = weight * Math.max(0, 1 - Math.abs(i - sample));
      if (action.weight > 0) action.play();
      action.enabled = action.weight > 0;
    }
    mixer.setTime(phase);
    placeRider(phase, weight, short);
    // The boots stay in the irons as the shoulders turn into the running line.
    waist.rotation.z += lean * 0.24;
    waist.rotation.y = -lean * 0.39;
  }
  function seekDistance(distance, running, stop, lean = 0, curvature = 0) {
    const step = raceStride(spec.number, distance, stop);
    pose(distance, running ? step.weight : 0, step.count, step.short, lean);
    if (running) plant.apply(distance, stop, step, noseLead, curvature);
  }
  function seek(time, running = false, speed = 0) {
    pose(running ? time * speed : 0, running ? 1 : 0);
  }
  function update(dt, running = false, speed = 0) {
    pose(running ? travelled + dt * speed : 0, running ? 1 : 0);
  }
  seek(0);
  function hoofPosition(hoof, target) {
    return body.getVertexPosition(limbs[hoof].sole, target).applyMatrix4(body.matrixWorld);
  }
  return { group, update, seek, seekDistance, hoofPosition, get noseLead() { return noseLead; } };
}
