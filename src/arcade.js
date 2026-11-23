import { horses, cameras } from "./data.js";
import { bendEntry, bendExit } from "./course.js";
import { cameraShot, liveCameras, readView, saveView } from "./broadcast.js";
import { createRadar } from "./radar.js";
import { icon } from "./icons.js";
import {
  newGame,
  markets,
  styles,
  odds,
  returns,
  wager,
  cancel,
  start,
  changeSpeed,
  elapsed,
  distance,
  runOutEnd,
  stopDistance,
  snapshot,
  snapshotAt,
  settle,
  next,
  refill,
  LENGTH,
} from "./race.js";
import { openGameSave } from "./game-save.js";
import { raceAudio } from "./race-audio.js";
import { finishReplay } from "./replay.js";

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const format = (n) => n.toLocaleString("zh-HK");
const time = (t) =>
  Math.floor(t / 60) +
  ":" +
  Math.floor(t % 60)
    .toString()
    .padStart(2, "0") +
  "." +
  Math.floor((t % 1) * 100)
    .toString()
    .padStart(2, "0");
const marketHints = {
  win: "選中第一名馬匹",
  place: "選中頭兩名其中一匹",
  pair: "選中頭兩名馬匹，次序不限",
};
const picksText = (picks) =>
  picks.map((i) => horses[i].number + " " + horses[i].name).join(" ＋ ");
const status = (msg) => {
  $("message").textContent = msg;
};
const audio = raceAudio();
const finishCam = { id: "line", name: "終點定鏡", en: "FINISH LINE" };
const raceCameras = [...cameras, finishCam, ...liveCameras.slice(cameras.length)];
const initialView = readView();
let game = newGame(),
  save,
  stage,
  market = "win",
  busy = false,
  ready = false,
  settling = false,
  lastOrder = "",
  lastPhase = "",
  lastBell = "",
  forceMap = false,
  replay = null,
  previousView = null;
const cameraState = {
  selected: initialView.horse,
  cam: initialView.cam,
  onShot: showShot,
  onPick: (runner) => updateCamera(runner),
  time: 0.8,
  paused: false,
  visible: true,
  get studyMode() { return replay?.scope === "stride"; },
  get studyHoof() {
    if (replay?.scope !== "stride" || replay.playing) return null;
    return replay.footsteps(this.selected).current?.hoof ?? null;
  },
  speed: 1,
  get holdFrame() {
    return replay ? !replay.playing : game.race.phase === "open";
  },
  get staticPose() {
    return replay ? !replay.playing : game.race.phase === "settled" && elapsed(game.race) >= runOutEnd(game.race);
  },
  courseFrame() {
    if (game.race.phase === "open") return null;
    const frame = replay ? snapshotAt(game.race, replay.position()) : snapshot(game.race);
    frame.plan = game.race.plan;
    frame.speeds = game.race.plan.map((runner, i) => (frame.ds[i] - distance(runner, frame.t - 0.05)) / 0.05);
    frame.stops = game.race.plan.map(stopDistance);
    return frame;
  },
};
const mapCanvas = $("race-map");
const paintMap = createRadar(mapCanvas, runner => updateCamera(runner));
new ResizeObserver(() => drawRadar()).observe(mapCanvas);
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.outerHTML = icon(el.dataset.icon);
});
const options = horses
  .map(
    (h, i) =>
      '<option value="' +
      i +
      '">' +
      pad(h.number) +
      "　" +
      h.name +
      "</option>",
  )
  .join("");
for (const key of ["pick", "second", "fs-horse"]) $(key).innerHTML = options;
$("second").value = "1";
$("fs-camera").innerHTML = raceCameras
  .map((c) => '<option value="' + c.id + '">' + c.name + "</option>")
  .join("");
$("camera-switch").innerHTML = liveCameras
  .map(
    (c, i) =>
      '<button type="button" data-cam="' +
      c.id +
      '" title="快捷鍵 ' +
      (i + 1) +
      "　" +
      c.name + (c.id === "pack" ? "（點馬可跟拍）" : "") +
      '">' +
      icon(c.icon) +
      c.name +
      "</button>",
  )
  .join("");
