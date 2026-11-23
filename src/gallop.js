import {
  AnimationClip,
  MathUtils,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { stanceStarts, strideMetres } from './stride.js';
export { strideLength } from './stride.js';

const turn = Math.PI * 2;
const stance = 0.22;
const xAxis = new Vector3(1, 0, 0);

export function bodyMotion(phase) {
  const a = turn * phase;
  return {
    heave: -0.155 + 0.066 * Math.cos(a + 0.66) - 0.018 * Math.cos(2 * a + 0.4),
    pitch: 0.084 * Math.sin(a - 0.3),
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
export function makeGallop(source, scale, ground) {
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
  const neck = ['spine011_31', 'spine012_28', 'spine014_25', 'skull_6'].map(joint);
  const tail = ['spine004_5', 'spine003_4', 'spine002_3', 'spine001_2', 'spine_1'].map(joint);
  const body = rig.getObjectByName('Object_11'),
    muzzle = new Vector3();
  function nose() {
    body.getVertexPosition(3998, muzzle).applyMatrix4(body.matrixWorld);
    return muzzle.z;
  }
  const restNose = nose();

  function leg(names, front, beat, soleZ) {
    const joints = names.map(joint);
    const segments = joints.slice(0, -1).map((p, i) => {
      const delta = joints[i + 1].position.clone().sub(p.position);
      return { length: Math.hypot(delta.y, delta.z), restAngle: angle(delta.z, delta.y) };
    });
    const toe = joints.at(-1).position;
    return { joints, segments, front, beat, soleZ, toeZ: soleZ - toe.z, toeY: -toe.y };
  }
  const legs = [
    leg(['thighR_61', 'shinR_60', 'footR_59', 'r_toeR_58'], false, stanceStarts[0], -0.753),
    leg(['thighL_56', 'shinL_55', 'footL_54', 'r_toeL_53'], false, stanceStarts[1], -0.752),
    leg(['shoulderR_45', 'upper_armR_44', 'forearmR_43', 'handR_42', 'f_toeR_41'], true, stanceStarts[2], 0.463),
    leg(['shoulderL_39', 'upper_armL_38', 'forearmL_37', 'handL_36', 'f_toeL_35'], true, stanceStarts[3], 0.462),
  ];

  const q = new Quaternion(),
    parentQ = new Quaternion(),
    point = new Vector3();
  function rotateWorld(state, delta, relative = false) {
    const bone = state.bone;
    bone.parent.getWorldQuaternion(parentQ);
    q.setFromAxisAngle(xAxis, delta);
    if (relative) q.multiply(parentQ).multiply(state.local);
    else q.multiply(state.rotation);
    bone.quaternion.copy(parentQ.invert()).multiply(q).normalize();
    bone.updateWorldMatrix(false, false);
  }
  function swing(leg, phase, noseOffset) {
    const { joints, segments, front } = leg;
    const u = MathUtils.euclideanModulo(phase - leg.beat, 1);
    const path = hoofPath(u, front);
    const fold = u < stance ? 0 : Math.sin((Math.PI * (u - stance)) / (1 - stance)) ** 2;
    const load = u < stance ? Math.sin((Math.PI * u) / stance) ** 2 : 0;
    const roll = 0.76 * Math.exp(-((u - 0.31) ** 2) / 0.011) - 0.3 * fold;
    const soleZ = leg.soleZ + path.z + noseOffset;
    const tipY = path.y - (leg.toeY * Math.cos(roll) - leg.toeZ * Math.sin(roll));
    const tipZ = soleZ - (leg.toeY * Math.sin(roll) + leg.toeZ * Math.cos(roll));
    // Work up from the hoof to the knee or hock, then solve the two upper
    // segments in the sagittal plane without stretching their lengths.
    let y = tipY,
      z = tipZ;
    const cannon = Math.atan2(path.z, 1.35) + (front ? -1.46 : 1.05) * fold;
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
  }

  const times = [],
    pivot = new Vector3(0, 1.34, -0.18),
    frames = 72;
  for (let i = 0; i <= frames; i++) {
    const phase = (i % frames) / frames,
      a = turn * phase,
      { heave, pitch } = bodyMotion(phase);
    times.push(i / frames);
    point.copy(root.position).sub(pivot).applyAxisAngle(xAxis, pitch).add(pivot);
    point.y += heave;
    root.bone.position.copy(root.bone.parent.worldToLocal(point));
    root.bone.position.toArray(rootPositions, 3 * i);
    rotateWorld(root, pitch);
    const nod = Math.sin(a - 0.7);
    [0.16 + 0.052 * nod, 0.12 + 0.046 * nod, 0.035 + 0.025 * nod, -0.1 - 0.04 * nod].forEach((d, j) =>
      rotateWorld(neck[j], d, true),
    );
    [0.49, 0.36, 0.2, 0.12, 0.06].forEach((d, j) =>
      rotateWorld(tail[j], d + 0.058 * Math.sin(a - 0.5 * j), true),
    );
    rig.updateMatrixWorld(true);
    // Race distance is measured at the moving nose. Compensate here so the
    // stance foot stays planted while the head nods.
    const muzzleOffset = nose() - restNose;
    for (const limb of legs) swing(limb, phase, muzzleOffset);
    for (const s of states.values()) s.bone.quaternion.toArray(s.keys, 4 * i);
  }
  const tracks = [new VectorKeyframeTrack(root.bone.name + '.position', times, rootPositions)];
  for (const [name, s] of states)
    tracks.push(new QuaternionKeyframeTrack(name + '.quaternion', times, s.keys));
  return new AnimationClip('Gallop', 1, tracks);
}
