export function raceAudio() {
  let ctx,
    enabled = false,
    nextBeat = 0;
  function pulse(time, hz, length, volume, type, end) {
    const source = ctx.createOscillator(),
      gain = ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(hz, time);
    source.frequency.exponentialRampToValueAtTime(end, time + length);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(time);
    source.stop(time + length + 0.01);
  }
  return {
    async toggle() {
      ctx ??= new AudioContext();
      if (!enabled) {
        await ctx.resume();
        nextBeat = 0;
      } else await ctx.suspend();
      enabled = !enabled;
      return enabled;
    },
    step(running) {
      if (!enabled || !running || document.hidden || ctx.currentTime < nextBeat)
        return;
      const t = ctx.currentTime;
      for (const [dt, f] of [
        [0, 130],
        [0.11, 110],
        [0.23, 145],
        [0.29, 93],
      ])
        pulse(t + dt, f, 0.09, 0.11, "triangle", 38);
      nextBeat = t + 0.49;
    },
    bell() {
      if (enabled && !document.hidden)
        for (const [dt, f] of [
          [0, 720],
          [0.13, 980],
        ])
          pulse(ctx.currentTime + dt, f, 0.22, 0.08, "sine", f * 0.96);
    },
  };
}