const quickFocus = document.createElement("select");
quickFocus.className = "quick-focus";
quickFocus.setAttribute("aria-label", "直播焦點馬匹");
quickFocus.innerHTML = options;
$("sound").before(quickFocus);
const orderButtons = horses.map((horse, i) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.runner = String(i);
  button.style.setProperty("--silk", horse.color);
  button.innerHTML = '<span class="order-place"></span><b>' + pad(horse.number) + "</b>";
  button.onclick = () => updateCamera(i);
  $("order-runners").append(button);
  return button;
});
let lastStrip = "";
function showOrder(order, label) {
  const signature = label + order.join("");
  if (signature === lastStrip) return;
  lastStrip = signature;
  $("order-kind").textContent = label;
  const focused = document.activeElement;
  const runners = $("order-runners");
  order.forEach((i, rank) => {
    const button = orderButtons[i];
    button.firstElementChild.textContent = String(rank + 1);
    button.setAttribute("aria-label", label + "第 " + (rank + 1) + "，" + horses[i].number + " 號" + horses[i].name + "，跟拍");
    button.title = horses[i].name;
    if (runners.children[rank] !== button) runners.insertBefore(button, runners.children[rank]);
  });
  if (orderButtons.includes(focused) && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
}
function showShot(shot) {
  const i = raceCameras.findIndex((c) => c.id === shot);
  const mapActive = forceMap || cameraState.cam === "radar";
  cameraState.visible = !mapActive;
  mapCanvas.hidden = !mapActive;
  if (mapActive) $("tracking-mark").hidden = true;
  $("stage").dataset.shot = mapActive ? "radar" : shot;
  $("cam-label").textContent = mapActive ? "2D　/　RACE RADAR"
    : (cameraState.cam === "auto" ? "導播" : "CAM " + pad(i + 1)) + "　/　" + raceCameras[i].en;
}
function updateCamera(horse = cameraState.selected, cam = cameraState.cam) {
  if (horse !== cameraState.selected && replay?.scope === "stride" && !replay.playing)
    focusFootfall(horse,replay.position());
  const changed = horse !== cameraState.selected || cam !== cameraState.cam;
  cameraState.selected = horse;
  cameraState.cam = cam;
  const h = horses[horse];
  $("hero-bib").textContent = pad(h.number);
  $("hero-name").textContent = h.name;
  $("hero-en").textContent = h.en.toUpperCase();
  const distance = cam === "auto" ? cameraState.courseFrame()?.ds[horse] ?? 0 : 0;
  showShot(cameraShot(cam, distance));
  $("tracking-mark").textContent = pad(h.number);
  $("fs-horse").value = quickFocus.value = String(horse);
  $("fs-camera").value = forceMap ? "radar" : cam;
  for (const b of $("camera-switch").children)
    b.setAttribute("aria-pressed", String(b.dataset.cam === cam));
  for (const b of orderButtons)
    b.setAttribute("aria-pressed", String(Number(b.dataset.runner) === horse));
  for (const row of $("field-body").rows) {
    const active = Number(row.dataset.i) === horse;
    row.classList.toggle("tracked", active);
    row.querySelector(".follow").setAttribute("aria-pressed", String(active));
  }
  if (changed) {
    if (!replay) saveView(horse, cam);
    stage?.cut();
    syncSound();
  }
  drawRadar();
}
function priceCell(race, key, runner) {
  const price = odds(race, key, [runner]).toFixed(1);
  if (race.phase !== "open") return price;
  return `<button class="card-price" data-price="${key}" data-runner="${runner}" aria-label="${horses[runner].name}，${markets[key]}，賠率 ${price}">${price}</button>`;
}
function field() {
  const r = game.race;
  $("field-body").innerHTML = horses
    .map(
      (h, i) =>
        '<tr data-i="' +
        i +
        '"><td><span class="rank"></span><span class="number-tile" style="--silk:' +
        h.color +
        '">' +
        pad(h.number) +
        '</span></td><td><button class="horse-cell" data-focus="' +
        i +
        '">' +
        h.name +
        '<span class="sr-only">，追蹤此馬</span></button><small class="horse-latin">' +
        h.en +
        '</small></td><td class="style-col">' +
        styles[i] +
        "</td><td>" +
        priceCell(r, "win", i) +
        "</td><td>" +
        priceCell(r, "place", i) +
        '</td><td><button data-focus="' +
        i +
        '" class="follow" aria-label="追蹤' +
        h.name +
        '">' +
        icon("focus") +
        "</button></td></tr>",
    )
    .join("");
  lastOrder = "";
  $("rank-label").textContent = r.phase === "open" ? "馬號" : "位 / 號";
  $("field-title").textContent =
    r.phase === "open"
      ? "出馬表"
      : replay ? "重播走位" : r.phase === "running"
        ? "即時走位"
        : "完成名次";
  updateCamera();
}
function selectedPicks() {
  const first = Number($("pick").value);
  return market === "pair" ? [first, Number($("second").value)] : [first];
}
function quote() {
  const picks = selectedPicks(),
    stake = Number($("stake").value);
  const price = odds(game.race, market, picks),
    valid =
      Number.isSafeInteger(stake) &&
      stake >= 10 &&
      stake % 10 === 0 &&
      stake <= game.balance;
  $("price").textContent = price.toFixed(1) + "×";
  $("potential").textContent = valid ? format(returns(stake, price)) : "—";
  $("stake-error").textContent = valid
    ? ""
    : stake > game.balance
      ? "代幣餘額不足。"
      : "注碼由 10 枚起，請輸入 10 的倍數。";
  $("confirm").disabled =
    busy || game.race.phase !== "open" || !valid || !ready;
  for (const b of $("chips").children)
    b.setAttribute("aria-pressed", String(Number(b.dataset.stake) === stake));
}
function pickMarket(key) {
  market = key;
  $("second-field").hidden = market !== "pair";
  for (const opt of $("second").options)
    opt.disabled = opt.value === $("pick").value;
  if ($("second").value === $("pick").value)
    $("second").value = String((Number($("pick").value) + 1) % 6);
  for (const b of $("market-tabs").children)
    b.setAttribute("aria-pressed", String(b.dataset.market === market));
  $("market-hint").textContent = marketHints[key];
  showForm();
  quote();
}
function showForm() {
  const recent = game.history.filter((race) => race.number < game.race.number).slice(0, 3);
  $("form-guide").hidden = !recent.length;
  if (!recent.length) return;
  const rows = selectedPicks().map((runner) => {
    const ranks = recent.map((race) => {
      const rank = race.order.indexOf(runner) + 1;
      const label = `第 ${race.number} 場，第 ${rank} 名`;
      return `<span class="form-rank" title="${label}" aria-label="${label}">${rank}</span>`;
    });
    return `<div><span>${horses[runner].name}</span>${ranks.join("")}</div>`;
  });
  $("form-guide").innerHTML = "<b>近績 · 最近場次在先</b>" + rows.join("");
}
function ladder(order) {
  return (
    '<ol class="live-order">' +
    order
      .map(
        (i, j) =>
          '<li><button data-follow="' +
          i +
          '" aria-label="跟拍' +
          horses[i].name +
          '"><em>' +
          pad(j + 1) +
          '</em><span class="lane-colour" style="background:' +
          horses[i].color +
          '"></span><b>' +
          horses[i].name +
          '</b><small data-gap="' +
          i +
          '"></small></button></li>',
      )
      .join("") +
    "</ol>"
  );
}
function ticketPanel() {
  const r = game.race;
  $("ticket-count").textContent = r.tickets.length + " 張";
  if (!r.tickets.length) {
    $("ticket-list").innerHTML =
      '<p class="empty-ticket">' +
      (r.phase === "open"
        ? "選好馬匹及注碼，再按「確認投注」。"
        : "今場以觀眾身分睇賽。") +
      "</p>";
    return;
  }
  $("ticket-list").innerHTML = r.tickets
    .map(
      (t, i) =>
        '<div class="ticket"><div><b>' +
        markets[t.market] +
        "　" +
        picksText(t.picks) +
        "</b><small>" +
        format(t.stake) +
        " 枚　× " +
        t.price.toFixed(1) +
        "</small></div>" +
        (r.phase === "open"
          ? '<button data-cancel="' +
            i +
            '" aria-label="取消第 ' +
            (i + 1) +
            ' 張注單">取消</button>'
          : r.phase === "settled"
            ? "<strong>" +
              (t.paid ? "派彩 " + format(t.paid) : "未中") +
              "</strong>"
            : "<small>已封盤</small>") +
        "</div>",
    )
    .join("");
}
function display() {
  const r = game.race,
    opened = r.phase === "open",
    done = r.phase === "settled";
  if (replay && (replay.raceNumber !== r.number || !done)) leaveReplay();
  showReplayControls();
  $("balance").textContent = format(game.balance);
  $("meet-name").textContent = r.name;
  $("meet-number").textContent = "R" + pad(r.number);
  $("bet-form").hidden = !opened;
  $("closed").hidden = opened;
  $("start").hidden = !opened;
  $("start").disabled = !ready || busy;
  $("speed").hidden = r.phase !== "running";
  $("speed").textContent = "轉播 " + r.speed + "×";
  $("phase").textContent = replay
    ? { finish: "終點重播", full: "全場重播", stride: "步姿慢鏡", pullup: "過線收步" }[replay.scope]
    : opened
    ? "接受投注"
    : done
      ? "賽事完成"
      : "賽事進行中";
  $("live-status").textContent = replay ? "REPLAY" : opened ? "PADDOCK" : done ? "RESULT" : "LIVE";
  $("subject-label").textContent = replay ? "RACE REPLAY" : opened ? "PADDOCK FEED" : "TRACKING";
  $("refill").hidden = !(opened && game.balance < 10 && !r.tickets.length);
  $("field-tag").textContent = opened
    ? "6 匹出賽"
    : replay ? "重播排名" : done
      ? "正式賽果"
      : "場上排名";
  $("closed").innerHTML = done
    ? '<div class="eyebrow small">OFFICIAL RESULT</div><h3>' +
      horses[r.settlement.order[0]].name +
      " 勝出</h3><p>派彩 " +
      format(r.settlement.paid) +
      " 枚　·　投注 " +
      format(r.settlement.stake) +
      " 枚</p>" +
      ladder(r.settlement.order) +
      '<button class="next-race" id="next">下一場賽事　→</button>'
    : '<div class="eyebrow small">BETTING CLOSED</div><h3>投注已封盤</h3><p>本場已確認 ' +
      r.tickets.length +
      ' 張注單。點選下列馬匹可即時跟拍。</p><div id="running-ladder"></div>';
  if (done)
    for (const slot of $("closed").querySelectorAll("[data-gap]"))
      slot.textContent = time(r.plan[Number(slot.dataset.gap)].finish);
  if (done) $("next").onclick = () => act((g) => next(g), "新一場已開放投注。");
  $("result").hidden = !done;
  if (done) {
    const s = r.settlement;
    $("result").innerHTML =
      '<div class="eyebrow small">OFFICIAL RESULT　/　R' +
      pad(r.number) +
      '</div><div class="podium">' +
      s.order
        .slice(0, 3)
        .map(
          (i, j) =>
            "<span><strong>" +
            pad(j + 1) +
            "</strong>" +
            horses[i].name +
            "</span>",
        )
        .join("") +
      '</div><p class="result-summary">頭馬時間 ' +
      time(r.plan[s.order[0]].finish) +
      "　·　本場淨額 " +
      (s.paid - s.stake >= 0 ? "+" : "") +
      format(s.paid - s.stake) +
      " 枚</p>";
  }
  cameraState.speed = r.phase === "running" ? r.speed : 1;
  field();
  ticketPanel();
  showForm();
  quote();
  tick();
}
async function readLatest() {
  if (!save) return;
  game = await save.read();
  display();
}
async function act(change, message = "", guard = game.race.number) {
  if (!ready || busy) return;
  busy = true;
  quote();
  $("start").disabled = true;
  try {
    game = await save.update((g) => {
      if (g.race.number !== guard) throw Error("場次已更新，請重新選擇。");
      change(g);
    });
    status(message);
  } catch (e) {
    status(e.message);
    game = await save.read();
  } finally {
    busy = false;
    display();
  }
}
function syncSound(t) {
  const r = game.race;
  if (!r.plan) {
    audio.reset();
    return;
  }
  const rate = replay ? (replay.playing ? replay.rate : 0) : r.speed;
  const end = replay ? replay.to : runOutEnd(r);
  const current = t ?? (replay ? replay.position() : elapsed(r));
  audio.step(r, cameraState.selected, current, current >= end ? 0 : rate, end, !!replay);
}
function tick() {
  const r = game.race,
    live = r.phase === "running";
  if (lastPhase !== r.phase) {
    lastPhase = r.phase;
    stage?.cut();
  }
  let snap;
  $("race-bug").hidden = !live && !replay;
  $("order-strip").hidden = !r.plan;
  if (!r.plan) {
    $("distance-label").textContent = "起步至終點　1,200 米";
    $("progress").style.width = "0%";
    $("countdown").hidden = true;
  } else {
    snap = replay ? snapshotAt(r, replay.position()) : snapshot(r);
    if (replay) renderReplayClock(snap.t);
    const count = Math.ceil(-snap.t);
    const stripKind = replay ? "重播走位" : !live ? "賽果" : count > 0 ? "檔位" : "走位";
    showOrder(!replay && r.settlement ? r.settlement.order : snap.order, stripKind);
    $("countdown").hidden = (!live && !replay) || count <= 0;
    if (count > 0) $("countdown").textContent = count;
    $("distance-label").textContent =
      (count > 0
        ? "即將起步"
        : snap.remaining
          ? "餘下 " + format(snap.remaining) + " 米"
          : "已過終點") +
      "　·　" +
      time(Math.max(0, snap.t));
    if (!live && !replay) {
      const winnerTime = r.plan[r.settlement.order[0]].finish;
      const motion = snap.t < runOutEnd(r) ? "過線收步" : "賽事完成";
      $("distance-label").textContent = motion + "　·　頭馬時間 " + time(winnerTime);
    }
    $("progress").style.width =
      ((LENGTH - snap.remaining) / LENGTH) * 100 + "%";
    const order = replay ? snap.order : r.settlement?.order ?? snap.order,
      k = order.join("-");
    if (live || replay) {
      const leader = snap.ds[snap.order[0]];
      const section = leader < bendEntry ? "對面直路" : leader < bendExit ? "彎位" : "終點直路";
      const result = snap.t >= Math.max(...r.plan.map(h => h.finish)) ? "過線收步" : "衝線";
      $("bug-distance").textContent = count > 0 ? "準備起步" : snap.remaining ? section + "　" + format(snap.remaining) + " m" : result;
      const rank = snap.order.indexOf(cameraState.selected) + 1;
      $("bug-rank").textContent = count > 0 ? "第 " + horses[cameraState.selected].number + " 檔" : "焦點馬 第 " + rank + " 位";
    }
    if (k !== lastOrder) {
      lastOrder = k;
      const active = document.activeElement;
      const activeFollow = active?.dataset.follow;
      if ($("running-ladder")) $("running-ladder").innerHTML = ladder(order);
      const rows = Array.from($("field-body").rows);
      order.forEach((idx, rank) => {
        const row = rows.find((row) => Number(row.dataset.i) === idx);
        if (row) {
          row.querySelector(".rank").textContent = rank + 1;
          const current = $("field-body").rows[rank];
          if (row !== current) $("field-body").insertBefore(row, current);
        }
      });
      if (activeFollow !== undefined && !active.isConnected)
        $("running-ladder")?.querySelector(`[data-follow="${activeFollow}"]`)?.focus({ preventScroll: true });
      else if (rows.some((row) => row.contains(active)) && document.activeElement !== active)
        active.focus({ preventScroll: true });
    }
    if (live) {
      const leader = snap.ds[order[0]];
      for (const slot of $("closed").querySelectorAll("[data-gap]")) {
        const i = Number(slot.dataset.gap);
        slot.textContent =
          snap.t <= 0
            ? "待起步"
            : snap.ds[i] >= LENGTH
              ? "已衝線"
              : i === order[0]
                ? "領先"
                : "−" + Math.max(0, leader - snap.ds[i]).toFixed(1) + " m";
      }
    }
    if (live && snap.t >= 0 && lastBell !== r.number) {
      lastBell = r.number;
      if (snap.t < 0.45) audio.bell();
    }
    if (
      live &&
      !busy &&
      !settling &&
      snap.t >= Math.max(...r.plan.map((h) => h.finish))
    ) {
      settling = true;
      act((g) => settle(g), "賽果已確認，派彩已計入餘額。").finally(() => {
        settling = false;
      });
    }
  }
  syncSound(snap?.t);
  drawRadar(snap);
}
$("closed").addEventListener("click", (e) => {
  const b = e.target.closest("[data-follow]");
  if (b) updateCamera(Number(b.dataset.follow));
});
$("bet-form").onsubmit = (e) => {
  e.preventDefault();
  const ticket = {
    market,
    picks: selectedPicks(),
    stake: Number($("stake").value),
    id: crypto.randomUUID(),
  };
  act(
    (g) => wager(g, ticket),
    "已落注　" +
      markets[market] +
      " · " +
      picksText(ticket.picks) +
      " · " +
      ticket.stake +
      " 枚",
  );
};
$("ticket-list").onclick = (e) => {
  const b = e.target.closest("[data-cancel]");
  if (b) {
    const id = game.race.tickets[Number(b.dataset.cancel)]?.id;
    act((g) => cancel(g, id), "注單已取消，代幣已退回。");
  }
};
$("refill").onclick = () => act((g) => refill(g), "已領取 1,000 枚遊戲代幣。");
$("start").onclick = () => act((g) => start(g), "本場已封盤。");
$("speed").onclick = () => {
  const speed = game.race.speed === 1 ? 2 : 1;
  act((g) => changeSpeed(g, speed));
};
$("market-tabs").onclick = (e) => {
  const b = e.target.closest("[data-market]");
  if (b) pickMarket(b.dataset.market);
};
$("pick").onchange = () => pickMarket(market);
$("second").onchange = () => { showForm(); quote(); };
$("stake").oninput = quote;
function setStake(n) {
  $("stake").value = String(n);
  quote();
}
$("chips").onclick = (e) => {
  const b = e.target.closest("[data-stake]");
  if (b) setStake(Number(b.dataset.stake));
};
$("less").onclick = () =>
  setStake(Math.max(10, (Number($("stake").value) || 0) - 10));
$("more").onclick = () => setStake((Number($("stake").value) || 0) + 10);
$("camera-switch").onclick = (e) => {
  const b = e.target.closest("[data-cam]");
  if (b) updateCamera(cameraState.selected, b.dataset.cam);
};
$("field-body").onclick = (e) => {
  const price = e.target.closest("[data-price]");
  if (price && game.race.phase === "open") {
    $("pick").value = price.dataset.runner;
    pickMarket(price.dataset.price);
    updateCamera(Number(price.dataset.runner));
    $("pick").focus();
    return;
  }
  const b = e.target.closest("[data-focus]");
  if (b) updateCamera(Number(b.dataset.focus));
};
$("fs-horse").onchange = quickFocus.onchange = (e) =>
  updateCamera(Number(e.target.value));
$("fs-camera").onchange = (e) =>
  updateCamera(cameraState.selected, e.target.value);
function showReplayControls() {
  const available = ready && game.race.phase === "settled";
  $("watch-replay").hidden = $("fs-replay").hidden = !available || !!replay;
  $("replay-deck").hidden = !replay;
  $("stage").classList.toggle("replaying", !!replay);
  const line = $("fs-camera").querySelector('[value="line"]');
  line.hidden = line.disabled = !replay;
}
function renderReplayClock(t) {
  $("replay-scrub").value = t;
  const labelTime = t < 0 ? "−" + time(-t) : time(t);
  $("replay-scrub").setAttribute("aria-valuetext", labelTime);
  $("replay-time").textContent = labelTime;
  if (replay.scope === "stride") {
    const {previous,current,next} = replay.footsteps(cameraState.selected,t);
    $("previous-hoof").disabled = !previous;
    $("next-hoof").disabled = !next;
    const hoof = current && !replay.playing ? ["右後蹄","左後蹄","右前蹄","左前蹄"][current.hoof] : "";
    const subject = hoof ? hoof + "着地" : "步姿慢鏡";
    if ($("subject-label").textContent !== subject) $("subject-label").textContent = subject;
  }
  const label = replay.playing ? "暫停" : t >= replay.to ? "再播" : "播放";
  if ($("replay-play").textContent !== label) {
    $("replay-play").textContent = label;
    stage?.cut();
  }
}
function focusFootfall(runner,t) {
  const { current, previous, next } = replay.footsteps(runner,t);
  const nearest = current ?? (!previous || (next && next.time-t < t-previous.time) ? next : previous);
  replay.pauseAt(nearest?.time ?? t);
}
function playScope(scope, first = false) {
  const gait = scope === "stride", t = replay?.position() ?? 0;
  const rate = gait ? 0.25 : replay?.rate ?? 0.5;
  replay = finishReplay(game.race, undefined, scope);
  replay.setRate(rate);
  if (gait) focusFootfall(cameraState.selected,t);
  $("previous-hoof").hidden = $("next-hoof").hidden = !gait;
  $("replay-line").hidden = gait;
  if (gait) $("subject-label").setAttribute("aria-live","polite");
  else $("subject-label").removeAttribute("aria-live");
  $("replay-scope").value = scope;
  $("replay-scrub").min = replay.from;
  $("replay-scrub").max = replay.to;
  $("replay-rate").value = String(replay.rate);
  updateCamera(first ? game.race.settlement.order[0] : cameraState.selected,
    first || (gait && !forceMap) || cameraState.cam === "line" ? "track" : cameraState.cam);
  stage?.cut();
  display();
}
function beginReplay() {
  if (replay || game.race.phase !== "settled") return;
  previousView = { horse: cameraState.selected, cam: cameraState.cam };
  playScope("finish", true);
  $("replay-play").focus({ preventScroll: true });
}
$("replay-scope").onchange = e => playScope(e.target.value);
function leaveReplay() {
  replay = null;
  $("subject-label").removeAttribute("aria-live");
  updateCamera(previousView.horse, previousView.cam);
  previousView = null;
  stage?.cut();
}
$("watch-replay").onclick = $("fs-replay").onclick = beginReplay;
$("replay-play").onclick = () => {
  replay.toggle();
  stage?.cut();
  tick();
};
for (const [button,direction] of [["previous-hoof","previous"],["next-hoof","next"]]) {
  $(button).onclick = () => {
    const event = replay.footsteps(cameraState.selected)[direction];
    if (event) pauseReplayAt(event.time);
  };
}
function pauseReplayAt(t) {
  replay.pauseAt(t);
  stage?.cut();
  tick();
}
$("replay-scrub").oninput = (e) => {
  const t = Number(e.target.value);
  pauseReplayAt(t >= replay.to - Number(e.target.step) ? replay.to : t);
};
$("replay-scrub").onkeydown = e => {
  if (e.key !== "Home" && e.key !== "End") return;
  e.preventDefault();
  pauseReplayAt(e.key === "Home" ? replay.from : replay.to);
};
$("replay-rate").onchange = (e) => {
  replay.setRate(Number(e.target.value));
  syncSound();
};
$("replay-line").onclick = () => {
  replay.pauseAt(replay.winnerTime);
  updateCamera(game.race.settlement.order[0], forceMap ? "radar" : "line");
  stage?.cut();
  tick();
};
$("replay-exit").onclick = () => {
  leaveReplay();
  display();
  const full = document.fullscreenElement || $("stage").classList.contains("expanded");
  $(full ? "fs-replay" : "watch-replay").focus({ preventScroll: true });
};
$("sound").onclick = async () => {
  const button = $("sound");
  button.disabled = true;
  try {
    const on = await audio.toggle();
    button.textContent = "音效 " + (on ? "開" : "關");
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "關閉賽場音效" : "開啟賽場音效");
    if (on) syncSound();
  } catch {
    status("此瀏覽器未能播放音效。");
  } finally {
    button.disabled = false;
  }
};
document.addEventListener("visibilitychange", () => document.hidden ? audio.reset() : syncSound());
window.addEventListener("pagehide", () => audio.reset());
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
  fullInfo();
};
function fullInfo() {
  const full =
    !!document.fullscreenElement || $("stage").classList.contains("expanded");
  $("full").innerHTML = icon(full ? "shrink" : "expand");
  $("full").setAttribute("aria-label", full ? "離開全螢幕" : "全螢幕");
  if (full) $("stage").append($("replay-deck"));
  else document.querySelector(".broadcast-strip").after($("replay-deck"));
  if (full) $("stage").append($("order-strip"));
  else $("stage").after($("order-strip"));
  if (full) $("stage").append($("sound"));
  else quickFocus.after($("sound"));
}
document.addEventListener("fullscreenchange", fullInfo);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("stage").classList.contains("expanded")) {
    $("stage").classList.remove("expanded");
    fullInfo();
  }
  if (
    $("dialog").open ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    /INPUT|SELECT/.test(e.target.tagName)
  )
    return;
  if (!forceMap && /^[1-7]$/.test(e.key))
    updateCamera(cameraState.selected, liveCameras[Number(e.key) - 1].id);
});
function dialog(title, html) {
  $("dialog-title").textContent = title;
  $("dialog-body").innerHTML = html;
  $("dialog").showModal();
}
$("close").onclick = () => $("dialog").close();
$("dialog").onclick = (e) => {
  if (e.target === $("dialog")) $("dialog").close();
};
$("rules-button").onclick = () =>
  dialog(
    "遊戲玩法",
    "<ul><li><b>賽前落注</b><span>起始有 1,000 枚虛擬代幣。選馬、輸入 10 的倍數注碼，按確認投注。同場可落多張注單，開跑前可取消。</span></li><li><b>三種玩法</b><span>獨贏揀頭馬，位置揀頭兩名其中一匹，連贏揀頭兩匹而不分先後。派彩按落注時顯示嘅賠率計算，包含本金。</span></li><li><b>封盤及觀賽</b><span>按封盤開跑開始賽事。即使冇落注亦可以睇。點走位列馬號揀焦點。按 1 至 3 切換跟拍、俯視或長鏡，4 睇全場並可點馬，5 開自動導播。可選 2× 轉播。</span></li><li><b>派彩及存檔</b><span>全場衝線後一次過結算，保存最近 20 場。本機瀏覽器記錄進度。代幣只供遊戲使用。餘額不足 10 枚且無未結算注項時可免費補充。</span></li></ul>",
  );
