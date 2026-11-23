import { skinJockey } from './jockey.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let asset;
const pending = new Map();

export async function loadHorse(url = new URL('models/horse-ranch.glb', document.baseURI).href) {
  if (!pending.has(url)) {
    pending.set(url, new GLTFLoader().loadAsync(url).catch(error => {
      pending.delete(url);
      throw error;
    }));
  }
  asset = await pending.get(url);
  return asset;
}

const white = '#fff4df';
const leather = '#302420';
const gold = '#dfb768';
const up = new THREE.Vector3(0, 1, 0);
const vector = p => new THREE.Vector3(...p);
const actorMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: false, roughness: 0.8, side: THREE.DoubleSide
});
const reinMaterial = new THREE.MeshStandardMaterial({ color: leather, roughness: 0.8 });
const reinSegment = new THREE.CylinderGeometry(0.009, 0.009, 1, 5);

// Bake each rigid assembly into one vertex-coloured mesh so six jockeys cost
// the same number of draw calls regardless of how their silks and boots are cut.
function sculpt() {
  const parts = [];
  let vertexCount = 0;
  function put(geometry, color, position, rotation = new THREE.Quaternion(), scale = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(vector(position), rotation, vector(scale));
    const shape = geometry.index ? geometry.toNonIndexed() : geometry;
    if (shape !== geometry) geometry.dispose();
    shape.applyMatrix4(matrix);
    shape.deleteAttribute('uv');
    const count = shape.getAttribute('position').count;
    vertexCount += count;
    const c = new THREE.Color(color);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(shape);
  }
  function joint(p, size, color, head = false) {
    put(new THREE.SphereGeometry(1, head ? 28 : 20, head ? 16 : 12), color, p,
      new THREE.Quaternion(), size);
  }
  function limb(a, b, r1, r2, color, width = 1) {
    const dir = vector(b).sub(vector(a));
    const mid = dir.clone().multiplyScalar(0.5).add(vector(a));
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    put(new THREE.CylinderGeometry(r2, r1, dir.length(), 18), color, mid.toArray(), q, [width, 1, 1]);
  }
  function finish() {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, actorMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  return { joint, limb, put, finish, get vertexCount() { return vertexCount; } };
}

function numberPlate(number, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const {r, g, b} = new THREE.Color(color);
  ctx.fillStyle = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.46 ? '#201f1c' : '#fff7e6';
  ctx.font = 'italic 900 108px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 68);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
  });
  return material;
}

