import test from "node:test";
import assert from "node:assert/strict";
import { distance, lockLatePick, newGame, next, odds, settle, snapshot, start } from "../src/race.js";
import { latePickRewards } from "../src/late-pick.js";

const midpointRoll = () => 0.5;

test("race pace changes the same horse’s chance and the field’s actual early pace", () => {
  const game = newGame(midpointRoll);
  const races = [];
  for (const pace of ["even", "fast", "slow"]) {
    assert.equal(game.race.pace, pace);
    const earlyHorseOdds = odds(game.race, "win", [0]);
    const closingHorseOdds = odds(game.race, "win", [4]);
    start(game, 1000, midpointRoll);
    const horse = game.race.plan[0];
    const atHalfTime = distance(horse, horse.finish / 2);
    for (const runner of game.race.plan) {
      let previous = 0;
      for (let t = 0.25; t < runner.finish; t += 0.25) {
        const d = distance(runner, t);
        assert.ok(d > previous && d < 1200);
        previous = d;
      }
      assert.equal(distance(runner, runner.finish), 1200);
    }
    races.push({ earlyHorseOdds, closingHorseOdds, atHalfTime });
    settle(game, 100000);
    next(game, midpointRoll);
  }
  const [even, fast, slow] = races;
  assert.ok(fast.atHalfTime > even.atHalfTime + 60 && slow.atHalfTime < even.atHalfTime - 40);
  assert.ok(fast.earlyHorseOdds > even.earlyHorseOdds && slow.earlyHorseOdds < even.earlyHorseOdds);
  assert.ok(fast.closingHorseOdds < even.closingHorseOdds && slow.closingHorseOdds > even.closingHorseOdds);
});

test("late picks lock inside the live window at the quoted reward and pay once", () => {
  const game = newGame(midpointRoll);
  assert.throws(() => lockLatePick(game, 0, 20, 1000), /賽事進行/);
  start(game, 1000, midpointRoll);
  // Existing plans omit these fields and still support live predictions.
  delete game.race.pace;
  game.race.plan.forEach(horse => delete horse.paceBias);
  assert.throws(() => lockLatePick(game, 0, 20, 34000), /最後 200/);
  assert.throws(() => lockLatePick(game, 0, 20, 69000), /最後 200/);
  const during = 51000;
  const winner = game.race.plan.findIndex(horse => horse.finish === Math.min(...game.race.plan.map(h => h.finish)));
  const rank = snapshot(game.race, during).order.indexOf(winner);
  const reward = latePickRewards[rank];
  assert.throws(() => lockLatePick(game, winner, 0, during), /走位已變/);
  assert.throws(() => lockLatePick(game, -1, reward, during), /有效/);
  assert.equal(game.race.latePick, undefined);
  lockLatePick(game, winner, reward, during);
  assert.equal(game.balance, 1000);
  const saved = JSON.parse(JSON.stringify(game));
  assert.throws(() => lockLatePick(saved, winner, reward, during + 1000), /一次/);
  assert.equal(settle(saved, 100000), true);
  assert.equal(settle(saved, 110000), false);
  assert.equal(saved.balance, 1000 + reward);
  assert.equal(saved.race.settlement.paid, 0);
  assert.deepEqual(saved.history[0].latePick, { runner: winner, rank: rank + 1, reward, paid: reward });
  next(saved, midpointRoll);
  assert.equal(saved.race.latePick, undefined);

  const loser = snapshot(game.race, during).order.find(runner => runner !== winner);
  delete game.race.latePick;
  lockLatePick(game, loser, latePickRewards[snapshot(game.race, during).order.indexOf(loser)], during);
  settle(game, 100000);
  assert.equal(game.balance, 1000);
  assert.equal(game.history[0].latePick.paid, 0);
});
