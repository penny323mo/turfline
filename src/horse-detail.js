import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

// These fittings are small curved surfaces. The coat, mane, four hooves,
// cheekpiece contacts and the entire hand-to-bit rig keep their original mesh.
const fittings = ['Object_19','Object_21','Object_23','JockeyUpperBody','JockeyLegs'];
const cache = new WeakMap();
const position = new Vector3(), localView = new Matrix4();

function levels(mesh) {
  const source = mesh.geometry;
  if (cache.has(source)) return cache.get(source);
  const pos = source.attributes.position, normal = source.attributes.normal;
  const xyz = new Float32Array(pos.count*3), normals = new Float32Array(pos.count*3);
  for (let i=0; i<pos.count; i++) {
    position.fromBufferAttribute(pos,i).toArray(xyz,3*i);
    position.fromBufferAttribute(normal,i).toArray(normals,3*i);
  }
  const span = MeshoptSimplifier.getScale(xyz,3);
  const scale = mesh.matrixWorld.getMaxScaleOnAxis();
  const choices = [{geometry: source, error: 0}];
  for (const metres of [0.00045,0.0015,0.005,0.014]) {
    const [indices,error] = MeshoptSimplifier.simplifyWithAttributes(source.index.array,xyz,3,
      normals,3,[0.025,0.025,0.025],null,Math.floor(source.index.count/3*0.04)*3,metres/(span*scale),[]);
    if (indices.length >= choices.at(-1).geometry.index.count*0.94) continue;
    // An index-only level keeps the exact original normals, weights, morphs
    // and vertex IDs. All levels share the same GPU attribute buffers.
    const geometry = new BufferGeometry();
    geometry.attributes = source.attributes;
    geometry.morphAttributes = source.morphAttributes;
    geometry.morphTargetsRelative = source.morphTargetsRelative;
    geometry.setIndex(new BufferAttribute(indices,1));
    geometry.boundingBox = source.boundingBox;
    geometry.boundingSphere = source.boundingSphere;
    choices.push({geometry,error: error*span*scale});
  }
  cache.set(source,choices);
  return choices;
}

export async function prepareHorseDetail(actors) {
  if (!MeshoptSimplifier.supported) return null;
  await MeshoptSimplifier.ready;
  const rows = actors.map(({group}) => {
    if (!group.getObjectByName('RacingReins')) return [];
    group.updateWorldMatrix(true,true);
    return fittings.map(name => {
      const mesh = group.getObjectByName(name);
      return {mesh,choices: levels(mesh)};
    });
  });
  return (camera,height) => {
    const focalPixels = height * camera.projectionMatrix.elements[5]/2;
    rows.forEach((items,i) => {
      if (!items.length) return;
      const subject = actors[i].group;
      subject.updateWorldMatrix(true,false);
      localView.multiplyMatrices(camera.matrixWorldInverse,subject.matrixWorld);
      const e = localView.elements;
      // Nearest depth of the occupied jacket, breeches and bridle volume.
      // Keeping its long axis along the horse avoids overestimating the size
      // of a side-on horse when the lens is close to its shoulder.
      const depth = Math.max(camera.near,-e[14] - Math.abs(e[2])*0.54
        - Math.max(e[6]*0.55,e[6]*2.70) - Math.max(e[10]*-0.75,e[10]*1.78));
      const budget = 0.38*depth/focalPixels;
      for (const {mesh,choices} of items) {
        let index = choices.length-1;
        while (index && choices[index].error>budget) index--;
        mesh.geometry = choices[index].geometry;
      }
    });
  };
}
