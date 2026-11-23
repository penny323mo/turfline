import test from "node:test";
import assert from "node:assert/strict";
import { hoofContacts } from "../src/race-audio.js";
import { distance, newGame, start } from "../src/race.js";
import { stanceStarts, strideCount } from "../src/stride.js";

test("four-beat sound follows each runner through the break, the finish and adjoining audio windows", () => {
  const game = newGame(() => 0.47);
  start(game, 0, () => 0.47);
  game.race.plan.forEach((horse, i) => {
    const number = i + 1, stop = horse.finish + 2;
    const events = hoofContacts(horse, number, -1, stop);
    assert.deepEqual(hoofContacts(horse, number, -3, 0), []);
    assert.deepEqual(hoofContacts(horse, number, stop, stop + 1), []);
    assert.ok(events.length > 600);
    for (const [j, event] of events.entries()) {
      assert.ok(event.time > 0 && event.time <= horse.finish + 22 / 17);
      if (j) assert.equal(event.hoof, (events[j - 1].hoof + 1) % 4);
      const phase = strideCount(number, distance(horse, event.time)) - event.stride;
      assert.ok(Math.abs(phase - stanceStarts[event.hoof]) < 0.034);
    }
    const windows = [];
    for (let t = -1; t < stop; t += 0.12)
      windows.push(...hoofContacts(horse, number, t, Math.min(stop, t + 0.12)));
    assert.deepEqual(windows.map(e => [e.stride,e.hoof]), events.map(e => [e.stride,e.hoof]));
    windows.forEach((event, j) => assert.ok(Math.abs(event.time - events[j].time) < 0.0002));
  });
});
