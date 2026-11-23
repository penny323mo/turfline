import { GATES, runOutEnd } from "./race.js";
import { hoofContacts } from "./race-audio.js";

// The playback clock only reads the sealed race plan. Each viewer can pause or
// seek without changing the official clock, the wallet, or another tab.
export function finishReplay(race, clock = () => performance.now() / 1000, scope = "finish") {
  const winnerTime = race.plan[race.settlement.order[0]].finish;
  const from = scope === "finish" ? Math.max(0, winnerTime - 4.5) : scope === "pullup" ? winnerTime : -GATES;
  const to = scope === "finish" ? Math.max(...race.plan.map((runner) => runner.finish)) + 0.65 : runOutEnd(race);
  let cursor = from, anchor = clock(), moving = true, rate = 0.5;
  const contacts = new Map();
  const position = () => Math.min(to, cursor + (moving ? Math.max(0, clock() - anchor) * rate : 0));
  function seek(value) {
    cursor = Math.max(from, Math.min(to, value));
    anchor = clock();
  }
  return {
    raceNumber: race.number, scope, from, to, winnerTime, position,
    footsteps(runner, t = position()) {
      if (!contacts.has(runner)) contacts.set(runner, hoofContacts(race.plan[runner], runner+1, from, to));
      const events = contacts.get(runner);
      let lo = 0, hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].time < t - 0.0002) lo = mid + 1;
        else hi = mid;
      }
      const current = events[lo]?.time <= t + 0.0002 ? events[lo] : null;
      return { previous: events[lo-1], current, next: events[lo + (current ? 1 : 0)] };
    },
    get playing() { return moving && position() < to; },
    get rate() { return rate; },
    pauseAt(value) {
      seek(value);
      moving = false;
    },
    toggle() {
      const t = position();
      if (moving && t < to) this.pauseAt(t);
      else {
        seek(t >= to ? from : t);
        moving = true;
      }
    },
    setRate(value) {
      if (![0.25, 0.5, 1].includes(value)) return;
      seek(position());
      rate = value;
    },
  };
}
