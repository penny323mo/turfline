import {
  AnimationClip,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { shortStrideRatio, stanceStarts, strideMetres } from './stride.js';
export { strideLength } from './stride.js';

const turn = Math.PI * 2;
const stance = 0.22;
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);
const zAxis = new Vector3(0, 0, 1);
// Use the same foremost skinned point for the race clock and the leg solve.
export const muzzleVertices = [1879, 1970, 3998, 4087, 7524, 7733, 11244, 11446];
// Extremal points on the skinned soles, also used by the runtime ground solve.
export const soleVertices = [
  202, 210, 1135, 1143, 2355, 2607, 3273, 3281, 4524, 4573, 4575,
  4584, 4974, 6138, 6145, 6168, 6174, 8416, 8804, 9938, 9945, 9967,
  9973, 11901, 12585, 13645, 14273,
];

export const limbs = [
  { names: ['thighR_61', 'shinR_60', 'footR_59', 'r_toeR_58'], front: false, sole: 14273 },
  { names: ['thighL_56', 'shinL_55', 'footL_54', 'r_toeL_53'], front: false, sole: 12585 },
  { names: ['shoulderR_45', 'upper_armR_44', 'forearmR_43', 'handR_42', 'f_toeR_41'], front: true, sole: 13645 },
  { names: ['shoulderL_39', 'upper_armL_38', 'forearmL_37', 'handL_36', 'f_toeL_35'], front: true, sole: 11901 },
];

export function supportFraction(short) {
  return MathUtils.lerp(stance, 0.40, short * short);
}

// Forward reach relative to the standing sole at first contact.
export function touchdownReach(front, short, stride) {
  const scale = MathUtils.lerp(1, shortStrideRatio, short);
  return (front ? 0.8 : 0.73) * stride / strideMetres * scale * supportFraction(short) / stance -
    (front ? 0.15 * short : 0);
}

export function bodyMotion(phase) {
  const a = turn * phase;
  // The hind pair and then the fore pair take weight in succession.
  const hind = Math.sin(a - 1.05), fore = Math.sin(a - 3.38);
  return {
    heave: -0.155 + 0.066 * Math.cos(a + 0.66) - 0.018 * Math.cos(2 * a + 0.4),
    pitch: 0.084 * Math.sin(a - 0.3),
    sway: 0.026 * hind + 0.014 * fore,
    roll: -0.048 * hind,
    shoulderRoll: -0.044 * fore,
  };
}

// Positions and tangents are in metres per normalised stride. The planted
// hoof sweeps backwards at course speed, with matching velocity at lift-off
// and at the next touchdown. The swing folds before it reaches forwards.
function hoofPath(u, front) {
  const reach = front ? 0.8 : 0.73;
  const end = reach - stance * strideMetres;
  if (u < stance) return { z: reach - strideMetres * u, y: 0 };
  const keys = [
    [stance, end, 0, -strideMetres, 0],
    [0.35, end - 0.3, front ? 0.24 : 0.27, 0.7, 2.6],
    [0.54, front ? -0.56 : -0.27, front ? 0.59 : 0.49, 3.7, 0.1],
    [0.76, front ? 0.42 : 0.5, front ? 0.43 : 0.32, 4.7, -1.6],
    [0.93, reach + 0.18, 0.105, -0.6, -1.8],
    [1, reach, 0, -strideMetres, 0],
  ];
  const j = keys.findIndex((k, i) => i > 0 && u <= k[0]);
  const a = keys[j - 1],
    b = keys[j],
    d = b[0] - a[0],
    t = (u - a[0]) / d;
  const t2 = t * t,
    t3 = t2 * t;
  function at(value, slope) {
    return (
      (2 * t3 - 3 * t2 + 1) * a[value] +
      (t3 - 2 * t2 + t) * d * a[slope] +
      (3 * t2 - 2 * t3) * b[value] +
      (t3 - t2) * d * b[slope]
    );
  }
  return { z: at(1, 3), y: at(2, 4) };
}

const positionOf = (bone) => bone.getWorldPosition(new Vector3());
const rotationOf = (bone) => bone.getWorldQuaternion(new Quaternion());
const angle = (dz, dy) => Math.atan2(dz, -dy);

