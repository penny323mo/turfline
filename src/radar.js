import { coursePoint, LENGTH } from "./course.js";
import { paradePoint, ringCentre, ringRadius } from "./parade.js";
import { horses } from "./data.js";
import { linePose } from "./racing-line.js";
import { portraitPredictionView } from "./prediction-view.js";

// In a long field the runners fit along the long side of the display. All
// positions use the same uniform scale, including the inside of the bend.
export function mapView(ds, w, h, topEdge = h * 0.2, bottomEdge = h * 0.78) {
  const first = Math.min(...ds) - 14, last = Math.max(...ds) + 14;
  const axis = coursePoint((first + last) / 2);
  const sin = Math.sin(axis.heading), cos = Math.cos(axis.heading), portrait = h > w;
  function local(p) {
    const x = p.x - axis.x, z = p.z - axis.z;
    const ahead = x * sin + z * cos, across = x * cos - z * sin;
    return portrait ? [across, -ahead] : [ahead, across];
  }
  const edges = [];
  for (let i = 0; i <= 24; i++) {
    const d = first + (last - first) * i / 24;
    for (const side of [-11, 11]) edges.push(local(coursePoint(d, side)));
  }
  const x = edges.map(p => p[0]), y = edges.map(p => p[1]);
  const left = Math.min(...x), right = Math.max(...x), top = Math.min(...y), bottom = Math.max(...y);
  const scale = Math.min(w * 0.90 / (right - left), (bottomEdge - topEdge) / (bottom - top));
  return { first, last, project(point) {
    const [x,y] = local(point);
    return { x: w / 2 + (x - (left + right) / 2) * scale,
      y: (topEdge + bottomEdge) / 2 + (y - (top + bottom) / 2) * scale };
  } };
}

function spreadLabels(dots, radius, w, top, bottom) {
  const labels = dots.map(p => ({ ...p }));
  for (let pass = 0; pass < 16; pass++)
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j], dx = b.x - a.x, dy = b.y - a.y;
        const length = Math.hypot(dx,dy), overlap = 2 * radius + 4 - length;
        if (overlap <= 0) continue;
        const x = overlap / 2 * (length ? dx / length : 0), y = overlap / 2 * (length ? dy / length : 1);
        a.x -= x; b.x += x; a.y -= y; b.y += y;
      }
  // A short mobile feed may only have room for a few vertical rows at the
  // stalls. Put the remaining bibs alongside and leave a stem at each horse.
  const placed = [];
  const spacing = 2 * radius + 3;
  for (const p of labels) {
    let best, cost = Infinity;
    const cx = Math.max(radius+2,Math.min(w-radius-2,p.x));
    const cy = Math.max(top,Math.min(bottom,p.y));
    for (let row = -2; row <= 2; row++)
      for (let col = -5; col <= 5; col++) {
        const x = cx+col*spacing, y = cy+row*spacing;
        if (x < radius+2 || x > w-radius-2 || y < top || y > bottom) continue;
        if (placed.some(q => Math.hypot(x-q.x,y-q.y) < spacing-0.1)) continue;
        const d = (x-p.x)**2 + (y-p.y)**2;
        if (d < cost) { cost = d; best = {x,y}; }
      }
    placed.push(best ?? {x:cx,y:cy});
  }
  return placed;
}