export function makeRacingTack(spec, articulated = false) {
  const tack = new THREE.Group();
  const shape = sculpt();
  const jacket = sculpt();
  const sleeves = [], headRanges = [];
  const legs = sculpt();
  const accent = spec.color;
  const skin = ['#e1a47f', '#b77f5e', '#d69971'][((spec.number || 1) - 1) % 3];
  const panels = [];
  const uvless = (a, b, c, d) => panels.push(...a, ...b, ...d, ...b, ...c, ...d);
  const number = numberPlate(spec.number, accent);
  tack.name = 'SaddleAndJockey';
  for (const side of [-1, 1]) {
    const back = [[0,1.685,-0.58],[side*0.235,1.62,-0.56],[side*0.317,1.48,-0.55],[side*0.338,1.265,-0.49]];
    const front = [[0,1.64,0.23],[side*0.218,1.59,0.23],[side*0.28,1.47,0.22],[side*0.302,1.26,0.19]];
    for (let i = 0; i < back.length - 1; i++) uvless(back[i], front[i], front[i+1], back[i+1]);
    shape.limb(back[3], front[3], 0.011, 0.011, white);
    shape.limb(back[2], back[3], 0.009, 0.009, white);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), number);
    label.rotation.y = side * Math.PI / 2;
    label.rotation.z = side * 0.012;
    label.position.set(side * 0.343, 1.375, -0.338);
    tack.add(label);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(panels, 3));
  geometry.computeVertexNormals();
  shape.put(geometry, accent, [0,0,0]);
  shape.joint([0,1.617,-0.075], [0.24,0.079,0.32], leather);
  shape.joint([0,1.66,-0.26], [0.23,0.075,0.134], '#51372a');

  // The rider sits in a short-stirrup racing crouch, with both hands at the withers.
  legs.joint([0,1.754,-0.117], [0.165,0.117,0.156], white);
  jacket.limb([0,1.78,-0.10], [0,1.845,-0.032], 0.115, 0.115, leather, 1.37);
  jacket.limb([0,1.826,-0.053], [0,1.923,0.071], 0.112, 0.124, accent, 1.35);
  jacket.limb([0,1.923,0.071], [0,2.045,0.226], 0.124, 0.115, accent, 1.42);
  jacket.limb([0,1.904,0.063], [0,1.93,0.093], 0.128, 0.128, white, 1.40);
  jacket.joint([0,2.052,0.223], [0.181,0.105,0.127], accent);
  jacket.limb([0,2.072,0.268], [0,2.122,0.305], 0.088, 0.065, white);
  const headStart = jacket.vertexCount;
  jacket.limb([0,2.094,0.289], [0,2.162,0.342], 0.069, 0.061, skin);
  jacket.joint([0,2.206,0.363], [0.102,0.133,0.105], skin, true);
  jacket.joint([0,2.182,0.455], [0.022,0.027,0.039], skin);
  jacket.joint([0,2.151,0.448], [0.025,0.006,0.010], '#965f50');
  jacket.joint([0,2.239,0.362], [0.105,0.034,0.111], '#362d29', true);
  jacket.joint([0,2.275,0.355], [0.118,0.092,0.124], accent, true);
  jacket.joint([0,2.267,0.438], [0.116,0.021,0.092], '#282723', true);
  jacket.joint([0,2.359,0.348], [0.028,0.015,0.028], white);
  headRanges.push([headStart, jacket.vertexCount]);
  for (const side of [-1, 1]) {
    const eyewearStart = jacket.vertexCount;
    jacket.limb([side*.102,2.238,.358],[side*.083,2.16,.384],.007,.007,'#332c29');
    jacket.limb([side*.083,2.16,.384],[side*.025,2.102,.398],.007,.007,'#332c29');
    jacket.joint([side*0.092,2.197,0.344], [0.023,0.037,0.022], skin);
    jacket.joint([side*0.052,2.224,0.449], [0.052,0.032,0.033], '#262c2f');
    jacket.joint([side*0.052,2.228,0.468], [0.039,0.019,0.017], '#65747b');
    jacket.joint([side*.057,2.234,.481], [.027,.003,.003], '#bdc6c7');
    headRanges.push([eyewearStart, jacket.vertexCount]);
    const hip = [side*0.125,1.75,-0.105];
    const knee = [side*0.294,1.422,0.215];
    const ankle = [side*0.312,1.113,-0.06];
    legs.limb(hip, knee, 0.115, 0.079, white);
    legs.joint(knee, [0.077,0.076,0.076], white);
    legs.limb(knee, [side*0.302,1.36,0.164], 0.078, 0.072, white);
    legs.limb([side*0.302,1.369,0.17], ankle, 0.077, 0.041, '#322822');
    legs.limb([side*0.302,1.369,0.17], [side*0.305,1.335,0.135], 0.078, 0.074, '#764733');
    legs.joint([side*0.314,1.098,0.005], [0.059,0.042,0.116], '#302824');
    shape.limb([side*0.265,1.527,0.067], [side*0.336,1.085,-0.012], 0.009,0.008,leather);
    shape.limb([side*0.367,1.067,-0.014], [side*0.367,1.113,0.013], 0.009,0.009,gold);
    shape.limb([side*0.367,1.067,-0.014], [side*0.279,1.067,-0.014], 0.009,0.009,gold);
    const shoulder = [side*0.15,2.049,0.203];
    const elbow = [side*0.216,1.898,0.301];
    const hand = [side*0.139,1.876,0.536];
    const sleeveStart = jacket.vertexCount;
    jacket.joint(shoulder,[0.069,0.068,0.078],accent);
    jacket.limb(shoulder, elbow, 0.065, 0.052, accent);
    jacket.limb([side*0.174,1.990,0.24],[side*0.184,1.966,0.257],0.067,0.065,white);
    const elbowStart = jacket.vertexCount;
    jacket.joint(elbow,[0.052,0.052,0.054],accent);
    jacket.limb(elbow, hand, 0.05, 0.032, accent);
    jacket.limb([side*0.155,1.88,0.495], hand,0.037,0.033,white);
    const gloveStart = jacket.vertexCount;
    jacket.joint(hand,[0.037,0.036,0.059],'#372d28');
    sleeves.push({ side, shoulder, elbow, hand, start: sleeveStart, elbowStart, gloveStart, end: jacket.vertexCount });
  }
  const helmetStart = jacket.vertexCount;
  // Two narrow stripes follow the helmet dome from nape to peak.
  for (const side of [-1,1]) {
    const points = [[side*0.025,2.296,0.244],[side*0.026,2.339,0.286],
      [side*0.027,2.358,0.349],[side*0.027,2.346,0.415],[side*0.025,2.302,0.463]];
    for (let i=1;i<points.length;i++) jacket.limb(points[i-1],points[i],0.009,0.009,white);
  }
  headRanges.push([helmetStart, jacket.vertexCount]);
  const waist = new THREE.Group();
  waist.name = 'JockeyWaist';
  waist.position.set(0,1.78,-0.10);
  const jacketMesh = jacket.finish();
  const rider = articulated ? skinJockey(jacketMesh, sleeves, headRanges) : null;
  const upperBody = rider?.mesh ?? jacketMesh;
  upperBody.name = 'JockeyUpperBody';
  upperBody.position.copy(waist.position).multiplyScalar(-1);
  waist.add(upperBody);
  const breeches = legs.finish();
  breeches.name = 'JockeyLegs';
  const positions = breeches.geometry.attributes.position, delta = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const lift = 0.12 * THREE.MathUtils.smoothstep(positions.getY(i),1.30,1.75);
    delta[i*3+1] = lift;
    delta[i*3+2] = -0.30 * lift;
  }
  breeches.geometry.morphTargetsRelative = true;
  breeches.geometry.morphAttributes.position = [new THREE.BufferAttribute(delta,3)];
  breeches.updateMorphTargets();
  tack.add(shape.finish(), breeches, waist);
  return { tack, waist, upperBody, breeches, rider };
}