$("history-button").onclick = () =>
  dialog(
    "最近賽績",
    game.history.length
      ? game.history
          .map(
            (r) =>
              '<details class="history-row"><summary>R' +
              pad(r.number) +
              "　" +
              r.name +
              "　·　派彩 " +
              format(r.paid) +
              "</summary><p>" +
              r.order.map((i, j) => j + 1 + ". " + horses[i].name).join("　") +
              "</p><p>投注 " +
              format(r.stake) +
              " 枚　·　派彩 " +
              format(r.paid) +
              " 枚</p>" +
              r.tickets
                .map(
                  (t) =>
                    "<p>" +
                    markets[t.market] +
                    "　" +
                    picksText(t.picks) +
                    "　" +
                    t.stake +
                    " × " +
                    t.price.toFixed(1) +
                    "　→　" +
                    t.paid +
                    " 枚</p>",
                )
                .join("") +
              "</details>",
          )
          .join("")
      : '<p class="empty-ticket">第一場完賽後，呢度會記錄名次、注項同派彩。</p>',
  );
function drawRadar(s = snapshotIfRunning()) {
  if (!mapCanvas.hidden) paintMap(game.race.plan, s?.ds, cameraState.selected);
}
function snapshotIfRunning() {
  return replay ? snapshotAt(game.race, replay.position()) : game.race.plan ? snapshot(game.race) : null;
}
async function init() {
  save = await openGameSave();
  game = await save.read();
  save.channel?.addEventListener("message", () =>
    readLatest().catch(() => status("同步失敗，重新載入可繼續。")),
  );
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) readLatest();
  });
  pickMarket("win");
  display();
  try {
    const { startStage } = await import("./stage.js");
    stage = await startStage($("race-canvas"), cameraState, () => {});
    $("stage").dataset.render = "3d";
    const canvas = $("race-canvas");
    canvas.addEventListener("webglcontextlost", () => {
      const note = $("loading");
      note.replaceChildren(
        document.createTextNode("3D 畫面中斷，注單已保留。"),
      );
      const retry = document.createElement("button");
      retry.className = "retry";
      retry.textContent = "重新載入";
      retry.onclick = () => location.reload();
      note.append(retry);
      note.hidden = false;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      $("loading").hidden = true;
      stage.cut();
    });
  } catch (err) {
    console.warn("3D rendering unavailable", err);
    forceMap = true;
    $("race-canvas").hidden = true;
    const note = document.createElement("span");
    note.className = "fallback-note";
    note.textContent = "2D 走位圖 · 3D 需 WebGL 2";
    $("stage").append(note);
    $("stage").dataset.render = "2d";
    $("camera-switch").hidden = true;
    $("fs-camera").disabled = true;
  }
  $("loading").hidden = true;
  ready = true;
  display();
  if (save.temporary) status("此瀏覽器只可暫存，關閉頁面後會重新開始。");
  setInterval(tick, 100);
}
init().catch((e) => {
  $("loading").textContent = "未能開啟遊戲，請重新載入。";
  console.error(e);
});
