import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, Box3, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { laneX, horses } from "../src/data.js";
import { walkStride, walkSpeed, walkBeats, walkSupport, paradePoint } from "../src/parade.js";
import { strideCount, strideLength } from "../src/stride.js";
import { prepareHorseDetail } from "../src/horse-detail.js";
import { hoofContacts } from "../src/race-audio.js";
import { newGame, start, distance, RUN_OUT_SECONDS, stopDistance } from "../src/race.js";
import { bendEntry, bendExit, bendLean, coursePoint, laneTravel } from "../src/course.js";
import { linePose, racingDistance } from "../src/racing-line.js";
import { attachStartingStalls } from "../src/landscape.js";
import { ayanViewBox, mountedViewBounds, placeRunnerFrame } from "../src/stage.js";
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

test("software camera bounds enclose the mounted silhouette throughout a leaning stride", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const frame = new Group(), runner = makeAyanHorse(horses[2]);
  frame.add(runner.group);
  const vertex = new Vector3(), centre = new Vector3(), toLocal = new Matrix4();
  for (let i = 0; i < 20; i++) {
    const lean = i % 2 ? 0.4 : -0.30;
    placeRunnerFrame(frame,{ x: 14, z: 47, heading: i * 0.19 },lean);
    runner.group.position.z = 0;
    runner.seekDistance(40+i*0.38,true,1200,lean);
    runner.group.position.z = -runner.noseLead;
    frame.updateMatrixWorld(true);
    runner.group.getWorldPosition(centre);
    centre.y += mountedViewBounds.height;
    toLocal.copy(runner.group.matrixWorld).invert();
    runner.group.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
        mesh.getVertexPosition(j,vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(vertex.distanceToSquared(centre) < mountedViewBounds.radius ** 2);
        assert.ok(ayanViewBox.containsPoint(vertex.applyMatrix4(toLocal)));
      }
    });
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

function skinPoint(mesh,vertex) {
  return mesh.getVertexPosition(vertex,new Vector3()).applyMatrix4(mesh.matrixWorld);
}

// Opposite vertices of the rigid glove ellipsoid give its visible centre.
function gloveEnds(jacket,side) {
  const joint = jacket.skeleton.bones.findIndex(b => b.name === "Jockey"+side+"Hand");
  const {skinIndex,position} = jacket.geometry.attributes;
  let min, max;
  for (let i=0; i<position.count; i++) if (skinIndex.getX(i) === joint) {
    if (min === undefined || position.getX(i) < position.getX(min)) min = i;
    if (max === undefined || position.getX(i) > position.getX(max)) max = i;
  }
  assert.notEqual(min,max);
  return [min,max];
}

test("the fitted jockey keeps shared vertices across adjacent triangles", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const horse = makeAyanHorse(horses[0]);
  for (const name of ["JockeyLegs","JockeyUpperBody"]) {
    const geometry = horse.group.getObjectByName(name).geometry;
    assert.ok(geometry.index && geometry.attributes.position.count < geometry.index.count / 2);
  }
});

test("software detail selects and restores the original fittings as the camera zooms", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const actors = [makeAyanHorse(horses[0]),makeAyanHorse(horses[5])];
  const subject = actors[0].group, jacket = subject.getObjectByName("JockeyUpperBody");
  const full = jacket.geometry, body = subject.getObjectByName("Object_11"), coat = body.geometry;
  const reins = subject.getObjectByName("RacingReins"), strap = reins.geometry;
  const fit = await prepareHorseDetail(actors), camera = new PerspectiveCamera(35,1.75,0.08,2300);
  function from(z,zoom = 1) {
    camera.position.set(0,1.7,z);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    fit(camera,530);
  }
  from(85);
  const wide = jacket.geometry;
  assert.ok(wide.index.count < 0.45 * full.index.count);
  assert.equal(wide.attributes,full.attributes);
  assert.equal(wide.morphAttributes,full.morphAttributes);
  from(2,4);
  assert.equal(jacket.geometry,full);
  from(85);
  assert.equal(jacket.geometry,wide);
  assert.equal(body.geometry,coat);
  assert.equal(reins.geometry,strap);
});