function makeBridle(detailed) {
  const shape = sculpt();
  for (const side of [-1,1]) {
    if (detailed) {
      const path = [[side*.107,1.979,1.40],[side*.125,1.802,1.518],
        [side*.113,1.529,1.644],[side*.084,1.343,1.685]];
      for (let i=1;i<path.length;i++) shape.limb(path[i-1],path[i],.012,.012,leather);
      shape.limb([side*.125,1.802,1.518],[side*.115,1.657,1.383],.010,.010,leather);
      shape.limb([side*.115,1.514,1.649],[side*.073,1.499,1.733],.013,.013,leather);
      shape.limb([side*.073,1.499,1.733],[0,1.499,1.742],.013,.013,leather);
      shape.joint([side*.084,1.343,1.685],[.017,.023,.023],gold);
      continue;
    }
    const path = [[side*0.10,2.017,1.19],[side*0.151,1.871,1.309],
      [side*0.128,1.718,1.448],[side*0.082,1.681,1.469]];
    for (let i=1;i<path.length;i++) shape.limb(path[i-1],path[i],0.012,0.012,leather);
    shape.limb([side*0.151,1.871,1.309],[side*0.10,1.788,1.151],0.009,0.009,leather);
    shape.limb([side*0.126,1.753,1.442],[side*0.063,1.75,1.522],0.013,0.013,leather);
    shape.joint([side*0.13,1.718,1.448],[0.016,0.023,0.023],gold);
  }
  return shape.finish();
}

function reinRig(tack, bridle, group, detailed) {
  const straps = new THREE.InstancedMesh(reinSegment, reinMaterial, 8);
  straps.name = 'Reins';
  straps.frustumCulled = false;
  group.add(straps);
  const start = new THREE.Vector3(), end = new THREE.Vector3(), delta = new THREE.Vector3();
  const point = new THREE.Vector3(), previous = new THREE.Vector3(), segment = new THREE.Object3D();
  return () => {
    let index = 0;
    group.updateWorldMatrix(true, false);
    for (const side of [-1,1]) {
      start.set(side*0.139,1.876,0.536);
      if (detailed) end.set(side*.084,1.343,1.685);
      else end.set(side*.13,1.718,1.448);
      group.worldToLocal(tack.localToWorld(start));
      group.worldToLocal(bridle.localToWorld(end));
      previous.copy(start);
      for (let i=1;i<=4;i++) {
        const t = i/4;
        point.lerpVectors(start,end,t);
        point.y -= 0.115*Math.sin(Math.PI*t);
        point.x += side*0.092*Math.sin(Math.PI*t);
        delta.subVectors(point,previous);
        segment.position.copy(previous).lerp(point,0.5);
        segment.scale.set(1,delta.length(),1);
        segment.quaternion.setFromUnitVectors(up,delta.normalize());
        segment.updateMatrix();
        straps.setMatrixAt(index++,segment.matrix);
        previous.copy(point);
      }
    }
    straps.instanceMatrix.needsUpdate = true;
  };
}

