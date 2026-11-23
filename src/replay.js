// The playback clock only reads the sealed race plan. Each viewer can pause or
// seek without changing the official clock, the wallet, or another tab.
export function finishReplay(race, clock = () => performance.now() / 1000) {
  const winnerTime = race.plan[race.settlement.order[0]].finish;
  const from = Math.max(0, winnerTime - 4.5);
  const to = Math.max(...race.plan.map((runner) => runner.finish)) + 0.65;
  let cursor = from, anchor = clock(), moving = true, rate = 0.5;
  const position = () => Math.min(to, cursor + (moving ? Math.max(0, clock() - anchor) * rate : 0));
  function seek(value) {
    cursor = Math.max(from, Math.min(to, value));
    anchor = clock();
  }
  return {
    raceNumber: race.number, from, to, winnerTime, position,
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
