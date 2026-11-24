// 체육관 기록(라운드·KO 수)을 처음으로 되돌림 — 테스트 후 정리용
// node tools/reset-gym.js  (BASE=주소, KEY=열쇠 — 기본은 faces-src/KEY.txt)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'https://cheon-jaeryong.github.io/sandbag/';
const KEY = process.env.KEY || fs.readFileSync(path.join(__dirname, '..', 'faces-src', 'KEY.txt'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  await page.goto(BASE + '#k=' + KEY, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 30000 });
  await page.fill('#nameIn', '관리자');
  await page.click('#startBtn');
  await page.waitForFunction(() => window.__sb.net && window.__sb.net.count() > 0, null, { timeout: 20000 });
  await sleep(2500);
  const first = await page.evaluate(() => window.__sb.faces[0].id);
  await page.evaluate(f => { const G = window.__sb.G; G.round = 1; G.kos = 0; G.hp = 1500; window.__sb.net.setState({ round: 1, face: f, kos: 0, hp: 1500, reset: true }); }, first);
  await sleep(2500);
  const info = await page.evaluate(() => ({ faces: window.__sb.faces.map(f => f.id + ':' + f.src), net: window.__sb.net.count() }));
  console.log('초기화 완료', info);
  if (process.env.SHOT) await page.screenshot({ path: path.join(__dirname, 'shots', 'live.png') });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
