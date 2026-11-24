// 바로가기 아이콘(🥊) 그리기 → shortcut/icon.png
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">
  <div style="width:256px;height:256px;border-radius:56px;background:radial-gradient(circle at 35% 30%,#ff6a3d,#c8102e 60%,#6e0a1c);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.12) 0 6deg,transparent 6deg 18deg)"></div>
    <span style="font-size:170px;line-height:1;position:relative;filter:drop-shadow(0 8px 6px rgba(0,0,0,.45));transform:rotate(-12deg)">🥊</span>
  </div></body></html>`);
  await p.screenshot({ path: path.join(__dirname, '..', 'shortcut', 'icon.png'), omitBackground: true });
  await b.close();
})();
