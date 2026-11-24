// KO 쓰러짐 자세 확인: 물리를 직접 돌려서 캡처 (헤드리스는 느려서 실제 시간으로는 확인이 어려움)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8777/';
const KEY = process.env.KEY || fs.readFileSync(path.join(__dirname, '..', 'faces-src', 'KEY.txt'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  await p.goto(BASE + '#k=' + KEY, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 30000 });
  await p.evaluate(() => { document.getElementById('start').hidden = true; });
  const shots = [['stand', 0], ['gut', 1], ['ko-0.4s', 2], ['ko-1.5s', 3], ['ko-3s', 4], ['up', 5]];
  for (const [name, step] of shots) {
    await p.evaluate((step) => {
      const sb = window.__sb, d = sb.dummy, G = sb.G, T = sb.THREE;
      const run = (s) => { for (let i = 0; i < s * 60; i++) d.update(1 / 60); };
      if (step === 1) { const t = d.spot('gut'); d.hit({ part: 'body', lp: t.lp, dir: new T.Vector3(0, 0, -1), power: 5, dent: 1 }); d.flinch('gut', 0.8); run(0.25); }
      if (step === 2) { run(1); d.setKO(true); G.inKO = true; run(0.4); }
      if (step === 3) run(1.1);
      if (step === 4) run(1.5);
      if (step === 5) { d.setKO(false); G.inKO = false; run(1.6); }
    }, step);
    await sleep(900);
    await p.screenshot({ path: path.join(__dirname, 'shots', 'fall-' + name + '.png') });
  }
  await b.close();
})();