test("airborne hooves swing clear, planted hooves track straight and the rider steadies their head", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const horse = makeAyanHorse(horses[0]), group = horse.group;
  const soles = [14273,12585,13645,11901], body = group.getObjectByName("Object_11");
  const all = soles.map(() => []), ground = soles.map(() => []);
  const head = [], chest = [], q = new Quaternion();
  const span = values => Math.max(...values) - Math.min(...values);
  for (let i=0; i<200; i++) {
    horse.seek(i*strideLength(1)/(16*200),true,16);
    group.updateMatrixWorld(true);
    for (const [j,index] of soles.entries()) {
      const p = skinPoint(body,index);
      all[j].push(p.x);
      if (p.y < 0.015) ground[j].push(p.x);
    }
    for (const [joint,angles] of [["JockeyChest",chest],["JockeyHead",head]]) {
      group.getObjectByName(joint).getWorldQuaternion(q);
      angles.push(Math.asin(new Vector3(0,0,1).applyQuaternion(q).y));
    }
  }
  for (const [i,travel] of all.entries()) {
    assert.ok(span(travel) > (i<2 ? 0.045 : 0.027));
    assert.ok(ground[i].length > 20 && span(ground[i]) < 0.002);
  }
  assert.ok(span(head) > 0.04 && span(head) < 0.6*span(chest));
});

test("both visible reins meet each palm and bit as all six riders bend their elbows", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64,"+bytes.toString("base64"));
  for (const spec of horses) {
    const actor = makeAyanHorse(spec), group = actor.group;
    const reins = group.getObjectByName("RacingReins"), jacket = group.getObjectByName("JockeyUpperBody");
    const sides = ["Right","Left"].map((side,i) => ({
      side, indices: gloveEnds(jacket,side), start: i*(9*8 + 9*25),
      cheek: group.getObjectByName(i ? "Object_13" : "Object_15"), vertex: i ? 103 : 184, angles: [],
    }));
    for (let i=0; i<=100; i++) {
      const fraction = ((i*37)%101)/100;
      for (const d of [fraction*3, 440+8*fraction, 1200-fraction*3]) {
        actor.seekDistance(d,d>0,1200,d>400 && d<500 ? 0.16 : 0);
        group.updateMatrixWorld(true);
        for (const {side,indices,start,cheek,vertex,angles} of sides) {
          const palm = skinPoint(jacket,indices[0]).lerp(skinPoint(jacket,indices[1]),0.5);
          const middle = offset => skinPoint(reins,start+offset).lerp(skinPoint(reins,start+offset+4),0.5);
          assert.ok(palm.distanceTo(middle(0)) < 0.001);
          const ring = offset => skinPoint(reins,start+72+offset).lerp(skinPoint(reins,start+72+100+offset),0.5);
          assert.ok(middle(64).distanceTo(ring(0)) < 0.001);
          assert.ok(skinPoint(cheek,vertex).distanceTo(ring(6)) < 0.003);
          if (d>400 && d<500) {
            const joint = name => group.getObjectByName("Jockey"+side+name).getWorldPosition(new Vector3());
            const elbow = joint("Elbow");
            angles.push(joint("Shoulder").sub(elbow).angleTo(palm.sub(elbow)));
          }
        }
      }
    }
    for (const {angles} of sides) assert.ok(Math.max(...angles)-Math.min(...angles) > Math.PI/18);
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
    const jacket = group.getObjectByName("JockeyUpperBody"), reins = group.getObjectByName("RacingReins");
    for (const side of ["Right","Left"]) {
      const wrist = jacket.skeleton.bones.findIndex(b => b.name === "Jockey"+side+"Hand");
      points.push(skinPoint(jacket,jacket.geometry.attributes.skinIndex.array.indexOf(wrist)/4));
    }
    const head = jacket.skeleton.bones.findIndex(b => b.name === "JockeyHead");
    points.push(skinPoint(jacket,jacket.geometry.attributes.skinIndex.array.indexOf(head)/4));
    return [...points, ...[0,35,64,78,297,332,361,375].map(i => skinPoint(reins,i)),
      group.getObjectByName("JockeyWaist").getWorldPosition(new Vector3())];
  }
  const walkClip = baked.animations.find(a => a.name === "ParadeWalk");
  assert.ok(Math.abs(walkClip.duration - walkStride/walkSpeed) < 0.00001);
  for (const gait of [clip, walkClip]) {
    playback.stopAllAction();
    playback.clipAction(gait).reset().play();
    for (let i=0; i<73; i++) {
      const t = gait.duration * ((i * 37) % 73) / 73;
      if (gait === walkClip) runner.walk(t*walkSpeed);
      else runner.seek(t,true,16);
      playback.setTime(t);
      runner.group.updateMatrixWorld(true);
      baked.scene.updateMatrixWorld(true);
      const actual = samples(runner.group), exported = samples(baked.scene);
      actual.forEach((p,j) => assert.ok(p.distanceTo(exported[j]) < 0.002));
      assert.ok(Math.abs(runner.group.getObjectByName("JockeyLegs").morphTargetInfluences[0]
        - baked.scene.getObjectByName("JockeyLegs").morphTargetInfluences[0]) < 0.001);
    }
  }
  const period = strideLength(1)/16;
  for (const [name,cycles,start] of [["GallopRight",1,50],["ChangeToRight",2,39],["ChangeToLeft",2,89]]) {
    const action = baked.animations.find(a => a.name === name);
    assert.ok(Math.abs(action.duration-period*cycles) < 0.00001);
    playback.stopAllAction();
    playback.clipAction(action).reset().play();
    for (let n=0; n<79; n++) {
      const t = period*cycles*((n*31)%79)/79;
      runner.seekDistance((start+t/period)*strideLength(1),true,Infinity,0,0,[40,90]);
      playback.setTime(t);
      runner.group.updateMatrixWorld(true);
      baked.scene.updateMatrixWorld(true);
      const exported = samples(baked.scene);
      samples(runner.group).forEach((p,j) => assert.ok(p.distanceTo(exported[j]) < 0.002,
        name+" at "+t.toFixed(4)+"s, landmark "+j));
    }
  }
  const plan = { finish: 68, early: 0.008, surge: 0.006 }, lane = laneX(0);
  for (const [name, start] of [["GateBreak", 0], ["PullUp", plan.finish]]) {
    const transition = baked.animations.find(a => a.name === name);
    assert.equal(transition.duration, name === "GateBreak" ? 2.5 : RUN_OUT_SECONDS);
    playback.stopAllAction();
    playback.clipAction(transition).reset().play();
    for (let i = 0; i < 73; i++) {
      const t = transition.duration * ((31 * i) % 73) / 73;
      runner.seekDistance(laneTravel(distance(plan, t + start), lane), t + start > 0,
        laneTravel(stopDistance(plan), lane));
      playback.setTime(t);
      runner.group.updateMatrixWorld(true);
      baked.scene.updateMatrixWorld(true);
      const exported = samples(baked.scene);
      samples(runner.group).forEach((p, j) => assert.ok(p.distanceTo(exported[j]) < 0.004,
        name+" at "+t.toFixed(4)+"s, landmark "+j+" differs by "+p.distanceTo(exported[j]).toFixed(5)+"m"));
    }
  }
});

