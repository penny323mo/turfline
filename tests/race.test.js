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
  RUN_OUT_SECONDS,
  runOutEnd,
  stopDistance,
  elapsed,
  snapshot,
  snapshotAt,
  LENGTH,
} from "../src/race.js";
import { finishReplay } from "../src/replay.js";

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
    ["exacta", [1], 50],
    ["exacta", [3, 3], 50],
    ["exacta", [1, 4, 5], 50],
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
test("all 30 exactas quote their ordered draw and only the winning sequence pays", () => {
  const rng = seeded(4), game = newGame(rng), race = game.race;
  const p = race.probabilities;
  for (let first = 0; first < 6; first++) {
    for (let second = 0; second < 6; second++) {
      if (first === second) continue;
      const picks = [first, second], chance = p[first] * p[second] / (1 - p[first]);
      assert.equal(odds(race, "exacta", picks), Math.floor(9.2 / chance) / 10);
      wager(game, { id: picks.join("-"), market: "exacta", picks, stake: 10 });
    }
  }
  assert.equal(game.balance, 700);
  start(game, 0, rng);
  assert.equal(settle(game, 120000), true);
  const winningOrder = race.settlement.order.slice(0, 2);
  const winners = game.history[0].tickets.filter(ticket => ticket.paid > 0);
  assert.equal(winners.length, 1);
  assert.deepEqual(winners[0].picks, winningOrder);
  assert.equal(winners[0].paid, returns(10, winners[0].price));
  assert.equal(game.balance, 700 + winners[0].paid);
  assert.equal(settle(game, 150000), false);
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

test("the new field stays in reach at halfway and different runners can take the lead late", () => {
  const rng = seeded(1519), spans = [];
  let leadChanges = 0;
  for (let i = 0; i < 1000; i++) {
    const g = newGame(rng);
    start(g, 0, rng);
    const halfway = snapshotAt(g.race, 34);
    spans.push(Math.max(...halfway.ds) - Math.min(...halfway.ds));
    if (halfway.order[0] !== snapshotAt(g.race, 75).order[0]) leadChanges++;
  }
  spans.sort((a, b) => a - b);
  assert.ok(spans[500] < 35 && spans[950] < 50);
  assert.ok(leadChanges > 350);
});

test("replay pauses on the official winning instant, seeks, and never alters the settled save", () => {
  const g = newGame(seeded());
  start(g, 100, seeded(7));
  settle(g, 100000);
  const original = structuredClone(g), winner = g.race.settlement.order[0];
  let clock = 300;
  const replay = finishReplay(g.race, () => clock);
  clock += 2;
  assert.equal(replay.position(), replay.from + 1);
  replay.setRate(0.25);
  clock += 4;
  assert.equal(replay.position(), replay.from + 2);
  replay.pauseAt(replay.winnerTime);
  clock += 5;
  assert.equal(replay.position(), g.race.plan[winner].finish);
  const frame = snapshotAt(g.race, replay.position());
  assert.equal(frame.ds[winner], LENGTH);
  assert.equal(frame.ds.filter((d) => d >= LENGTH).length, 1);
  assert.equal(replay.playing, false);
  replay.toggle();
  clock += 30;
  assert.equal(replay.position(), replay.to);
  assert.equal(replay.playing, false);
  replay.toggle();
  assert.equal(replay.position(), replay.from);
  assert.deepEqual(g, original);
});

test("settlement pays at the line while all camera clocks follow the smooth run-out to rest", () => {
  const g = newGame(seeded(519));
  start(g, 100, seeded(4));
  changeSpeed(g, 2, 4100);
  const r = g.race, end = runOutEnd(r), last = end - RUN_OUT_SECONDS;
  for (const h of r.plan) {
    const speed = t => (distance(h, t + 0.0001) - distance(h, t)) / 0.0001;
    assert.ok(Math.abs(speed(h.finish - 0.0001) - speed(h.finish)) < 0.001);
    let previous = speed(h.finish);
    for (let i = 1; i <= 64; i++) {
      const v = speed(h.finish + RUN_OUT_SECONDS * i / 64);
      assert.ok(v >= 0 && v <= previous + 1e-7);
      previous = v;
    }
    assert.equal(distance(h, end + 2), stopDistance(h));
  }
  const wall = r.anchor + (last + 0.001 - r.elapsed) * 1000 / r.speed;
  assert.ok(settle(g, wall));
  const record = structuredClone(g);
  assert.ok(Math.abs(elapsed(r, wall) - last - 0.001) < 1e-6);
  assert.ok(Math.abs(elapsed(r, wall + 1000) - last - 2.001) < 1e-6);
  assert.equal(elapsed(r, wall + 60000), end);
  const mixed = { plan: [{ finish: 68, early: 0, surge: -0.02 }, { finish: 68.2, early: 0, surge: 0.02 }] };
  const pulledUp = snapshotAt(mixed, 80);
  assert.ok(pulledUp.ds[1] > pulledUp.ds[0]);
  assert.deepEqual(pulledUp.order, [0, 1]);
  for (const scope of ["full", "pullup"]) {
    const replay = finishReplay(r, () => 0, scope);
    assert.equal(replay.from, scope === "full" ? -3 : r.plan[r.settlement.order[0]].finish);
    replay.pauseAt(Infinity);
    assert.equal(replay.position(), end);
    assert.equal(replay.playing, false);
  }
  assert.deepEqual(g, record);
});

test("hoof-by-hoof replay finds both neighbouring strikes of the selected runner at any clock position", () => {
  const rng = seeded(58), game = newGame(rng);
  start(game,0,rng);
  settle(game,200000);
  const wallet = JSON.stringify(game);
  const playback = finishReplay(game.race,() => 0,"stride");
  assert.equal(playback.from,-3);
  for (let runner=0; runner<6; runner++) {
    const first = playback.footsteps(runner,playback.from);
    assert.ok(!first.previous && !first.current && first.next.time > 0);
    const middle = playback.footsteps(runner,32);
    assert.ok(middle.previous.time < 32 && middle.next.time > 32);
    const exact = playback.footsteps(runner,middle.next.time);
    assert.deepEqual(exact.current,middle.next);
    assert.deepEqual(exact.previous,middle.previous);
    const [enter,exit] = game.race.plan[runner].leadChanges;
    const order = stride => stride >= enter && stride < exit ? [1,0,3,2] : [0,1,2,3];
    assert.equal(order(exact.next.stride).indexOf(exact.next.hoof),(order(exact.current.stride).indexOf(exact.current.hoof)+1)%4);
    assert.equal(playback.changeFootfall(runner,0).hoof,2);
    assert.equal(playback.changeFootfall(runner,1).hoof,3);
    assert.deepEqual(playback.footsteps(runner,exact.next.time).previous,exact.current);
    const last = playback.footsteps(runner,playback.to);
    assert.ok(last.previous.time < playback.to && !last.next);
  }
  assert.equal(JSON.stringify(game),wallet);
});

test("finish review stops at each official crossing and compares consecutive runners without resettling tickets", () => {
  const rng = seeded(71), game = newGame(rng);
  for (const [id,market,picks,stake] of [
    ["a","win",[3],20], ["b","place",[1],10], ["c","pair",[3,1],10], ["d","win",[4],10],
  ]) wager(game,{id,market,picks,stake});
  start(game,0,rng);
  settle(game,200000);
  assert.deepEqual(game.race.settlement,{order:[3,1,4,2,0,5],stake:50,paid:287});
  assert.deepEqual(game.race.tickets.map(ticket => ticket.paid),[138,21,128,0]);
  assert.equal(game.balance,1237);
  const before = JSON.stringify(game), order = game.race.settlement.order;
  const review = finishReplay(game.race,() => 0);
  for (const [rank,runner] of order.entries()) {
    const crossing = review.crossing(runner);
    const other = order[rank === 0 ? 1 : rank-1];
    assert.equal(crossing.rank,rank+1);
    assert.equal(crossing.other,other);
    assert.equal(crossing.gap,Math.abs(game.race.plan[runner].finish-game.race.plan[other].finish));
    review.pauseAt(crossing.time);
    assert.equal(review.position(),game.race.plan[runner].finish);
    assert.ok(Math.abs(distance(game.race.plan[runner],review.position())-1200)<1e-9);
  }
  assert.equal(JSON.stringify(game),before);
});
