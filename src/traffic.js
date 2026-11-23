import { bendEntry, bendExit } from "./course.js";
import { laneX } from "./data.js";
import { sweep } from "./racing-line.js";

const tracks = [-9, -7.5, -6, -4, -2, 0, 2, 4, 6, 8];
const stations = [22, 102, 182, 262, 342, 422, 502, 582, 662, 742, 822, 902, 982, 1062, 1142, 1400];
const step = 0.25;

function edgeCost(a, b, start, end, traffic) {
  const shift = Math.abs(b - a);
  if (shift > 4.1 || (start >= 1142 && shift > 0)) return Infinity;
  // Prefer the short route into and around the bend. On the home straight a
  // clear view ahead matters more, and a change of course carries a cost.
  const inBend = Math.max(0, Math.min(end, bendExit) - Math.max(start, bendEntry));
  const approach = Math.max(0, Math.min(end, bendEntry) - start);
  let cost = ((a + b) / 2 + 9) * (inBend + 0.42 * approach) / 120 + 0.30 * shift + 0.055 * shift * shift;
  for (const frame of traffic) {
    const x = a + (b - a) * frame.blend;
    for (const other of frame.nearby) {
      const clearance = Math.abs(x - other.x);
      if (other.alongside && clearance < 1.90) return Infinity;
      if (clearance < 2.1)
        cost += other.pressure * (1 - clearance / 2.1);
    }
  }
  return cost;
}

// A shortest path through alternative lines, with the other five runners'
// current paths reserved. The original gate lanes form a feasible starting
// solution. Only replace one path at a time so every accepted field is safe.
export function planRacingLines(plan, distanceAt, endTime) {
  const times = Array.from({ length: Math.ceil(endTime / step) + 1 }, (_, i) => i * step);
  const ds = plan.map(h => times.map(t => distanceAt(h, t)));
  const xs = plan.map((_, i) => times.map(() => laneX(i)));
  const priority = plan.map((_, i) => i).sort((a, b) => ds[b][80] - ds[a][80] || a - b);
  const lines = plan.map((_, i) => stations.map(() => laneX(i)));
  for (let pass = 0; pass < 2; pass++) {
    for (const runner of priority) {
      const traffic = stations.slice(1).map(() => []);
      let segment = 0;
      for (const [k, d] of ds[runner].entries()) {
        if (d < stations[0]) continue;
        while (segment + 2 < stations.length && d >= stations[segment + 1]) segment++;
        const u = (d - stations[segment]) / (stations[segment + 1] - stations[segment]);
        const frame = { blend: sweep(u), nearby: [], k };
        for (let j = 0; j < plan.length; j++) {
          if (j === runner) continue;
          const gap = ds[j][k] - d;
          if (gap < -6.2 || gap > 20) continue;
          const closing = k ? (ds[j][k - 1] - ds[runner][k - 1] - gap) / step : 0;
          frame.nearby.push({
            x: xs[j][k], alongside: gap <= 6.2,
            pressure: gap > 0 ? step * Math.max(0, Math.min(2.5, closing + 0.18)) * (1 - gap / 20) : 0,
          });
        }
        traffic[segment].push(frame);
      }
      let costs = tracks.map(x => x === laneX(runner) ? 0 : Infinity);
      const parents = [];
      for (let s = 0; s < traffic.length; s++) {
        const next = tracks.map(() => Infinity), from = [];
        for (const [i, a] of tracks.entries()) {
          if (!Number.isFinite(costs[i])) continue;
          for (const [j, b] of tracks.entries()) {
            const cost = costs[i] + edgeCost(a, b, stations[s], stations[s + 1], traffic[s]);
            if (cost < next[j]) { next[j] = cost; from[j] = i; }
          }
        }
        parents.push(from);
        costs = next;
      }
      let best = costs.indexOf(Math.min(...costs));
      if (!Number.isFinite(costs[best])) continue;
      const line = lines[runner];
      for (let s = parents.length - 1; s >= 0; s--) {
        line[s + 1] = tracks[best];
        best = parents[s][best];
      }
      for (const [s, frames] of traffic.entries())
        for (const frame of frames)
          xs[runner][frame.k] = line[s] + (line[s + 1] - line[s]) * frame.blend;
    }
  }
  return lines.map(line => stations.flatMap((d, i) =>
    i > 0 && line[i] === line[i - 1] && (i === line.length - 1 || line[i] === line[i + 1]) ? [] : [[d, line[i]]]));
}
