import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { courseVisibility } from './course-visibility.js';
import { laneX } from './data.js';
import { coursePoint, raceOval, studioOval } from './course.js';
import { LENGTH } from './race.js';

const CHUNK = 120;
const TAU = Math.PI * 2;
const BOX = new THREE.BoxGeometry();
const CONE = new THREE.ConeGeometry(1, 1, 7);
const BUSH = new THREE.IcosahedronGeometry(1, 0);
const surface = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function random(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Static buildings, railings and foliage share one draw call per course section.
function batch() {
  const vertices = [], colors = [];
  const point = new THREE.Vector3();
  const transform = new THREE.Object3D();
  function tri(a, b, c, tone) {
    const color = new THREE.Color(tone);
    vertices.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  }
  function shape(geometry, x, y, z, sx, sy, sz, tone, rx = 0, ry = 0, rz = 0) {
    const color = new THREE.Color(tone);
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(rx, ry, rz);
    transform.updateMatrix();
    const position = geometry.attributes.position, indices = geometry.index;
    const size = indices?.count ?? position.count;
    for (let i = 0; i < size; i++) {
      point.fromBufferAttribute(position, indices ? indices.getX(i) : i).applyMatrix4(transform.matrix);
      vertices.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  const box = (x, y, z, w, h, l, color, rx, ry, rz) =>
    shape(BOX, x, y, z, w, h, l, color, rx, ry, rz);
  function mesh(material = surface) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, material);
  }
  return { tri, shape, box, mesh };
}

let grassTexture, grassReady;
function groundTexture() {
  if (grassTexture) return grassTexture;
  grassReady = new Promise((resolve, reject) => {
    grassTexture = new THREE.TextureLoader().load(new URL('environment/turf.jpg', document.baseURI).href, resolve, undefined, reject);
  });
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(1.8, 1.8);
  grassTexture.anisotropy = 8;
  grassTexture.colorSpace = THREE.SRGBColorSpace;
  return grassTexture;
}

function turf() {
  const g = new THREE.PlaneGeometry(1600, 3000, 1, 500).rotateX(-Math.PI / 2).toNonIndexed();
  const positions = g.attributes.position;
  const tints = [], uv = [];
  for (let i = 0; i < positions.count; i++) {
    const strip = Math.floor(i / 6);
    const tint = strip % 2 ? 0.99 : 0.946;
    tints.push(tint, tint, tint);
    uv.push(positions.getX(i) / 3, positions.getZ(i) / 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: groundTexture(), vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.position.set(0, -0.022, 600);
  return mesh;
}

function grandstand(b, z, rand) {
  const x = -29, length = 47;
  b.box(x, 0.06, z, 8, 0.12, length + 2, '#c8bb99');
  for (let row = 0; row < 8; row++) {
    const xx = x + 2.8 - row * 0.72, height = (1.62 + row * 0.37) * 0.77;
    for (let seat = -22; seat < 23; seat += 0.76) {
      if (Math.abs(seat % 12) < 1 || rand() < 0.41) continue;
      const body = ['#e2cdb1', '#5c7467', '#b4be9a', '#b98169', '#76858d'][Math.floor(rand() * 5)];
      const zz = z + seat + rand() * 0.25;
      b.box(xx + 0.02, height + 0.27, zz, 0.26, 0.40, 0.28, body);
      b.shape(BUSH, xx + 0.03, height + 0.56, zz, 0.14, 0.16, 0.14, '#b99876');
    }
  }
  for (const end of [-22, 0, 22]) {
    b.box(x - 2.2, 6.82, z + end, 0.06, 2.2, 0.06, '#ebe3c6');
    b.tri([x - 2.2, 7.91, z + end], [x - 2.08, 7.65, z + end + 1.08], [x - 2.2, 7.38, z + end], '#d8a156');
    b.tri([x - 2.2, 7.38, z + end], [x - 2.08, 7.65, z + end + 1.08], [x - 2.2, 7.91, z + end], '#d8a156');
  }
}

function cypress(b, x, z, h, tilt, rand) {
  b.box(x, h * 0.17, z, h * 0.047, h * 0.34, h * 0.045, '#827352');
  const green = ['#74865b', '#829264', '#677f56', '#93a06d'][Math.floor(rand() * 4)];
  b.shape(BUSH, x, h * 0.56, z, h * 0.20, h * 0.43, h * 0.19, green, 0, tilt, 0.025);
  b.shape(CONE, x + h * 0.026, h * 0.80, z, h * 0.146, h * 0.47, h * 0.14, green, 0, tilt + 0.4);
}

function courseChunk(index, onRaceCourse = false) {
  const rand = random(971 + index * 71), b = batch();
  const group = new THREE.Group();
  // Parallel exercise track, grassy verge and pale path sit outside the white rail.
  const section = onRaceCourse ? 6 : CHUNK;
  for (let z = (section - CHUNK) / 2; z < CHUNK / 2; z += section) {
    b.box(-16.8, -0.03, z, 8.9, 0.075, section, '#c8b996');
    b.box(-22.0, 0.004, z, 0.9, 0.045, section, '#aeaa85');
    b.box(-22.7, 0.94, z, 0.09, 0.085, section, '#e8e6cc');
  }
  for (let z = -60; z < 60; z += 3) b.box(-22.7, 0.46, z, 0.1, 0.93, 0.1, '#d5dbc3');
  // One spectator stand and a tree avenue can be seen from the original paddock.

  const oakLocations = [];
  for (let i = 0; i < 56; i++) {
    const z = (rand() - 0.5) * CHUNK;
    let x = -(28 + rand() * 26);
    if (i % 4 === 0) x = 22 + rand() * 34;
    if (index === 0 && x < 0 && x > -35 && Math.abs(z - 10) < 23) continue;
    if (onRaceCourse && x < 0 && x > -36 && Math.abs(index * CHUNK + z - 1193) < 26) continue;
    if (!onRaceCourse && index === 2 && x < 0 && x > -35 && Math.abs(z + 37) < 23) continue;
    const h = 2.5 + rand() ** 1.3 * 6;
    if (i % 3 === 0) cypress(b, x, z, h, rand() * TAU, rand);
    else oakLocations.push({ x, z, h, rotation: rand() * TAU, width: 0.85 + rand() * 0.65, shade: rand() });
  }
  for (let i = 0; i < 52; i++) {
    const z = (rand() - 0.5) * CHUNK, x = -23.5 - rand() * 1.5;
    b.shape(BUSH, x, 0.25, z, 0.55 + rand() * 0.8, 0.38 + rand() * 0.35, 0.7 + rand(), '#8c9a66', 0, rand() * 4);
  }
  for (const side of [-1, 1]) {
    const z = -40 + index * 10;
    for (let k = 0; k < 5; k++) b.box(side * 11.75, k * 0.33 + 0.165, z, 0.12, 0.33, 0.12, k % 2 ? '#c38468' : '#f0ebd0');
    b.shape(BUSH, side * 11.75, 1.76, z, 0.22, 0.22, 0.22, '#eaddbc');
  }
  const architecture = b.mesh();
  if (onRaceCourse) {
    const centre = index * CHUNK, origin = coursePoint(centre);
    group.position.set(-origin.x, 0, origin.z);
    const geometry = architecture.geometry, p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const pt = coursePoint(centre + p.getZ(i), -p.getX(i));
      p.setXYZ(i, origin.x - pt.x, p.getY(i), pt.z - origin.z);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    for (const oak of oakLocations) {
      const pt = coursePoint(centre + oak.z, -oak.x);
      oak.x = origin.x - pt.x;
      oak.z = pt.z - origin.z;
    }
  }
  architecture.receiveShadow = true;
  group.add(architecture);
  return { group, oakLocations };
}

function grassTufts(tiled) {
  const rand = random(64083), tiles = new Map();
  const greens = ['#859259', '#a8ae70', '#b5b778', '#919f61', '#abb579'];
  for (let i = 0; i < 6000; i++) {
    const x = (rand() - 0.5) * 27, z = (rand() - 0.5) * 64;
    const tile = tiled ? Math.floor((x+13.5)/8) + 4*Math.floor((z+32)/8) : 0;
    if (!tiles.has(tile)) tiles.set(tile,batch());
    const b = tiles.get(tile);
    const n = rand() < 0.8 ? 2 : 4;
    const tone = greens[Math.floor(rand() * greens.length)];
    for (let j = 0; j < n; j++) {
      const xx = x + rand() * 0.085, zz = z + rand() * 0.08;
      const height = (0.026 + rand() * 0.066) * (Math.abs(x) > 11 ? 1.85 : 1);
      b.tri([xx, -0.015, zz], [xx + 0.018 + rand() * 0.013, -0.015, zz + 0.012],
        [xx + rand() * 0.1 - 0.018, height, zz + rand() * 0.055], tone);
    }
  }
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true });
  for (const tile of tiles.values()) group.add(tile.mesh(material));
  return group;
}

// Continuous irregular ridgelines surround the race even when the camera changes direction.
function ridges() {
  const group = new THREE.Group();
  const bands = [
    { r: 124, base: 16.8, amp: 12, shades: ['#a5bcb3', '#b0c4b7', '#a8beb7', '#bdcbb9'] },
    { r: 91, base: 10, amp: 8.3, shades: ['#92a78a', '#a5b194', '#a2b091', '#b3b99a'] },
    { r: 66, base: 4.1, amp: 4.4, shades: ['#9ca97b', '#a8af80', '#b1b68a', '#a2ae80'] },
  ];
  bands.forEach(({ r, base, amp, shades }, band) => {
    const rand = random(5003 + band * 909), b = batch(), count = 89;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const a = TAU * i / count, angle = a + (rand() - 0.5) * 0.026;
      const radius = r + (0.035 * r * Math.sin(7 * a + band));
      const h = base + amp * (0.55 * Math.sin(a * 4 + band * 3) + 0.23 * Math.cos(a * 7 + band) + 0.3 * Math.cos(a * 9 - band) + rand() * 0.34);
      rows.push([1, 0.85, 0.65].map((k, j) => [
        Math.cos(angle + j * 0.011) * radius * k,
        j === 0 ? h : j === 1 ? h * (0.34 + rand() * 0.26) : -1.6,
        Math.sin(angle + j * 0.011) * radius * k,
      ]));
    }
    rows.forEach((row, i) => {
      const other = rows[(i + 1) % rows.length];
      for (let j = 0; j < 2; j++) {
        b.tri(row[j], other[j], row[j + 1], shades[Math.floor(rand() * shades.length)]);
        b.tri(other[j], other[j + 1], row[j + 1], shades[Math.floor(rand() * shades.length)]);
      }
    });
    group.add(b.mesh(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true, flatShading: true })));
  });
  return group;
}

