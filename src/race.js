import { LENGTH } from "./course.js";
import { planLeadChanges } from "./gallop-lead.js";
import { planRacingLines } from "./traffic.js";
import { meetNumber, meetRound } from "./meet.js";
import { paceForRace, racePace } from "./race-pace.js";
import { latePickOpen, latePickRewards } from "./late-pick.js";
export { LENGTH } from "./course.js";
export const RUN_OUT_SECONDS = 8;
export const GATES = 3;
export const STARTING_FUNDS = 1000;
export const markets = { win: "獨贏", place: "位置", pair: "連贏" };
export const styles = ["領放", "跟前", "後上", "前置", "留後", "跟前"];
const names = [
  "翠谷短途盃",
  "晨曦草地錦標",
  "金葉短途挑戰盃",
  "銀灣紀念盃",
  "綠茵冠軍盃",
  "日落競速盃",
];
const strengths = [1.45, 1.19, 1.05, 0.92, 0.8, 0.7];

function uniform() {
  return (crypto.getRandomValues(new Uint32Array(1))[0] + 0.5) / 4294967296;
}
function raceCard(number, rng) {
  const pace = paceForRace(meetRound(number), meetNumber(number));
  const form = racePace({ pace });
  const weights = strengths.map((base, i) => base * form.weight[i] * (0.7 + 0.65 * rng()));
  const total = weights.reduce((a, b) => a + b, 0);
  return {
    number,
    name: names[meetRound(number) - 1],
    pace,
    probabilities: weights.map((w) => w / total),
    phase: "open",
    tickets: [],
    plan: null,
    anchor: 0,
    elapsed: 0,
    speed: 1,
    settlement: null,
  };
}
export function newGame(rng = uniform, raceNumber = 1) {
  return {
    version: 1,
    balance: STARTING_FUNDS,
    race: raceCard(raceNumber, rng),
    history: [],
  };
}
export function odds(race, market, picks) {
  if (
    !Object.hasOwn(markets, market) ||
    picks.length !== (market === "pair" ? 2 : 1) ||
    new Set(picks).size !== picks.length ||
    picks.some((n) => !Number.isInteger(n) || n < 0 || n >= 6)
  )
    throw Error("請選擇有效嘅出賽馬匹。");
  const p = race.probabilities;
  const a = picks[0],
    b = picks[1];
  let probability = p[a];
  if (market === "place")
    probability += p.reduce(
      (sum, other, i) => sum + (i === a ? 0 : (other * p[a]) / (1 - other)),
      0,
    );
  if (market === "pair")
    probability = p[a] * p[b] * (1 / (1 - p[a]) + 1 / (1 - p[b]));
  return Math.max(1.1, Math.floor(9.2 / probability) / 10);
}
export const returns = (stake, price) =>
  Math.floor((stake * Math.round(price * 10)) / 10);
