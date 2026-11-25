// 화면 캡처 테스트: node tools/shot.js [보기모드]  → tools/shots/*.png
// BASE=주소 (기본 http://127.0.0.1:8777/), KEY=열쇠(기본 faces-src/KEY.txt), W/H 화면 크기, MOBILE=1
// OFFLINE=1 → 인터넷(MQTT) 막음: 진짜 열쇠로 KO까지 해도 실제 체육관 기록이 안 바뀜
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/';
const keyFile = path.join(__dirname, '..', 'faces-src', 'KEY.txt');
const KEY = process.env.KEY ?? (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '');
const W = +(process.env.W || 1280), H = +(process.env.H || 800);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1), isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE });
  if (process.env.OFFLINE) await ctx.addInitScript(() => {
    window.WebSocket = class { constructor() { this.readyState = 3; setTimeout(() => { this.onerror && this.onerror(new Event('error')); this.onclose && this.onclose(new CloseEvent('close')); }, 50); } send() {} close() {} addEventListener() {} removeEventListener() {} };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const url = BASE + (KEY ? '#k=' + KEY : '#pub');
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 30000 });
  await sleep(800);
  const tag = process.env.TAG || 'pc';
  await page.screenshot({ path: path.join(out, tag + '-0-start.png') });
  await page.fill('#nameIn', '테스터');
  await page.click('#startBtn');
  await sleep(1500);
  await page.screenshot({ path: path.join(out, tag + '-1-game.png') });
  const plan = (process.env.PLAN || 'punch,kick,slap,knuckle,pinch,flick,hammer,tickle').split(',');
  // 인형 얼굴/몸의 화면 좌표
  // 'head' → 얼굴 사진 (u,v) 자리, 'body' → 이름 있는 몸 자리(gut/chest/sideL/sideR/thigh)
  const spot = async (part, a, b) => page.evaluate(([part, a, b]) => {
    const sb = window.__sb; const t = part === 'head' ? sb.dummy.headSpotUV(a, b) : sb.dummy.spot(a);
    const p = t.point.clone().project(sb.stage.camera); const s = sb.stage.size;
    return [(p.x + 1) / 2 * s.w, (1 - p.y) / 2 * s.h];
  }, [part, a, b]);
  let i = 2;
  for (const tool of plan) {
    await page.evaluate(t => window.__sb.selectTool(t), tool);
    const [fx, fy] = await spot('head', 0.6, 0.6);
    const [bx, by] = await spot('body', 'gut');
    const target = tool === 'kick' ? [bx, by] : [fx, fy];
    if (tool === 'pinch') {
      await page.mouse.move(fx, fy); await page.mouse.down();
      for (let k = 1; k <= 8; k++) { await page.mouse.move(fx + k * 18, fy + k * 4); await sleep(40); }
      await sleep(300);
      await page.screenshot({ path: path.join(out, `${tag}-${i++}-${tool}-hold.png`) });
      await page.mouse.up();
      await sleep(120);
      await page.screenshot({ path: path.join(out, `${tag}-${i++}-${tool}-after.png`) });
    } else if (tool === 'tickle') {
      await page.mouse.move(bx, by); await page.mouse.down(); await sleep(700);
      await page.screenshot({ path: path.join(out, `${tag}-${i++}-${tool}.png`) });
      await page.mouse.up();
    } else {
      await page.mouse.click(target[0], target[1]);
      const n = +(process.env.BURST || 1);
      for (let b = 0; b < n; b++) {
        await sleep(+(process.env.DELAY || 160));
        await page.screenshot({ path: path.join(out, `${tag}-${i}-${tool}${n > 1 ? '-' + b : ''}.png`) });
      }
      i++;
    }
    await sleep(+(process.env.GAP || 1200));
  }
  if (process.env.DEMPSEY) {
    await page.evaluate(() => { window.__sb.G.gauge = 100; window.__sb.setDempsey(true); });
    await sleep(500);
    for (let k = 0; k < 4; k++) { await page.mouse.click(W / 2, H / 2); await sleep(260); }
    await page.screenshot({ path: path.join(out, `${tag}-${i++}-dempsey.png`) });
    await page.evaluate(() => window.__sb.startSuper());
    await sleep(1500);
    await page.screenshot({ path: path.join(out, `${tag}-${i++}-super.png`) });
    await sleep(3000);
    await page.screenshot({ path: path.join(out, `${tag}-${i++}-super-end.png`) });
  }
  if (process.env.KO) {
    await page.evaluate(() => { const sb = window.__sb; sb.G.hp = 5; sb.selectTool('punch'); });
    const [fx, fy] = await spot('head', 0.55, 0.6);
    await page.mouse.click(fx, fy); await sleep(150); await page.mouse.click(fx, fy);
    for (let k = 0; k < 4; k++) { await sleep(800); await page.screenshot({ path: path.join(out, `${tag}-${i}-ko-${k}.png`) }); }
    i++;
    await sleep(2500);
    await page.screenshot({ path: path.join(out, `${tag}-${i++}-next.png`) });
  }
  console.log(JSON.stringify(await page.evaluate(() => ({ hp: window.__sb.G.hp, round: window.__sb.G.round, face: window.__sb.G.faceId, faces: window.__sb.faces.length, net: window.__sb.net && window.__sb.net.count() }))));
  console.log(errs.filter(e => !/GPU stall|WebGL|swiftshader|GL Driver/i.test(e)).join('\n') || '오류 없음');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