async function addOaks(chunks) {
  const { scene } = await loadVenueFile('oak');
  scene.updateMatrixWorld();
  const shape = new THREE.Object3D(), color = new THREE.Color();
  scene.traverse(source => {
    if (!source.isMesh) return;
    const bark = source.material.name.toLowerCase().includes('bark');
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    for (const { group, oakLocations } of chunks) {
      const trees = new THREE.InstancedMesh(source.geometry, mat, oakLocations.length);
      oakLocations.forEach(({ x, z, h, width, rotation, shade }, index) => {
        shape.position.set(x, 0, z);
        shape.rotation.y = rotation;
        const scale = h / 1.23;
        shape.scale.set(scale * width, scale, scale * width);
        shape.updateMatrix();
        trees.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(shape.matrix, source.matrixWorld));
        const palette = bark ? ['#836f54', '#776a51', '#97805b'] : ['#788f60', '#8c9c6c', '#9ba976'];
        trees.setColorAt(index, color.set(palette[Math.min(2, Math.floor(3 * shade))]));
      });
      trees.computeBoundingSphere();
      group.add(trees);
    }
  });
}

const FILES = ['rail', 'starters-rostrum', 'winning-post', 'finish-mirror', 'grandstand-tier', 'grandstand-canopy', 'course-tractor'];
const venuePalette = {
  charcoal: '#585f55', gravel: '#c6c2ae', steel: '#84948d', white: '#f0ecda',
  green: '#658773', red: '#bc6450', yellow: '#dfb257', timber: '#9d8162', glass: '#9eb5b4',
};