function requireOpen(race) {
  if (race.phase !== "open") throw Error("今場已經封盤。");
}
export function wager(game, { market, picks, stake, id }) {
  const race = game.race;
  if (race.tickets.some((t) => t.id === id)) return;
  requireOpen(race);
  const price = odds(race, market, picks);
  if (!Number.isSafeInteger(stake) || stake < 10 || stake % 10)
    throw Error("注碼須為 10 的正整數倍。");
  if (stake > game.balance) throw Error("代幣餘額不足。");
  if (race.tickets.length >= 100) throw Error("每場最多 100 張注單。");
  race.tickets.push({ id, market, picks: [...picks], stake, price });
  game.balance -= stake;
}
export function cancel(game, id) {
  requireOpen(game.race);
  const index = game.race.tickets.findIndex((t) => t.id === id);
  if (index < 0) return;
  game.balance += game.race.tickets.splice(index, 1)[0].stake;
}
function drawPlan(race, rng) {
  // Sequential weighted sampling gives the same order probabilities used in the odds board.
  const remaining = race.probabilities.map((p, i) => ({ p, i }));
  const pace = racePace(race);
  let finish = 67 + rng() * 3;
  const plan = new Array(6);
  while (remaining.length) {
    let mark = rng() * remaining.reduce((acc, h) => acc + h.p, 0);
    let index = remaining.findIndex((h) => (mark -= h.p) < 0);
    if (index === -1) index = remaining.length - 1;
    const { i } = remaining.splice(index, 1)[0];
    plan[i] = {
      finish,
      early:
        [0.016, 0.006, -0.012, 0.010, -0.016, 0.002][i] + pace.early[i] + (rng() - 0.5) * 0.012,
      surge: pace.surge[i] + (rng() - 0.5) * 0.021,
      paceBias: pace.bias,
    };
    finish += 0.09 + rng() * 0.43;
  }
  return plan;
}
export function start(game, now = Date.now(), rng = uniform) {
  requireOpen(game.race);
  const race = game.race;
  race.plan = drawPlan(race, rng);
  const lines = planRacingLines(race.plan, distance, runOutEnd(race));
  race.plan.forEach((h, i) => {
    h.line = lines[i];
    h.leadChanges = planLeadChanges(h,i);
  });
  race.phase = "running";
  race.anchor = now + GATES * 1000;
  race.elapsed = 0;
}
export function elapsed(race, now = Date.now()) {
  if (!race.plan) return 0;
  const delta = (now - race.anchor) / 1000;
  const t = race.elapsed + delta * (delta < 0 ? 1 : race.speed);
  return race.phase === "settled" ? Math.min(runOutEnd(race), t) : t;
}
export function runOutEnd(race) {
  return Math.max(...race.plan.map(h => h.finish)) + RUN_OUT_SECONDS;
}
// Integral of a smooth deceleration from the runner's exact line speed to zero.
const startNormalisation = 1 - 0.023 * (1 - Math.exp(-1 / 0.023));
function lineSpeed(h) {
  return LENGTH * (1 - Math.exp(-1 / 0.023)) / (h.finish * startNormalisation);
}
// Runners finishing with a stronger surge ease off later. The bounded term
// has zero slope at either end and keeps every deceleration monotonic.
function pullUpBias(h) {
  return 0.64 * Math.tanh(62 * h.surge);
}
export function stopDistance(h) {
  return LENGTH + lineSpeed(h) * RUN_OUT_SECONDS * (0.5 + 2 * pullUpBias(h) / 15);
}
export function changeSpeed(game, speed, now = Date.now()) {
  if (![1, 2].includes(speed) || game.race.phase !== "running") return;
  const r = game.race;
  const t = elapsed(r, now);
  if (t >= 0) {
    r.elapsed = t;
    r.anchor = now;
  }
  r.speed = speed;
}
// Endpoints at t=0 and t=finish are exact. The pace adjustments disappear at the line.
export function distance(h, t) {
  if (t <= 0) return 0;
  if (t >= h.finish) {
    const u = Math.min(1, (t - h.finish) / RUN_OUT_SECONDS);
    if (u === 1) return stopDistance(h);
    const coasting = u - u ** 3 + u ** 4 / 2;
    const easing = 4 * u ** 3 * (1 / 3 - u / 2 + u * u / 5);
    return LENGTH + lineSpeed(h) * RUN_OUT_SECONDS * (coasting + pullUpBias(h) * easing);
  }
  const u = t / h.finish;
  const acceleration = 0.023 * (1 - Math.exp(-u / 0.023));
  const start = (u - acceleration) / startNormalisation;
  const wave = Math.sin(Math.PI * u);
  return (
    LENGTH *
    (start +
      wave * wave * ((h.paceBias ?? 0) + h.early * (1 - u) + h.surge * Math.sin(2 * Math.PI * u)))
  );
}
export function snapshot(race, now = Date.now()) {
  return snapshotAt(race, elapsed(race, now));
}
export function snapshotAt(race, t) {
  const ds = race.plan.map((h) => distance(h, t));
  const order = ds
    .map((_, i) => i)
    .sort(
      (a, b) => {
        if (t >= race.plan[a].finish && t >= race.plan[b].finish)
          return race.plan[a].finish - race.plan[b].finish;
        return ds[b] - ds[a] || (t > 0 ? race.plan[a].finish - race.plan[b].finish : a - b);
      },
    );
  return {
    t,
    ds,
    order,
    remaining: Math.max(0, Math.ceil(LENGTH - Math.max(...ds))),
  };
}
export function lockLatePick(game, runner, quotedReward, now = Date.now()) {
  const r = game.race;
  if (r.latePick) throw Error("每場只可預測一次。");
  if (r.phase !== "running") throw Error("尾段預測只喺賽事進行時開放。");
  const frame = snapshot(r, now);
  if (!latePickOpen(r, frame)) throw Error("尾段預測只喺入直路至最後 200 米前開放。");
  const rank = frame.order.indexOf(runner);
  if (rank < 0) throw Error("請揀一匹有效嘅馬。");
  const reward = latePickRewards[rank];
  if (reward !== quotedReward) throw Error("走位已變，請按最新獎勵再揀。");
  r.latePick = { runner, rank: rank + 1, reward };
}
export function settle(game, now = Date.now()) {
  const r = game.race;
  if (
    r.phase !== "running" ||
    elapsed(r, now) < Math.max(...r.plan.map((h) => h.finish))
  )
    return false;
  const order = r.plan
    .map((_, i) => i)
    .sort((a, b) => r.plan[a].finish - r.plan[b].finish);
  const totals = { stake: 0, paid: 0 };
  for (const ticket of r.tickets) {
    const firstTwo = order.slice(0, 2);
    const won =
      ticket.market === "win"
        ? ticket.picks[0] === order[0]
        : ticket.picks.every((i) => firstTwo.includes(i));
    ticket.paid = won ? returns(ticket.stake, ticket.price) : 0;
    totals.stake += ticket.stake;
    totals.paid += ticket.paid;
  }
  r.settlement = { order, ...totals };
  r.phase = "settled";
  if (r.latePick) r.latePick.paid = r.latePick.runner === order[0] ? r.latePick.reward : 0;
  game.balance += totals.paid + (r.latePick?.paid ?? 0);
  game.history.unshift({
    number: r.number,
    name: r.name,
    order,
    stake: totals.stake,
    paid: totals.paid,
    times: r.plan.map((h) => h.finish),
    tickets: structuredClone(r.tickets),
    ...(r.latePick && { latePick: { ...r.latePick } }),
  });
  game.history = game.history.slice(0, 20);
  return true;
}
export function next(game, rng = uniform) {
  if (game.race.phase !== "settled") throw Error("請等待今場賽事完成。");
  game.race = raceCard(game.race.number + 1, rng);
}
export function refill(game) {
  if (
    game.balance >= 10 ||
    game.race.phase !== "open" ||
    game.race.tickets.length
  )
    throw Error("現時仍可使用已有代幣或注單。");
  game.balance += STARTING_FUNDS;
}
