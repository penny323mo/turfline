import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { newGame, start } from '../src/race.js';

const base = process.env.TURFLINE_URL || 'http://127.0.0.1:4174/';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const epoch = 1780000000000;
let seed = 58;
const random = () => (seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296;
const game = newGame(random);
start(game,epoch,random);
const browser = await chromium.launch({
  executablePath: process.env.TURFLINE_CHROME || (existsSync(chrome) ? chrome : undefined),
  args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({viewport: {width: 1050,height: 760}});
  await page.addInitScript(epoch => {
    window.rewindRace = seconds => {
      const start = performance.now();
      Date.now = () => Math.round(epoch+3000+seconds*1000+performance.now()-start);
    };
    window.rewindRace(29);
  },epoch);
  // Install the same six-runner race into a fresh browser profile.
  const fixture = new URL('__playback_fixture',base).href;
  await page.route(fixture,route => route.fulfill({contentType: 'text/html',body: '<title>Race setup</title>'}));
  await page.goto(fixture);
  await page.evaluate(record => new Promise((resolve,reject) => {
    const req = indexedDB.open('turfline-arcade',1);
    req.onupgradeneeded = () => req.result.createObjectStore('save');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('save','readwrite');
      tx.objectStore('save').put(record,'player');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }),game);
  await page.goto(base);
  await page.waitForSelector('#stage[data-render="3d"]');
  await page.selectOption('.quick-focus','5');
  console.log(await page.evaluate(() => {
    const gl = document.querySelector('#race-canvas').getContext('webgl2');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  }));
  for (const camera of ['track','rider','pack']) {
    await page.click('[data-cam="'+camera+'"]');
    await page.locator('#stage').scrollIntoViewIfNeeded();
    const fps = await page.evaluate(async () => {
      const stream = document.querySelector('#race-canvas').captureStream(60);
      const video = document.createElement('video');
      video.muted = video.playsInline = true;
      video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:.02;pointer-events:none';
      video.srcObject = stream;
      document.body.append(video);
      try {
        await video.play();
        window.rewindRace(29);
        await new Promise(resolve => setTimeout(resolve,1000));
        window.rewindRace(30);
        const samples = [];
        let callback;
        const presented = (time,frame) => {
          samples.push([time,frame.presentedFrames]);
          callback = video.requestVideoFrameCallback(presented);
        };
        callback = video.requestVideoFrameCallback(presented);
        await new Promise(resolve => setTimeout(resolve,5500));
        video.cancelVideoFrameCallback(callback);
        if (samples.length < 3) throw new Error('No sustained canvas playback');
        const first = samples[1], last = samples.at(-1);
        return 1000*(last[1]-first[1])/(last[0]-first[0]);
      } finally {
        stream.getTracks().forEach(track => track.stop());
        video.remove();
      }
    });
    console.log(camera,fps.toFixed(1)+' presented FPS');
    if (fps < Number(process.env.TURFLINE_MIN_FPS || 0)) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