function loadVenueFile(name) {
  const base = './';
  return new GLTFLoader().loadAsync(base + 'models/scenery-' + name + '.glb');
}

function ovalPoint(distance, radius, oval) {
  const straight = oval.far - oval.near, halfTurn = Math.PI * radius;
  if (distance <= straight) return [oval.radius - radius, oval.near + distance];
  distance -= straight;
  if (distance < halfTurn) {
    const a = distance / radius;
    return [oval.radius - radius * Math.cos(a), oval.far + radius * Math.sin(a)];
  }
  distance -= halfTurn;
  if (distance <= straight) return [oval.radius + radius, oval.far - distance];
  const a = (distance - straight) / radius;
  return [oval.radius + radius * Math.cos(a), oval.near - radius * Math.sin(a)];
}

function courseEdges(offset, oval) {
  const radius = oval.radius + offset, straight = oval.far - oval.near, arc = Math.PI * radius;
  const points = [];
  let travelled = 0;
  for (const segment of [straight, arc, straight, arc]) {
    const count = Math.ceil(segment / 8.12);
    for (let i = 0; i < count; i++) points.push(ovalPoint(travelled + segment * i / count, radius, oval));
    travelled += segment;
  }
  return points;
}

function ovalTurf(oval) {
  const b = batch(), length = (oval.far - oval.near) * 2 + TAU * oval.radius;
  const points = [], count = Math.ceil(length / 6);
  for (let i = 0; i < count; i++) {
    const d = i / count * length, a = ovalPoint(d, oval.radius, oval), n = ovalPoint(d + 0.05, oval.radius, oval);
    const dx = n[0] - a[0], dz = n[1] - a[1], factor = 11 / Math.hypot(dx, dz);
    points.push([[a[0] - dz * factor, -0.01, a[1] + dx * factor], [a[0] + dz * factor, -0.01, a[1] - dx * factor]]);
  }
  points.forEach(([left, right], i) => {
    const [nextLeft, nextRight] = points[(i + 1) % count];
    const tint = i % 2 ? '#d7e1cc' : '#dfe7d3';
    b.tri(left, nextLeft, right, tint);
    b.tri(right, nextLeft, nextRight, tint);
  });
  const mesh = b.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTexture() }));
  const position = mesh.geometry.attributes.position, uv = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i) / 3, position.getZ(i) / 3);
  mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  mesh.receiveShadow = true;
  return mesh;
}

