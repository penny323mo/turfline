import * as THREE from "three";
import { createLandscape } from "./landscape.js";
import { loadAyanHorse, makeAyanHorse } from "./horse-ayan.js";
import { horses, duration, laneX } from "./data.js";
import { cameraShot, fieldCamera } from "./broadcast.js";
import { bendLean, coursePoint, laneTravel } from "./course.js";

const venueShots = {
  overview: { eye: [-355, 760, 600], target: [-60, 0, 600], fov: 55 },
  gate: { eye: [-13, 5.0, 13], target: [-1, 1.45, -1.4], fov: 39 },
  stand: { eye: [1, 8.4, 35], target: [29, 3.0, 10], fov: 39 },
  finish: { eye: [-17, 4.1, 1217], target: [5, 1.7, 1200], fov: 37 },
};

const bankFrame = new THREE.Matrix4();
export function placeRunnerFrame(frame, pt, lean) {
  // Shift the centre of mass inward in proportion to its height. The
  // support plane stays level even when both sides have a hoof down.
  frame.matrixAutoUpdate = false;
  bankFrame.makeShear(0, 0, -Math.tan(lean), 0, 0, 0);
  frame.matrix.makeRotationY(pt.heading).multiply(bankFrame).setPosition(pt.x, 0, pt.z);
  frame.matrixWorldNeedsUpdate = true;
}

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
  const onRaceCourse = Boolean(state.courseFrame);
  const land = createLandscape(onRaceCourse);
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
  const runnerFrames = actors.map(actor => {
    const frame = new THREE.Group();
    frame.add(actor.group);
    scene.add(frame);
    return frame;
  });
  const runnerPositions = actors.map(() => new THREE.Vector3());
  const field = actors.map(() => ({ x: 0, z: 0, angle: 0, lean: 0 }));
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
    focus = new THREE.Vector3(), cameraEye = new THREE.Vector3(), cameraAim = new THREE.Vector3();
  const cameraFrame = new THREE.Matrix4(), inverseFrame = new THREE.Matrix4();
  let cut = true,
    lastFrame = 0,
    lastUi = -1,
    lastTime = state.time,
    lastRaceTime,
    lastShot;
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
  if (state.onPick) {
    const raycaster = new THREE.Raycaster();
    const bounds = new THREE.Box3();
    canvas.addEventListener("click", (event) => {
      if (lastShot !== "pack") return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera({
        x: 2 * (event.clientX - rect.left) / rect.width - 1,
        y: 1 - 2 * (event.clientY - rect.top) / rect.height,
      }, camera);
      let closest = Infinity, runner;
      for (const [i, actor] of actors.entries()) {
        const p = runnerPositions[i];
        bounds.min.set(p.x - 2.3, -0.1, p.z - 2.3);
        bounds.max.set(p.x + 2.3, 2.9, p.z + 2.3);
        if (!raycaster.ray.intersectsBox(bounds)) continue;
        actor.group.traverseVisible((mesh) => {
          if (!mesh.isMesh) return;
          if (mesh.isSkinnedMesh) mesh.computeBoundingSphere();
          const hit = raycaster.intersectObject(mesh, false)[0];
          if (hit && hit.distance < closest) {
            closest = hit.distance;
            runner = i;
          }
        });
      }
      if (runner !== undefined) state.onPick(runner);
    });
  }
  function place(dt) {
    const t = state.time;
    const race = state.courseFrame?.();
    const z = race ? race.ds[state.selected] : 10 + t * (1190 / duration);
    const shot = cameraShot(state.cam, race ? z : 0);
    if (shot !== lastShot) {
      cut = true;
      lastShot = shot;
      state.onShot?.(shot);
    }
    if (race && Math.abs(race.t - lastRaceTime) > 0.8) cut = true;
    lastRaceTime = race?.t;
    for (let i = 0; i < actors.length; i++) {
      const spec = horses[i],
        g = actors[i].group;
      const d = race ? race.ds[i] : z + spec.z + 1.65 * Math.sin(t * 0.32 + i * 0.88);
      const lane = race ? laneX(i) : spec.x;
      const sway = race ? 0.06 * Math.sin(Math.max(0, race.t) * 0.4 + i) : 0.1 * Math.sin(t * 0.38 + i);
      const pt = onRaceCourse ? coursePoint(d, lane + sway) : { x: lane + sway, z: d, heading: 0 };
      const frame = runnerFrames[i];
      const lean = onRaceCourse ? bendLean(d, race ? race.speeds[i] : 15.7, lane) : 0;
      field[i].angle = pt.heading;
      field[i].lean = lean;
      placeRunnerFrame(frame, pt, lean);
      g.position.set(0, 0, 0);
      g.rotation.y = 0.008 * Math.cos((race ? race.t : t) * 0.38 + i);
      // Sample the same stride from race time in live coverage and on replay.
      if (race)
        actors[i].seekDistance(laneTravel(d, lane), race.t > 0);
      else if (actors[i].seek && cut) actors[i].seek(t + i * 0.147, true, 15.7);
      else actors[i].update(dt, true, 15.7);
      if (race) g.position.z = -actors[i].noseLead;
      frame.localToWorld(runnerPositions[i].copy(g.position));
      if (software) {
        patches[i].position.copy(runnerPositions[i]);
        patches[i].position.y = 0.012;
        patches[i].rotation.y = pt.heading;
      }
    }
    const cameraDistance = shot === "pack" && race ? (Math.min(...race.ds) + Math.max(...race.ds)) / 2 : z;
    const axis = onRaceCourse ? coursePoint(cameraDistance) : { x: 0, z: cameraDistance, heading: 0 };
    cameraFrame.makeRotationY(axis.heading).setPosition(axis.x, 0, axis.z);
    inverseFrame.copy(cameraFrame).invert();
    focus.copy(runnerPositions[state.selected]).applyMatrix4(inverseFrame);
    const venue = venueShots[shot];
    const screenWidthBias = Math.max(1, 1.35 / camera.aspect);
    let fov = 32, fogDensity = shot === "overview" ? 0.00045 : 0.0085;
    if (venue) {
      eye.fromArray(venue.eye);
      look.fromArray(venue.target);
      fov = venue.fov;
      if (state.cam === "overview" && camera.aspect < 1.9)
        eye
          .sub(look)
          .multiplyScalar(1.9 / camera.aspect)
          .add(look);
    } else if (shot === "pack") {
      runnerPositions.forEach((p, i) => {
        look.copy(p).applyMatrix4(inverseFrame);
        field[i].x = look.x;
        field[i].z = look.z;
        field[i].angle -= axis.heading;
      });
      const frame = fieldCamera(field, camera.aspect);
      look.set(frame.x, frame.y, frame.z);
      eye.set(frame.eyeX, frame.eyeY, frame.eyeZ);
      fov = frame.fov;
      fogDensity = frame.fogDensity;
    } else if (shot === "line") {
      eye.set(-17 * screenWidthBias, 8.2 * screenWidthBias, 1200);
      look.set(0, 1.2, 1200);
      fov = 36;
    } else if (shot === "track") {
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
      if (race && z < 18) {
        const gateView = 1 - THREE.MathUtils.smoothstep(z, 2, 18);
        eye.lerp(new THREE.Vector3(-10 * screenWidthBias, 3.7, 13), gateView);
        look.lerp(new THREE.Vector3(focus.x * 0.68, 1.5, -0.7), gateView);
        fov += 8 * gateView;
      }
    } else if (shot === "aerial") {
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
    scene.fog.density = fogDensity;
    land.update(venue ? venue.target[2] : z, race?.t ?? 0, shot !== "pack");
    const a = cut ? 1 : 1 - Math.exp(-15 * Math.max(dt, 1 / 60));
    cameraEye.lerp(eye, a);
    cameraAim.lerp(look, a);
    camera.position.copy(cameraEye);
    aim.copy(cameraAim);
    if (!venue && shot !== "line") {
      camera.position.applyMatrix4(cameraFrame);
      aim.applyMatrix4(cameraFrame);
    }
    camera.lookAt(aim);
    // Keep the near-side timing cabinet out of the finish camera's sightline.
    let near = 0.08;
    if (shot === "line") near = Math.max(1, eye.distanceTo(look) - 9.8);
    // Keep enough depth precision to separate the turf and its painted course.
    if (shot === "pack") near = camera.position.distanceTo(aim) * 0.25;
    camera.near = near;
    camera.fov = fov / (state.zoom || 1);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sun.position.set(aim.x - 18, 36, aim.z + 20);
    sun.target.position.copy(aim);
    const marker = document.getElementById("tracking-mark");
    if (marker) {
      marker.hidden = Boolean(venue) || shot === "track";
      if (!marker.hidden) {
        const pt = runnerPositions[state.selected].clone();
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
    if (!cut && (state.paused || state.staticPose || venueShots[state.cam] || (software && state.holdFrame))) return;
    const fps = !document.hasFocus() ? 6 : software ? 18 : 60;
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
      actors.forEach((old, i) => runnerFrames[i].remove(old.group));
      actors = next;
      actors.forEach((actor, i) => runnerFrames[i].add(actor.group));
      cut = true;
    },
  };
}
