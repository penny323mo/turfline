import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraShot, fieldCamera } from "../src/broadcast.js";
import { laneX } from "../src/data.js";
import { newGame, start, snapshotAt } from "../src/race.js";

test("director cuts follow the selected horse's distance and manual shots remain fixed", () => {
  const distances = [0, 150, 550, 720, 930, 1199, 1222];
  assert.deepEqual(distances.map((d) => cameraShot("auto", d)), ["track", "pack", "tele", "aerial", "pack", "track", "track"]);
  for (const manual of ["track", "pack", "tele", "aerial", "line"])
    assert.ok(distances.every((d) => cameraShot(manual, d) === manual));
  assert.equal(cameraShot("auto", 150), cameraShot("auto", 175));
});

test("whole-field perspective fits all six mounted silhouettes on desktop, portrait and old race plans", () => {
  let seed = 197;
  const rng = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const point = new Vector3();
  for (let race = 0; race < 20; race++) {
    const game = newGame(rng);
    start(game, 0, rng);
    if (race % 2) game.race.plan.forEach((horse) => { horse.early *= 3; });
    for (const t of [-2, 15, 34, 64, 75]) {
      const centres = snapshotAt(game.race, t).ds.map((d) => d - 1.35);
      for (const aspect of [0.46, 1.65, 2.03, 2.8]) {
        const frame = fieldCamera(laneX(0), laneX(5), Math.min(...centres), Math.max(...centres), aspect);
        const camera = new PerspectiveCamera(frame.fov, aspect, 0.08, 2300);
        camera.position.set(frame.x - 0.8 * frame.radius, frame.y + 0.6 * frame.radius, frame.z);
        camera.lookAt(frame.x, frame.y, frame.z);
        camera.updateMatrixWorld();
        for (const [i, z] of centres.entries())
          for (const side of [-0.6, 0.6])
            for (const height of [0, 2.9])
              for (const end of [-1.95, 1.55]) {
                point.set(laneX(i) + side, height, z + end).project(camera);
                assert.ok(Math.abs(point.x) < 0.85 && Math.abs(point.y) < 0.54 && point.z < 1);
              }
      }
    }
  }
});
