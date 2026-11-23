import * as THREE from 'three';
import { ringCentre, ringRadius } from './parade.js';

export function makeParadeRing() {
  const group = new THREE.Group();
  group.position.set(ringCentre.x, 0, ringCentre.z);
  function ground(inner, outer, color, y, texture) {
    const geometry = new THREE.RingGeometry(inner, outer, 128).rotateX(-Math.PI / 2);
    if (texture) {
      const uv = geometry.attributes.uv, pos = geometry.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i,pos.getX(i)/2,pos.getZ(i)/2);
    }
    const pad = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({color,map:texture ?? null}));
    pad.position.y = y;
    pad.receiveShadow = true;
    group.add(pad);
  }
  const pixels = new Uint8Array(128*128*4);
  let seed = 714;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    const sand = 187 + (seed >>> 26);
    pixels.set([sand,sand,sand,255],i);
  }
  const grain = new THREE.DataTexture(pixels,128,128);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.generateMipmaps = true;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.magFilter = THREE.LinearFilter;
  grain.needsUpdate = true;
  ground(ringRadius-2.3,ringRadius+2.3,'#d6b890',0.001,grain);
  ground(ringRadius+2.3,ringRadius+4.3,'#b1a898',-0.003,grain);
  const pieces = [], tr = new THREE.Object3D();
  function beam(x,y,z,width,height,depth,angle,color) {
    tr.position.set(x,y,z);
    tr.scale.set(width,height,depth);
    tr.rotation.y = angle;
    tr.updateMatrix();
    pieces.push([tr.matrix.clone(),color]);
  }
  for (const radius of [ringRadius-2.25, ringRadius+2.28]) {
    const outer = radius > ringRadius, count = 52;
    for (let i=0; i<count; i++) {
      if (outer && (i===13 || i===14)) continue; // passage to the course
      const a = 2*Math.PI*i/count, b = 2*Math.PI*(i+1)/count, mid=(a+b)/2;
      const h = outer ? 0.89 : 0.48;
      beam(radius*Math.sin(a),h/2,radius*Math.cos(a),0.083,h,0.083,a,'#345247');
      const length = 2*radius*Math.sin((b-a)/2)+0.025;
      const centre = radius*Math.cos((b-a)/2);
      beam(centre*Math.sin(mid),h,centre*Math.cos(mid),length,0.073,0.093,mid,'#f6efda');
      if (outer) beam(centre*Math.sin(mid),0.50,centre*Math.cos(mid),length,0.041,0.05,mid,'#819386');
      else beam((centre-0.42)*Math.sin(mid),0.20,(centre-0.42)*Math.cos(mid),length,0.39,0.53,mid,'#466342');
    }
  }
  // Shaded viewing pavilion, tiered benches and the yellow nosing of each step.
  const standZ = -ringRadius-8;
  for (let row=0; row<3; row++) {
    const z=standZ-row*1.35, y=row*0.32;
    beam(0,y/2+0.04,z,17.4,y+0.16,1.35,0,'#b6b3a4');
    for (const x of [-5.8,0,5.8]) {
      beam(x,y+0.51,z-0.16,4.9,0.12,0.43,0,'#9c7952');
      for (const leg of [-1.9,1.9]) beam(x+leg,y+0.30,z-0.16,0.09,0.36,0.34,0,'#36594d');
    }
    beam(0,y+0.13,z+0.64,17.4,0.032,0.055,0,'#efe7cb');
  }
  for (const x of [-8,-2.7,2.7,8])
    beam(x,1.89,standZ-3.2,0.14,3.8,0.16,0,'#325044');
  beam(0,3.83,standZ-1.2,18.4,0.18,5.6,0,'#265a4a');
  beam(0,3.69,standZ+1.58,18.4,0.12,0.12,0,'#d6b67e');
  // The ring garden and its horseshoe planting can be recognised from above.
  const shrubs = new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),
    new THREE.MeshLambertMaterial(), 72);
  for (let i=0; i<72; i++) {
    const a = (i%36)/35 * Math.PI*1.54 + Math.PI*0.23;
    const r = i<36 ? 3.1 : 2.66;
    tr.position.set(r*Math.sin(a),0.17,r*Math.cos(a));
    tr.scale.set(0.30,i<36 ? 0.35 : 0.21,0.31);
    tr.updateMatrix();
    shrubs.setMatrixAt(i,tr.matrix);
    shrubs.setColorAt(i,new THREE.Color(i<36 ? (i%2 ? '#748853' : '#647e51') : (i%2 ? '#d9ad7b' : '#cf8f70')));
  }
  shrubs.castShadow = shrubs.receiveShadow = true;
  group.add(shrubs);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial(),pieces.length);
  pieces.forEach(([matrix,color],i) => {
    bars.setMatrixAt(i,matrix);
    bars.setColorAt(i,new THREE.Color(color));
  });
  bars.castShadow = bars.receiveShadow = true;
  group.add(bars);
  return group;
}
