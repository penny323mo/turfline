// Use the live gap at the front, then let the stands settle after the first nose crosses.
export function crowdLevel(frame, winnerTime) {
  const approach = Math.max(0, 1 - frame.remaining / 240);
  if (!approach) return 0;
  const [first, second] = frame.order;
  const gap = Math.abs(frame.ds[first] - frame.ds[second]);
  const contest = Math.max(0, 1 - gap / 8);
  const release = 1 - Math.min(1, Math.max(0, (frame.t - winnerTime) / 6));
  return approach * (0.19 + 0.36 * contest) * release;
}

export function grandstand(ctx) {
  let buffer, loading, voice;
  function stop() {
    if (!voice) return;
    const now = ctx.currentTime;
    voice.gain.gain.cancelAndHoldAtTime?.(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.009);
    voice.source.stop(now + 0.05);
    voice = null;
  }
  return {
    prepare() {
      if (buffer || loading) return;
      loading = fetch("./audio/grandstand.mp3").then(async response => {
        if (!response.ok) throw Error("Crowd recording unavailable");
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      }).catch(() => {}).finally(() => { loading = null; });
    },
    mix(level, raceTime) {
      if (!buffer || level <= 0) { stop(); return; }
      const now = ctx.currentTime;
      if (!voice) {
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain).connect(ctx.destination);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        source.start(now, raceTime % buffer.duration);
        voice = { source, gain };
      }
      voice.gain.gain.setTargetAtTime(level, now, 0.12);
    },
    stop,
  };
}
