import { cameras, horses, riderCamera } from "./data.js";
import { distance, LENGTH, RUN_OUT_SECONDS } from "./race.js";
import { coursePoint } from "./course.js";
import { linePose } from "./racing-line.js";

export const liveCameras = [...cameras,
  { id: "pack", name: "全場廣角", en: "FIELD WIDE", icon: "expand" },
  { id: "auto", name: "自動導播", en: "DIRECTOR", icon: "broadcast" },
  { id: "radar", name: "走位圖", en: "RACE RADAR", icon: "focus" },
  riderCamera,
];
const viewKey = "turfline.spectator-view";

export function readView() {
  try {
    const view = JSON.parse(sessionStorage.getItem(viewKey));
    if (Number.isInteger(view?.horse) && horses[view.horse] && liveCameras.some((c) => c.id === view.cam))
      return view;
  } catch { /* Storage can be unavailable in private or sandboxed tabs. */ }
  return { horse: 0, cam: "track" };
}

export function saveView(horse, cam) {
  try { sessionStorage.setItem(viewKey, JSON.stringify({ horse, cam })); }
  catch { /* Camera controls still work in memory. */ }
}

// Cuts are determined by where the chosen horse is now, including on a seek.
export function cameraShot(mode, distance) {
  if (mode !== "auto") return mode;
  if (distance < 110) return "track";
  if (distance < 400) return "pack";
  if (distance < 650) return "tele";
  if (distance < 860) return "aerial";
  if (distance < LENGTH - 180) return "pack";
  return "track";
}

// Use the screen's long axis for the length of the field. Fit the full box in
// perspective, including the nearest lane and space around the broadcast graphics.
export function fieldCamera(runners, aspect, tight = false) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { x, z, angle, lean } of runners) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const shift = -1.45 * Math.tan(lean);
    const width = 0.65 + Math.abs(shift);
    const halfX = width * Math.abs(cos) + 2 * Math.abs(sin);
    const halfZ = width * Math.abs(sin) + 2 * Math.abs(cos);
    minX = Math.min(minX, x + shift * cos - halfX);
    maxX = Math.max(maxX, x + shift * cos + halfX);
    minZ = Math.min(minZ, z - shift * sin - halfZ);
    maxZ = Math.max(maxZ, z - shift * sin + halfZ);
  }
  const dx = (maxX - minX) / 2;
  const dy = 1.55;
  const dz = (maxZ - minZ) / 2;
  const fov = 38, tangent = Math.tan(fov * Math.PI / 360);
  // Keep the down-track view when the available rectangle is nearly square.
  const portrait = aspect < (tight ? 1.18 : 1);
  const backX = portrait ? 0 : -0.8;
  const backZ = portrait ? -0.35 : 0;
  const backY = Math.sqrt(1 - backX ** 2 - backZ ** 2);
  const along = portrait ? dz : dx;
  const tilt = portrait ? -backZ : -backX;
  const nearest = tilt * along + backY * dy;
  const horizontal = (portrait ? dx : dz) / (0.84 * tangent * aspect);
  const verticalFill = tight ? 0.84 : portrait ? 0.62 : 0.53;
  const vertical = (backY * along + tilt * dy) / (verticalFill * tangent);
  const radius = nearest + Math.max(horizontal, vertical);
  const x = (minX + maxX) / 2, y = 1.48, z = (minZ + maxZ) / 2;
  return {
    x, y, z, fov, eyeX: x + backX * radius, eyeY: y + backY * radius,
    eyeZ: z + backZ * radius, fogDensity: Math.min(0.0085, 0.34 / radius),
  };
}

// Price obstructions between the lens and the selected horse. An uninterrupted
// shot has value, so plan a cut only when the opposite rail improves coverage.
const coverage = new WeakMap();
const shotSeconds = 2;
export function tracksideSide(plan, runner, t, screenBias) {
  if (!plan[runner].line) return -1;
  let cache = coverage.get(plan);
  if (!cache) { cache = new Map(); coverage.set(plan, cache); }
  const bias = Math.round(Math.min(4, screenBias) * 4) / 4;
  const key = runner + "/" + bias;
  let shots = cache.get(key);
  if (!shots) {
    const n = Math.ceil((Math.max(...plan.map(h => h.finish)) + RUN_OUT_SECONDS) / shotSeconds) + 1;
    let totals = [0, 0];
    const previous = [];
    for (let k = 0; k < n; k++) {
      const cost = [0, 0.07];
      for (let j = 0; j < 4; j++) {
        const time = shotSeconds * (k + (j + 0.5) / 4);
        const ds = plan.map(h => distance(h,time));
        const base = coursePoint(ds[runner]), sin = Math.sin(base.heading), cos = Math.cos(base.heading);
        const focus = linePose(plan[runner],runner,ds[runner]);
        for (const [i, h] of plan.entries()) {
          if (i === runner || Math.abs(ds[i] - ds[runner]) > 5 * bias + 6) continue;
          const p = linePose(h,i,ds[i]), dx = p.x - focus.x, dz = p.z - focus.z;
          const side = dx*cos - dz*sin, f = Math.abs(side) / (5.95*bias);
          if (f >= 1.12) continue;
          const along = dx*sin + dz*cos;
          const gap = Math.abs(along - f * 2.7 * bias);
          cost[side > 0 ? 1 : 0] += Math.max(0,1-gap/4.2) * Math.min(1,(1.12-f)*3);
        }
      }
      const from = [0,1].map(i => totals[i] <= totals[1-i] + 2.8 ? i : 1-i);
      totals = from.map((side,i) => totals[side] + cost[i] + (side === i ? 0 : 2.8));
      previous.push(from);
    }
    shots = Array(n);
    let side = totals[0] <= totals[1] ? 0 : 1;
    for (let k = n-1; k >= 0; k--) {
      shots[k] = side ? 1 : -1;
      side = previous[k][side];
    }
    cache.set(key, shots);
  }
  return shots[Math.min(shots.length-1, Math.max(0, Math.floor(t/shotSeconds)))];
}
