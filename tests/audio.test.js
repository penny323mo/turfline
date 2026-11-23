import test from "node:test";
import assert from "node:assert/strict";
import { hoofContacts, raceAudio } from "../src/race-audio.js";
import { distance, newGame, RUN_OUT_SECONDS, start, stopDistance } from "../src/race.js";
import { raceStride, stanceStarts } from "../src/stride.js";
import { laneTravel } from "../src/course.js";
import { laneX } from "../src/data.js";

test("four-beat sound follows each runner through the break, the finish and adjoining audio windows", () => {
  const game = newGame(() => 0.47);
  start(game, 0, () => 0.47);
  game.race.plan.forEach((horse, i) => {
    const number = i + 1, stop = horse.finish + RUN_OUT_SECONDS;
    const events = hoofContacts(horse, number, -1, stop);
    assert.deepEqual(hoofContacts(horse, number, -3, 0), []);
    assert.deepEqual(hoofContacts(horse, number, stop, stop + 1), []);
    assert.ok(events.length > 600);
    for (const [j, event] of events.entries()) {
      assert.ok(event.time > 0 && event.time <= stop);
      if (j) assert.equal(event.hoof, (events[j - 1].hoof + 1) % 4);
      const offset = laneX(i);
      const phase = raceStride(number, laneTravel(distance(horse, event.time), offset),
        laneTravel(stopDistance(horse), offset)).count - event.stride;
      assert.ok(Math.abs(phase - stanceStarts[event.hoof]) < 0.034);
    }
    const windows = [];
    for (let t = -1; t < stop; t += 0.12)
      windows.push(...hoofContacts(horse, number, t, Math.min(stop, t + 0.12)));
    assert.deepEqual(windows.map(e => [e.stride,e.hoof]), events.map(e => [e.stride,e.hoof]));
    windows.forEach((event, j) => assert.ok(Math.abs(event.time - events[j].time) < 0.0002));
  });
});

test("a long device output queue keeps four distinct hits and cancels pending hits on a paused replay", async t => {
  const savedContext = globalThis.AudioContext, savedDocument = globalThis.document;
  t.after(() => {
    if (savedContext) globalThis.AudioContext = savedContext;
    else delete globalThis.AudioContext;
    if (savedDocument) globalThis.document = savedDocument;
    else delete globalThis.document;
  });
  let ctx;
  const hits = [];
  globalThis.document = { hidden: false };
  globalThis.AudioContext = class {
    currentTime = 1;
    sampleRate = 8000;
    outputLatency = 0.32;
    constructor() { ctx = this; }
    async resume() { this.state = "running"; }
    async suspend() { this.state = "suspended"; }
    createBuffer() { return { getChannelData: () => new Float32Array(1120) }; }
    createGain() {
      return { gain: { setTargetAtTime() {} }, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      return { playbackRate: {}, connect: gain => gain, disconnect() {},
        start(when) { this.when = when; hits.push(this); },
        stop() { this.stopped = true; } };
    }
  };
  const game = newGame(() => 0.42);
  start(game, 0, () => 0.42);
  const audio = raceAudio();
  await audio.toggle();
  for (let i = 0; i < 20; i++) {
    ctx.currentTime = 1 + i / 10;
    audio.step(game.race, 2, 30 + i / 10, 1, 65, true);
  }
  assert.ok(hits.length > 18);
  const expected = hoofContacts(game.race.plan[2], 3, 30.32, 32.46);
  assert.equal(hits.length, expected.length);
  hits.forEach((hit, i) => assert.ok(Math.abs(hit.when + 0.32 + 29 - expected[i].time) < 0.0003));
  audio.step(game.race, 2, 31.9, 0, 65, true);
  assert.ok(hits.every(hit => hit.stopped));
});
