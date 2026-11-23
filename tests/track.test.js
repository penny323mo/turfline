import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Box3, Group, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { laneX, horses } from "../src/data.js";
import { attachStartingStalls } from "../src/landscape.js";
import { loadAyanHorse, makeAyanHorse } from "../src/horse-ayan.js";

// Geometry checks use real meshes, skeletons and animations. The headless
// texture surfaces stand in for number plates and the source's embedded image.
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event {};
globalThis.document = {
  createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
};
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const asset = (name) => readFile(new URL("../public/models/" + name, import.meta.url));

test("six physical starting stalls close on their lane centres and clear the horses at the break", async () => {
  const bytes = await asset("scenery-starting-stalls.glb");
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const course = new Group();
  course.scale.x = -1;
  const gate = attachStartingStalls(course, gltf.scene);
  for (const t of [-3, 0, 0.14, 0.28, 72, -1]) {
    gate(t);
    course.updateMatrixWorld(true);
    for (let i = 0; i < horses.length; i++) {
      const bounds = (side) => new Box3().setFromObject(course.getObjectByName(`gate-${i + 1}-${side}`), true);
      const a = bounds("left"), b = bounds("right");
      const gap = Math.max(a.min.x, b.min.x) - Math.min(a.max.x, b.max.x);
      const midpoint = (Math.min(a.min.x, b.min.x) + Math.max(a.max.x, b.max.x)) / 2;
      assert.ok(Math.abs(midpoint - laneX(i)) < 0.012);
      if (t <= 0) {
        assert.ok(Math.abs(gap) < 0.001);
        assert.ok(a.min.z > 0.15 && a.max.z < 0.30);
      } else assert.ok(gap >= (t < 0.28 ? 1.20 : 1.58));
    }
  }
});

test("the foremost animated muzzle vertex meets the official line at every sampled stride", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const horse = makeAyanHorse(horses[0]), body = horse.group.getObjectByName("Object_11");
  const position = body.geometry.attributes.position, muzzle = [], point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    if (position.getX(i) < -2.42 && position.getY(i) > 0.55) muzzle.push(i);
  }
  assert.ok(muzzle.length > 800);
  for (let i = 0; i < 60; i++) {
    horse.group.rotation.y = 0.008 * Math.cos(i);
    horse.group.position.set(laneX(0), 0, 1200);
    horse.seek(i * 0.037, true, 16);
    horse.group.position.z -= horse.noseLead;
    horse.group.updateMatrixWorld(true);
    let tip = -Infinity;
    for (const v of muzzle) {
      body.getVertexPosition(v, point).applyMatrix4(body.matrixWorld);
      tip = Math.max(tip, point.z);
    }
    assert.ok(Math.abs(tip - 1200) < 0.0001);
  }
});
