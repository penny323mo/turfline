import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { limbs, supportFraction, touchdownReach } from './gallop.js';
import { raceStride, shortStrideRatio, stanceStarts, strideLength } from './stride.js';

const midStance = 0.12;
const strideScale = step => 1 - (1 - shortStrideRatio) * step.short;

// A stride can lengthen appreciably between touchdown and lift-off. Invert
// the distance clock at mid-stance so a seek reconstructs the same footprint.
function midStanceDistance(number, metres, stop, targetCount, step, stride) {
  let distance = metres + (targetCount - step.count) * stride * strideScale(step);
  for (let i = 0; i < 2; i++) {
    const at = raceStride(number, distance, stop);
    distance += (targetCount - at.count) * stride * strideScale(at);
  }
  return distance;
}

export function hoofPlant(horse, body, mount, number, restNose) {
  const stride = strideLength(number);
  const toMount = new Matrix4().copy(mount.matrixWorld).invert().multiply(body.matrixWorld);
  const feet = limbs.map(({ names, front, sole }) => {
    const rest = body.getVertexPosition(sole, new Vector3()).applyMatrix4(toMount);
    return {
      upper: horse.getObjectByName(names[0]), lower: horse.getObjectByName(names[1]),
      baseUpper: new Quaternion(), baseLower: new Quaternion(), rest, front, sole, changed: false,
    };
  });
  const foot = new Vector3(), goal = new Vector3(), knee = new Vector3(), nextKnee = new Vector3();
  const dir = new Vector3(), across = new Vector3(), a = new Vector3(), b = new Vector3();
  const rotate = new Quaternion(), hinge = new Quaternion(), toParent = new Matrix4();

  // Keep the sampled knee on its existing side of the limb. Solve its new
  // location on the intersection of the upper and lower segment spheres.
  function solve(limb) {
    const { upper, lower } = limb, hip = upper.position;
    toParent.copy(upper.parent.matrixWorld).invert().multiply(mount.matrixWorld);
    foot.applyMatrix4(toParent);
    goal.applyMatrix4(toParent);
    knee.copy(lower.position).applyMatrix4(upper.matrix);
    const thigh = hip.distanceTo(knee), shin = knee.distanceTo(foot);
    dir.subVectors(goal, hip);
    const reach = MathUtils.clamp(dir.length(), Math.abs(thigh - shin) + 0.0001, thigh + shin - 0.0001);
    dir.normalize();
    across.subVectors(knee, hip);
    across.addScaledVector(dir, -across.dot(dir)).normalize();
    const along = (thigh * thigh + reach * reach - shin * shin) / (2 * reach);
    nextKnee.copy(hip).addScaledVector(dir, along).addScaledVector(across, Math.sqrt(Math.max(0, thigh * thigh - along * along)));
    limb.baseUpper.copy(upper.quaternion);
    limb.baseLower.copy(lower.quaternion);
    rotate.setFromUnitVectors(a.subVectors(knee, hip).normalize(), b.subVectors(nextKnee, hip).normalize());
    upper.quaternion.premultiply(rotate);
    hinge.setFromUnitVectors(a.subVectors(foot, knee).applyQuaternion(rotate).normalize(), b.subVectors(goal, nextKnee).normalize());
    rotate.copy(upper.quaternion).invert().multiply(hinge).multiply(upper.quaternion);
    lower.quaternion.premultiply(rotate);
    limb.changed = true;
  }

  return {
    restore() {
      // The mixer can skip writing a bone if a paused frame is sampled twice.
      for (const limb of feet) if (limb.changed) {
        limb.upper.quaternion.copy(limb.baseUpper);
        limb.lower.quaternion.copy(limb.baseLower);
        limb.changed = false;
      }
    },
    apply(metres, stop, step, nose, curvature) {
      if (!step.weight || (!step.short && Math.abs(curvature) < 0.0001)) return;
      toMount.copy(mount.matrixWorld).invert().multiply(body.matrixWorld);
      const support = supportFraction(step.short);
      for (const [i, limb] of feet.entries()) {
        let cycle = MathUtils.euclideanModulo(step.count - stanceStarts[i], 1);
        if (cycle > 0.9) cycle--;
        const blend = MathUtils.smoothstep(cycle, -0.07, 0) * (1 - MathUtils.smoothstep(cycle, support, support + 0.09));
        if (!blend) continue;
        const ref = midStanceDistance(number, metres, stop, step.count - cycle + midStance, step, stride);
        const at = raceStride(number, ref, stop);
        const z = limb.rest.z - restNose + touchdownReach(limb.front, at.short, stride) - midStance * stride * strideScale(at);
        const ds = metres - ref, angle = curvature * ds, sin = Math.sin(angle), cos = Math.cos(angle);
        // Transform the fixed turf point into the current tangent frame.
        // Use the half-angle identity for (1 - cos(angle)) near a straight.
        const xShift = curvature ? 2 * Math.sin(angle / 2) ** 2 / curvature : 0;
        const forward = curvature ? sin / curvature : ds;
        body.getVertexPosition(limb.sole, foot).applyMatrix4(toMount);
        goal.set(xShift + cos * limb.rest.x - sin * z, foot.y, nose - forward + sin * limb.rest.x + cos * z);
        goal.sub(foot).clampLength(0, 0.12).multiplyScalar(blend * at.weight * step.weight).add(foot);
        solve(limb);
      }
    },
  };
}
