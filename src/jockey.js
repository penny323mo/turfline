import * as THREE from 'three';

// All geometry stays in one draw. Rigid weights at the spherical shoulder,
// elbow and glove joints preserve sleeve width as the rider gives rein.
export function skinJockey(source, sleeves, headRanges) {
  const mesh = new THREE.SkinnedMesh(source.geometry, source.material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bones = [];
  const count = source.geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[4 * i] = 1;
  function bone(name, parent, position, ranges) {
    const joint = new THREE.Bone();
    joint.name = name;
    joint.position.copy(position);
    for (const [start,end] of ranges)
      for (let i = start; i < end; i++) indices[4 * i] = bones.length;
    parent.add(joint);
    bones.push(joint);
    return joint;
  }
  const root = bone('JockeyChest',mesh,new THREE.Vector3(),[]);
  const head = bone('JockeyHead',root,new THREE.Vector3(0,2.094,0.289),headRanges);
  const arms = sleeves.map(s => {
    const prefix = s.side < 0 ? 'JockeyRight' : 'JockeyLeft';
    const shoulder = new THREE.Vector3(...s.shoulder), elbow = new THREE.Vector3(...s.elbow);
    const hand = new THREE.Vector3(...s.hand);
    const arm = bone(prefix+'Shoulder',root,shoulder,[[s.start,s.elbowStart]]);
    const fore = bone(prefix+'Elbow',arm,elbow.clone().sub(shoulder),[[s.elbowStart,s.gloveStart]]);
    const wrist = bone(prefix+'Hand',fore,hand.clone().sub(elbow),[[s.gloveStart,s.end]]);
    return { side: s.side, arm, fore, wrist, hand, upperLength: fore.position.length(), foreLength: wrist.position.length() };
  });
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  mesh.bind(new THREE.Skeleton(bones));
  return { mesh, head, arms };
}

const aim = new THREE.Vector3(), pole = new THREE.Vector3(), bend = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3(), q = new THREE.Quaternion();
const basis = new THREE.Matrix4(), up = new THREE.Vector3(0,1,0);

// Target and bridle are in jacket coordinates. The elbow pole keeps the
// joint outside the barrel and the glove turns along its own leather strap.
export function reachForRein(limb, target, bridle) {
  const { arm, fore, wrist, side, upperLength: a, foreLength: b } = limb;
  aim.subVectors(target,arm.position);
  const length = THREE.MathUtils.clamp(aim.length(),Math.abs(a-b)+0.004,(a+b)*0.985);
  aim.normalize();
  pole.set(side*0.28,-0.48,-0.42);
  pole.addScaledVector(aim,-pole.dot(aim)).normalize();
  const along = (length*length + a*a - b*b) / (2*length);
  bend.copy(aim).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
  arm.quaternion.setFromUnitVectors(from.copy(fore.position).normalize(),to.copy(bend).normalize());
  to.copy(aim).multiplyScalar(length).sub(bend).normalize();
  q.copy(arm.quaternion).invert();
  fore.quaternion.setFromUnitVectors(from.copy(wrist.position).normalize(), to.applyQuaternion(q));
  target.copy(arm.position).addScaledVector(aim,length);
  const forward = to.subVectors(bridle,target).normalize();
  const right = from.crossVectors(up,forward).normalize();
  basis.makeBasis(right,pole.crossVectors(forward,right),forward);
  q.multiplyQuaternions(arm.quaternion, fore.quaternion).invert();
  wrist.quaternion.setFromRotationMatrix(basis).premultiply(q).normalize();
}
