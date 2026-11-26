import { bendExit } from "./course.js";
import { distance, LENGTH, snapshotAt } from "./race.js";

export const checkpoints = [
  { label: "出閘搶位", metres: 100, camera: "pack" },
  { label: "轉入直路", metres: bendExit, camera: "aerial" },
  { label: "最後 200 米", metres: LENGTH - 200, camera: "tele" },
  { label: "頭馬衝線", metres: LENGTH, camera: "track" },
];

const byPlan = new WeakMap();

export function raceMoments(race) {
  if (byPlan.has(race.plan)) return byPlan.get(race.plan);
  const winnerTime = Math.min(...race.plan.map(horse => horse.finish));
  const moments = checkpoints.map(({ metres }) => {
    let lo = 0, hi = winnerTime;
    if (metres < LENGTH) {
      // Find the first nose at this marker, even when the lead changes on the bend.
      while (hi - lo > 0.00001) {
        const t = (lo + hi) / 2;
        if (race.plan.some(horse => distance(horse, t) >= metres)) hi = t;
        else lo = t;
      }
    }
    const { ds, order } = snapshotAt(race, hi);
    const [leader, second] = order;
    return { time: hi, leader, second, gap: ds[leader] - ds[second] };
  });
  byPlan.set(race.plan, moments);
  return moments;
}
