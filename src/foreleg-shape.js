import { MathUtils, Vector3 } from 'three';

const ramp = MathUtils.smoothstep;

// Ayan's bind mesh faces -X, with the two forelegs on opposite sides of Z.
// Shape each cannon and forearm around its own centre, fading into the chest.
function contour(point, out, scale, ground) {
  out.copy(point);
  const height = (point.y + ground) * scale;
  if (height <= 0.13 || height >= 1.4) return out;
  const side = Math.abs(point.z) * scale;
  const forward = -point.x * scale;
  const axisSide = 0.217 + 0.015 * ramp(height, 0.55, 1.12);
  const axisForward = 0.383 + 0.049 * ramp(height, 0.55, 1.02);
  const mask = (1 - ramp(Math.abs(forward - axisForward), 0.12, 0.32))
    * ramp(side, 0.0, 0.15);
  const cannon = ramp(height, 0.13, 0.27) * (1 - ramp(height, 0.46, 0.70));
  const muscle = ramp(height, 0.32, 0.74) * (1 - ramp(height, 0.93, 1.40));
  out.z += Math.sign(point.z) * (side - axisSide) * mask * (0.24 * cannon + 0.62 * muscle) / scale;
  out.x -= (forward - axisForward) * mask * (0.18 * cannon + 0.46 * muscle) / scale;
  return out;
}

export function shapeForelegs(geometry, scale, ground) {
  const { position, normal } = geometry.attributes;
  const point = new Vector3(), shaped = new Vector3(), n = new Vector3();
  const tangent = new Vector3(), bitangent = new Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    contour(point, shaped, scale, ground);
    if (point.equals(shaped)) continue;
    position.setXYZ(i, shaped.x, shaped.y, shaped.z);
    // Carry the authored smooth normal through the same deformation, including UV seams.
    n.fromBufferAttribute(normal, i).normalize();
    tangent.set(0, 1, 0);
    if (Math.abs(n.y) > 0.9) tangent.set(1, 0, 0);
    tangent.cross(n).normalize();
    bitangent.crossVectors(n, tangent);
    for (const direction of [tangent, bitangent]) {
      direction.multiplyScalar(0.0001).add(point);
      contour(direction, direction, scale, ground).sub(shaped);
    }
    n.crossVectors(tangent, bitangent).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  position.needsUpdate = normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