export function createRadar(canvas, onPick) {
  const ctx = canvas.getContext("2d");
  let labels = [], radius;
  canvas.addEventListener("click", e => {
    const rect = canvas.getBoundingClientRect();
    const ds = labels.map(p => Math.hypot(e.clientX - rect.left - p.x, e.clientY - rect.top - p.y));
    if (Math.min(...ds) <= Math.max(18, radius + 5)) onPick(ds.indexOf(Math.min(...ds)));
  });
  return function draw(plan, distances, selected, paradeTime = null, partner) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#173b32";
    ctx.fillRect(0, 0, w, h);
    const ds = distances ?? horses.map(() => 0);
    radius = Math.max(9, Math.min(14, Math.min(w,h) * 0.038));
    const stage = canvas.parentElement, rect = canvas.getBoundingClientRect();
    let top = radius + 4, bottom = h - radius - 4;
    for (const el of stage.querySelectorAll(".feed-meta,.race-bug,.order-strip")) {
      const bounds = el.getBoundingClientRect();
      if (bounds.height) top = Math.max(top,bounds.bottom-rect.top+radius+4);
    }
    for (const el of stage.querySelectorAll(".lower-third,.fs-tools,.replay-deck")) {
      const bounds = el.getBoundingClientRect();
      if (bounds.height) bottom = Math.min(bottom,bounds.top-rect.top-radius-4);
    }
    const prediction = portraitPredictionView(stage);
    if (prediction) top = Math.max(top, prediction.top + radius);
    bottom = Math.max(bottom,top+1);
    const drawPath = (points, stroke, width, fill) => {
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    };
    function courseProjection() {
      const { first, last, project } = mapView(ds, w, h, top, bottom);
      const at = (d, side) => project(coursePoint(d, side));
      // Carry the rails past the frame edge even when all six are at the gate.
      const from = Math.floor((first - 120) / 10) * 10, to = last + 120;
      const inner = [], outer = [];
      for (let d = from; d <= to; d += 5) {
        inner.push(at(d,-11)); outer.push(at(d,11));
      }
      drawPath([...inner,...outer.slice().reverse()],null,0,"#507858");
      for (let i = 0; i + 1 < inner.length; i++) if (Math.floor((from + i*5) / 15) % 2)
        drawPath([inner[i],inner[i+1],outer[i+1],outer[i]],null,0,"#4a7154");
      drawPath(inner, "#e1ebd4", 2);
      drawPath(outer, "#bdcdb7", 1.5);
      for (const d of [0, LENGTH]) if (d >= from && d <= to) {
        ctx.setLineDash([4, 3]);
        drawPath([at(d,-11), at(d,11)], "#f2f0cf", 2);
        ctx.setLineDash([]);
      }
      return (i, d) => project(linePose(plan?.[i] ?? {}, i, d));
    }
    function paradeProjection() {
      const y = (top + bottom) / 2, r = Math.min(w * 0.37, (bottom-top) * 0.43);
      for (const [size, color] of [[1.18,"#c4b08e"],[0.84,"#477253"]]) {
        ctx.beginPath();
        ctx.arc(w/2,y,r*size,0,2*Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#dedfc9";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      return (i) => {
        const p = paradePoint(i,paradeTime);
        return { x: w/2 + (p.x-ringCentre.x)*r/ringRadius, y: y-(p.z-ringCentre.z)*r/ringRadius };
      };
    }
    const runnerPoint = paradeTime === null ? courseProjection() : paradeProjection();
    const dots = ds.map((d,i) => runnerPoint(i,d));
    labels = spreadLabels(dots, radius, w, top, bottom);
    for (const [i,d] of ds.entries()) {
      const trail = [];
      for (let n = Math.max(0,d-18); n < d; n += 1.5) trail.push(runnerPoint(i,n));
      trail.push(dots[i]);
      drawPath(trail, horses[i].color, i === selected || i === partner ? 4 : 2);
      drawPath([dots[i], labels[i]], "#dee8d6", 1);
    }
    ctx.font = 'bold ' + Math.round(radius * 1.1) + 'px system-ui';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    labels.forEach(({x,y}, i) => {
      ctx.beginPath(); ctx.arc(x,y,radius,0,2*Math.PI);
      ctx.fillStyle = horses[i].color; ctx.fill();
      ctx.strokeStyle = i === selected ? "#f2ff99" : i === partner ? "#f3e2ba" : "#17352d";
      ctx.lineWidth = i === selected || i === partner ? 3 : 1.5; ctx.stroke();
      ctx.fillStyle = "#101e1a"; ctx.fillText(String(i+1),x,y+0.4);
    });
  };
}
