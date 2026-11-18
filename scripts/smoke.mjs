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
    { timeout },
  );
const ready = (p) =>
  p.waitForSelector('#stage[data-render="3d"]', { timeout: 60000 });
const tickets = [];
async function ticket(p, market, first, second) {
  await p.locator('[data-market="' + market + '"]').click();
  await p.locator("#pick").selectOption(String(first));
  if (second !== undefined)
    await p.locator("#second").selectOption(String(second));
  await p.locator('[data-stake="10"]').click();
  const price = Number(
    (await p.locator("#price").innerText()).replace("×", ""),
  );
  const picks = second === undefined ? [first] : [first, second];
  await p.locator("#confirm").click();
  tickets.push({ market, picks, price });
}
try {
  if (!realtime) await page.clock.setFixedTime(now);
  await page.goto(base);
  await ready(page);
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
  if (!realtime) await peer.clock.setFixedTime(now);
  await peer.goto(base);
  await ready(peer);
  await Promise.all([ticket(page, "win", 0), ticket(peer, "win", 1)]);
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
  await page.locator("#start").click();
  await waitText(peer, "#phase", "賽事進行中");
  assert(await peer.locator("#bet-form").isHidden());
  assert.equal(await peer.locator("[data-cancel]").count(), 0);
  await page.locator("#speed").click();
  await waitText(page, "#speed", "轉播 2×");
  await page.reload();
  await ready(page);
  await waitText(page, "#balance", "920");
  await waitText(page, "#ticket-count", "8 張");
  if (!realtime) await page.clock.setFixedTime(now + 18000);
  for (const [cam, num] of [
    ["aerial", 3],
    ["tele", 6],
    ["track", 2],
  ]) {
    await page.locator('[data-cam="' + cam + '"]').click();
    await page.locator(".quick-focus").selectOption(String(num - 1));
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
  await page.locator("#full").click();
  assert.equal(await page.locator("#field-body tr").count(), 6);
  if (!realtime)
    await Promise.all([
      page.clock.setFixedTime(now + 100000),
      peer.clock.setFixedTime(now + 100000),
    ]);
  await waitText(page, "#phase", "賽事完成", 80000);
  await waitText(peer, "#phase", "賽事完成", 80000);
  const order = await page
    .locator("#field-body tr")
    .evaluateAll((rows) => rows.map((tr) => Number(tr.dataset.i)));
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
  await page.locator("#history-button").click();
  assert.equal(await page.locator(".history-row").count(), 1);
  await page.locator("#close").click();
  await page.locator("#next").click();
  await waitText(page, "#meet-number", "R02");
  await waitText(page, "#ticket-count", "0 張");
  await waitText(peer, "#meet-number", "R02");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth === innerWidth,
    ),
  );
  await page.locator('[data-market="pair"]').click();
  await page.locator("#pick").selectOption("4");
  assert.notEqual(await page.locator("#second").inputValue(), "4");
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
    "PASS: 3D, concurrent betting, cancellation, 3 markets, closing, reload, 3 cameras, fullscreen, single settlement, balance, history, next race, mobile and model studio.",
    JSON.stringify({
      order: order.map((i) => i + 1),
      stake: 80,
      paid: total,
      balance: expected,
      realtime,
    }),
  );
} catch (error) {
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
