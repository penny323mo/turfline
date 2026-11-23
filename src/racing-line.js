import { bendEntry, bendExit, bendLean, coursePoint, laneTravel, raceOval } from "./course.js";
import { laneX } from "./data.js";

// Each saved pair is [official course metres, lateral metres]. Zero first
// and second derivatives at both ends let the runner settle into each line.
export const sweep = u => u * u * u * (10 + u * (-15 + 6 * u));

function section(points, d) {
  let lo = 0, hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

function profile(points, d) {
  if (d <= points[0][0]) return { offset: points[0][1], slope: 0, second: 0 };
  if (d >= points.at(-1)[0]) return { offset: points.at(-1)[1], slope: 0, second: 0 };
  const i = section(points, d), [a, x] = points[i], [b, next] = points[i + 1];
  const span = b - a, delta = next - x, u = (d - a) / span;
  return {
    offset: x + delta * sweep(u),
    slope: delta / span * 30 * u * u * (1 - u) ** 2,
    second: delta / (span * span) * 60 * u * (1 - u) * (1 - 2 * u),
  };
}

export function linePose(runner, index, d, speed = 0) {
  const { offset, slope, second } = runner.line ? profile(runner.line, d) :
    { offset: laneX(index), slope: 0, second: 0 };
  const pt = coursePoint(d, offset);
  const k = d > bendEntry && d < bendExit ? 1 / raceOval.radius : 0;
  const along = 1 + offset * k;
  const heading = pt.heading + Math.atan2(slope, along);
  const scale = Math.hypot(along, slope);
  const steering = (along * second - k * slope * slope) / scale;
  const intoBend = Math.tan(bendLean(d, speed, offset));
  const curvature = (-k + steering / scale) / scale;
  return { x: pt.x, z: pt.z, heading, offset, curvature, lean: Math.atan(intoBend - speed * speed * steering / 9.81) };
}

const lengths = new WeakMap();
function pathLength(points, a, b) {
  const arc = Math.max(0, Math.min(b, bendExit) - Math.max(a, bendEntry));
  const { offset, slope } = profile(points, (a + b) / 2);
  return (b - a - arc) * Math.hypot(1, slope) +
    arc * Math.hypot(1 + offset / raceOval.radius, slope);
}

// Integrate once per saved route. Seeking, animation and audio all sample
// the same odometer, including the diagonal distance of a passing move.
export function racingDistance(runner, index, d) {
  if (!runner.line) return laneTravel(d, laneX(index));
  const points = runner.line;
  let prefix = lengths.get(points);
  if (!prefix) {
    const end = Math.ceil(Math.max(bendExit, points.at(-1)[0]));
    prefix = new Float64Array(end + 1);
    for (let n = 0; n < end; n++) prefix[n + 1] = prefix[n] + pathLength(points, n, n + 1);
    lengths.set(points, prefix);
  }
  const whole = Math.min(Math.max(0, Math.floor(d)), prefix.length - 1);
  if (whole === prefix.length - 1) return prefix[whole] + (d - whole);
  return prefix[whole] + pathLength(points, whole, d);
}
