import { cameras, horses } from "./data.js";
import { LENGTH } from "./race.js";

export const liveCameras = [...cameras,
  { id: "pack", name: "全場廣角", en: "FIELD WIDE", icon: "expand" },
  { id: "auto", name: "自動導播", en: "DIRECTOR", icon: "broadcast" },
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
export function fieldCamera(minX, maxX, minZ, maxZ, aspect) {
  const dx = (maxX - minX) / 2 + 0.65;
  const dy = 1.55;
  const dz = (maxZ - minZ) / 2 + 2;
  const fov = 38, tangent = Math.tan(fov * Math.PI / 360);
  const portrait = aspect < 1;
  const backX = portrait ? 0 : -0.8;
  const backZ = portrait ? -0.35 : 0;
  const backY = Math.sqrt(1 - backX ** 2 - backZ ** 2);
  const along = portrait ? dz : dx;
  const tilt = portrait ? -backZ : -backX;
  const nearest = tilt * along + backY * dy;
  const horizontal = (portrait ? dx : dz) / (0.84 * tangent * aspect);
  const vertical = (backY * along + tilt * dy) / ((portrait ? 0.62 : 0.53) * tangent);
  const radius = nearest + Math.max(horizontal, vertical);
  const x = (minX + maxX) / 2, y = 1.48, z = (minZ + maxZ) / 2;
  return {
    x, y, z, fov, eyeX: x + backX * radius, eyeY: y + backY * radius,
    eyeZ: z + backZ * radius, fogDensity: Math.min(0.0085, 0.34 / radius),
  };
}
