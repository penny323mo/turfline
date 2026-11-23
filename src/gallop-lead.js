import { gallopSupport, stanceStarts, strideCount } from './stride.js';
import { bendEntry, bendExit } from './course.js';
import { racingDistance, sweep } from './racing-line.js';

export function planLeadChanges(runner, index) {
  // Store the first stride on the new lead. Account for each horse's line
  // and cadence so cuts, replays and other spectators see the same change.
  const approach = bendEntry - 8 - index*7 % 17;
  const straight = bendExit + 9 + index*11 % 23;
  return [approach, straight].map(d =>
    Math.round(strideCount(index+1, racingDistance(runner,index,d))));
}

export function rightLead(changes, stride) {
  return !!changes && stride >= changes[0] && stride < changes[1];
}

export function sampleLead(changes, count) {
  if (changes) {
    for (let i=0; i<changes.length; i++) {
      const time = count - changes[i] + 1;
      if (time >= 0 && time < 2) return { kind: i === 0 ? 'toRight' : 'toLeft', time };
    }
  }
  return { kind: rightLead(changes, count) ? 'right' : 'left', time: count - Math.floor(count) };
}

export function changingLead(kind) {
  return kind === 'toRight' || kind === 'toLeft';
}

const eased = t => sweep(Math.max(0, Math.min(1,t)));

// During the two-stride change, keep each old support at course speed.
// Only its return through the air is lengthened or shortened, ending on
// the first strike of that limb's new schedule with matching velocity.
export function legBeat(hoof, kind, time) {
  const left = stanceStarts[hoof], right = stanceStarts[hoof ^ 1];
  if (kind === 'left') return left;
  if (kind === 'right') return right;
  const old = kind === 'toRight' ? left : right;
  const next = kind === 'toRight' ? right : left;
  const lift = old + gallopSupport, land = 1 + next;
  return old + (next-old)*eased((time-lift)/(land-lift));
}

export function lateralBalance(kind, time) {
  if (kind === 'left') return 1;
  if (kind === 'right') return -1;
  const transfer = 1 - 2*eased((time-0.62)/0.60);
  return kind === 'toRight' ? transfer : -transfer;
}
