import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, Box3, Group, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { laneX, horses } from "../src/data.js";
import { hoofContacts } from "../src/race-audio.js";
import { distance } from "../src/race.js";
import { bendEntry, bendExit, bendLean, coursePoint, laneTravel } from "../src/course.js";
import { attachStartingStalls } from "../src/landscape.js";
import { placeRunnerFrame } from "../src/stage.js";
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

test("all six lanes turn continuously and measure the length of their own racing line", () => {
  for (const [i] of horses.entries()) {
    const offset = laneX(i);
    let previous = coursePoint(0, offset), length = 0;
    assert.equal(previous.heading, Math.PI);
    for (let d = 0.5; d <= 1222; d += 0.5) {
      const pt = coursePoint(d, offset);
      length += Math.hypot(pt.x - previous.x, pt.z - previous.z);
      assert.ok(Math.abs(pt.heading - previous.heading) < 0.005);
      assert.ok(Math.abs(length - laneTravel(d, offset)) < 0.001);
      previous = pt;
    }
    assert.deepEqual(coursePoint(1200, offset), { x: offset, z: 1200, heading: 0 });
    assert.equal(bendLean(bendEntry, 17, offset), 0);
    assert.equal(bendLean(bendExit, 17, offset), 0);
    assert.ok(bendLean(bendEntry + 90, 17, offset) > bendLean(bendEntry + 90, 13, offset));
  }
  const extra = laneTravel(1200, laneX(5)) - laneTravel(1200, laneX(0));
  assert.ok(Math.abs(extra - 10 * Math.PI) < 1e-8);
});

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

test("each runner plants four separate hooves and has an airborne phase at racing speed", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const soles = [11901, 13645, 12585, 14273];
  const speed = 16, step = 1 / 60;
  for (const spec of horses) {
    const horse = makeAyanHorse(spec), body = horse.group.getObjectByName("Object_11");
    const slip = soles.map(() => []);
    let previous, airborne = 0;
    for (let i = 0; i <= 480; i++) {
      const d = 40 + i * step;
      horse.seekDistance(d, true);
      horse.group.position.z = d - horse.noseLead;
      horse.group.updateMatrixWorld(true);
      const points = soles.map(index => body.getVertexPosition(index, new Vector3()).applyMatrix4(body.matrixWorld));
      if (points.every(p => p.y > 0.07)) airborne++;
      if (previous) points.forEach((p,j) => {
        if (Math.max(p.y, previous[j].y) < 0.018)
          slip[j].push(Math.abs(p.z - previous[j].z) * speed / step);
      });
      previous = points;
    }
    assert.ok(airborne > 30);
    for (const samples of slip) {
      assert.ok(samples.length > 30);
      samples.sort((a,b) => a-b);
      assert.ok(samples[Math.floor(samples.length / 2)] < 0.8, "planted sole moves with the turf");
    }
  }
});

test("the inside and outside runners lean into the bend with four grounded support phases", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  for (const i of [0, 5]) {
    const frame = new Group(), horse = makeAyanHorse(horses[i]), offset = laneX(i);
    const mesh = horse.group.getObjectByName("Object_11"), soles = [11901, 13645, 12585, 14273];
    frame.add(horse.group);
    let previous, flight = 0;
    const slips = soles.map(() => []);
    for (let k = 0; k <= 480; k++) {
      const speed = 16, step = 1 / 60, d = 510 + k * step;
      const pt = coursePoint(d, offset);
      placeRunnerFrame(frame, pt, bendLean(d, speed, offset));
      horse.seekDistance(laneTravel(d, offset), true);
      horse.group.position.z = -horse.noseLead;
      frame.updateMatrixWorld(true);
      const up = new Vector3(0, 1, 0).applyMatrix4(frame.matrix);
      const inward = -(up.x - pt.x) * Math.cos(pt.heading) + (up.z - pt.z) * Math.sin(pt.heading);
      assert.ok(inward > 0.19 && up.y === 1);
      const points = soles.map(v => mesh.getVertexPosition(v, new Vector3()).applyMatrix4(mesh.matrixWorld));
      if (points.every(p => p.y > 0.07)) flight++;
      if (previous) points.forEach((p, j) => {
        if (Math.max(p.y, previous[j].y) < 0.018)
          slips[j].push(p.distanceTo(previous[j]) * speed / step);
      });
      previous = points;
    }
    assert.ok(flight > 30);
    for (const samples of slips) {
      assert.ok(samples.length > 30);
      samples.sort((a, b) => a - b);
      assert.ok(samples[Math.floor(samples.length / 2)] < 0.88);
    }
  }
});

test("mounted download reproduces the in-game hooves, nose and jockey when sampled out of order", async () => {
  const bytes = await asset("horse-ayan.glb"), mounted = await asset("horse-ayan-mounted.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const runner = makeAyanHorse(horses[0]);
  const baked = await new GLTFLoader().parseAsync(mounted.buffer.slice(mounted.byteOffset, mounted.byteOffset + mounted.byteLength), "");
  const clip = baked.animations.find(a => a.name === "Gallop");
  assert.ok(Math.abs(clip.duration - 7.05 / 16) < 0.00001);
  const playback = new AnimationMixer(baked.scene);
  playback.clipAction(clip).play();
  function samples(group) {
    const body = group.getObjectByName("Object_11");
    const points = [11901,13645,12585,14273,3998].map(i => body.getVertexPosition(i,new Vector3()).applyMatrix4(body.matrixWorld));
    return [...points, group.getObjectByName("JockeyWaist").getWorldPosition(new Vector3())];
  }
  for (let i=0; i<73; i++) {
    const t = clip.duration * ((i * 37) % 73) / 73;
    runner.seek(t,true,16);
    playback.setTime(t);
    runner.group.updateMatrixWorld(true);
    baked.scene.updateMatrixWorld(true);
    const actual = samples(runner.group), exported = samples(baked.scene);
    actual.forEach((p,j) => assert.ok(p.distanceTo(exported[j]) < 0.002));
    assert.ok(Math.abs(runner.group.getObjectByName("JockeyLegs").morphTargetInfluences[0]
      - baked.scene.getObjectByName("JockeyLegs").morphTargetInfluences[0]) < 0.001);
    assert.ok(Math.abs(runner.group.getObjectByName("JockeyUpperBody").morphTargetInfluences[0]
      - baked.scene.getObjectByName("JockeyUpperBody").morphTargetInfluences[0]) < 0.001);
  }
});

test("audible strikes coincide with the first descent to turf of the corresponding skinned hoof", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const soles = [14273, 12585, 13645, 11901], point = new Vector3();
  for (const spec of horses) {
    const runner = makeAyanHorse(spec), mesh = runner.group.getObjectByName("Object_11");
    const plan = { finish: 68 + spec.number / 4, early: 0.01, surge: -0.008 };
    const height = (t, hoof) => {
      const d = distance(plan, t), offset = laneX(spec.number - 1);
      runner.seekDistance(laneTravel(d, offset), true);
      runner.group.updateMatrixWorld(true);
      return mesh.getVertexPosition(soles[hoof], point).applyMatrix4(mesh.matrixWorld).y;
    };
    for (const {time, hoof} of hoofContacts(plan, spec.number, 24, 26)) {
      const contact = height(time, hoof);
      assert.ok(contact >= -0.003 && contact < 0.02);
      assert.ok(height(time - 0.020, hoof) > contact + 0.02);
    }
  }
});