test("audible strikes coincide with the first descent to turf of the corresponding skinned hoof", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const soles = [14273, 12585, 13645, 11901], point = new Vector3();
  const game = newGame(() => 0.39);
  start(game, 0, () => 0.39);
  for (const [i,spec] of horses.entries()) {
    const runner = makeAyanHorse(spec), mesh = runner.group.getObjectByName("Object_11");
    const plan = game.race.plan[i];
    const height = (t, hoof) => {
      const d = distance(plan, t);
      const banking = linePose(plan,i,d,(d-distance(plan,t-0.02))/0.02).lean;
      runner.seekDistance(racingDistance(plan,i,d), true, racingDistance(plan,i,stopDistance(plan)), banking, linePose(plan,i,d).curvature,plan.leadChanges);
      runner.group.updateMatrixWorld(true);
      return mesh.getVertexPosition(soles[hoof], point).applyMatrix4(mesh.matrixWorld).y;
    };
    for (const {time, hoof, stride} of hoofContacts(plan, spec.number, 0, plan.finish)) {
      const nearChange = plan.leadChanges.some(change => Math.abs(stride-change) <= 1);
      if (!nearChange && (time < 24 || time > 26)) continue;
      const contact = height(time, hoof), before = height(time - 0.020, hoof);
      const label = spec.number+" hoof "+hoof+" stride "+stride+" at "+time+"s";
      assert.ok(contact >= -0.003 && contact < 0.02, label+" contacts at "+contact+"m");
      assert.ok(before > contact + 0.02, label+" descent "+(before-contact)+"m");
    }
  }
});

