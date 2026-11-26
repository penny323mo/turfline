import { bendExit, LENGTH } from "./course.js";

export const latePickStart = LENGTH - bendExit;
export const latePickEnd = 200;
export const latePickRewards = [20, 20, 40, 40, 80, 80];

export function latePickOpen(race, frame) {
  return race.phase === "running" && frame &&
    frame.remaining <= latePickStart && frame.remaining > latePickEnd;
}
