import test from "node:test";
import assert from "node:assert/strict";
import { challengeDay, localChallengeDay, newChallenge, startChallenge } from "../src/challenge.js";
import { latePickOpen, latePickRewards } from "../src/late-pick.js";
import { lockLatePick, settle, snapshot } from "../src/race.js";
import { raceMoments } from "../src/race-moments.js";

test("today flips at midnight in Macau and a shared date stays pinned", () => {
  const before = Date.parse("2026-11-26T15:59:59Z");
  const after = before + 1000;
  assert.equal(localChallengeDay(before), "2026-11-26");
  assert.equal(challengeDay("daily", after), "2026-11-27");
  assert.equal(challengeDay("2026-11-26", after), "2026-11-26");
  for (const date of [null, "2026-11-28", "2026-09-31", "2026-11-7"])
    assert.equal(challengeDay(date, after), null);
});

test("matching challenge dates lock the same field and start just before the decision window", () => {
  const date = "2026-11-27";
  const first = newChallenge(date), peer = newChallenge(date), tomorrow = newChallenge("2026-11-28");
  startChallenge(first, date, 1000);
  startChallenge(peer, date, 9500);
  startChallenge(tomorrow, "2026-11-28", 1000);
  assert.deepEqual(first.race.plan, peer.race.plan);
  assert.notDeepEqual(first.race.plan, tomorrow.race.plan);
  assert.deepEqual(snapshot(first.race, 1000), snapshot(peer.race, 9500));
  assert.equal(latePickOpen(first.race, snapshot(first.race, 1000)), false);
  const during = 4000;
  const frame = snapshot(first.race, during);
  const winner = raceMoments(first.race).at(-1).leader;
  const reward = latePickRewards[frame.order.indexOf(winner)];
  assert.ok(latePickOpen(first.race, frame));
  lockLatePick(first, winner, reward, during);
  assert.throws(() => startChallenge(first, date, during));
  assert.throws(() => lockLatePick(first, winner, reward, during));
  assert.equal(settle(first, 60000), true);
  assert.equal(settle(first, 62000), false);
  assert.equal(first.balance, reward);
  assert.equal(first.race.tickets.length, 0);
});
