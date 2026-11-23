import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { courseVisibility } from '../src/course-visibility.js';

test('mirrored course instances recover their original transforms and colours after a camera cut', () => {
  const root = new Group(), geom = new BoxGeometry(), mat = new MeshBasicMaterial();
  root.scale.x = -1;
  const rails = new InstancedMesh(geom,mat,3), stand = new Mesh(geom,mat), ground = new Mesh(geom,mat);
  const matrix = new Matrix4(), colour = new Color();
  [-35,0,35].forEach((x,i) => {
    rails.setMatrixAt(i,matrix.makeTranslation(x,0,-10));
    rails.setColorAt(i,colour.setRGB(i/2,0.5,1-i/2));
  });
  stand.position.z = ground.position.z = -800;
  root.add(rails,stand,ground);
  const cull = courseVisibility(root,[],new Set([ground]));
  const camera = new PerspectiveCamera(35,1,0.08,2300);
  function shoot(x,density) {
    camera.position.x = x;
    camera.updateMatrixWorld();
    cull(camera,density,700);
  }
  for (const i of [1,0,2,1]) {
    shoot(35-35*i,0.0085);
    assert.equal(rails.count,1);
    rails.getMatrixAt(0,matrix);
    rails.getColorAt(0,colour);
    assert.equal(matrix.elements[12],35*i-35);
    assert.equal(colour.r,i/2);
    assert.equal(stand.visible,false);
    assert.equal(ground.visible,true);
  }
  shoot(500,0.0085);
  assert.equal(rails.visible,false);
  shoot(0,0.00045);
  assert.equal(rails.visible,true);
  assert.equal(stand.visible,true);
});