function setCoat(scene, coat, detailed) {
  const base = new THREE.Color(coat);
  const colors = {
    Main: base,
    Main_Dark: base.clone().multiplyScalar(0.54),
    Main_Light: base.clone().lerp(new THREE.Color('#eac89c'),0.22),
    Hair: base.clone().multiplyScalar(0.16),
    Muzzle: base.clone().lerp(new THREE.Color('#322923'),0.77)
  };
  scene.traverse(object => {
    if (!object.isMesh) return;
    const material = object.material.clone();
    if (detailed && material.name === 'TexturedBayCoat') {
      const reference = new THREE.Color('#935735');
      material.color.setRGB(
        THREE.MathUtils.clamp(base.r / reference.r, .14, 2.65),
        THREE.MathUtils.clamp(base.g / reference.g, .14, 2.65),
        THREE.MathUtils.clamp(base.b / reference.b, .14, 2.65)
      );
    }
    if (detailed && material.name === 'StrandHair') {
      material.transparent = false;
      material.alphaTest = .28;
      material.depthWrite = true;
      material.color.set('#998778');
    }
    if (colors[material.name]) material.color.copy(colors[material.name]);
    material.metalness = 0;
    if (!detailed) material.roughness = 0.87;
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
}

export function makeHorse(spec, model = asset) {
  if (!model) throw new Error('Call loadHorse() before makeHorse().');
  const group = new THREE.Group();
  const horse = clone(model.scene);
  const detailed = Boolean(horse.getObjectByName('RanchHorseRig'));
  if (!detailed) horse.scale.setScalar(0.46);
  group.add(horse);
  setCoat(horse, spec.coat, detailed);
  const { tack, waist, upperBody } = makeRacingTack(spec);
  if (detailed) {
    tack.position.set(0,.098,.015);
    tack.scale.x = 1.115;
  }
  const bridle = makeBridle(detailed);
  // Attach in the bind pose, preserving the authored world-space fit.
  group.add(tack, bridle);
  group.updateMatrixWorld(true);
  horse.getObjectByName('Torso').attach(tack);
  horse.getObjectByName('Head').attach(bridle);
  const updateReins = reinRig(upperBody, bridle, group, detailed);
  const mixer = new THREE.AnimationMixer(horse);
  const action = name => mixer.clipAction(THREE.AnimationClip.findByName(model.animations,name));
  const idle = action('Idle'), gallop = action('Gallop');
  idle.play();
  const offset = (spec.number * 0.137) % 1;
  idle.time = offset * idle.getClip().duration;
  let isRunning = false;
  function update(dt, running = false, speed = 0) {
    if (isRunning !== running) {
      const next = running ? gallop : idle;
      const old = running ? idle : gallop;
      next.reset();
      next.time = offset * next.getClip().duration;
      next.play().crossFadeFrom(old,0.18,false);
      isRunning = running;
    }
    gallop.timeScale = THREE.MathUtils.clamp(0.65 + speed * 0.035, 0.7, 1.48);
    mixer.update(dt);
    const phase = gallop.time / gallop.getClip().duration * Math.PI * 2;
    const lean = running ? 0.31 + 0.065 * Math.sin(phase) : 0;
    waist.rotation.x = THREE.MathUtils.damp(waist.rotation.x, lean, 12, dt);
    updateReins();
  }
  function seek(seconds, running = false, speed = 0) {
    const active = running ? gallop : idle;
    const duration = active.getClip().duration;
    mixer.stopAllAction();
    active.reset().play();
    active.timeScale = running ? THREE.MathUtils.clamp(0.65 + speed * 0.035, 0.7, 1.48) : 1;
    active.time = THREE.MathUtils.euclideanModulo(seconds, duration);
    isRunning = running;
    mixer.update(0);
    waist.rotation.x = running ? 0.31 + 0.065 * Math.sin(active.time / duration * Math.PI * 2) : 0;
    updateReins();
  }
  update(0);
  return { group, update, seek, durations: { idle: idle.getClip().duration, gallop: gallop.getClip().duration } };
}
