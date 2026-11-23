import test from "node:test";
import assert from "node:assert/strict";
import { newGame, start, distance, runOutEnd } from "../src/race.js";
import { laneX } from "../src/data.js";
import { coursePoint, laneTravel } from "../src/course.js";
import { linePose, racingDistance } from "../src/racing-line.js";
import { planRacingLines } from "../src/traffic.js";
import { mapView } from "../src/radar.js";

function raceFor(seed) {
  const rng = () => (seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296;
  const game = newGame(rng);
  start(game, 0, rng);
  return game.race;
}

test("running lines repeat after saving, preserve gate and finish headings, and measure the mounted path", () => {
  const race = raceFor(919);
  const saved = JSON.parse(JSON.stringify(race.plan));
  assert.deepEqual(planRacingLines(saved, distance, runOutEnd(race)), race.plan.map(h => h.line));
  let diagonal = 0, maxMove = 0;
  race.plan.forEach((h,i) => {
    let prev = linePose(h,i,0), length = 0;
    assert.equal(prev.offset, laneX(i));
    for (let d = 0.25; d <= 1290; d += 0.25) {
      const p = linePose(h,i,d), base = coursePoint(d).heading;
      assert.ok(p.offset >= -9.00001 && p.offset <= 8.00001);
      assert.ok(Math.abs(p.heading - base) < 0.11);
      if (d < 22 || d >= 1142) assert.equal(p.heading, base);
      length += Math.hypot(p.x-prev.x,p.z-prev.z);
      if (d % 10 === 0) {
        assert.ok(Math.abs(racingDistance(h,i,d) - length) < 0.002);
        assert.deepEqual(linePose(saved[i],i,d),p);
        assert.equal(racingDistance({},i,d), laneTravel(d,laneX(i)));
      }
      diagonal = Math.max(diagonal, Math.abs(p.heading-base));
      maxMove = Math.max(maxMove, Math.abs(p.offset-laneX(i)));
      prev = p;
    }
  });
  assert.ok(diagonal > 0.07 && maxMove > 10);
  assert.ok(saved.some(h => h.line.some(([d,x],i) => i && x > h.line[i-1][1] + 1 && d > 400)));
});

test("sampled fields maintain room for the inclined bodies while crossing lanes at race pace", () => {
  let minSide = Infinity, nearby = 0;
  for (let seed = 0; seed < 64; seed++) {
    const race = raceFor(43 + seed * 787), end = runOutEnd(race);
    for (let n = 0; n <= end * 30; n++) {
      const t = n / 30, ds = race.plan.map(h => distance(h,t));
      const ps = race.plan.map((h,i) => {
        const p = linePose(h,i,ds[i], (ds[i] - distance(h,t-0.02)) / 0.02);
        return {...p, sin: Math.sin(p.heading), cos: Math.cos(p.heading)};
      });
      for (let i=0; i<ps.length; i++) for (let j=i+1; j<ps.length; j++) {
        if (Math.abs(ds[i]-ds[j]) > 5.2) continue;
        const a = ps[i], b = ps[j];
        const sin = Math.sin((a.heading+b.heading)/2), cos = Math.cos((a.heading+b.heading)/2);
        for (const height of [0,1.4,2.8]) {
          // Centre of each 3.8 m long silhouette, including the inward bank.
          const bankA = height*Math.tan(a.lean), bankB = height*Math.tan(b.lean);
          const dx = a.x-b.x - 1.75*(a.sin-b.sin) - bankA*a.cos + bankB*b.cos;
          const dz = a.z-b.z - 1.75*(a.cos-b.cos) + bankA*a.sin - bankB*b.sin;
          const angle = Math.abs(a.heading-b.heading)/2;
          const along = Math.abs(dx*sin+dz*cos);
          if (along > 3.8*Math.cos(angle) + 1.3*Math.sin(angle)) continue;
          nearby++;
          const side = Math.abs(dx*cos-dz*sin);
          minSide = Math.min(minSide,side);
          assert.ok(side > 1.3*Math.cos(angle) + 3.8*Math.sin(angle),
            'runner silhouettes intersect at seed '+seed+' t '+t+' runners '+i+'/'+j);
        }
      }
    }
  }
  assert.ok(nearby > 10000);
  console.log('64 fields at 30 Hz, mounted centre spacing in overlapping longitudinal spans:', minSide.toFixed(3),'m');
});

test("turf map contains all moving horses within the unobstructed part of landscape and portrait screens", () => {
  const race = raceFor(919);
  for (let t=0; t<82; t+=0.3) {
    const ds = race.plan.map(h=>distance(h,t));
    for (const [w,h] of [[850,400],[390,844],[360,210]]) {
      const view = mapView(ds,w,h);
      for (const [i,d] of ds.entries()) {
        const {x,y} = view.project(linePose(race.plan[i],i,d));
        assert.ok(x>w*.04 && x<w*.96 && y>h*.17 && y<h*.81);
      }
    }
  }
});
