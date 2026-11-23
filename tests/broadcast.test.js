import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraShot, fieldCamera } from "../src/broadcast.js";
import { laneX } from "../src/data.js";
import { newGame, start, snapshotAt } from "../src/race.js";
import { bendLean, coursePoint } from "../src/course.js";

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
    for (const t of [-2, 15, 21, 34, 43, 64, 75]) {
      const ds = snapshotAt(game.race, t).ds;
      const axis = coursePoint((Math.min(...ds) + Math.max(...ds)) / 2);
      const centres = ds.map((d, i) => {
        const p = coursePoint(d, laneX(i)), angle = p.heading - axis.heading;
        const dx = p.x - axis.x, dz = p.z - axis.z;
        return {
          x: dx * Math.cos(axis.heading) - dz * Math.sin(axis.heading) - 1.35 * Math.sin(angle),
          z: dx * Math.sin(axis.heading) + dz * Math.cos(axis.heading) - 1.35 * Math.cos(angle),
          angle, lean: bendLean(d, 18, laneX(i)),
        };
      });
      for (const aspect of [0.46, 1.65, 2.03, 2.8]) {
        const frame = fieldCamera(centres, aspect);
        const camera = new PerspectiveCamera(frame.fov, aspect, 0.08, 2300);
        camera.position.set(frame.eyeX, frame.eyeY, frame.eyeZ);
        camera.lookAt(frame.x, frame.y, frame.z);
        camera.updateMatrixWorld();
        const range = camera.position.distanceTo(point.set(frame.x, frame.y, frame.z));
        camera.near = range * 0.25;
        camera.updateProjectionMatrix();
        assert.ok(Math.exp(-((range * frame.fogDensity) ** 2)) > 0.88);
        if (aspect < 1) assert.ok(frame.eyeZ < frame.z && frame.eyeX === frame.x);
        for (const p of centres)
          for (const side of [-0.6, 0.6])
            for (const height of [0, 2.9])
              for (const end of [-1.95, 1.55]) {
                const x = side - height * Math.tan(p.lean);
                point.set(p.x + x * Math.cos(p.angle) + end * Math.sin(p.angle), height,
                  p.z - x * Math.sin(p.angle) + end * Math.cos(p.angle)).project(camera);
                assert.ok(Math.abs(point.x) < 0.85 && Math.abs(point.y) < (aspect < 1 ? 0.63 : 0.54) && Math.abs(point.z) < 1);
              }
      }
    }
  }
});
