import { Box3, DynamicDrawUsage, Frustum, Matrix4 } from 'three';

// Compact the original instance order, including its colours. Keeping the
// originals lets a replay jump from the finish to the gate in a single frame.
function prepareInstances(mesh) {
  const geom = mesh.geometry, matrix = new Matrix4(), matrices = mesh.instanceMatrix;
  const colors = mesh.instanceColor;
  const original = matrices.array.slice(), shades = colors?.array.slice();
  const bounds = Array.from({length: mesh.count}, (_,i) => {
    mesh.getMatrixAt(i,matrix);
    return geom.boundingBox.clone().applyMatrix4(matrix);
  });
  const slots = bounds.map((_,i) => i);
  matrices.setUsage(DynamicDrawUsage);
  colors?.setUsage(DynamicDrawUsage);
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return {mesh,bounds,slots,original,shades};
}

export function courseVisibility(root, grass, ground) {
  const details = [], grassTiles = new Set(), box = new Box3();
  for (const patch of grass) patch.traverse(mesh => { if (mesh.isMesh) grassTiles.add(mesh); });
  root.traverse(mesh => {
    if (!mesh.isMesh || ground.has(mesh)) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    details.push(mesh.isInstancedMesh ? prepareInstances(mesh) : {mesh});
  });
  const volume = new Frustum(), projection = new Matrix4();
  const grassVolume = new Frustum();
  function clip(frustum,camera,far) {
    projection.copy(camera.projectionMatrix);
    const n = camera.near, f = Math.min(camera.far,Math.max(n+1,far));
    projection.elements[10] = -(f+n)/(f-n);
    projection.elements[14] = -2*f*n/(f-n);
    frustum.setFromProjectionMatrix(projection.multiply(camera.matrixWorldInverse));
  }
  return (camera,density,pixelsHigh) => {
    // Keep the sky, terrain and ridgeline out to the original horizon. Fine
    // scenery loses its contrast as exp(-density² * depth²) approaches zero.
    const far = Math.sqrt(-Math.log(0.0002))/density;
    clip(volume,camera,far);
    const focalPixels = pixelsHigh*camera.projectionMatrix.elements[5]/2;
    clip(grassVolume,camera,Math.min(far,0.12*focalPixels));
    root.updateWorldMatrix(true,true);
    for (const item of details) {
      const {mesh,bounds} = item;
      const view = grassTiles.has(mesh) ? grassVolume : volume;
      box.copy(bounds ? mesh.boundingBox : mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      mesh.visible = view.intersectsBox(box);
      if (!mesh.visible || !bounds) continue;
      let count = 0, changed = false;
      for (let i=0; i<bounds.length; i++) {
        if (!view.intersectsBox(box.copy(bounds[i]).applyMatrix4(mesh.matrixWorld))) continue;
        if (item.slots[count] !== i) {
          mesh.instanceMatrix.array.set(item.original.subarray(16*i,16*i+16),16*count);
          if (item.shades) mesh.instanceColor.array.set(item.shades.subarray(3*i,3*i+3),3*count);
          item.slots[count] = i;
          changed = true;
        }
        count++;
      }
      mesh.count = count;
      if (changed) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };
}
