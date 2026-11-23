import { LENGTH } from "./race.js";

export const raceOval = { near: LENGTH - 480, far: LENGTH + 45, radius: 120 };
export const studioOval = { near: -30, far: 1230, radius: 60 };
export const bendExit = raceOval.near;
export const bendEntry = bendExit - Math.PI * raceOval.radius;

// Official race distance follows the centreline. Positive offsets are on
// the runner's right and travel farther around the left-hand bend.
export function coursePoint(distance, offset = 0) {
  const { radius, near } = raceOval;
  if (distance <= bendEntry)
    return { x: -2 * radius - offset, z: near + bendEntry - distance, heading: Math.PI };
  if (distance >= bendExit) return { x: offset, z: distance, heading: 0 };
  const angle = (distance - bendEntry) / radius;
  return {
    x: -radius - (radius + offset) * Math.cos(angle),
    z: near - (radius + offset) * Math.sin(angle),
    heading: Math.PI - angle,
  };
}

export function laneTravel(distance, offset) {
  const arc = Math.max(0, Math.min(distance - bendEntry, bendExit - bendEntry));
  return distance + offset * arc / raceOval.radius;
}

export function bendLean(distance, speed, offset) {
  const t = Math.max(0, Math.min(1, (distance - bendEntry) / 24, (bendExit - distance) / 24));
  const angularSpeed = speed / raceOval.radius;
  const acceleration = angularSpeed * angularSpeed * (raceOval.radius + offset);
  return t * t * (3 - 2 * t) * Math.atan(acceleration / 9.81);
}
