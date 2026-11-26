import * as THREE from "three";
import { createLandscape } from "./landscape.js";
import { loadAyanHorse, makeAyanHorse } from "./horse-ayan.js";
import { horses, duration, laneX } from "./data.js";
import { cameraShot, fieldCamera, tracksideSide } from "./broadcast.js";
import { portraitPredictionView } from "./prediction-view.js";
import { bendLean, coursePoint, LENGTH } from "./course.js";
import { linePose, racingDistance } from "./racing-line.js";

import { paradePoint, ringCentre } from "./parade.js";
import { makeParadeRing } from "./parade-ring.js";

const venueShots = {
  overview: { eye: [-355, 760, 600], target: [-60, 0, 600], fov: 55 },
  gate: { eye: [-13, 5.0, 13], target: [-1, 1.45, -1.4], fov: 39 },
  stand: { eye: [1, 8.4, 35], target: [29, 3.0, 10], fov: 39 },
  finish: { eye: [-17, 4.1, 1217], target: [5, 1.7, 1200], fov: 37 },
};

const bankFrame = new THREE.Matrix4();
export const mountedViewBounds = { height: 1.35, radius: 3.5 };
// Local envelope of the mounted Ayan model through flight, support and bank.
export const ayanViewBox = new THREE.Box3(new THREE.Vector3(-0.54,-0.10,-2.48),new THREE.Vector3(0.54,2.70,1.78));
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
  const ring = onRaceCourse ? makeParadeRing() : null;
  const land = createLandscape(onRaceCourse,software,ring);
  land.group.scale.x = -1;
  scene.add(land.group);
  if (ring) scene.add(ring);
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
  // The finish lens looks along the same plane as its near-side housing.
  // Keep the cabinet visible from every other camera.
  const housingLayer = 1;
  land.group.getObjectByName("finish-mirror").layers.set(housingLayer);
  const cullCourse = software ? land.prepareVisibility() : null;
  let actors = horses.map(makeAyanHorse);
  const loadedActors = new Map([[makeAyanHorse, actors]]);
  const adjustDetail = software ? await import("./horse-detail.js")
    .then(module => module.prepareHorseDetail(actors))
    .catch(() => null) : null;
  const runnerFrames = actors.map(actor => {
    const frame = new THREE.Group();
    frame.add(actor.group);
    scene.add(frame);
    return frame;
  });
  const runnerPositions = actors.map(() => new THREE.Vector3());
  const view = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
  const localView = new THREE.Frustum(), localProjection = new THREE.Matrix4();
  const mountedBounds = new THREE.Sphere(new THREE.Vector3(), mountedViewBounds.radius);
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
  const hoofMark = document.getElementById("hoof-mark"), solePoint = new THREE.Vector3();
  const replayDeck = document.getElementById("replay-deck"), orderStrip = document.getElementById("order-strip");
  const finishNose = document.getElementById("finish-nose"), finishGuide = document.getElementById("finish-guide");
  const nosePoint = new THREE.Vector3();
  const lowerThird = canvas.parentElement.querySelector(".lower-third");
  let cut = true,
    lastFrame = 0,
    lastUi = -1,
    lastTime = state.time,
    lastRaceTime,
    lastShot;
  const canvasBox = canvas.parentElement;
  let fullAspect = camera.aspect;
  let predictionView = null;
  const predictionPanel = document.getElementById("late-pick");
  if (predictionPanel) {
    const measure = new ResizeObserver(() => {
      predictionView = portraitPredictionView(canvasBox);
      cut = true;
    });
    for (const el of [canvasBox, lowerThird, predictionPanel, predictionPanel.querySelector("#late-options")])
      measure.observe(el);
  }
  let onScreen = true;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  }).observe(canvasBox);
  const size = () => {
    const w = canvasBox.clientWidth,
      h = canvasBox.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    fullAspect = camera.aspect = w / h;
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
  let lastTrackSide, lastParade;
  function place(dt) {
    const t = state.time;
    const crossing = state.finishReview;
    const race = state.courseFrame?.();
    const parade = !!state.parade;
    const paradeTime = parade ? state.paradeTime : 0;
    if (ring) ring.visible = parade;
    if (parade !== lastParade) cut = true;
    lastParade = parade;
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
      const runner = race?.plan[i];
      const lane = runner ? laneX(i) : spec.x;
      const moving = race ? THREE.MathUtils.smoothstep(race.speeds[i], 0, 3) : 1;
      const sway = race ? moving * 0.06 * Math.sin(Math.max(0, race.t) * 0.4 + i) : 0.1 * Math.sin(t * 0.38 + i);
      const pt = parade ? paradePoint(i, paradeTime) : runner?.line ? linePose(runner, i, d, race.speeds[i]) :
        onRaceCourse ? coursePoint(d, lane + sway) : { x: lane + sway, z: d, heading: 0 };
      const frame = runnerFrames[i];
      const lean = pt.lean ?? (onRaceCourse ? bendLean(d, race ? race.speeds[i] : 15.7, lane) : 0);
      field[i].angle = pt.heading;
      field[i].lean = lean;
      placeRunnerFrame(frame, pt, lean);
      g.position.set(0, 0, 0);
      g.rotation.y = parade || runner?.line ? 0 : moving * 0.008 * Math.cos((race ? race.t : t) * 0.38 + i);
      // Sample the same stride from race time in live coverage and on replay.
      if (parade) actors[i].walk(pt.metres);
      else if (race && race.t < 0) actors[i].waitAt(race.t);
      else if (race)
        actors[i].seekDistance(racingDistance(runner, i, d), race.t > 0, racingDistance(runner, i, race.stops[i]), lean, pt.curvature, runner.leadChanges);
      else if (actors[i].seek && cut) actors[i].seek(t + i * 0.147, true, 15.7);
      else actors[i].update(dt, true, 15.7);
      if (race) g.position.z = -(race.t < 0 ? actors[i].restNose : actors[i].noseLead);
      frame.localToWorld(runnerPositions[i].copy(g.position));
      if (software) {
        patches[i].position.copy(runnerPositions[i]);
        patches[i].position.y = 0.012;
        patches[i].rotation.y = pt.heading;
      }
    }
    const cameraDistance = shot === "pack" && race ? (Math.min(...race.ds) + Math.max(...race.ds)) / 2 : z;
    const axis = parade ? (shot === "pack" ? ringCentre : paradePoint(state.selected,paradeTime)) : onRaceCourse ? coursePoint(cameraDistance) : { x: 0, z: cameraDistance, heading: 0 };
    cameraFrame.makeRotationY(axis.heading).setPosition(axis.x, 0, axis.z);
    inverseFrame.copy(cameraFrame).invert();
    focus.copy(runnerPositions[state.selected]).applyMatrix4(inverseFrame);
    const unobstructed = crossing || state.studyMode ? null : predictionView;
    camera.aspect = unobstructed
      ? unobstructed.width / (unobstructed.bottom - unobstructed.top)
      : fullAspect;
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
      const frame = fieldCamera(field, camera.aspect, !!unobstructed);
      look.set(frame.x, frame.y, frame.z);
      eye.set(frame.eyeX, frame.eyeY, frame.eyeZ);
      fov = frame.fov;
      fogDensity = frame.fogDensity;
    } else if (shot === "line") {
      if (crossing) {
        const a = runnerPositions[state.selected].x, b = runnerPositions[crossing.other].x;
        const spread = Math.abs(a-b), centre = (a+b)/2-spread*0.15;
        const back = Math.max(10, 7+spread, 11/camera.aspect);
        look.set(centre,0.85,1200);
        eye.set(centre-back,0.85+back*0.55,1200);
        fov = 38;
      } else {
        eye.set(-17 * screenWidthBias, 8.2 * screenWidthBias, 1200);
        look.set(0, 1.2, 1200);
        fov = 36;
      }
    } else if (shot === "track") {
      const side = race && z > 18 ? tracksideSide(race.plan, state.selected, race.t, screenWidthBias) : -1;
      if (side !== lastTrackSide) cut = true;
      lastTrackSide = side;
      const cameraWidth = 5.95 * screenWidthBias;
      let height = Math.max(1.78, 7.7 / Math.max(1.6, 11 - side * focus.x)) * screenWidthBias;
      if (parade) height = 2.95 * screenWidthBias;
      if (race?.plan[state.selected].line && z > 18) {
        for (const [i,p] of runnerPositions.entries()) {
          if (i === state.selected) continue;
          look.copy(p).applyMatrix4(inverseFrame).sub(focus);
          const fraction = side * look.x / cameraWidth;
          if (fraction <= 0 || fraction >= 1.1) continue;
          const gap = Math.abs(look.z - fraction * 2.7 * screenWidthBias);
          const cover = (1 - THREE.MathUtils.smoothstep(gap, 1.3, 4.5)) *
            (1 - THREE.MathUtils.smoothstep(fraction, 0.85, 1.1));
          const clearHeight = Math.min(8.5 * screenWidthBias, 0.35 + 2.4 / Math.max(0.15, fraction));
          height = Math.max(height, THREE.MathUtils.lerp(1.78 * screenWidthBias, clearHeight, cover));
        }
      }
      eye
        .copy(focus)
        .add(
          new THREE.Vector3(
            side * cameraWidth,
            height,
            2.7 * screenWidthBias,
          ),
        );
      look.copy(focus).add(new THREE.Vector3(-side * 0.2, 1.2, 0.38));
      if (race && z < 18) {
        const gateView = 1 - THREE.MathUtils.smoothstep(z, 2, 18);
        eye.lerp(new THREE.Vector3(-10 * screenWidthBias, 3.7, 13), gateView);
        look.lerp(new THREE.Vector3(focus.x * 0.68, 1.5, -0.7), gateView);
        fov += 8 * gateView;
      }
    } else if (shot === "rider") {
      const side = race && z > 18 ? tracksideSide(race.plan,state.selected,race.t,screenWidthBias) : -1;
      if (side !== lastTrackSide) cut = true;
      lastTrackSide = side;
      const width = Math.max(1,0.95/camera.aspect);
      look.copy(focus);
      look.x -= 1.60 * Math.tan(field[state.selected].lean);
      look.y += 1.63;
      look.z += 0.58;
      eye.set(look.x+side*2.45*width,look.y+0.58*width,look.z+0.70*width);
      fov = 35;
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
    land.update(parade ? ringCentre.z : venue ? venue.target[2] : z, race?.t ?? 0, shot !== "pack", parade ? ringCentre : null);
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
    if (shot === "line") camera.layers.disable(housingLayer);
    else camera.layers.enable(housingLayer);
    let near = 0.08;
    // Keep enough depth precision to separate the turf and its painted course.
    if (shot === "pack") near = camera.position.distanceTo(aim) * 0.25;
    camera.near = near;
    camera.fov = fov / (state.zoom || 1);
    if (unobstructed) {
      const { width, height, top, bottom } = unobstructed;
      // Treat the clear strip as the lens frame, then extend it to fill the canvas.
      camera.setViewOffset(width, bottom - top, 0, -top, width, height);
    } else if ((state.studyMode || crossing) && canvasBox.contains(replayDeck)) {
      const { width, height, top } = canvasBox.getBoundingClientRect();
      const bottomInset = Math.max(replayDeck.getBoundingClientRect().height,
        top+height-lowerThird.getBoundingClientRect().top) + 4;
      const topInset = Math.max(0, orderStrip.getBoundingClientRect().bottom - top) + 4;
      const usableHeight = Math.max(height * 0.35, height - topInset - bottomInset);
      const scale = Math.max(1, height / (usableHeight * screenWidthBias));
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(scale * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
      camera.setViewOffset(width, height, 0, (bottomInset - topInset) / 2, width, height);
    } else if (camera.view?.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    cullCourse?.(camera,fogDensity,gl.drawingBufferHeight);
    const ayan = actors === loadedActors.get(makeAyanHorse);
    if (ayan) adjustDetail?.(camera,gl.drawingBufferHeight);
    if (finishNose) {
      finishNose.hidden = finishGuide.hidden = !crossing;
      if (crossing) {
        runnerFrames[state.selected].updateMatrixWorld(true);
        actors[state.selected].nosePosition(nosePoint).project(camera);
        finishNose.style.left = (nosePoint.x+1)*50 + "%";
        finishNose.style.top = (1-nosePoint.y)*50 + "%";
        const lineX = nosePoint.set(0,1.2,LENGTH).project(camera).x;
        finishGuide.style.left = (lineX+1)*50 + "%";
      }
    }
    if (hoofMark) {
      const hoof = state.studyHoof;
      hoofMark.hidden = hoof == null;
      if (hoof != null) {
        runnerFrames[state.selected].updateMatrixWorld(true);
        actors[state.selected].hoofPosition(hoof,solePoint).project(camera);
        hoofMark.hidden = Math.abs(solePoint.x) > 1 || Math.abs(solePoint.y) > 1 || Math.abs(solePoint.z) > 1;
        hoofMark.style.left = (solePoint.x + 1) * 50 + "%";
        hoofMark.style.top = (1 - solePoint.y) * 50 + "%";
      }
    }
    if (software) {
      // The animated meshes have no fixed bind-pose bounds. Cull the whole
      // mounted pair with room for an extended leg and the rider's lean.
      view.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const [i,p] of runnerPositions.entries()) {
        mountedBounds.center.set(p.x, p.y + mountedViewBounds.height, p.z);
        let visible = view.intersectsSphere(mountedBounds);
        if (visible && ayan) {
          const subject = actors[i].group;
          subject.updateWorldMatrix(true,false);
          localView.setFromProjectionMatrix(localProjection.multiplyMatrices(viewProjection,subject.matrixWorld));
          visible = localView.intersectsBox(ayanViewBox);
        }
        runnerFrames[i].visible = visible;
        // The ground shadow can extend into frame while its horse is outside.
        patches[i].visible = view.intersectsSphere(mountedBounds);
      }
    }
    sun.position.set(aim.x - 18, 36, aim.z + 20);
    sun.target.position.copy(aim);
    const marker = document.getElementById("tracking-mark");
    if (marker) {
      marker.hidden = Boolean(venue) || !!crossing || shot === "track" || shot === "rider";
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
  const pendingFrames = [];
  let nextFrame = 0, wasStatic = false;
  function draw() {
    renderer.render(scene, camera);
    if (software) {
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (fence) pendingFrames.push(fence);
      gl.flush();
    }
  }
  function render(now) {
    if (!state.visible || document.hidden || !onScreen) {
      lastFrame = 0;
      nextFrame = 0;
      return;
    }
    const still = state.staticPose;
    if (wasStatic !== still) cut = true;
    wasStatic = still;
    if (!cut && (state.paused || still || venueShots[state.cam])) return;
    const focused = document.hasFocus();
    const fps = software ? (state.parade ? (focused ? 20 : 5) : (focused ? 24 : 10)) : (focused ? 60 : 30);
    const interval = 1000 / fps;
    if (!cut && now + 0.8 < nextFrame) return;
    // A foreground software renderer can prepare the next frame while the
    // previous one finishes. Bound the queue to keep cuts and input responsive.
    while (pendingFrames.length) {
      if (gl.clientWaitSync(pendingFrames[0],0,0) === gl.TIMEOUT_EXPIRED) break;
      gl.deleteSync(pendingFrames.shift());
    }
    if (pendingFrames.length >= (focused ? 2 : 1)) return;
    const dt = lastFrame ? Math.min(0.24, (now - lastFrame) / 1000) : 0;
    // Carry the fractional interval across display refreshes, skipping missed
    // slots when the GPU stalls instead of trying to catch up in a burst.
    nextFrame = nextFrame && now - nextFrame < interval ? nextFrame + interval : now + interval;
    if (cut) nextFrame = now + interval;
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
