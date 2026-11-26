import { newGame, start } from "./race.js";
import { raceMoments } from "./race-moments.js";

export function localChallengeDay(now = Date.now()) {
  const fields = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Macau", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const date = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  return [date.year, date.month, date.day].join("-");
}

export function challengeDay(value, now = Date.now()) {
  const today = localChallengeDay(now);
  if (value === "daily") return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value + "T") ? value : null;
}

function randomFor(day, salt) {
  let seed = (Number(day.replaceAll("-", "")) ^ salt) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
}

export function newChallenge(day) {
  const rng = randomFor(day, 0xd143ed39);
  const game = newGame(rng, 1 + Math.floor(rng() * 6));
  game.race.name = "每日直路挑戰";
  game.balance = 0;
  return game;
}

export function startChallenge(game, day, now = Date.now()) {
  start(game, now, randomFor(day, 0xf475dd27));
  game.race.elapsed = raceMoments(game.race)[1].time - 2;
  game.race.anchor = now;
}
