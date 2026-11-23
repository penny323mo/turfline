import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  executablePath: process.env.TURFLINE_CHROME || (existsSync(chrome) ? chrome : undefined),
});
try {
  const page = await browser.newPage();
  // Use the project's exact browser modules, including canvas number plates.
  await page.route("http://turfline.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({ contentType: "text/html", body: '<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>' });
    const file = url.pathname.slice(1);
    const dir = file.startsWith("three/") ? "node_modules" : file.startsWith("models/") ? "public" : "";
    await route.fulfill({
      body: await readFile(path.join(root, dir, file)),
      contentType: file.endsWith(".js") ? "text/javascript" : "model/gltf-binary",
    });
  });
  await page.goto("http://turfline.test/");
  const data = await page.evaluate(async () => {
    const THREE = await import("three");
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const { loadAyanHorse, makeAyanHorse } = await import("/src/horse-ayan.js");
    const { horses, laneX } = await import("/src/data.js");
    const { strideLength } = await import("/src/stride.js");
    const { distance, stopDistance, RUN_OUT_SECONDS } = await import("/src/race.js");
    const { laneTravel } = await import("/src/course.js");
    await loadAyanHorse();
    const actor = makeAyanHorse(horses[0]), model = actor.group;
    model.name = "Crimson Comet";
    model.children[0].name = "GroundedHorseAndRider";
    const moving = new Set(["GroundedHorseAndRider", "JockeyLegs", "JockeyWaist", "JockeyUpperBody"]);
    function bake(name, duration, segments, pose) {
      const states = [], times = [];
      model.traverse(node => {
        if (node.isBone || moving.has(node.name)) states.push({ node, positions: [], rotations: [], morphs: [] });
      });
      for (let i = 0; i <= segments; i++) {
        const t = duration * i / segments;
        times.push(t);
        pose(t);
        model.updateMatrixWorld(true);
        for (const { node, positions, rotations, morphs } of states) {
          node.position.toArray(positions, 3 * i);
          node.quaternion.toArray(rotations, 4 * i);
          if (node.morphTargetInfluences) morphs.push(node.morphTargetInfluences[0]);
        }
      }
      const tracks = [];
      const varies = (values, width) => values.some((v, i) => Math.abs(v - values[i % width]) > 0.00001);
      for (const { node, positions, rotations, morphs } of states) {
        if (varies(positions, 3)) tracks.push(new THREE.VectorKeyframeTrack(node.name + ".position", times, positions));
        if (varies(rotations, 4)) tracks.push(new THREE.QuaternionKeyframeTrack(node.name + ".quaternion", times, rotations));
        if (varies(morphs, 1)) tracks.push(new THREE.NumberKeyframeTrack(node.name + ".morphTargetInfluences", times, morphs));
      }
      return new THREE.AnimationClip(name, duration, tracks).optimize();
    }
    const plan = { finish: 68, early: 0.008, surge: 0.006 };
    const offset = laneX(0), halt = laneTravel(stopDistance(plan), offset);
    const sampleRace = t => actor.seekDistance(laneTravel(distance(plan, t), offset), t > 0, halt);
    const period = strideLength(1) / 16;
    const clips = [
      bake("Gallop", period, 360, t => actor.seek(t === period ? 0 : t, true, 16)),
      bake("GateBreak", 2.5, 600, sampleRace),
      bake("PullUp", RUN_OUT_SECONDS, RUN_OUT_SECONDS * 240, t => sampleRace(plan.finish + t)),
    ];
    actor.seek(0);
    model.updateMatrixWorld(true);
    const exporter = new GLTFExporter();
    exporter.register(writer => ({ afterParse() {
      writer.json.asset.copyright = "Horse by Ayan (CC BY 4.0). Mounted adaptation by Turfline.";
      writer.json.asset.extras = {
        title: "Crimson Comet — mounted racehorse", horseAuthor: "Ayan",
        horseSource: "https://sketchfab.com/3d-models/animated-rigged-horse-with-saddle-b08743c2c4734fb98a4e0a2f5767c318",
        horseLicense: "https://creativecommons.org/licenses/by/4.0/",
        adaptation: "Turfline racing tack, colours, jockey and in-place gallop, gate break and pull-up. Metres, positive Z forward.",
      };
    } }));
    const bytes = new Uint8Array(await exporter.parseAsync(model, { binary: true, animations: clips }));
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 16384) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return btoa(chunks.join(""));
  });
  const dest = path.join(root, "public/models/horse-ayan-mounted.glb"), temp = dest + "." + process.pid + ".tmp";
  await writeFile(temp, Buffer.from(data, "base64"));
  await rename(temp, dest);
  console.log("Exported Gallop, GateBreak and PullUp to public/models/horse-ayan-mounted.glb");
} finally {
  await browser.close();
}
