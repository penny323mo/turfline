// A stride is counted in course metres, including the runner's starting phase.
// The four strike slots are trailing hind, leading hind, trailing fore, leading fore.
export const strideMetres = 7.05;
export const gallopSupport = 0.22;
export const stanceStarts = [0, 0.14, 0.36, 0.51];
export const shortStrideRatio = 0.40;
const transition = 15;
const extraCadence = 1 / shortStrideRatio - 1;
const lengths = [0, 0.026, -0.018, 0.014, -0.031, 0.037];
const offsets = [0.12, 0.61, 0.32, 0.85, 0.46, 0.04];

export function strideLength(number) {
  return strideMetres * (1 + (lengths[number - 1] ?? 0));
}

export function strideCount(number, distance) {
  return distance / strideLength(number) + (offsets[number - 1] ?? 0);
}

// Integrate the extra strides accumulated as the steps lengthen from the
// gate and shorten towards the halt. The middle of the race retains its phase.
export function raceStride(number, distance, stop = Infinity) {
  const start = Math.max(0, 1 - Math.max(0, distance) / transition);
  const end = Math.max(0, 1 - Math.max(0, stop - distance) / transition);
  const scale = 1 / (1 + extraCadence * (start * start + end * end));
  return {
    count: strideCount(number, distance + transition * extraCadence / 3 * (end ** 3 - start ** 3)),
    short: (1 - scale) / (1 - shortStrideRatio),
    weight: launchWeight(Math.min(distance, stop - distance)),
  };
}

export function launchWeight(distance) {
  const t = Math.min(1, Math.max(0, distance / 0.95));
  return t * t * (3 - 2 * t);
}