test("all six shorten their steps at the break and return all four soles to turf at a halt", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  const soles = [14273, 12585, 13645, 11901];
  for (const spec of horses) {
    const plan = { finish: 68, early: 0.008, surge: 0.006 };
    const actor = makeAyanHorse(spec), mesh = actor.group.getObjectByName("Object_11");
    const lane = laneX(spec.number - 1), stop = laneTravel(stopDistance(plan), lane);
    function sample(t) {
      actor.seekDistance(laneTravel(distance(plan, t), lane), t > 0, stop);
      actor.group.updateMatrixWorld(true);
      return soles.map(v => mesh.getVertexPosition(v, new Vector3()).applyMatrix4(mesh.matrixWorld));
    }
    const rest = sample(0), after = sample(plan.finish + 4);
    assert.ok(after.some((p, i) => p.distanceTo(rest[i]) > 0.1));
    for (const [from, to] of [[0, 2.5], [plan.finish + 4, plan.finish + RUN_OUT_SECONDS]]) {
      const impacts = hoofContacts(plan, spec.number, from, to);
      assert.equal(new Set(impacts.map(e => e.hoof)).size, 4);
      for (const e of impacts) assert.ok(Math.abs(sample(e.time)[e.hoof].y) < 0.02);
    }
    const halt = sample(plan.finish + RUN_OUT_SECONDS);
    halt.forEach((p, i) => assert.ok(p.y < 0.006 && p.distanceTo(rest[i]) < 0.00001));
    const repeat = sample(plan.finish + 4);
    after.forEach((p, i) => assert.ok(p.distanceTo(repeat[i]) < 0.00001));
  }
});

test("all six mounted runners keep each support on its patch of turf through the break, a bend and the pull-up", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64," + bytes.toString("base64"));
  let seed = 58;
  const rng = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const game = newGame(rng);
  start(game, 0, rng);
  for (const [i,spec] of horses.entries()) {
    const h = game.race.plan[i], runner = makeAyanHorse(spec), frame = new Group();
    frame.add(runner.group);
    const stop = racingDistance(h,i,stopDistance(h));
    function sample(t) {
      const d = distance(h,t), speed = (d - distance(h,t-0.01)) / 0.01;
      const pt = linePose(h,i,d,speed);
      placeRunnerFrame(frame,pt,pt.lean);
      runner.group.position.z = 0;
      runner.seekDistance(racingDistance(h,i,d),true,stop,pt.lean,pt.curvature,h.leadChanges);
      runner.group.position.z = -runner.noseLead;
      frame.updateMatrixWorld(true);
      return [0,1,2,3].map(hoof => runner.hoofPosition(hoof,new Vector3()));
    }
    for (const [from,to] of [[0.4,3.5],[10,13],[28,32],[h.finish+2.5,h.finish+7.3]]) {
      const contacts = [[],[],[],[]], drift = [[],[],[],[]];
      for (let n=0; n<=(to-from)*240; n++) {
        sample(from+n/240).forEach((v,hoof) => {
          const points = contacts[hoof];
          if (v.y < 0.018) points.push(v);
          else if (points.length) {
            if (points.length >= 5) {
              const a = points[0], b = points.at(-1);
              drift[hoof].push(Math.hypot(a.x-b.x,a.z-b.z));
            }
            points.length = 0;
          }
        });
      }
      for (const spans of drift) {
        assert.ok(spans.length >= 3, 'too few full supports for horse '+spec.number+' at '+from);
        spans.sort((a,b) => a-b);
        assert.ok(spans[Math.floor(spans.length/2)] < 0.014, 'support slides on horse '+spec.number+' at '+from);
      }
    }
    const target = sample(30.25);
    for (const t of [30.25,0.9,h.finish+7.1,12,30.25]) {
      const result = sample(t);
      if (t === 30.25) result.forEach((point,j) => assert.ok(point.distanceTo(target[j]) < 0.00001));
    }
  }
});

