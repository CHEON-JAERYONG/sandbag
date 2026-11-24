// 온라인 테스트: 창 2개(PC + 폰)가 같은 체육관에 들어가 서로의 타격·체력·KO·얼굴 바꾸기가 맞는지 확인
// 실제 공개 중계 서버 사용. 기본은 테스트용 새 열쇠(실제 체육관 기록을 안 건드림)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/';
const KEY = process.env.KEY || crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ✅ ' : '  ❌ ') + msg); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = async (name, vp, mobile) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', e => page.errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
    await page.goto(BASE + '#k=' + KEY, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 90000 });
    await page.fill('#nameIn', name);
    await page.click('#startBtn');
    return page;
  };
  console.log('체육관 열쇠(테스트):', KEY);
  const A = await mk('철수', { width: 1100, height: 720 }, false);
  const B = await mk('영희폰', { width: 390, height: 844 }, true);
  const st = p => p.evaluate(() => ({ hp: window.__sb.G.hp, round: window.__sb.G.round, face: window.__sb.G.faceId, kos: window.__sb.G.kos, n: document.getElementById('onlineN').textContent, net: window.__sb.net.count() }));
  // 서로 보일 때까지
  let t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const [a, b] = [await st(A), await st(B)];
    if (a.n === '2' && b.n === '2') break;
    await sleep(500);
  }
  let a = await st(A), b = await st(B);
  console.log('접속:', a, b);
  ok(a.n === '2' && b.n === '2', `서로 보임 (A:${a.n}명, B:${b.n}명)`);

  // A가 진짜 클릭으로 펀치 4번
  const spot = (p, part, x, y, z) => p.evaluate(([part, x, y, z]) => {
    const sb = window.__sb; const v = sb.dummy.worldOf(part, new sb.THREE.Vector3(x, y, z)).project(sb.stage.camera);
    const s = sb.stage.size; return [(v.x + 1) / 2 * s.w, (1 - v.y) / 2 * s.h];
  }, [part, x, y, z]);
  for (let i = 0; i < 4; i++) { const [x, y] = await spot(A, 'head', 0.1, -0.1, 0.5); await A.mouse.click(x, y); await sleep(450); }
  // B가 화면 터치로 꿀밤 2번
  await B.evaluate(() => window.__sb.selectTool('knuckle'));
  for (let i = 0; i < 2; i++) { const [x, y] = await spot(B, 'head', 0, 0.4, 0.3); await B.touchscreen.tap(x, y); await sleep(700); }
  await sleep(2500);
  a = await st(A); b = await st(B);
  console.log('타격 후:', a.hp, b.hp);
  ok(a.hp < 1500 && Math.abs(a.hp - b.hp) < 1, `두 화면 체력 같음 (A ${a.hp} / B ${b.hp})`);
  await A.screenshot({ path: path.join(out, 'on-A-hit.png') });
  await B.screenshot({ path: path.join(out, 'on-B-hit.png') });

  // A가 막타 → 둘 다 KO → 다음 라운드
  const r0 = a.round;
  await A.evaluate(() => { const sb = window.__sb; sb.myHit({ tool: 'kick', part: 'body', lp: new sb.THREE.Vector3(0.2, 1, 0.4), dir: new sb.THREE.Vector3(0, 0, -1), power: 6, dmg: 5000, crit: true }); });
  await sleep(1200);
  await B.screenshot({ path: path.join(out, 'on-B-ko.png') });
  await sleep(5500);
  a = await st(A); b = await st(B);
  console.log('KO 후:', a, b);
  ok(a.round === r0 + 1 && b.round === r0 + 1, `둘 다 다음 라운드 (A ${a.round} / B ${b.round})`);
  ok(a.kos === b.kos && a.kos >= 1, `KO 수 같음 (${a.kos} / ${b.kos})`);
  ok(a.hp === 1500 && b.hp === 1500, '체력 다시 가득');

  // 늦게 들어온 사람 C: 라운드/얼굴 따라오는지
  const C = await mk('민수', { width: 800, height: 600 }, false);
  await sleep(6000);
  const c = await st(C);
  console.log('C:', c);
  ok(c.round === a.round, `늦게 온 사람도 같은 라운드 (${c.round})`);
  ok(c.n === '3', `3명 보임 (${c.n})`);

  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) ok(!p.errs.length, `${n} 오류 없음 ${p.errs.slice(0, 3).join(' | ')}`);
  await browser.close();
  console.log(fails ? `실패 ${fails}개` : '모두 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
