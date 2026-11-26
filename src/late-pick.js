import { bendExit, LENGTH } from "./course.js";

export const latePickStart = LENGTH - bendExit;
export const latePickEnd = 200;
export const latePickRewards = [20, 20, 40, 40, 80, 80];
export const trendSeconds = 3;

export function latePickOpen(race, frame) {
  return race.phase === "running" && frame &&
    frame.remaining <= latePickStart && frame.remaining > latePickEnd;
}

export function latePickForm(frame, previous, runner) {
  const lead = frame.order[0] === runner;
  const rival = frame.order[lead ? 1 : 0];
  const gap = frame.ds[rival] - frame.ds[runner];
  // Use the same opponent at both instants, even if the lead changed hands.
  const gain = previous.ds[rival] - previous.ds[runner] - gap;
  const trend = Math.abs(gain) < 0.1 ? "steady" : gain > 0 ? "gain" : "loss";
  const label = trend === "steady" ? "差距相若" :
    (gain > 0 ? (lead ? "拉開 " : "追近 ") : (lead ? "被追近 " : "再落後 ")) +
    Math.abs(gain).toFixed(1) + " 米";
  return { gap: lead ? "領先" : "−" + gap.toFixed(1) + " 米", label, trend };
}
