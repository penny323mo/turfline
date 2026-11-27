import { startStage } from "./stage.js";
import { horses, cameras as fieldCameras, riderCamera, venues, duration } from "./data.js";
import { icon, silk } from "./icons.js";
import { loadHorse, makeHorse } from "./horse.js";

import { loadAyanHorse, makeAyanHorse } from "./horse-ayan.js";

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const cameras = [...fieldCameras, riderCamera];
const view = new URLSearchParams(location.search).get("view");
const state = {
  selected: 0,
  cam: cameras.find(c => c.id === view)?.id ?? "track",
  time: 0.65,
  speed: 1,
  paused: false,
  visible: true,
};
let stage,
  activeModel = "ayan";
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.outerHTML = icon(el.dataset.icon);
});
$("runners").innerHTML = horses
  .map(
    (h, i) =>
      '<button type="button" class="runner" data-horse="' +
      i +
      '" style="--silk:' +
      h.color +
      '" aria-pressed="' +
      (i === 0) +
      '"><span class="number-tile">' +
      pad(h.number) +
      '</span><span class="runner-copy"><strong>' +
      h.name +
      "</strong><small>" +
      h.en +
      "</small></span>" +
      silk(h.number) +
      '<span class="focus-ring"></span></button>',
  )
  .join("");
$("cams").innerHTML = cameras
  .map(
    (c, i) =>
      '<button type="button" class="cam-card" data-cam="' +
      c.id +
      '" aria-label="' +
      c.name +
      "，" +
      c.desc +
      '" aria-pressed="' +
      (i === 0) +
      '"><span class="cam-check">' +
      icon("check") +
      '</span><span><span class="cam-id">CAM ' +
      pad(i + 1) +
      '</span><strong class="cam-name">' +
      c.name +
      '</strong><span class="cam-en">' +
      c.en +
      "</span></span></button>",
  )
  .join("");
$("venues").innerHTML = venues
  .map(
    (v) =>
      '<button class="venue-btn" data-venue="' +
      v.id +
      '"><span><small>' +
      v.en +
      "</small><strong>" +
      v.name +
      "</strong></span>" +
      icon("arrow") +
      "</button>",
  )
  .join("");
const marker = document.createElement("span");
marker.id = "tracking-mark";
marker.hidden = true;
marker.textContent = "01";
$("stage").append(marker);
const controls = $("play");
const zoom = document.createElement("button");
zoom.className = "view-zoom";
zoom.title = "放大模型";
zoom.setAttribute("aria-label", "鏡頭放大倍率");
zoom.textContent = "1×";
zoom.onclick = () => {
  state.zoom = state.zoom === 1.4 ? 1.8 : state.zoom === 1.8 ? 1 : 1.4;
  zoom.textContent = state.zoom + "×";
  stage?.cut();
};
$("stage").append(zoom);
const thumb = (name) => "./views/" + name + ".jpg";

