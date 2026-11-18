import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  wager,
  cancel,
  start,
  changeSpeed,
  settle,
  next,
  refill,
  odds,
  returns,
  distance,
  elapsed,
  snapshot,
  LENGTH,
} from "../src/race.js";

function seeded(seed = 712193) {
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
test("stake validation, ticket retry, locked odds and cancellation", () => {
  const g = newGame(seeded());
  for (const [market, picks, stake] of [
    ["win", [1], -20],
    ["win", [1], 15],
    ["win", [6], 50],
    ["pair", [0, 0], 50],
    ["pair", [1], 50],
    ["place", [3], 2000],
    ["bad", [1], 50],
  ]) {
    assert.throws(() => wager(g, { market, picks, stake, id: "bad" }));
  }
  assert.equal(g.balance, 1000);
  const ticket = { id: "a", market: "pair", picks: [4, 1], stake: 100 };
  wager(g, ticket);
  wager(g, ticket);
  assert.equal(g.balance, 900);
  assert.equal(g.race.tickets.length, 1);
  assert.equal(g.race.tickets[0].price, odds(g.race, "pair", [1, 4]));
  cancel(g, "a");
  cancel(g, "a");
  assert.equal(g.balance, 1000);
  start(g, 10000, seeded());
  assert.throws(() => wager(g, ticket));
  assert.throws(() => cancel(g, "a"));
  assert.throws(() => start(g));
});
test("each supported market settles from the finish order exactly once", () => {
  const rng = seeded(26),
    g = newGame(rng),
    race = g.race;
  for (let i = 0; i < 6; i++) {
    for (const market of ["win", "place"])
      wager(g, { id: market + i, market, picks: [i], stake: 10 });
    for (let j = i + 1; j < 6; j++)
      wager(g, {
        id: "pair" + i + j,
        market: "pair",
        picks: [i, j],
        stake: 10,
      });
  }
  assert.equal(g.balance, 730);
  start(g, 20000, rng);
  assert.equal(settle(g, 25000), false);
  assert.throws(() => next(g));
  assert.equal(settle(g, 120000), true);
  const [a, b] = race.settlement.order;
  const paid =
    returns(10, odds(race, "win", [a])) +
    returns(10, odds(race, "place", [a])) +
    returns(10, odds(race, "place", [b])) +
    returns(10, odds(race, "pair", [a, b]));
  assert.equal(g.balance, 730 + paid);
  assert.equal(race.tickets.filter((t) => t.paid > 0).length, 4);
  assert.equal(settle(g, 130000), false);
  assert.equal(g.history.length, 1);
  next(g, rng);
  assert.equal(g.race.number, 2);
  assert.deepEqual(g.race.tickets, []);
  assert.equal(g.balance, 730 + paid);
});
test("positions advance, cross 1200 at finish, and use ticket-independent race plans", () => {
  const winners = new Set();
  for (let k = 1; k <= 140; k++) {
    const rng = seeded(k * 197),
      g = newGame(rng),
      other = structuredClone(g);
    wager(other, { id: "ticket", market: "win", picks: [5], stake: 1000 });
    start(g, 1000, seeded(k * 10091));
    start(other, 1000, seeded(k * 10091));
    assert.deepEqual(g.race.plan, other.race.plan);
    for (const run of g.race.plan) {
      let last = 0;
      for (let t = 0; t < run.finish; t += 0.25) {
        const d = distance(run, t);
        assert.ok(d >= last && d < LENGTH);
        last = d;
      }
      assert.equal(distance(run, run.finish), LENGTH);
    }
    settle(g, 100000);
    winners.add(g.race.settlement.order[0]);
    assert.deepEqual(snapshot(g.race).order, g.race.settlement.order);
  }
  assert.equal(winners.size, 6);
});
test("countdown, speed changes, and reload preserve race time and wallet", () => {
  const g = newGame(seeded());
  start(g, 1000, seeded());
  assert.equal(elapsed(g.race, 2000), -2);
  changeSpeed(g, 2, 2500);
  assert.equal(elapsed(g.race, 4000), 0);
  assert.equal(elapsed(g.race, 5000), 2);
  changeSpeed(g, 1, 5000);
  assert.equal(elapsed(g.race, 6000), 3);
  const copy = JSON.parse(JSON.stringify(g));
  assert.deepEqual(snapshot(g.race, 17000), snapshot(copy.race, 17000));
  settle(copy, 200000);
  assert.equal(copy.balance, 1000);
});
test("arcade credit top-up requires an empty, unfunded open slip; history is bounded", () => {
  const rng = seeded(66),
    g = newGame(rng);
  assert.throws(() => refill(g));
  wager(g, { id: "all", market: "win", picks: [5], stake: 1000 });
  assert.throws(() => refill(g));
  g.race.tickets = [];
  refill(g);
  assert.equal(g.balance, 1000);
  for (let i = 0; i < 24; i++) {
    start(g, 1000, rng);
    settle(g, 100000);
    next(g, rng);
  }
  assert.equal(g.history.length, 20);
  assert.equal(g.history[0].number, 24);
});
