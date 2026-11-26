import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.env.TURFLINE_URL || "http://127.0.0.1:4174/";
const realtime = process.env.TURFLINE_REALTIME === "1";
const localChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.TURFLINE_CHROME ||
  (process.platform === "darwin" && existsSync(localChrome)
    ? localChrome
    : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const faults = [];
const origin = new URL(base).origin;
const now = Date.now();
function observe(page) {
  page.on("pageerror", (e) => faults.push(e.message));
  page.on("console", (m) => {
    if (m.text().includes("3D rendering unavailable")) console.error(m.text());
  });
  page.on("response", (r) => {
    if (new URL(r.url()).origin === origin && r.status() >= 400)
      faults.push(r.status() + " " + r.url());
  });
}
const page = await context.newPage();
observe(page);
const waitText = (p, selector, value, timeout = 15000) =>
  p.waitForFunction(
    ([id, text]) => document.querySelector(id)?.textContent === text,
    [selector, value],
    { timeout, polling: 100 },
  );
async function ready(p, mode = "3d") {
  await p.waitForFunction(() => document.querySelector("#stage")?.dataset.render,
    undefined, { timeout: 60000, polling: 100 });
  assert.equal(
    await p.locator("#stage").getAttribute("data-render"),
    mode,
    "Expected the selected race renderer",
  );
}
const tickets = [];
async function prepare(p, market, first, second) {
  await p.locator('[data-market="' + market + '"]').click();
  await p.locator("#pick").selectOption(String(first));
  if (second !== undefined)
    await p.locator("#second").selectOption(String(second));
  await p.locator('[data-stake="10"]').click();
  const price = Number(
    (await p.locator("#price").innerText()).replace("×", ""),
  );
  const picks = second === undefined ? [first] : [first, second];
  tickets.push({ market, picks, price });
}
async function ticket(p, market, first, second) {
  await prepare(p, market, first, second);
  await p.locator("#confirm").click();
}
try {
  if (!realtime) await context.clock.setFixedTime(now);
  await page.goto(base);
  await ready(page);
  console.log("Primary 3D renderer:", await page.evaluate(() => {
    const gl = document.querySelector("#race-canvas").getContext("webgl2");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }));
  await waitText(page, "#subject-label", "亮相圈");
  assert(await page.locator("#race-report").isHidden());
  await page.locator('[data-cam="radar"]').click();
  assert(await page.locator("#race-map").isVisible());
  await page.selectOption(".quick-focus","2");
  await waitText(page, "#hero-bib", "03");
  await page.locator('[data-cam="track"]').click();
  await page.selectOption(".quick-focus","0");
  await waitText(page, "#balance", "1,000");
  await page.locator("#stake").fill("1010");
  assert(await page.locator("#confirm").isDisabled());
  await page.locator('[data-stake="50"]').click();
  await page.locator("#confirm").click();
  await waitText(page, "#balance", "950");
  await page.locator("[data-cancel]").click();
  await waitText(page, "#balance", "1,000");
  const peer = await context.newPage();
  observe(peer);
  // Exercise the same wallet across WebGL and the supported live-radar fallback.
  const dual = process.env.TURFLINE_DUAL_3D === "1";
  if (!dual)
    await peer.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : get.call(this, type, ...args);
      };
    });
  await peer.goto(base);
  await ready(peer, dual ? "3d" : "2d");
  console.log("Both race tabs loaded; second renderer:", dual ? "3d" : "2d");
  await prepare(page, "win", 0);
  await prepare(peer, "win", 1);
  await Promise.all([page.locator("#confirm").click(), peer.locator("#confirm").click()]);
  await waitText(page, "#balance", "980");
  await waitText(peer, "#ticket-count", "2 張");
  for (let i = 2; i < 6; i++) {
    await ticket(page, "win", i);
    await waitText(page, "#ticket-count", i + 1 + " 張");
  }
  await ticket(page, "place", 1);
  await waitText(page, "#ticket-count", "7 張");
  await ticket(page, "pair", 0, 1);
  await waitText(page, "#balance", "920");
  console.log("Eight tickets posted across both tabs.");
  await page.locator("#start").click();
  await waitText(peer, "#phase", "賽事進行中");
  await waitText(page, "#subject-label", "TRACKING");
  assert(await peer.locator("#bet-form").isHidden());
  assert.equal(await peer.locator("[data-cancel]").count(), 0);
  await page.locator("#speed").click();
  await waitText(page, "#speed", "轉播 2×");
  await page.locator('[data-cam="auto"]').click();
  await page.locator('#order-runners [data-runner="4"]').click();
  await page.reload();
  await ready(page);
  await waitText(page, "#hero-bib", "05");
  assert.equal(await page.locator('[data-cam="auto"]').getAttribute("aria-pressed"), "true");
  await waitText(peer, "#hero-bib", "01");
  await waitText(page, "#balance", "920");
  await waitText(page, "#ticket-count", "8 張");
  if (!realtime) {
    assert.equal(await page.locator('#report-moments [data-reached="true"]').count(), 0);
    assert.equal(await page.locator('#report-moments button:enabled').count(), 0);
    await context.clock.setFixedTime(now + 11000);
    await page.locator("#stage").scrollIntoViewIfNeeded();
    await waitText(page, "#cam-label", "導播　/　FIELD WIDE");
    await context.clock.setFixedTime(now + 18000);
    await waitText(page, "#cam-label", "導播　/　TELEPHOTO");
    assert.equal(await page.locator('#report-moments [data-reached="true"]').count(), 1);
    assert.match(await page.locator("#report-call").innerText(), /出閘搶位/);
  }
  for (const [cam, num] of [
    ["radar", 3],
    ["pack", 5],
    ["rider", 2],
    ["aerial", 3],
    ["tele", 6],
    ["track", 2],
  ]) {
    await page.locator('[data-cam="' + cam + '"]').click();
    await page.locator(".quick-focus").selectOption(String(num - 1));
    assert.equal(await page.locator("#race-map").isVisible(), cam === "radar");
    assert.equal(
      await page.locator("#hero-bib").innerText(),
      String(num).padStart(2, "0"),
    );
    assert.equal(
      await page
        .locator('[data-cam="' + cam + '"]')
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  await page.locator("#full").click();
  assert(
    await page.evaluate(
      () =>
        !!document.fullscreenElement ||
        document.querySelector("#stage").classList.contains("expanded"),
    ),
  );
  await page.locator('#stage #order-runners [data-runner="3"]').click();
  await waitText(page, "#hero-bib", "04");
  await page.locator("#stage #sound").click();
  await waitText(page, "#sound", "音效 開");
  assert.equal(await peer.locator("#sound").getAttribute("aria-pressed"), "false");
  await waitText(peer, "#hero-bib", "01");
  await page.locator("#full").click();
  await page.locator(".live-controls #sound").click();
  await waitText(page, "#sound", "音效 關");
  assert.equal(await page.locator("#field-body tr").count(), 6);
  if (!realtime) await context.clock.setFixedTime(now + 100000);
  await waitText(page, "#phase", "賽事完成", 80000);
  await waitText(peer, "#phase", "賽事完成", 80000);
  console.log("Finish received in both tabs.");
  const order = await page
    .locator("#field-body tr")
    .evaluateAll((rows) => rows.map((tr) => Number(tr.dataset.i)));
  assert.deepEqual(await page.locator("#order-runners button").evaluateAll(
    (buttons) => buttons.map((b) => Number(b.dataset.runner))), order);
  const total = tickets.reduce((sum, t) => {
    const won =
      t.market === "win"
        ? order[0] === t.picks[0]
        : t.picks.every((i) => order.slice(0, 2).includes(i));
    return sum + (won ? Math.round(t.price * 10) : 0);
  }, 0);
  const expected = (920 + total).toLocaleString("zh-HK");
  await waitText(page, "#balance", expected);
  await waitText(peer, "#balance", expected);
  await page.reload();
  await ready(page);
  await waitText(page, "#balance", expected);
  await waitText(page, "#hero-bib", "04");
  const moments = page.locator("#report-moments button");
  assert.equal(await page.locator("#report-moments button:enabled").count(), 4);
  const stretchLeader = await moments.nth(1).locator(".moment-leader").innerText();
  await moments.nth(1).click();
  await waitText(page, "#phase", "分段精華");
  await waitText(page, "#hero-name", stretchLeader);
  assert.equal(await page.locator("#stage").getAttribute("data-shot"), "aerial");
  const scrub = page.locator("#replay-scrub");
  assert.equal(Number(await scrub.getAttribute("max")) - Number(await scrub.getAttribute("min")), 5);
  await page.locator("#moment-picker").selectOption("3");
  await waitText(page, "#hero-bib", String(order[0] + 1).padStart(2, "0"));
  await waitText(page, "#cam-label", "CAM 01　/　TRACKSIDE");
  await waitText(peer, "#live-status", "RESULT");
  await page.locator("#replay-exit").click();
  await waitText(page, "#hero-bib", "04");
  await waitText(page, "#balance", expected);
  await page.locator("#watch-replay").click();
  await waitText(page, "#live-status", "REPLAY");
  await waitText(peer, "#live-status", "RESULT");
  await page.locator("#replay-rate").selectOption("0.25");
  await page.locator("#replay-line").click();
  await waitText(page, "#replay-play", "播放");
  await waitText(page, "#hero-bib", String(order[0] + 1).padStart(2, "0"));
  await waitText(page, "#cam-label", "CAM 04　/　FINISH LINE");
  assert.equal(await page.locator("#replay-time").innerText(),
    await page.locator('[data-gap="' + order[0] + '"]').innerText());
  await page.selectOption("#crossing-rank",String(order[1]));
  await waitText(page, "#bug-distance", "第 2 名過線");
  await waitText(page, "#hero-bib", String(order[1]+1).padStart(2,"0"));
  assert.equal(await page.locator("#replay-time").innerText(),await page.locator('[data-gap="'+order[1]+'"]').innerText());
  await page.locator("#finish-nose").waitFor({state:"visible"});
  await waitText(peer, "#balance", expected);
  await page.locator("#replay-scrub").focus();
  await page.keyboard.press("Home");
  await page.locator("#replay-play").click();
  await waitText(page, "#replay-play", "暫停");
  await page.locator("#full").click();
  assert(await page.locator("#stage #replay-exit").isVisible());
  await page.locator("#replay-scope").selectOption("stride");
  await waitText(page, "#phase", "步姿慢鏡");
  await page.locator("#next-hoof").click();
  await page.selectOption("#replay-change","0");
  await waitText(page, "#subject-label", "右前蹄着地 · 換右腳");
  await page.selectOption("#replay-change","1");
  await waitText(page, "#subject-label", "左前蹄着地 · 換左腳");
  const footTime = await page.locator("#replay-time").innerText();
  await page.locator("#previous-hoof").click();
  assert.notEqual(await page.locator("#replay-time").innerText(), footTime);
  await page.locator("#next-hoof").click();
  await waitText(page, "#replay-time", footTime);
  await page.locator("#hoof-mark").waitFor({ state: "visible" });
  await page.locator("#replay-scope").selectOption("full");
  await waitText(page, "#phase", "全場重播");
  assert.equal(await page.locator("#replay-scrub").getAttribute("min"), "-3");
  await page.locator("#replay-scrub").focus();
  await page.keyboard.press("Home");
  await waitText(page, "#replay-time", "−0:03.00");
  await waitText(page, "#countdown", "3");
  await page.locator("#replay-scope").selectOption("pullup");
  await waitText(page, "#phase", "過線收步");
  await page.locator("#replay-scrub").focus();
  await page.keyboard.press("End");
  await waitText(page, "#replay-play", "再播");
  await waitText(peer, "#live-status", "RESULT");
  await page.locator("#replay-exit").click();
  await waitText(page, "#live-status", "RESULT");
  await waitText(page, "#hero-bib", "04");
  await page.locator("#full").click();
  await waitText(page, "#balance", expected);
  await page.locator("#history-button").click();
  assert.equal(await page.locator(".history-row").count(), 1);
  await page.locator("#close").click();
  await peer.locator("#report-moments button").nth(2).click();
  await waitText(peer, "#phase", "分段精華");
  await waitText(peer, "#subject-label", "最後 200 米");
  assert.equal(await peer.locator("#race-map").isVisible(), !dual);
  await peer.locator("#replay-exit").click();
  await peer.locator("#watch-replay").click();
  await peer.locator("#replay-scope").selectOption("full");
  await peer.locator("#replay-line").click();
  await waitText(peer, "#replay-play", "播放");
  await page.locator("#next").click();
  await waitText(page, "#meet-number", "R02");
  await waitText(page, "#ticket-count", "0 張");
  await waitText(peer, "#meet-number", "R02");
  assert(await page.locator("#order-strip").isHidden());
  assert(await page.locator("#race-report").isHidden());
  assert(await peer.locator("#replay-deck").isHidden());
  await page.locator('[data-price="place"][data-runner="4"]').click();
  assert.equal(await page.locator("#pick").inputValue(), "4");
  assert.equal(await page.locator('[data-market="place"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#form-guide .form-rank").innerText(), String(order.indexOf(4) + 1));
  await waitText(page, "#ticket-count", "0 張");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth === innerWidth,
    ),
  );
  await page.locator('[data-market="pair"]').click();
  await page.locator("#pick").selectOption("4");
  assert.notEqual(await page.locator("#second").inputValue(), "4");
  assert.equal(await page.locator("#form-guide .form-rank").count(), 2);
  await page.locator("#rules-button").click();
  assert(await page.locator("#dialog").isVisible());
  await page.locator("#close").click();
  await peer.close();
  await page.locator('nav a[href*="studio.html"]').click();
  await page.waitForSelector("#stage[data-ready=true]", {
    state: "attached",
    timeout: 60000,
  });
  await page.locator('[data-model-key="ranch"]').click();
  await page.waitForSelector('#stage[data-model="ranch"]', { timeout: 40000 });
  assert.equal(await page.locator("#hero-bib").innerText(), "01");
  assert.deepEqual(faults, []);
  console.log(
    "PASS: 3D, concurrent bets, official settlement, independent finish replay, freeze at winning time, fullscreen playback, race-card odds, form, cross-tab next race, mobile and model studio.",
    JSON.stringify({
      order: order.map((i) => i + 1),
      stake: 80,
      paid: total,
      balance: expected,
      realtime,
    }),
  );
} catch (error) {
  for (const p of context.pages()) {
    const state = await p.evaluate(() => ({
      title: document.title, visibility: document.visibilityState,
      renderer: document.querySelector("#stage")?.dataset.render,
      phase: document.querySelector("#phase")?.textContent,
      tickets: document.querySelector("#ticket-count")?.textContent,
      balance: document.querySelector("#balance")?.textContent,
    })).catch(() => ({}));
    console.error("Last visible race state:", state);
  }
  const screenshot = path.join(os.tmpdir(), "turfline-smoke-failure.png");
  await page.screenshot({ path: screenshot, timeout: 5000 }).catch(() => {});
  console.error(
    "Smoke failure screenshot:",
    screenshot,
    "Browser errors:",
    faults,
  );
  throw error;
} finally {
  await browser.close();
}