function venueTriangles(scene, visit) {
  const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  scene.updateMatrixWorld();
  scene.traverse(obj => {
    if (!obj.isMesh) return;
    const g = obj.geometry, pos = g.attributes.position, idx = g.index;
    const count = idx ? idx.count : pos.count;
    const tone = venuePalette[obj.material.name] ?? '#a7ac95';
    function point(vector, index) {
      return vector.fromBufferAttribute(pos, idx ? idx.getX(index) : index).applyMatrix4(obj.matrixWorld).toArray();
    }
    for (let i = 0; i < count; i += 3) visit(obj.name, point(a, i), point(c, i + 1), point(d, i + 2), tone);
  });
}

async function loadVenueGeometry(name) {
  const { scene } = await loadVenueFile(name), b = batch();
  venueTriangles(scene, (_, a, c, d, tone) => b.tri(a, c, d, tone));
  return b.mesh().geometry;
}

// Split the source grille along its centre and keep the original steel and
// yellow faces on two independently hinged leaves.
function clipGateFace(points, centre, side, target, tone) {
  const polygon = [];
  let a = points.at(-1);
  for (const b of points) {
    const ax = (a[0] - centre) * side, bx = (b[0] - centre) * side;
    if (ax * bx < 0) {
      const t = ax / (ax - bx);
      polygon.push([centre, a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
    if (bx >= 0) polygon.push(b);
    a = b;
  }
  for (let i = 1; i < polygon.length - 1; i++) target.tri(polygon[0], polygon[i], polygon[i + 1], tone);
}

export function attachStartingStalls(group, scene) {
  const fixed = batch(), stalls = new THREE.Group();
  const width = 0.92, hingeZ = 1.44;
  const bays = Array.from({ length: 6 }, (_, index) => ({
    x: -2.32 + index * width, halves: [batch(), batch()],
  }));
  venueTriangles(scene, (name, a, b, c, tone) => {
    const match = /^stall-(\d)/.exec(name);
    if (!match) return fixed.tri(a, b, c, tone);
    const bay = bays[Number(match[1]) - 1];
    clipGateFace([a, b, c], bay.x, -1, bay.halves[0], tone);
    clipGateFace([a, b, c], bay.x, 1, bay.halves[1], tone);
  });
  stalls.name = 'starting-stalls';
  stalls.add(fixed.mesh());
  const hinges = [];
  bays.forEach((bay, index) => {
    for (const [half, data] of bay.halves.entries()) {
      const side = half === 0 ? -1 : 1, x = bay.x + side * 0.40;
      const leaf = data.mesh();
      leaf.name = 'gate-' + (6 - index) + (half === 0 ? '-left' : '-right');
      leaf.geometry.translate(-x, 0, -hingeZ);
      leaf.position.set(x, 0, hingeZ);
      stalls.add(leaf);
      hinges.push({ leaf, side });
    }
    const face = document.createElement('canvas');
    face.width = 128; face.height = 96;
    const ctx = face.getContext('2d');
    ctx.fillStyle = '#1b493a'; ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = '#fff3cf'; ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(String(6 - index), 64, 78);
    const map = new THREE.CanvasTexture(face);
    map.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.42),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
    badge.position.set(bay.x, 2.65, hingeZ);
    badge.scale.x = -1;
    stalls.add(badge);
  });
  // Align each two-metre lane and lower the loaded floor to turf height.
  stalls.scale.set(2 / width, 1.12, 1.16);
  stalls.position.set(-laneX(bays.length - 1) - bays[0].x * stalls.scale.x,
    -0.26 * stalls.scale.y, 0.24 - hingeZ * stalls.scale.z);
  group.add(stalls);
  let last = -1;
  return (raceSeconds) => {
    const progress = THREE.MathUtils.clamp(raceSeconds / 0.28, 0, 1);
    if (progress === last) return;
    last = progress;
    const angle = Math.PI / 2 * (1 - (1 - progress) ** 3);
    for (const { leaf, side } of hinges) leaf.rotation.y = side * angle;
  };
}

async function addVenue(group, gateFrame, oval) {
  const pieces = await Promise.all(FILES.map(loadVenueGeometry));
  const models = Object.fromEntries(FILES.map((name, i) => [name, pieces[i]]));
  function place(name, x, z, angle = 0, sx = 1, sy = sx, sz = sx, frame = group) {
    const m = new THREE.Mesh(models[name], surface);
    m.name = name;
    m.position.set(x, 0, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = angle;
    m.receiveShadow = true;
    frame.add(m);
    return m;
  }
  place('starters-rostrum', -12.5, -5.4, Math.PI / 2, 1, 1, 1, gateFrame);
  place('winning-post', -10.4, 1200, -Math.PI / 2);
  place('finish-mirror', 10.4, 1200, -Math.PI / 2);
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(21, 0.14).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#f7f4d9' }));
  finish.position.set(0, 0.009, 1200);
  group.add(finish);
  for (const remaining of [800, 400, 200, 100]) {
    const face = document.createElement('canvas');
    face.width = 256;
    face.height = 128;
    const ctx = face.getContext('2d');
    ctx.fillStyle = '#f8f6e6';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#184d3f';
    ctx.fillRect(6, 6, 244, 116);
    ctx.fillStyle = '#fff8db';
    ctx.textAlign = 'center';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText(String(remaining), 128, 94);
    const map = new THREE.CanvasTexture(face);
    map.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }));
    const marker = oval === raceOval ? coursePoint(LENGTH - remaining, 12.1) :
      { x: 12.1, z: LENGTH - remaining, heading: 0 };
    sign.rotation.y = Math.PI / 2 - marker.heading;
    sign.scale.x = -1;
    sign.position.set(-marker.x, 2.05, marker.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.95, 0.12), finish.material);
    post.position.set(-marker.x, 0.975, marker.z);
    group.add(sign, post);
  }
  place('course-tractor', -18.5, -17.0, -0.28, 1, 1, 1, gateFrame);
  for (const centre of [10, 1193]) {
    const frame = centre === 10 ? gateFrame : group, crowd = batch();
    grandstand(crowd, centre, random(1874));
    frame.add(crowd.mesh());
    for (const section of [-18, -6, 6, 18]) {
      place('grandstand-tier', -29, centre + section, -Math.PI / 2, 1, 0.77, 1, frame);
      place('grandstand-canopy', -29, centre + section, -Math.PI / 2, 0.985, 0.73, 0.98, frame);
    }
  }
  for (const offset of [-11, 11]) {
    const edge = courseEdges(offset, oval), tr = new THREE.Object3D();
    // Subdivide the long rail into independently culled lengths.
    for (let first = 0; first < edge.length; first += 16) {
      const take = Math.min(16, edge.length - first);
      const rail = new THREE.InstancedMesh(models.rail, surface, take);
      rail.name = 'running-rail';
      for (let k = 0; k < take; k++) {
        const [x, z] = edge[first + k], [nx, nz] = edge[(first + k + 1) % edge.length];
        tr.position.set((x + nx) / 2, -0.01, (z + nz) / 2);
        tr.rotation.y = -Math.atan2(nz - z, nx - x);
        tr.scale.set(Math.hypot(nx - x, nz - z) / 8.12, 0.92, 1);
        tr.updateMatrix();
        rail.setMatrixAt(k, tr.matrix);
      }
      rail.computeBoundingSphere();
      group.add(rail);
    }
  }
}