const libraryCards = [
  {
    title: "馬匹與步態",
    tag: "01　/　HORSES",
    image: "track",
    text: "Ayan 賽駒依路程完成四拍疾馳。可逐格檢查四蹄着地，或者用同一機位比較牧場馬同低面數原型。",
    links: [
      ["睇前膊接位修正慢鏡", "./views/shoulder-comparison.mp4"],
      ["睇前腿加厚前後慢鏡", "./views/foreleg-comparison.mp4"],
      ["睇亮相慢行、出閘同疾馳", "./views/parade-and-gallop.mp4"],
      ["睇軟件渲染改前改後實況", "./views/software-playback.mp4"],
      ["睇 6 號馬入彎、出彎換腳", "./views/lead-changes.mp4"],
      ["睇 6 號馬四蹄逐拍落地", "./views/footwork.mp4"],
      ["睇 3 號馬移出外疊超越", "./views/running-lines.mp4"],
      ["睇出閘至收步實況", "./views/gate-and-pull-up.mp4"],
      ["睇彎位馬步及半速側鏡", "./views/bend-gallop.mp4"],
      ["睇新舊馬步對照", "./views/gallop-comparison.mp4"],
      ["聽直播同慢鏡蹄聲", "./views/hoofbeats.mp4"],
      [
        "Sketchfab · Ayan",
        "https://sketchfab.com/3d-models/animated-rigged-horse-with-saddle-b08743c2c4734fb98a4e0a2f5767c318",
      ],
      ["CC BY 4.0 · 改動紀錄", "./models/horse-ayan-credits.md"],
      ["牧場馬 · CC0", "https://opengameart.org/content/rigged-horse"],
      ["牧場馬製作紀錄", "./models/horse-ranch-credits.md"],
      [
        "Quaternius · CC0",
        "https://quaternius.com/packs/ultimateanimatedanimals.html",
      ],
    ],
  },
  {
    title: "騎師與馬具",
    tag: "02　/　JOCKEY & TACK",
    image: "rider",
    text: "本作製作騎師、頭盔、護目鏡、綵衣及號布，按馬背位置安裝。每組綵衣用獨立顏色辨認。",
    links: [
      ["睇 6 號馬騎姿慢鏡", "./views/rider-follow.mp4"],
      ["睇騎姿同韁繩近鏡", "./studio.html?view=rider"],
      ["Ayan 連騎師 GLB", "./models/horse-ayan-mounted.glb"],
      ["2K 版連騎師 GLB", "./models/horse-ranch-mounted.glb"],
      ["低面數版連騎師 GLB", "./models/horse-mounted.glb"],
      ["製作紀錄", "./models/horse-credits.md"],
    ],
  },
  {
    title: "草地馬場",
    tag: "03　/　RACECOURSE",
    image: "stand",
    text: "使用 3DAssets.dev 馬場套件組裝六格馬閘、看台、欄杆、終點柱及判決鏡。主直路長 1,200 米。",
    links: [
      [
        "場地套件 · CC0",
        "https://3dassets.dev/packs/racecourse-and-parade-ring",
      ],
      ["場景來源", "./models/scenery-credits.md"],
      ["天空及草地", "./environment/credits.md"],
    ],
  },
];
function drawCards() {
  $("asset-cards").innerHTML = libraryCards
    .map(
      (c) =>
        '<article class="asset-card"><img class="asset-photo" src="' +
        thumb(c.image) +
        '" alt="' +
        c.title +
        '實際 3D 畫面"><div class="asset-content"><div class="eyebrow small">' +
        c.tag +
        "</div><h2>" +
        c.title +
        "</h2><p>" +
        c.text +
        '</p><div class="source-list">' +
        c.links
          .map(
            ([name, url]) =>
              '<a href="' +
              url +
              '" target="_blank" rel="noopener">' +
              name +
              " ↗</a>",
          )
          .join("") +
        "</div></div></article>",
    )
    .join("");
}
const comparisons = [
  { id: "ayan", name: "Ayan 競賽配裝", detail: "32,124 三角面 · 四拍疾馳" },
  { id: "ranch", name: "Ranch 牧場馬", detail: "37,160 三角面 · 2K 毛皮貼圖" },
  { id: "base", name: "Quaternius 原型", detail: "2,182 三角面 · 低面數對照" },
];
$("compare").innerHTML = comparisons
  .map(
    (c) =>
      '<button class="compare-card" data-model-key="' +
      c.id +
      '"><img src="' +
      thumb(c.id === "rider" ? "rider-view" : c.id) +
      '" alt="' +
      c.name +
      '側面"><span><strong>' +
      c.name +
      "</strong><small>" +
      c.detail +
      "</small></span></button>",
  )
  .join("");