test("the walking field takes four separate beats, plants each sole around the ring and cuts cleanly to the gate", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64,"+bytes.toString("base64"));
  assert.deepEqual(walkBeats,[0,0.5,0.25,0.75]);
  for (const [i,spec] of horses.entries()) {
    const frame = new Group(), actor = makeAyanHorse(spec);
    frame.add(actor.group);
    const feet = () => walkBeats.map((_,j) => actor.hoofPosition(j,new Vector3()));
    let previous, grounded = 4;
    const slipping = [], raised = [0,0,0,0];
    for (let n=0; n<=140; n++) {
      const p = paradePoint(i,n/100);
      placeRunnerFrame(frame,p,0);
      actor.walk(p.metres);
      frame.updateMatrixWorld(true);
      const soles = feet();
      grounded = Math.min(grounded,soles.filter(p => p.y < 0.018).length);
      soles.forEach((foot,j) => {
        raised[j] = Math.max(raised[j],foot.y);
        const phase = (p.metres/walkStride + strideCount(spec.number,0) - walkBeats[j] + 1) % 1;
        if (phase > 0.02 && phase < walkSupport-0.02 && previous) {
          assert.ok(foot.y < 0.010);
          slipping.push(Math.hypot(foot.x-previous[j].x,foot.z-previous[j].z)*100);
        }
      });
      previous = soles;
    }
    assert.ok(grounded >= 2 && raised.every(h => h > 0.12));
    slipping.sort((a,b) => a-b);
    assert.ok(slipping[Math.floor(slipping.length*0.95)] < 0.015);
    actor.waitAt(-2.4);
    frame.updateMatrixWorld(true);
    const standing = feet();
    const ear = actor.group.getObjectByName("earL_8"), turned = ear.quaternion.clone();
    actor.waitAt(-1.6);
    frame.updateMatrixWorld(true);
    assert.ok(turned.angleTo(ear.quaternion) > 0.012);
    feet().forEach((p,j) => assert.ok(p.distanceTo(standing[j]) < 0.0001));
    actor.seekDistance(0,false,1200);
    frame.updateMatrixWorld(true);
    feet().forEach((p,j) => assert.ok(p.distanceTo(standing[j]) < 0.0001));
  }
});

test("a flying change keeps its supports, reaches the inside foreleg and reproduces every seam after a seek", async () => {
  const bytes = await asset("horse-ayan.glb");
  await loadAyanHorse("data:model/gltf-binary;base64,"+bytes.toString("base64"));
  const game = newGame(() => 0.39);
  start(game,0,() => 0.39);
  for (const [i,spec] of horses.entries()) {
    const h = game.race.plan[i], runner = makeAyanHorse(spec);
    const length = strideLength(spec.number), phase = strideCount(spec.number,0);
    const soles = () => [0,1,2,3].map(j => runner.hoofPosition(j,new Vector3()));
    function sample(count) {
      const d = (count-phase)*length;
      runner.seekDistance(d,true,Infinity,0,0,h.leadChanges);
      runner.group.updateMatrixWorld(true);
      return soles().map(p => { p.z += d-runner.noseLead; return p; });
    }
    for (const [k,change] of h.leadChanges.entries()) {
      for (const seam of [change-1,change+1]) {
        const before = sample(seam-0.000001), after = sample(seam+0.000001);
        sample(seam+13.8);
        const repeat = sample(seam+0.000001);
        after.forEach((p,j) => {
          assert.ok(p.distanceTo(before[j]) < 0.00015,"no cut at the edge of a change clip");
          assert.ok(p.distanceTo(repeat[j]) < 0.000001,"out-of-order pose drift");
        });
      }
      for (const stride of [change-1,change]) {
        const onRight = (k === 0) === (stride === change);
        const order = onRight ? [1,0,3,2] : [0,1,2,3];
        for (const [slot,beat] of [0,0.14,0.36,0.51].entries()) {
          const hoof = order[slot];
          const first = sample(stride+beat+0.07)[hoof], last = sample(stride+beat+0.16)[hoof];
          assert.ok(Math.max(first.y,last.y) < 0.018);
          assert.ok(first.distanceTo(last) < 0.016,"sliding through a lead change");
        }
      }
    }
    // The centre is to the right of a horse looking along this bend. Its
    // right fore sole must be closer to the centre than its left fore sole.
    const mid = (bendEntry+bendExit)/2;
    const pt = linePose(h,i,mid,16), frame = new Group();
    frame.add(runner.group);
    placeRunnerFrame(frame,pt,pt.lean);
    runner.seekDistance(racingDistance(h,i,mid),true,Infinity,pt.lean,pt.curvature,h.leadChanges);
    frame.updateMatrixWorld(true);
    const feet = soles();
    const inward = new Vector3(-Math.cos(pt.heading),0,Math.sin(pt.heading));
    assert.ok(feet[2].clone().sub(feet[3]).dot(inward) > 0.2);
  }
});
