// Matching the ring circumference to a whole number of strides keeps both
// the model and each planted foot continuous where the lap clock wraps.
export const walkStride = 1.62;
export const walkSpeed = 1.48;
export const walkSupport = 0.64;
export const walkBeats = [0, 0.5, 0.25, 0.75]; // RH, LH, RF, LF
export const ringRadius = 52 * walkStride / (2 * Math.PI);
export const ringCentre = { x: -120, z: 1045, heading: 0 };
const lapTime = 52 * walkStride / walkSpeed;

export function paradePoint(index, seconds) {
  const metres = (seconds % lapTime) * walkSpeed + index * (52 * walkStride / 6);
  const angle = metres / ringRadius;
  return { metres, lean: 0, x: ringCentre.x + ringRadius * Math.sin(angle),
    z: ringCentre.z + ringRadius * Math.cos(angle), heading: angle + Math.PI / 2 };
}

export function walkingFoot(cycle, front, x, z) {
  const v = Math.max(0, (cycle - walkSupport) / (1 - walkSupport));
  const recovery = v ** 3 * (10 - 15 * v + 6 * v * v);
  const arc = (cycle - walkSupport / 2 - recovery) * walkStride / ringRadius;
  const fold = Math.sin(Math.PI * v) ** 2;
  // Rotate the stance point into the advancing horse's local frame. Both
  // derivatives match at toe-off and touchdown, including on the curved path.
  return { x: ringRadius + (x - ringRadius) * Math.cos(arc) - z * Math.sin(arc),
    z: (x - ringRadius) * Math.sin(arc) + z * (Math.cos(arc) - 1),
    y: (front ? 0.16 : 0.14) * fold };
}