export function createLandscape(onRaceCourse = false, software = false, paradeGroup = null) {
  const group = new THREE.Group(), floor = turf(), mountains = ridges();
  const oval = onRaceCourse ? raceOval : studioOval;
  const chunks = Array.from({ length: onRaceCourse ? Math.round(raceOval.far / CHUNK) + 1 : 5 },
    (_, i) => courseChunk(i, onRaceCourse));
  const treeGroups = [...chunks];
  if (paradeGroup) {
    const oakLocations = [];
    const rand = random(4316);
    for (let i=0; i<18; i++) {
      const a = (i+0.2*rand())*TAU/18;
      if (Math.abs(Math.sin(a)) < 0.38 && Math.cos(a) < 0) continue;
      const r = 24+3*rand();
      oakLocations.push({ x: r*Math.sin(a), z: r*Math.cos(a), h: 3.2+1.6*rand(),
        width: 0.85+0.2*rand(), rotation: TAU*rand(), shade: rand() });
    }
    treeGroups.push({group: paradeGroup, oakLocations});
  }
  const grass = grassTufts(software), secondGrass = grass.clone();
  const gateFrame = new THREE.Group();
  function align(object, d) {
    const pt = onRaceCourse ? coursePoint(d) : { x: 0, z: d, heading: 0 };
    object.position.set(-pt.x, 0, pt.z);
    object.rotation.y = -pt.heading;
  }
  align(gateFrame, 0);
  const track = ovalTurf(oval);
  group.add(floor, mountains, grass, secondGrass, gateFrame, track, ...chunks.map(chunk => chunk.group));
  let setGates;
  function update(playerZ = 0, raceSeconds = 0, showBackdrop = true, backdropCentre = null) {
    setGates?.(raceSeconds);
    mountains.visible = showBackdrop;
    if (backdropCentre) mountains.position.set(-backdropCentre.x,0,backdropCentre.z);
    else align(mountains, playerZ);
    mountains.rotation.y = 0;
    mountains.scale.y = 0.20;
    for (let i = 0; !onRaceCourse && i < chunks.length; i++) {
      const base = i * CHUNK;
      chunks[i].group.position.z = base + CHUNK * chunks.length * Math.round((playerZ - base) / (CHUNK * chunks.length));
    }
    align(grass, 128 * Math.round(playerZ / 128));
    align(secondGrass, 64 + 128 * Math.round((playerZ - 64) / 128));
  }
  update();
  return { group, update,
    prepareVisibility: () => courseVisibility(group,[grass,secondGrass],new Set([floor,track,...mountains.children])),
    ready: Promise.all([grassReady, addOaks(treeGroups), addVenue(group, gateFrame, oval),
    loadVenueFile('starting-stalls').then(({ scene }) => { setGates = attachStartingStalls(gateFrame, scene); })]) };
}
