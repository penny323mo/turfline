import * as THREE from "three";
import { createLandscape } from "./landscape.js";
import { loadAyanHorse, makeAyanHorse } from "./horse-ayan.js";
import { horses, duration } from "./data.js";

const venueShots = {
  overview: { eye: [-355, 760, 600], target: [-60, 0, 600], fov: 55 },
  gate: { eye: [-13, 5.0, 13], target: [-1, 1.45, -4.7], fov: 39 },
  stand: { eye: [1, 8.4, 35], target: [29, 3.0, 10], fov: 39 },
  finish: { eye: [-17, 4.1, 1217], target: [5, 1.7, 1200], fov: 37 },
};

export async function startStage(canvas, state, refresh) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  // Software WebGL shares CPU time with input, storage and the other race tabs.
  const gl = renderer.getContext();
  const driver = gl.getExtension("WEBGL_debug_renderer_info");
  const software = Boolean(
    driver &&
      /swiftshader|llvmpipe|software rasterizer/i.test(
        gl.getParameter(driver.UNMASKED_RENDERER_WEBGL),
      ),
  );
  renderer.setPixelRatio(software ? 0.7 : Math.min(devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#bdd9df");
  scene.fog = new THREE.FogExp2("#c6d5cc", 0.0085);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.08, 2300);
  const land = createLandscape();
  land.group.scale.x = -1;
  scene.add(land.group);
  const hemi = new THREE.HemisphereLight(0xe8f3ff, 0xcdbe95, 1.35);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.48);
  sun.castShadow = true;
  const shadowSize = Math.min(innerWidth, innerHeight) < 650
      ? 1024
      : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, {
    left: -17,
    right: 17,
    top: 18,
    bottom: -18,
    near: 1,
    far: 110,
  });
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00035;
  scene.add(hemi, sun, sun.target);
  const sky = new THREE.TextureLoader()
    .loadAsync("./environment/kloofendal.jpg")
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = texture;
      if (!software) scene.environment = texture;
      scene.environmentIntensity = 0.33;
      scene.backgroundIntensity = 1.04;
      scene.backgroundRotation.y = 1.2;
      scene.environmentRotation.y = 1.2;
    });
  await Promise.all([land.ready, sky, loadAyanHorse()]);
  let actors = horses.map(makeAyanHorse);
  const loadedActors = new Map([[makeAyanHorse, actors]]);
  for (const actor of actors) scene.add(actor.group);
  // Projected contact patches keep the horses grounded without a second
  // scene-wide geometry pass on software WebGL.
  const patches = [];
  if (software) {
    const stamp = document.createElement("canvas");
    stamp.width = stamp.height = 64;
    const ctx = stamp.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(35,32,23,.45)");
    gradient.addColorStop(1, "rgba(35,32,23,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(stamp), transparent: true, depthWrite: false,
    });
    const plane = new THREE.PlaneGeometry(1.7, 3.2).rotateX(-Math.PI / 2);
    for (let i = 0; i < actors.length; i++) {
      const patch = new THREE.Mesh(plane, material);
      patches.push(patch);
      scene.add(patch);
    }
  }
  const eye = new THREE.Vector3(),
    look = new THREE.Vector3(),
    aim = new THREE.Vector3(),
    focus = new THREE.Vector3();
  let cut = true,
    lastFrame = 0,
    lastUi = -1,
    lastTime = state.time;
  const canvasBox = canvas.parentElement;
  let onScreen = true;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  }).observe(canvasBox);
  const size = () => {
    const w = canvasBox.clientWidth,
      h = canvasBox.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cut = true;
  };
  new ResizeObserver(size).observe(canvasBox);
  size();
  function place(dt) {
    const t = state.time;
    const race = state.courseFrame?.();
    const z = race ? race.ds[state.selected] : 10 + t * (1190 / duration);
    for (let i = 0; i < actors.length; i++) {
      const spec = horses[i],
        g = actors[i].group;
      g.position.set(
        race
          ? -6 + i * 2 + 0.06 * Math.sin(Math.max(0, race.t) * 0.4 + i)
          : spec.x + 0.1 * Math.sin(t * 0.38 + i),
        0,
        race
          ? race.ds[i] - 1.25
          : z + spec.z + 1.65 * Math.sin(t * 0.32 + i * 0.88),
      );
      if (software) patches[i].position.set(g.position.x, 0.012, g.position.z);
      g.rotation.y = 0.008 * Math.cos(t * 0.38 + i);
      if (race && (cut || race.t <= 0 || race.stopped))
        actors[i].seek(Math.max(0, race.t) + i * 0.147, race.t > 0, 16);
      else if (actors[i].seek && cut) actors[i].seek(t + i * 0.147, true, 15.7);
      else actors[i].update(dt, true, 15.7);
    }
    focus.copy(actors[state.selected].group.position);
    const venue = venueShots[state.cam];
    const screenWidthBias = Math.max(1, 1.35 / camera.aspect);
    let fov = 32;
    if (venue) {
      eye.fromArray(venue.eye);
      look.fromArray(venue.target);
      fov = venue.fov;
      if (state.cam === "overview" && camera.aspect < 1.9)
        eye
          .sub(look)
          .multiplyScalar(1.9 / camera.aspect)
          .add(look);
    } else if (state.cam === "track") {
      eye
        .copy(focus)
        .add(
          new THREE.Vector3(
            -5.95 * screenWidthBias,
            1.78,
            2.7 * screenWidthBias,
          ),
        );
      look.copy(focus).add(new THREE.Vector3(0.2, 1.2, 0.38));
    } else if (state.cam === "aerial") {
      eye
        .copy(focus)
        .add(new THREE.Vector3(-3.4, 18.5 * screenWidthBias, -6.2));
      look.copy(focus).add(new THREE.Vector3(0.4, 0.65, -0.2));
      fov = 46;
    } else {
      eye.copy(focus).add(new THREE.Vector3(-9.5, 3.5, 18 * screenWidthBias));
      look.copy(focus).add(new THREE.Vector3(0.4, 1.28, -0.5));
      fov = 17.4;
    }
    scene.fog.density = state.cam === "overview" ? 0.00045 : 0.0085;
    land.update(venue ? venue.target[2] : z);
    const a = cut ? 1 : 1 - Math.exp(-15 * Math.max(dt, 1 / 60));
    camera.position.lerp(eye, a);
    aim.lerp(look, a);
    camera.lookAt(aim);
    camera.fov = fov / (state.zoom || 1);
    camera.updateProjectionMatrix();
    sun.position.set(aim.x - 18, 36, aim.z + 20);
    sun.target.position.copy(aim);
    const marker = document.getElementById("tracking-mark");
    if (marker) {
      marker.hidden = Boolean(venue) || state.cam === "track";
      if (!marker.hidden) {
        const pt = focus.clone();
        pt.y = 2.8;
        pt.project(camera);
        marker.style.left = (pt.x + 1) * 50 + "%";
        marker.style.top = (-pt.y + 1) * 50 + "%";
      }
    }
    cut = false;
  }
  let pendingFrame;
  function draw() {
    renderer.render(scene, camera);
    if (software) {
      pendingFrame = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    }
  }
  function render(now) {
    if (!state.visible || document.hidden || !onScreen) {
      lastFrame = 0;
      return;
    }
    if (!cut && (state.paused || venueShots[state.cam] || (software && state.holdFrame))) return;
    const fps = !document.hasFocus() ? 6 : software ? 18 : 45;
    if (lastFrame && now - lastFrame < 1000 / fps - 1) return;
    // Do not enqueue another complete frame while the previous one is pending.
    if (pendingFrame) {
      if (gl.clientWaitSync(pendingFrame, 0, 0) === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(pendingFrame);
      pendingFrame = null;
    }
    const dt = lastFrame ? Math.min(0.24, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const step = state.paused || venueShots[state.cam] ? 0 : dt * state.speed;
    state.time = (state.time + step) % duration;
    if (Math.abs(state.time - lastTime) > 0.6) cut = true;
    lastTime = state.time;
    place(step);
    if (Math.floor(state.time * 10) !== lastUi) {
      refresh();
      lastUi = Math.floor(state.time * 10);
    }
    draw();
  }
  place(0);
  draw();
  renderer.setAnimationLoop(render);
  return {
    cut: () => {
      cut = true;
    },
    async replace(factory) {
      let next = loadedActors.get(factory);
      if (!next) {
        next = horses.map(factory);
        loadedActors.set(factory, next);
      }
      for (const old of actors) scene.remove(old.group);
      actors = next;
      for (const actor of actors) scene.add(actor.group);
      cut = true;
    },
  };
}
