import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeRacingTack } from './horse.js';
import { bodyMotion, limbs, makeGallop, makeWalk, muzzleVertices, soleVertices } from './gallop.js';
import { raceStride, strideCount, strideLength } from './stride.js';
import { fitRacingReins } from './racing-reins.js';
import { walkStride } from './parade.js';
import { lateralBalance, sampleLead } from './gallop-lead.js';
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
      asset = { walk: makeWalk(gltf.scene, SCALE, REST_GROUND), scene: gltf.scene, stride: clips[0], clips, byLength: new Map([[length, clips]]), turnClips: new Map() };
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
  // The bend is taken at full stride, so the two changes and the inside
  // lead each need just one clip at this runner's natural stride length.
  if (!asset.turnClips.has(length)) asset.turnClips.set(length,
    ['toRight','right','toLeft'].map(kind => [kind,makeGallop(asset.scene,SCALE,REST_GROUND,0,length,kind)]));
  const turns = asset.turnClips.get(length).map(([kind,clip]) => [kind,mixer.clipAction(clip)]);
  const walkAction = mixer.clipAction(asset.walk);
  mixer.update(0);
  horse.updateMatrixWorld(true);
  const body = horse.getObjectByName('Object_11');
  finishCoat(body, spec.coat);
  horse.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  // Keep Ayan's headcollar and cheekpieces. Fit the racing saddle, number
  // cloth and hand-held reins in place of the western tack.
  horse.getObjectByName('Object_7').visible = false;
  horse.getObjectByName('Object_9').visible = false;
  horse.getObjectByName('Object_17').visible = false;
  horse.rotation.y = Math.PI / 2;
  horse.scale.setScalar(SCALE);
  horse.position.y = REST_GROUND * SCALE;
  const { tack, waist, rider, breeches } = makeRacingTack(spec,true);
  tack.scale.set(1.025, 1, 1.02);
  tack.position.set(0,0.044,-0.05);
  mount.add(tack);
  group.updateMatrixWorld(true);
  horse.getObjectByName('spine008_50').attach(tack);
  const followMouth = fitRacingReins(mount,body,rider);
  const restPoint = new THREE.Vector3();
  const restNose = Math.max(...muzzleVertices.map(v =>
    body.getVertexPosition(v, restPoint).applyMatrix4(body.matrixWorld).z));
  const gateJoints = ['spine011_31','spine014_25','earR_14','earL_8'].map(name => {
    const bone = horse.getObjectByName(name);
    const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    return {bone, rest: bone.quaternion.clone(), axis: new THREE.Vector3(1,0,0).applyQuaternion(inv),
      swivel: new THREE.Vector3(0,1,0).applyQuaternion(inv)};
  });
  let waiting = false;
  const turn = new THREE.Quaternion();
  const plant = hoofPlant(horse, body, mount, spec.number, restNose);
  let travelled = 0;
  const bodyToMount = new THREE.Matrix4(), contact = new THREE.Vector3();
  let noseLead = 0;
  const noseTip = new THREE.Vector3();
  function placeRider(phase, weight, short, walking) {
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
      const lead = contact.z * yawCos - contact.x * yawSin;
      if (lead > noseLead) {
        noseLead = lead;
        noseTip.copy(contact);
      }
    }
    const {heave, pitch, shoulderRoll} = bodyMotion(phase);
    const a = phase * Math.PI * 2;
    const lift = walking ? 0.009 + 0.007 * Math.sin(2*a-0.6) : weight * (1 - 0.58 * short) * (0.055 - 0.72 * (heave + 0.155) + 0.009 * Math.sin(a - 0.65));
    breeches.morphTargetInfluences[0] = lift / 0.12;
    waist.position.y = 1.78 + lift;
    waist.position.z = -0.10 - 0.30 * lift;
    waist.rotation.x = walking ? -0.19 + 0.027 * Math.sin(2*a-0.84) : weight * (1 - 0.72 * short) * (0.26 - pitch + 0.09 * Math.sin(a - 1.28));
    waist.rotation.z = walking ? 0.018 * Math.sin(a-0.3) : -0.6 * shoulderRoll * weight * (1 - 0.64 * short);
  }
  function pose(distance, weight, count = strideCount(spec.number, distance), short = 0, lean = 0, walking = false, lead) {
    travelled = distance;
    if (waiting) {
      for (const joint of gateJoints) joint.bone.quaternion.copy(joint.rest);
      waiting = false;
    }
    plant.restore();
    const phase = THREE.MathUtils.euclideanModulo(count, 1);
    // Interpolate adjacent IK solutions. Blending the two extremes lifts the
    // planted forefoot off the turf as the stride length changes.
    const sample = short * (strides.length - 1);
    for (const [i, action] of strides.entries()) {
      action.weight = (!lead || lead.kind === 'left' ? weight : 0) * Math.max(0, 1 - Math.abs(i - sample));
      if (action.weight > 0) action.play();
      action.enabled = action.weight > 0;
    }
    for (const [kind,action] of turns) {
      action.enabled = lead?.kind === kind;
      if (action.enabled) action.play();
    }
    if (walking) walkAction.play();
    walkAction.enabled = walking;
    mixer.setTime(lead?.time ?? phase);
    placeRider(phase, weight, short, walking);
    if (lead) waist.rotation.z *= lateralBalance(lead.kind,lead.time);
    // The boots stay in the irons as the shoulders turn into the running line.
    waist.rotation.z += lean * 0.24;
    waist.rotation.y = -lean * 0.39;
    followMouth(walking ? 0.8 : weight, false, walking);
  }
  function seekDistance(distance, running, stop, lean = 0, curvature = 0, changes) {
    const step = raceStride(spec.number, distance, stop);
    const lead = changes ? sampleLead(changes,step.count) : null;
    pose(distance, running ? step.weight : 0, step.count, step.short, lean, false, lead);
    if (running) plant.apply(distance, stop, step, noseLead, curvature, lead);
  }
  function waitAt(seconds) {
    if (!waiting) pose(0,0);
    const strength = THREE.MathUtils.smoothstep(-seconds,0,0.9);
    const beat = seconds*2.6 + spec.number*1.41;
    gateJoints.forEach(({bone,rest,axis,swivel},i) => {
      const ear = i >= 2;
      const pitch = (ear ? 0.12 : 0.024) * Math.sin(beat-0.61*i);
      const yaw = (ear ? 0.30 : 0.010) * Math.sin(beat*(ear ? 1.41 : 0.77)+i);
      bone.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis,pitch*strength))
        .multiply(turn.setFromAxisAngle(swivel,yaw*strength));
    });
    waiting = true;
    followMouth(0);
  }
  function walk(metres) {
    pose(metres, 0, metres / walkStride + strideCount(spec.number, 0), 0, 0, true);
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
  function nosePosition(target) {
    return mount.localToWorld(target.copy(noseTip));
  }
  return { group, nosePosition, update, walk, waitAt, restNose, seek, seekDistance, hoofPosition, get noseLead() { return noseLead; } };
}