// Bake a cyclic clip once on a reference rig. The game samples the resulting
// ordinary animation tracks, including when replaying or seeking backwards.
export function makeGallop(source, scale, ground, collection = 0, stride = strideMetres) {
  const rig = clone(source);
  rig.rotation.y = Math.PI / 2;
  rig.scale.setScalar(scale);
  rig.position.y = ground * scale;
  rig.updateMatrixWorld(true);

  const states = new Map();
  function joint(name) {
    const bone = rig.getObjectByName(name);
    const state = {
      bone,
      position: positionOf(bone),
      rotation: rotationOf(bone),
      local: bone.quaternion.clone(),
      keys: [],
    };
    states.set(name, state);
    return state;
  }
  const root = joint('spine005_64'),
    rootPositions = [];
  const back = ['spine006_63', 'spine007_51', 'spine008_50', 'spine009_48'].map(joint);
  const neck = ['spine011_31', 'spine012_28', 'spine014_25', 'skull_6'].map(joint);
  const tail = ['spine004_5', 'spine003_4', 'spine002_3', 'spine001_2', 'spine_1'].map(joint);
  const body = rig.getObjectByName('Object_11'),
    muzzle = new Vector3();
  function nose() {
    let tip = -Infinity;
    for (const v of muzzleVertices) {
      body.getVertexPosition(v, muzzle).applyMatrix4(body.matrixWorld);
      tip = Math.max(tip, muzzle.z);
    }
    return tip;
  }
  const restNose = nose();

  function leg(names, front, beat, sole) {
    const joints = names.map(joint);
    const segments = joints.slice(0, -1).map((p, i) => {
      const delta = joints[i + 1].position.clone().sub(p.position);
      return { length: Math.hypot(delta.y, delta.z), restAngle: angle(delta.z, delta.y) };
    });
    const toe = joints.at(-1).position;
    const contact = body.getVertexPosition(sole, new Vector3()).applyMatrix4(body.matrixWorld);
    return { joints, segments, front, beat, sole, soleX: contact.x, soleZ: contact.z,
      toeZ: contact.z - toe.z, toeY: -toe.y, soles: [] };
  }
  const legs = limbs.map(({names, front, sole}, i) => leg(names, front, stanceStarts[i], sole));

  const q = new Quaternion(),
    bank = new Quaternion(),
    parentQ = new Quaternion(),
    point = new Vector3();
  for (const v of soleVertices) {
    body.getVertexPosition(v, point).applyMatrix4(body.matrixWorld);
    const closest = legs.reduce((a, b) => point.distanceToSquared(a.joints.at(-1).position) <
      point.distanceToSquared(b.joints.at(-1).position) ? a : b);
    closest.soles.push(v);
  }
  function rotateWorld(state, delta, relative = false, roll = 0, yaw = 0) {
    const bone = state.bone;
    bone.parent.getWorldQuaternion(parentQ);
    q.setFromAxisAngle(xAxis, delta);
    if (roll) q.premultiply(bank.setFromAxisAngle(zAxis, roll));
    if (yaw) q.premultiply(bank.setFromAxisAngle(yAxis, yaw));
    if (relative) q.multiply(parentQ).multiply(state.local);
    else q.multiply(state.rotation);
    bone.quaternion.copy(parentQ.invert()).multiply(q).normalize();
    bone.updateWorldMatrix(false, false);
  }
  function swing(leg, phase, noseOffset, heightOffset = 0, lengthOffset = 0) {
    const { joints, segments, front } = leg;
    const cycle = MathUtils.euclideanModulo(phase - leg.beat, 1);
    const support = supportFraction(collection);
    const u = cycle < support ? cycle * stance / support :
      stance + (cycle - support) * (1 - stance) / (1 - support);
    const path = hoofPath(u, front);
    path.z *= stride / strideMetres * MathUtils.lerp(1, shortStrideRatio, collection) * support / stance;
    if (front) path.z -= 0.15 * collection;
    path.y *= 1 - 0.62 * collection;
    const fold = u < stance ? 0 : Math.sin((Math.PI * (u - stance)) / (1 - stance)) ** 2;
    const load = u < stance ? Math.sin((Math.PI * u) / stance) ** 2 : 0;
    const roll = (0.76 * Math.exp(-((u - 0.31) ** 2) / 0.011) - 0.3 * fold) * (1 - 0.4 * collection);
    const soleZ = leg.soleZ + path.z + noseOffset;
    const tipY = path.y + heightOffset - (leg.toeY * Math.cos(roll) - leg.toeZ * Math.sin(roll));
    const tipZ = soleZ + lengthOffset - (leg.toeY * Math.sin(roll) + leg.toeZ * Math.cos(roll));
    // Work up from the hoof to the knee or hock, then solve the two upper
    // segments in the sagittal plane without stretching their lengths.
    let y = tipY,
      z = tipZ;
    const cannon = Math.atan2(path.z, 1.35) + (front ? -1.46 : 1.05) * fold * (1 - 0.45 * collection);
    const distal = front ? [cannon, 0.27 + 0.55 * load - 0.78 * fold] : [cannon];
    for (let i = 0; i < distal.length; i++) {
      const length = segments[i + 2].length,
        a = distal[i];
      y += length * Math.cos(a);
      z -= length * Math.sin(a);
    }
    joints[0].bone.getWorldPosition(point);
    const dy = y - point.y,
      dz = z - point.z,
      a = segments[0].length,
      b = segments[1].length;
    const d = MathUtils.clamp(Math.hypot(dy, dz), Math.abs(a - b) + 0.001, a + b - 0.001);
    const aim = angle(dz, dy),
      bend = front ? -1 : 1;
    const acos = (x) => Math.acos(MathUtils.clamp(x, -1, 1));
    const angles = [
      aim + bend * acos((a * a + d * d - b * b) / (2 * a * d)),
      aim - bend * acos((b * b + d * d - a * a) / (2 * b * d)),
      ...distal,
    ];
    angles.forEach((target, i) => rotateWorld(joints[i], segments[i].restAngle - target));
    rotateWorld(joints.at(-1), roll);
    // As the leg folds, the hoof swings clear of the passing leg. The offset
    // and its velocity reach zero on both ends of the airborne interval.
    const recovery = u < stance ? 0 : (u - stance) / (1 - stance);
    const clearance = (front ? 0.033 : 0.052) * fold * (1 - 0.56 * collection) *
      (1 + 0.22 * Math.cos(Math.PI * recovery));
    return { x: leg.soleX + Math.sign(leg.soleX) * clearance, y: path.y, z: soleZ };
  }

  const times = [],
    pivot = new Vector3(0, 1.34, -0.18),
    frames = 72;
  for (let i = 0; i <= frames; i++) {
    const phase = (i % frames) / frames,
      a = turn * phase;
    const motion = bodyMotion(phase);
    const heave = MathUtils.lerp(motion.heave, -0.19 + (motion.heave + 0.155) * 0.45, collection);
    const pitch = motion.pitch * (1 - 0.52 * collection);
    times.push(i / frames);
    point.copy(root.position).sub(pivot).applyAxisAngle(xAxis, pitch).add(pivot);
    point.y += heave;
    const balance = 1 - 0.64 * collection;
    point.x += motion.sway * balance;
    root.bone.position.copy(root.bone.parent.worldToLocal(point));
    root.bone.position.toArray(rootPositions, 3 * i);
    rotateWorld(root, pitch, false, motion.roll * balance);
    // The pelvis tucks under the body in the gathered phase. Transfer the
    // smaller motion along the back before solving either pair of legs.
    const flexion = 1 - 0.48 * collection;
    [0.085 * Math.cos(a + 0.34), -0.063 * Math.cos(a + 0.12),
      -0.048 * Math.cos(a - 0.11), 0.029 * Math.cos(a - 0.36)].forEach((d, j) =>
      rotateWorld(back[j], flexion * d, true, (motion.shoulderRoll - motion.roll) * balance / back.length),
    );
    // The neck stretches as the forehand takes weight. The poll follows the
    // base of the neck, and the shorter gate and run-out steps carry less swing.
    const foreLoad = Math.sin(a - turn * stanceStarts[3]);
    const nod = 1 - 0.64 * collection;
    [0.16 + nod * (0.077 * Math.sin(a - 0.48) + 0.019 * foreLoad), 0.12 + nod * 0.052 * Math.sin(a - 0.80),
      0.035 + nod * 0.031 * Math.sin(a - 1.14), -0.1 - nod * 0.066 * Math.sin(a - 0.94)].forEach((d, j) =>
      rotateWorld(neck[j], d * (1 - 0.24 * collection), true),
    );
    [0.49, 0.36, 0.2, 0.12, 0.06].forEach((d, j) =>
      rotateWorld(tail[j], d * (1 - 0.42 * collection) + balance * 0.058 * Math.sin(a - 0.5 * j), true, 0,
        balance * (0.017 + 0.012 * j) * Math.sin(a - 0.55 * j)),
    );
    rig.updateMatrixWorld(true);
    // Race distance is measured at the moving nose. Compensate here so the
    // stance foot stays planted while the head nods.
    const muzzleOffset = nose() - restNose;
    for (const limb of legs) {
      const target = swing(limb, phase, muzzleOffset);
      // The weighted skin can move relative to the toe joint during flexion.
      // Fit the sole itself while the IK is being baked.
      let y = 0, z = 0;
      for (let pass = 0; pass < 2; pass++) {
        let low = Infinity;
        for (const v of limb.soles) {
          body.getVertexPosition(v, point).applyMatrix4(body.matrixWorld);
          low = Math.min(low, point.y);
        }
        y += MathUtils.clamp(target.y - low, -0.08, 0.08);
        body.getVertexPosition(limb.sole, point).applyMatrix4(body.matrixWorld);
        z += MathUtils.clamp(target.z - point.z, -0.06, 0.06);
        swing(limb, phase, muzzleOffset, y, z);
      }
      // Match lateral swing in flight and keep the planted sole on its track.
      const upper = limb.joints[0].bone;
      const hip = positionOf(upper);
      body.getVertexPosition(limb.sole, point).applyMatrix4(body.matrixWorld);
      const correction = Math.atan2(target.x - hip.x, hip.y - point.y) -
        Math.atan2(point.x - hip.x, hip.y - point.y);
      upper.getWorldQuaternion(q).premultiply(bank.setFromAxisAngle(zAxis, correction));
      upper.parent.getWorldQuaternion(parentQ);
      upper.quaternion.copy(parentQ.invert()).multiply(q).normalize();
      upper.updateWorldMatrix(false, true);
    }
    for (const s of states.values()) s.bone.quaternion.toArray(s.keys, 4 * i);
  }
  const tracks = [new VectorKeyframeTrack(root.bone.name + '.position', times, rootPositions)];
  for (const [name, s] of states)
    tracks.push(new QuaternionKeyframeTrack(name + '.quaternion', times, s.keys));
  return new AnimationClip(collection ? 'CollectedStride' + collection : 'Gallop', 1, tracks);
}
