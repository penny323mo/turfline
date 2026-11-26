// In portrait fullscreen the prediction panel spans the top of the track.
// Both renderers frame the field between it and the commentary at the foot.
export function portraitPredictionView(stage) {
  const panel = stage.querySelector("#late-pick");
  if (!panel || panel.hidden || panel.querySelector("#late-options").hidden ||
      stage.clientWidth >= stage.clientHeight) return null;
  const { top: origin, width, height } = stage.getBoundingClientRect();
  const top = panel.getBoundingClientRect().bottom - origin + 12;
  const bottom = stage.querySelector(".lower-third").getBoundingClientRect().top - origin - 6;
  if (bottom <= top) return null;
  return { width, height, top, bottom };
}
