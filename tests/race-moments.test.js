import test from "node:test";
import assert from "node:assert/strict";
import { checkpoints, raceMoments } from "../src/race-moments.js";
import { snapshotAt } from "../src/race.js";
import { finishReplay } from "../src/replay.js";

// Older saved plans only carry the original pace parameters.
const plan = [69, 68, 70, 70.2, 70.7, 71].map((finish, i) => ({
  finish, early: i === 0 ? 0.019 : -0.01, surge: i === 0 ? 0.013 : 0,
}));
const race = { plan, settlement: { order: [1, 0, 2, 3, 4, 5] } };

test("each report uses the field as the first horse reaches the course marker", () => {
  const moments = raceMoments(race);
  for (const [i, moment] of moments.entries()) {
    const before = snapshotAt(race, moment.time - 0.001);
    const at = snapshotAt(race, moment.time);
    assert.ok(Math.max(...before.ds) < checkpoints[i].metres);
    assert.ok(Math.abs(Math.max(...at.ds) - checkpoints[i].metres) < 0.001);
    assert.deepEqual([moment.leader, moment.second], at.order.slice(0, 2));
    assert.equal(moment.gap, at.ds[at.order[0]] - at.ds[at.order[1]]);
  }
  assert.notEqual(moments[0].leader, moments.at(-1).leader);
  assert.equal(moments.at(-1).time, plan[race.settlement.order[0]].finish);
  assert.deepEqual(raceMoments(structuredClone(race)), moments);
});

test("each five-second highlight opens before the marker, stops, and can play again", () => {
  const saved = structuredClone(race);
  for (const [i, moment] of raceMoments(race).entries()) {
    let now = 0;
    const replay = finishReplay(race, () => now, "moment", i);
    assert.equal(replay.position(), moment.time - 3);
    assert.equal(replay.to, moment.time + 2);
    now = 6;
    assert.equal(replay.position(), moment.time);
    now = 15;
    assert.equal(replay.playing, false);
    assert.equal(replay.position(), replay.to);
    replay.toggle();
    assert.equal(replay.position(), replay.from);
    assert.equal(replay.playing, true);
  }
  assert.deepEqual(race, saved);
});
