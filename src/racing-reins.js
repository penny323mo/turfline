import * as THREE from 'three';
import { reachForRein } from './jockey.js';

// Landmarks on Ayan's skinned neck, from withers to jaw, on each side.
const neck = [[11012,7293], [3852,1735], [14781,13182], [11118,7390],
  [3934,1806], [11320,7597], [11327,7604]];
const cheek = [['Object_15',184,168], ['Object_13',103,93]];
const stations = 9, section = 8, radius = 0.025;
const up = new THREE.Vector3(0,1,0);
const leather = new THREE.Color('#583a2c'), brass = new THREE.Color('#bf9865');
const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.64});
let sharedGeometry;

function reinGeometry() {
  const positions = [], weights = [], joints = [], colors = [], indices = [];
  function vertex(x,y,z,joint,color) {
    positions.push(x,y,z);
    joints.push(joint,0,0,0);
    weights.push(1,0,0,0);
    colors.push(color.r,color.g,color.b);
  }
  function connect(a,b,c,d) { indices.push(a,b,d,b,c,d); }
  for (const [lane,side] of [-1,1].entries()) {
    const base = lane * (stations+1), x = side*0.15;
    const first = positions.length/3;
    for (let i=0; i<stations; i++) {
      for (let k=0; k<section; k++) {
        const a = 2*Math.PI*k/section;
        vertex(x+0.0035*Math.cos(a),0.009*Math.sin(a),i/(stations-1),base+i,leather);
        if (i+1 < stations) {
          const j = first+i*section, n = (k+1)%section;
          connect(j+k,j+n,j+section+n,j+section+k);
        }
      }
    }
    const ring = new THREE.TorusGeometry(radius,0.004,8,24);
    ring.rotateY(Math.PI/2);
    const start = positions.length/3, p = ring.attributes.position;
    for (let k=0; k<p.count; k++) vertex(x+p.getX(k),p.getY(k),1+p.getZ(k),base+stations,brass);
    for (const i of ring.index.array) indices.push(start+i);
    ring.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  for (const [name,values,size] of [['position',positions,3],['color',colors,3],['skinWeight',weights,4]])
    geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));
  geometry.computeVertexNormals();
  return geometry;
}

function outsideAt(points,z) {
  let i = 1;
  while (i < points.length-1 && points[i].z < z) i++;
  const a = points[i-1], b = points[i];
  return THREE.MathUtils.lerp(a.x,b.x,THREE.MathUtils.clamp((z-a.z)/Math.max(0.001,b.z-a.z),0,1));
}

