import { distance, stopDistance } from "./race.js";
import { racingDistance } from "./racing-line.js";
import { raceStride, stanceStarts } from "./stride.js";

// The skinned hoof takes this fraction of a stride to reach the turf after
// its leg enters stance. Use the first contact, including on a rolling hoof.
const contactOffsets = [
  [0.018, 0.008, -0.011, -0.017, -0.020],
  [0.025, 0.011, -0.002, -0.008, -0.018],
  [0.024, 0.015, 0.003, -0.008, 0.010],
  [0.029, 0.014, 0.002, -0.013, -0.007],
];
function contactDelay(hoof, short) {
  const row = contactOffsets[hoof], position = short * (row.length - 1);
  const i = Math.min(row.length - 2, Math.floor(position));
  return row[i] + (position - i) * (row[i + 1] - row[i]);
}
const lookahead = 0.24;

// Return impacts in (from, to]. Adjacent scheduling windows share an endpoint.
export function hoofContacts(plan, number, from, to) {
  const index = number - 1, stop = racingDistance(plan, index, stopDistance(plan));
  const at = raceTime => raceStride(number, racingDistance(plan, index, distance(plan, raceTime)), stop);
  const first = at(from), last = at(to), contacts = [];
  if (last.count <= first.count) return contacts;
  for (let stride = Math.floor(first.count) - 1; stride <= Math.floor(last.count) + 1; stride++) {
    for (const [hoof, phase] of stanceStarts.entries()) {
      const target = stride + phase;
      if (target <= first.count - contactDelay(hoof, first.short) ||
          target > last.count - contactDelay(hoof, last.short)) continue;
      let lo = from, hi = to;
      // The break accelerates and the finish caps the run-out. Invert the
      // same course-distance function that positions the animated horse.
      while (hi - lo > 0.0002) {
        const mid = (lo + hi) / 2;
        const step = at(mid);
        if (step.count - contactDelay(hoof, step.short) < target) lo = mid;
        else hi = mid;
      }
      contacts.push({ time: (lo + hi) / 2, stride, hoof });
    }
  }
  return contacts;
}

function turfImpact(ctx, hoof, variant) {
  const rate = ctx.sampleRate, length = 0.14;
  const sample = ctx.createBuffer(1, Math.ceil(rate * length), rate);
  const data = sample.getChannelData(0);
  let seed = 2719 * (1 + hoof) + 43 * variant, low = 0, mid = 0;
  const smooth = hz => 1 - Math.exp(-2 * Math.PI * hz / rate);
  const lowPass = smooth(420), midPass = smooth(2100);
  const pitch = [77, 84, 91, 86][hoof] + variant * 2;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += lowPass * (noise - low);
    mid += midPass * (noise - mid);
    const impact = 2 * Math.PI * (pitch * t + 0.56 * (1 - Math.exp(-t / 0.008)));
    const thud = 0.52 * Math.sin(impact) * Math.exp(-t / 0.019);
    const turf = 0.92 * (mid - low) * Math.exp(-t / 0.011) + 0.37 * low * Math.exp(-t / 0.033);
    data[i] = (1 - Math.exp(-t / 0.0012)) * (thud + turf);
  }
  return sample;
}

export function raceAudio() {
  let ctx, buffers, enabled = false, schedule = null;
  const voices = new Set();

  function play(source, gain, when, duration) {
    source.connect(gain).connect(ctx.destination);
    const voice = { source, gain, when };
    voices.add(voice);
    source.onended = () => {
      voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
    if (duration) source.stop(when + duration);
  }

  function reset() {
    schedule = null;
    for (const voice of voices) {
      const now = ctx.currentTime;
      // Silence future strikes and release a sounding impact without a click.
      if (voice.when > now) voice.source.stop(now);
      else {
        voice.gain.gain.cancelAndHoldAtTime?.(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.002);
        voice.source.stop(now + 0.010);
      }
    }
    voices.clear();
  }

  function strike(event, number, when, strength) {
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    const variant = ((event.stride + number + event.hoof) % 3 + 3) % 3;
    source.buffer = buffers[event.hoof][variant];
    source.playbackRate.value = 0.98 + 0.015 * variant;
    gain.gain.value = [0.64, 0.75, 0.70, 0.83][event.hoof] * strength;
    play(source, gain, when);
  }

  return {
    async toggle() {
      ctx ??= new AudioContext();
      if (!enabled) {
        await ctx.resume();
        buffers ??= stanceStarts.map((_, hoof) => [0, 1, 2].map(variant => turfImpact(ctx, hoof, variant)));
        enabled = true;
      } else {
        reset();
        await ctx.suspend();
        enabled = false;
      }
      return enabled;
    },
    reset,
    step(race, runner, t, rate, until, replay) {
      if (!enabled || ctx.state !== "running" || document.hidden || rate <= 0 || t < 0) {
        if (schedule) reset();
        return;
      }
      const now = ctx.currentTime;
      const discontinuity = !schedule || schedule.race !== race.number || schedule.runner !== runner
        || schedule.replay !== replay || schedule.rate !== rate
        || Math.abs(t - (schedule.t + (now - schedule.now) * rate)) > 0.045 * rate;
      if (discontinuity) {
        if (schedule) reset();
        schedule = { race: race.number, runner, replay, rate, t, now, until: t };
      }
      // The output clock corresponds to the frame being heard. An output
      // timestamp can be absent during startup or on a suspended device.
      const stamp = ctx.getOutputTimestamp?.();
      const outputNow = stamp?.performanceTime > 0
        ? Math.min(now, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000)
        : now - (ctx.outputLatency || ctx.baseLatency || 0);
      // Events inside the device's existing output buffer can no longer be
      // placed on time. Start at its far edge instead of stacking them at now.
      const audibleStart = t + (now - outputNow) * rate;
      const from = Math.max(audibleStart, schedule.until), to = Math.min(until, audibleStart + lookahead * rate);
      if (from >= to) return;
      const plan = race.plan[runner];
      for (const event of hoofContacts(plan, runner + 1, from, to)) {
        const step = raceStride(runner + 1, racingDistance(plan, runner, distance(plan, event.time)),
          racingDistance(plan, runner, stopDistance(plan)));
        const strength = step.weight * (1 - 0.55 * step.short) * (rate > 1 ? 0.72 : 1);
        strike(event, runner + 1, Math.max(now, outputNow + (event.time - t) / rate), strength);
      }
      schedule.until = to;
    },
    bell() {
      if (!enabled || ctx.state !== "running" || document.hidden) return;
      for (const [delay, pitch] of [[0, 720], [0.13, 980]]) {
        const when = ctx.currentTime + delay, source = ctx.createOscillator(), gain = ctx.createGain();
        source.frequency.setValueAtTime(pitch, when);
        source.frequency.exponentialRampToValueAtTime(pitch * 0.96, when + 0.22);
        gain.gain.setValueAtTime(0.001, when);
        gain.gain.exponentialRampToValueAtTime(0.08, when + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
        play(source, gain, when, 0.23);
      }
    },
  };
}
