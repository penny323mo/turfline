// A stride is counted in course metres, including the runner's starting phase.
// The limbs are ordered trailing hind, leading hind, trailing fore, leading fore.
export const strideMetres = 7.05;
export const stanceStarts = [0, 0.14, 0.36, 0.51];
const lengths = [0, 0.026, -0.018, 0.014, -0.031, 0.037];
const offsets = [0.12, 0.61, 0.32, 0.85, 0.46, 0.04];

export function strideLength(number) {
  return strideMetres * (1 + (lengths[number - 1] ?? 0));
}

export function strideCount(number, distance) {
  return distance / strideLength(number) + (offsets[number - 1] ?? 0);
}

// Blend out of the standing pose over the first 2.6 m out of the gate.
export function launchWeight(distance) {
  const t = Math.min(1, Math.max(0, distance / 2.6));
  return t * t * (3 - 2 * t);
}