export function fitRacingReins(mount,body,rider) {
  sharedGeometry ??= reinGeometry();
  const mesh = new THREE.SkinnedMesh(sharedGeometry,material);
  mesh.name = 'RacingReins';
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  const joints = [], sides = rider.arms.map((arm,lane) => {
    const name = arm.side < 0 ? 'Right' : 'Left';
    const bones = Array.from({length: stations+1}, (_,i) => {
      const joint = new THREE.Bone();
      joint.name = name + (i === stations ? 'BitRing' : 'Rein'+i);
      joint.position.set(arm.side*0.15,0,Math.min(i/(stations-1),1));
      joints.push(joint);
      mesh.add(joint);
      return joint;
    });
    return {arm,bones, cheek: mount.getObjectByName(cheek[lane][0]),
      end: new THREE.Vector3(), upper: new THREE.Vector3(), bindOffset: new THREE.Vector3(),
      guide: neck.map(() => new THREE.Vector3())};
  });
  mesh.bind(new THREE.Skeleton(joints));
  mount.add(mesh);
  const invMount = new THREE.Matrix4(), local = new THREE.Matrix4(), jacket = new THREE.Matrix4();
  const invJacket = new THREE.Matrix4(), basis = new THREE.Matrix4(), neutral = new THREE.Quaternion();
  const torso = new THREE.Quaternion(), identity = new THREE.Quaternion();
  const right = new THREE.Vector3(), vertical = new THREE.Vector3(), forward = new THREE.Vector3();
  const grip = new THREE.Vector3(), goal = new THREE.Vector3(), mouth = new THREE.Vector3();
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), across = new THREE.Vector3();
  const arcs = Array.from({length: stations},(_,i) => Math.sin(Math.PI*i/(stations-1)));
  function update(weight,fit = false,walking = false) {
    mount.updateMatrixWorld(true);
    invMount.copy(mount.matrixWorld).invert();
    jacket.multiplyMatrices(invMount,rider.mesh.matrixWorld);
    invJacket.copy(jacket).invert();
    torso.setFromRotationMatrix(basis.extractRotation(jacket)).normalize();
    if (fit) neutral.copy(torso);
    rider.head.quaternion.copy(identity).slerp(torso.invert().multiply(neutral),0.58*weight);
    for (const [i,s] of sides.entries()) {
      local.multiplyMatrices(invMount,s.cheek.matrixWorld);
      s.cheek.getVertexPosition(cheek[i][1],s.end).applyMatrix4(local);
      s.cheek.getVertexPosition(cheek[i][2],s.upper).applyMatrix4(local);
      local.multiplyMatrices(invMount,body.matrixWorld);
      s.guide.forEach((p,k) => body.getVertexPosition(neck[k][i],p).applyMatrix4(local));
    }
    right.subVectors(sides[1].end,sides[0].end).normalize();
    vertical.subVectors(sides[0].upper,sides[0].end).add(sides[1].upper).sub(sides[1].end);
    forward.crossVectors(right,vertical).normalize();
    vertical.crossVectors(forward,right).normalize();
    for (const {arm,bones,end,bindOffset,guide} of sides) {
      const ring = bones[stations];
      ring.position.copy(end).addScaledVector(vertical,-radius).addScaledVector(right,arm.side*0.002);
      ring.quaternion.setFromRotationMatrix(basis.makeBasis(right,vertical,forward));
      mouth.copy(ring.position).addScaledVector(forward,-radius);
      grip.copy(arm.hand);
      grip.x += arm.side*0.052;
      grip.y += 0.032;
      grip.z -= 0.020;
      grip.applyMatrix4(jacket);
      if (fit) bindOffset.subVectors(grip,mouth);
      goal.copy(mouth).add(bindOffset).sub(grip);
      grip.x += 0.35*weight*goal.x;
      if (walking) grip.y -= 0.13;
      grip.y += weight*(0.24*goal.y+0.015);
      grip.z += 0.55*weight*goal.z;
      grip.x = arm.side*Math.max(arm.side*grip.x,arm.side*outsideAt(guide,grip.z)+0.018);
      grip.applyMatrix4(invJacket);
      reachForRein(arm,grip,goal.copy(mouth).applyMatrix4(invJacket));
      grip.applyMatrix4(jacket);
      for (let i=0; i<stations; i++) {
        const p = bones[i].position, t = i/(stations-1);
        p.lerpVectors(grip,mouth,t);
        if (i && i < stations-1) {
          const clearance = THREE.MathUtils.smoothstep(1-t,0,0.26);
          const outside = arm.side*outsideAt(guide,p.z)+0.022;
          p.x = arm.side*THREE.MathUtils.lerp(arm.side*p.x,Math.max(arm.side*p.x,outside),clearance);
        }
      }
      // Extra length hangs progressively lower as the hands approach the bit.
      // Solve the arc length on the same stations used by the visible leather.
      let taut = 0;
      for (let i=1; i<stations; i++) taut += bones[i-1].position.distanceTo(bones[i].position);
      const reserve = Math.max(0,bindOffset.length() + 0.016 + 0.044*weight - taut);
      const length = taut + reserve * THREE.MathUtils.smoothstep(reserve,0,0.022);
      let lo = 0, hi = 0.12;
      for (let pass=0; pass<9; pass++) {
        const sag = (lo+hi)/2;
        let total = 0;
        for (let i=1; i<stations; i++) {
          tangent.subVectors(bones[i].position,bones[i-1].position);
          tangent.y -= sag*(arcs[i]-arcs[i-1]);
          total += tangent.length();
        }
        if (total < length) lo = sag;
        else hi = sag;
      }
      for (let i=1; i<stations-1; i++) bones[i].position.y -= arcs[i]*(lo+hi)/2;
      for (let i=0; i<stations; i++) {
        tangent.subVectors(bones[Math.min(stations-1,i+1)].position,bones[Math.max(0,i-1)].position).normalize();
        across.crossVectors(up,tangent).normalize();
        normal.crossVectors(tangent,across);
        bones[i].quaternion.setFromRotationMatrix(basis.makeBasis(across,normal,tangent));
      }
    }
  }
  update(0,true);
  return update;
}
