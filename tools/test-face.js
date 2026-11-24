// 얼굴 추가 테스트: A가 설정 → 얼굴 추가(사진 고르기 → 눈·눈·입 찍기 → 저장) → B 화면에도 같은 얼굴이 생기는지
// 사진: PHOTO=경로 또는 faces-src/faces.json 의 첫 얼굴(점 위치도 거기서). 테스트용 새 열쇠 사용
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/';
const KEY = crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'faces-src', 'faces.json'), 'utf8').replace(/^\uFEFF/, ''));
const PHOTO = process.env.PHOTO || path.join(cfg.source, cfg.faces[0].file);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ✅ ' : '  ❌ ') + msg); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = async (name) => {
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 760 } })).newPage();
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.goto(BASE + '#k=' + KEY, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 30000 });
    await page.fill('#nameIn', name); await page.click('#startBtn');
    return page;
  };
  const A = await mk('올린사람'), B = await mk('보는사람');
  await sleep(3000);
  await A.click('#btnSettings');
  await A.click('#faceAdd');
  await A.setInputFiles('.editor input[type=file]', PHOTO);
  await A.waitForSelector('.ed-step[data-s="1"]:not([hidden])');
  await sleep(500);
  // 사진 속 눈·눈·입 위치(원본 픽셀) → 화면 좌표로 바꿔 탭
  const pts = [cfg.faces[0].eL, cfg.faces[0].eR, cfg.faces[0].m];
  for (const p of pts) {
    const xy = await A.evaluate(([px, py]) => {
      const cv = document.querySelector('.ed-view canvas'); const r = cv.getBoundingClientRect();
      // editor 내부 view 상태는 감춰져 있으니 같은 계산(맞춤)으로 구함
      const img = new Image(); return null;
    }, p);
  }
  // 편집기 내부 상태를 이용해 정확한 위치 계산
  const taps = await A.evaluate((pts) => {
    const cv = document.querySelector('.ed-view canvas'); const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    // fit 규칙: 원본(최대 2200px로 줄임)을 캔버스에 맞춤
    return { w: cv.width, h: cv.height, rw: r.width, rh: r.height, left: r.left, top: r.top, dpr };
  }, pts);
  const iw = 1440, ih = 3067, k = Math.min(1, 2200 / Math.max(iw, ih));
  const W = iw * k, H = ih * k;
  const s = Math.min(taps.w / W, taps.h / H), ox = (taps.w - W * s) / 2, oy = (taps.h - H * s) / 2;
  for (const [px, py] of pts) {
    const cx = (px * k * s + ox) / taps.dpr + taps.left, cy = (py * k * s + oy) / taps.dpr + taps.top;
    await A.mouse.click(cx, cy); await sleep(150);
  }
  await A.screenshot({ path: path.join(out, 'face-1-marks.png') });
  await A.click('[data-next]');
  await sleep(300);
  await A.fill('[data-name]', '테스트얼굴');
  await A.screenshot({ path: path.join(out, 'face-2-mask.png') });
  const nA0 = await A.evaluate(() => window.__sb.faces.length);
  await A.click('[data-save]');
  await sleep(1500);
  const a = await A.evaluate(() => ({ n: window.__sb.faces.length, cur: window.__sb.G.faceId, names: window.__sb.faces.map(f => f.name) }));
  ok(a.n >= 1 && a.names.includes('테스트얼굴'), `A에 새 얼굴 (${a.names.join(',')}) 처음 ${nA0}개`);
  await A.keyboard.press('Escape');
  await A.evaluate(() => { document.getElementById('settings').hidden = true; });
  let b;
  for (let i = 0; i < 20; i++) { b = await B.evaluate(() => ({ n: window.__sb.faces.length, cur: window.__sb.G.faceId, names: window.__sb.faces.map(f => f.name) })); if (b.names.includes('테스트얼굴') && b.cur === a.cur) break; await sleep(500); }
  ok(b.names.includes('테스트얼굴'), `B에도 새 얼굴 도착 (${b.names.join(',')})`);
  ok(b.cur === a.cur, 'B도 같은 얼굴로 바뀜');
  await sleep(1500);
  await A.screenshot({ path: path.join(out, 'face-3-A.png') });
  await B.screenshot({ path: path.join(out, 'face-4-B.png') });
  // 지우기
  await A.evaluate(id => { document.getElementById('settings').hidden = false; }, null);
  await A.evaluate(() => window.__sb.net.delFace(window.__sb.G.faceId));
  // 열쇠 없는 사람(다른 체육관)은 못 봄 — 같은 체육관 토픽에 다른 열쇠로는 복호화 불가
  ok(!A.errs.length && !B.errs.length, '오류 없음 ' + A.errs.concat(B.errs).join(' | '));
  await browser.close();
  console.log(fails ? `실패 ${fails}개` : '모두 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
