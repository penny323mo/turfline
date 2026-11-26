import test from "node:test";
import assert from "node:assert/strict";
import { availableMeets, meetNumber, meetRound, meetStandings } from "../src/meet.js";

const result = (number, order = [0, 1, 2, 3, 4, 5]) => ({ number, order, paid: 0, stake: 0 });

test("a legacy race history scores the current and recent complete six-race days", () => {
  const history = Array.from({ length: 20 }, (_, i) => result(22 - i));
  const original = structuredClone(history);
  assert.deepEqual([6, 7, 22].map(meetNumber), [1, 2, 4]);
  assert.deepEqual([6, 7, 22].map(meetRound), [6, 1, 4]);
  assert.deepEqual(availableMeets(history, 4), [4, 3, 2]);
  const ongoing = meetStandings(history, 4);
  assert.equal(ongoing.completed, 4);
  assert.equal(ongoing.champion, null);
  assert.deepEqual(ongoing.rows.map(row => row.points), [40, 24, 16, 12, 8, 4]);
  assert.deepEqual(meetStandings(history, 3).champion, { runner: 0, points: 60, wins: 6 });
  const newDay = meetStandings(history, 5);
  assert.equal(newDay.completed, 0);
  assert.equal(newDay.champion, null);
  assert.ok(newDay.rows.every(row => row.points === 0 && row.wins === 0));
  assert.deepEqual(history, original);
});

test("equal points go to the most wins, then the better finish in the last race", () => {
  const latestFirst = [result(2, [1, 0, 2, 3, 4, 5]), result(1)];
  const tiedLeaders = meetStandings(latestFirst, 1).rows.slice(0, 2);
  assert.deepEqual(tiedLeaders, [
    { runner: 1, points: 16, wins: 1 },
    { runner: 0, points: 16, wins: 1 },
  ]);
  const equalPoints = meetStandings([
    result(3, [2, 3, 1, 4, 5, 0]),
    result(2, [2, 4, 1, 3, 5, 0]),
    result(1, [0, 2, 1, 3, 4, 5]),
  ], 1).rows.filter(row => row.runner <= 1);
  assert.deepEqual(equalPoints, [
    { runner: 0, points: 12, wins: 1 },
    { runner: 1, points: 12, wins: 0 },
  ]);
});