$("compare").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-model-key]");
  if (!b || !stage) return;
  state.time = duration * 0.014;
  state.paused = true;
  state.selected = 0;
  state.zoom = 1.4;
  zoom.textContent = "1.4×";
  location.hash = "studio";
  camera("track");
  await chooseModel(b.dataset.modelKey);
  refresh();
});
function page() {
  const library = location.hash === "#library";
  $("studio").hidden = library;
  $("library").hidden = !library;
  state.visible = !library;
  for (const [key, current] of [
    ["studio", !library],
    ["library", library],
  ]) {
    const nav = $("nav-" + key);
    nav.classList.toggle("current", current);
    if (current) nav.setAttribute("aria-current", "page");
    else nav.removeAttribute("aria-current");
  }
  if (library) drawCards();
  else requestAnimationFrame(() => stage?.cut());
}
function refresh() {
  const seconds = Math.floor(state.time);
  $("time").textContent =
    pad(Math.floor(seconds / 60)) + ":" + pad(seconds % 60);
  const p = (state.time / duration) * 100;
  $("scrub").value = Math.round(p * 10);
  $("scrub").style.setProperty("--progress", p + "%");
}
function updateInfo() {
  const h = horses[state.selected],
    i = cameras.findIndex((c) => c.id === state.cam),
    v = venues.find((v) => v.id === state.cam);
  $("hero-bib").textContent = v ? "◆" : pad(h.number);
  $("hero-name").textContent = v ? v.name : h.name;
  $("hero-eng").textContent = v
    ? "GREEN VALLEY RACECOURSE"
    : h.en.toUpperCase();
  $("feed-kicker").textContent = v ? "VENUE INSPECTION" : "TRACKING";
  $("cam-number").textContent = v ? "V" + (venues.indexOf(v) + 1) : pad(i + 1);
  $("cam-code").textContent = v ? v.en : cameras[i].en;
  marker.textContent = pad(h.number);
  document
    .querySelectorAll(".runner")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.horse) === state.selected && !v),
      ),
    );
  document
    .querySelectorAll(".cam-card")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.cam === state.cam)),
    );
  const stopped = state.paused || Boolean(v);
  $("live-status").textContent = v ? "VIEW" : stopped ? "HOLD" : "LIVE";
  $("live-status").parentElement.classList.toggle("off", stopped);
  controls.innerHTML = icon(stopped ? "play" : "pause");
  controls.setAttribute("aria-label", stopped ? "播放預覽" : "暫停播放");
  $("scrub").disabled = Boolean(v);
  $("speed").disabled = Boolean(v);
}
function camera(id) {
  state.cam = id;
  updateInfo();
  stage?.cut();
}
function play() {
  if (venues.some((v) => v.id === state.cam)) {
    state.paused = false;
    camera("track");
  } else {
    state.paused = !state.paused;
    updateInfo();
  }
}
$("runners").addEventListener("click", (e) => {
  const b = e.target.closest("[data-horse]");
  if (!b) return;
  state.selected = Number(b.dataset.horse);
  if (venues.some((v) => v.id === state.cam)) state.cam = "track";
  updateInfo();
  stage?.cut();
});
$("cams").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cam]");
  if (b) camera(b.dataset.cam);
});
$("venues").addEventListener("click", (e) => {
  const b = e.target.closest("[data-venue]");
  if (!b) return;
  location.hash = "studio";
  camera(b.dataset.venue);
});
controls.addEventListener("click", play);
$("restart").addEventListener("click", () => {
  state.time = 0;
  state.paused = false;
  camera(cameras.some((c) => c.id === state.cam) ? state.cam : "track");
  refresh();
});
$("speed").addEventListener("change", (e) => {
  state.speed = Number(e.target.value);
});
$("scrub").addEventListener("input", (e) => {
  state.time = (Number(e.target.value) / 1000) * (duration - 0.001);
  refresh();
  stage?.cut();
});
$("help").onclick = () => $("help-dialog").showModal();
$("close-help").onclick = () => $("help-dialog").close();
$("help-dialog").addEventListener("click", (e) => {
  if (e.target === $("help-dialog")) $("help-dialog").close();
});
$("full").onclick = async () => {
  const el = $("stage");
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (el.requestFullscreen) {
    try {
      await el.requestFullscreen();
    } catch {
      el.classList.toggle("expanded");
    }
  } else el.classList.toggle("expanded");
  updateFull();
};
function updateFull() {
  const full =
    Boolean(document.fullscreenElement) ||
    $("stage").classList.contains("expanded");
  $("full").innerHTML = icon(full ? "shrink" : "expand");
  $("full").setAttribute("aria-label", full ? "離開全螢幕" : "全螢幕");
}
document.addEventListener("fullscreenchange", updateFull);
window.addEventListener("hashchange", page);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("stage").classList.contains("expanded")) {
    $("stage").classList.remove("expanded");
    updateFull();
  }
  if (
    !state.visible ||
    $("help-dialog").open ||
    e.altKey ||
    e.metaKey ||
    e.ctrlKey ||
    e.repeat ||
    /SELECT|INPUT|TEXTAREA/.test(e.target.tagName)
  )
    return;
  if (["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    camera(cameras[Number(e.key) - 1].id);
  }
  if (e.code === "Space" && !/BUTTON|A/.test(e.target.tagName)) {
    e.preventDefault();
    play();
  }
});
function showError(message) {
  const error = $("loading");
  error.hidden = false;
  error.replaceChildren(document.createTextNode(message + " "));
  const b = document.createElement("button");
  b.textContent = "重新載入";
  b.className = "retry";
  b.onclick = () => location.reload();
  error.append(b);
}
function fileHorse(file) {
  let factory;
  return async () => {
    if (!factory) {
      const gltf = await loadHorse(
        new URL("models/" + file, document.baseURI).href,
      );
      factory = (spec) => makeHorse(spec, gltf);
    }
    return factory;
  };
}
const assets = {
  ayan: {
    label: "Ayan · 競賽配裝",
    load: async () => {
      await loadAyanHorse();
      return makeAyanHorse;
    },
  },
  ranch: { label: "Ranch · 2K 毛皮", load: fileHorse("horse-ranch.glb") },
  base: { label: "Quaternius · 低面數", load: fileHorse("horse.glb") },
};
const modelSelect = document.createElement("select");
modelSelect.id = "model-choice";
modelSelect.setAttribute("aria-label", "馬匹模型");
let version = 0;
async function chooseModel(key) {
  const seq = ++version;
  modelSelect.disabled = true;
  try {
    const factory = await assets[key].load();
    if (seq !== version) return;
    if (activeModel !== key) await stage.replace(factory);
    modelSelect.value = key;
    activeModel = key;
    $("stage").dataset.model = key;
  } catch (error) {
    console.error(error);
    modelSelect.value = activeModel;
    const status = $("model-status");
    status.textContent = "此模型載入失敗，可重試";
    status.hidden = false;
  } finally {
    if (seq === version) modelSelect.disabled = false;
  }
}
async function init() {
  updateInfo();
  refresh();
  page();
  const choose = document.createElement("label");
  choose.className = "model-picker";
  choose.innerHTML = "<span>馬匹模型</span>";
  choose.append(modelSelect);
  const helper = document.createElement("span");
  helper.id = "model-status";
  helper.hidden = true;
  choose.append(helper);
  document.querySelector(".intro .meet").before(choose);
  for (const [key, model] of Object.entries(assets)) {
    const o = new Option(model.label, key);
    modelSelect.add(o);
  }
  modelSelect.addEventListener("change", (e) => {
    helper.hidden = true;
    chooseModel(e.target.value);
  });
  modelSelect.disabled = true;
  try {
    stage = await startStage($("race-canvas"), state, refresh);
    await chooseModel("ayan");
    $("loading").hidden = true;
    $("stage").dataset.ready = "true";
  } catch (error) {
    console.error(error);
    showError("未能載入 3D 場景，請確認瀏覽器支援 WebGL 2。");
  }
}
for (const c of cameras) {
  const url = new URL(thumb(c.id === "rider" ? "rider-view" : c.id), document.baseURI).href;
  document
    .querySelector('[data-cam="' + c.id + '"]')
    .style.setProperty("--pic", 'url("' + url + '")');
}
init();
