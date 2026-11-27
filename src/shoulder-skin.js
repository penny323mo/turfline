import { MathUtils, Vector3 } from "three";

// The original standing rig blends the shoulder's full rotation into the
// inside of the chest. Anchor that skin to the breast bones and fade the
// correction towards the outside of the shoulder and top of the foreleg.
export function bindShoulderSkin(body, scale, ground) {
  const { position, skinIndex, skinWeight } = body.geometry.attributes;
  const names = body.skeleton.bones.map(bone => bone.name);
  const anchors = new Map([
    ["shoulderL_39", "breastL_40"], ["upper_armL_38", "breastL_40"],
    ["shoulderR_45", "breastR_46"], ["upper_armR_44", "breastR_46"],
  ].map(([limb, chest]) => [names.indexOf(limb), names.indexOf(chest)]));
  const limbJoints = [...anchors.keys()];
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    body.getVertexPosition(i, point).applyMatrix4(body.matrixWorld);
    const height = (point.y + ground) * scale;
    const lateral = Math.abs(point.z * scale);
    // Begin the blend below the elbow so the chest and upper arm share the
    // bend when the foreleg folds. Ease the inside of the chest in first.
    const medial = 1 - MathUtils.smoothstep(lateral, 0.08, 0.21);
    const transfer = MathUtils.smoothstep(height + 0.04 * medial, 0.41, 1.13) *
      (1 - MathUtils.smoothstep(lateral, 0.28, 0.65));
    if (!transfer) continue;
    const weights = new Map();
    for (let slot = 0; slot < 4; slot++) {
      const joint = skinIndex.getComponent(i, slot);
      weights.set(joint, (weights.get(joint) ?? 0) + skinWeight.getComponent(i, slot));
    }
    if (!limbJoints.some(joint => weights.get(joint) > 0)) continue;
    for (const [joint, anchor] of anchors) {
      const shift = (weights.get(joint) ?? 0) * transfer;
      if (!shift) continue;
      weights.set(joint, weights.get(joint) - shift);
      weights.set(anchor, (weights.get(anchor) ?? 0) + shift);
    }
    const influences = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = influences.reduce((sum, [, weight]) => sum + weight, 0);
    for (let slot = 0; slot < 4; slot++) {
      const [joint, weight] = influences[slot] ?? [0, 0];
      skinIndex.setComponent(i, slot, joint);
      skinWeight.setComponent(i, slot, weight / total);
    }
  }
  skinIndex.needsUpdate = skinWeight.needsUpdate = true;
}
