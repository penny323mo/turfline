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
  renderer.setPixelRatio(
    software ? 0.8 : Math.min(window.devicePixelRatio || 1, 1.65),
  );
  renderer.shadowMap.enabled = true;
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
  const shadowSize = software
    ? 512
    : Math.min(innerWidth, innerHeight) < 650
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
  function render(now) {
    if (!state.visible || document.hidden || !onScreen) {
      lastFrame = 0;
      return;
    }
    const fps = !document.hasFocus() ? 8 : software ? 18 : 45;
    if (lastFrame && now - lastFrame < 1000 / fps - 1) return;
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
    renderer.render(scene, camera);
  }
  place(0);
  renderer.render(scene, camera);
  renderer.setAnimationLoop(render);
  return {
    cut: () => {
      cut = true;
      place(0);
      renderer.render(scene, camera);
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
      place(0);
      renderer.render(scene, camera);
    },
  };
}
