// 얼굴 추가 화면: 사진 고르기 → 왼쪽 눈 · 오른쪽 눈 · 입 콕 찍기(확대·이동 가능) → 얼굴 테두리 조절 → 저장
import { normalizePhoto } from './faces.js?v=1.1.0';

const STEPS = ['👁 사진에서 <b>왼쪽 눈</b> 가운데를 누르세요', '👁 이제 <b>오른쪽 눈</b> 가운데를 누르세요', '👄 마지막으로 <b>입</b> 가운데를 누르세요', '✅ 점을 끌어서 고칠 수 있어요. 다 됐으면 <b>다음</b>'];
const COLORS = ['#38e1ff', '#38e1ff', '#ff4d8d'];

export function openEditor({ onSave }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal editor';
  wrap.innerHTML = `
  <div class="sheet">
    <div class="sheet-head"><h3>😈 얼굴 추가</h3><button class="x" data-x>✕</button></div>
    <div class="ed-step" data-s="0">
      <p class="hint">때리고 싶은 사람 얼굴이 나온 사진을 고르세요. 사진은 이 체육관 열쇠로 잠가서 올라가요.</p>
      <label class="bigbtn">📷 사진 고르기<input type="file" accept="image/*" hidden></label>
    </div>
    <div class="ed-step" data-s="1" hidden>
      <p class="hint ed-msg"></p>
      <div class="ed-view"><canvas></canvas>
        <div class="ed-zoom"><button data-z="1.4">＋</button><button data-z="0.7">－</button></div>
      </div>
      <div class="row"><button class="btn ghost" data-reset>다시 찍기</button><button class="btn" data-next disabled>다음 ▶</button></div>
    </div>
    <div class="ed-step" data-s="2" hidden>
      <div class="ed-prev"><canvas width="300" height="300"></canvas></div>
      <p class="hint">밝은 동그라미 안만 얼굴로 써요. 배경이나 다른 사람이 안 들어가게 맞춰 주세요.</p>
      <label class="sl">가로 <input type="range" min="0.18" max="0.36" step="0.005" data-m="2"></label>
      <label class="sl">세로 <input type="range" min="0.28" max="0.5" step="0.005" data-m="3"></label>
      <label class="sl">좌우 <input type="range" min="0.35" max="0.65" step="0.005" data-m="0"></label>
      <label class="sl">위아래 <input type="range" min="0.38" max="0.6" step="0.005" data-m="1"></label>
      <label class="sl name">이름 <input type="text" maxlength="10" placeholder="예: 김철수" data-name></label>
      <div class="row"><button class="btn ghost" data-back>◀ 점 다시</button><button class="btn hot" data-save>💾 저장하고 때리기</button></div>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  const q = s => wrap.querySelector(s);
  const close = () => wrap.remove();
  q('[data-x]').onclick = close;
  const show = n => wrap.querySelectorAll('.ed-step').forEach(el => { el.hidden = +el.dataset.s !== n; });

  let img = null, pts = [], view = { s: 1, x: 0, y: 0 }, dragIdx = -1, norm = null;
  const mask = [0.5, 0.48, 0.28, 0.42];
  const cv = q('.ed-view canvas'), g = cv.getContext('2d');

  q('input[type=file]').onchange = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      // 너무 큰 사진은 줄여서 다룸
      const max = 2200, k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      img = c; pts = [];
      URL.revokeObjectURL(url);
      show(1); fit(); msg(); draw();
    };
    im.src = url;
  };
  function msg() { q('.ed-msg').innerHTML = STEPS[Math.min(3, pts.length)]; q('[data-next]').disabled = pts.length < 3; }
  function fit() {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    view.s = Math.min(cv.width / img.width, cv.height / img.height);
    view.x = (cv.width - img.width * view.s) / 2; view.y = (cv.height - img.height * view.s) / 2;
  }
  const toImg = (cx, cy) => [(cx - view.x) / view.s, (cy - view.y) / view.s];
  const toCv = p => [p[0] * view.s + view.x, p[1] * view.s + view.y];
  function evPos(e) {
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  }
  function draw() {
    if (!img) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0e14'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, view.x, view.y, img.width * view.s, img.height * view.s);
    const dpr = cv.width / cv.getBoundingClientRect().width;
    pts.forEach((p, i) => {
      const [x, y] = toCv(p);
      g.lineWidth = 3 * dpr; g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, 11 * dpr, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = COLORS[i]; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(x, y, 11 * dpr, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 5 * dpr, y); g.lineTo(x + 5 * dpr, y); g.moveTo(x, y - 5 * dpr); g.lineTo(x, y + 5 * dpr); g.stroke();
      g.font = `bold ${12 * dpr}px sans-serif`; g.fillStyle = COLORS[i];
      g.fillText(['눈', '눈', '입'][i], x + 13 * dpr, y - 10 * dpr);
    });
  }
  // 터치: 한 손가락 = 이동(움직였을 때) 또는 점 찍기(그냥 누름), 두 손가락 = 확대
  const ptrs = new Map();
  let downAt = null, moved = false, pinch0 = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, evPos(e));
    if (ptrs.size === 1) {
      const p = evPos(e); downAt = p; moved = false;
      const dpr = cv.width / cv.getBoundingClientRect().width;
      dragIdx = pts.findIndex(pt => { const c = toCv(pt); return Math.hypot(c[0] - p[0], c[1] - p[1]) < 20 * dpr; });
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s, x: view.x, y: view.y, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      dragIdx = -1; moved = true;
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), p = evPos(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch0.c, pinch0.s * d / pinch0.d / view.s);
      draw(); return;
    }
    if (downAt && Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) > 8) moved = true;
    if (!moved) return;
    if (dragIdx >= 0) { pts[dragIdx] = toImg(p[0], p[1]); }
    else { view.x += p[0] - prev[0]; view.y += p[1] - prev[1]; }
    draw();
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      if (!moved && downAt && pts.length < 3 && dragIdx < 0) { pts.push(toImg(downAt[0], downAt[1])); msg(); draw(); }
      downAt = null; pinch0 = null; dragIdx = -1;
    }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(evPos(e), e.deltaY < 0 ? 1.15 : 1 / 1.15); draw(); }, { passive: false });
  function zoomAt(c, k) {
    const ns = Math.max(0.05, Math.min(20, view.s * k));
    const kk = ns / view.s;
    view.x = c[0] - (c[0] - view.x) * kk; view.y = c[1] - (c[1] - view.y) * kk; view.s = ns;
  }
  wrap.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zoomAt([cv.width / 2, cv.height / 2], +b.dataset.z); draw(); });
  q('[data-reset]').onclick = () => { pts = []; msg(); draw(); };
  q('[data-next]').onclick = () => {
    // 왼쪽/오른쪽 눈이 바뀌어 찍혔으면 바로잡기
    let [a, b, m] = pts;
    if (a[0] > b[0]) [a, b] = [b, a];
    norm = normalizePhoto(img, a, b, m, 384);
    mask[0] = 0.5; mask[1] = 0.48; mask[2] = 0.28; mask[3] = 0.42;
    wrap.querySelectorAll('[data-m]').forEach(s => { s.value = mask[+s.dataset.m]; });
    show(2); drawPrev();
  };
  wrap.querySelectorAll('[data-m]').forEach(s => s.oninput = () => { mask[+s.dataset.m] = +s.value; drawPrev(); });
  function drawPrev() {
    const pc = q('.ed-prev canvas'), pg = pc.getContext('2d'), S = pc.width;
    pg.clearRect(0, 0, S, S);
    pg.drawImage(norm.canvas, 0, 0, S, S);
    pg.save();
    pg.fillStyle = 'rgba(10,10,20,0.72)';
    pg.beginPath(); pg.rect(0, 0, S, S);
    pg.ellipse(mask[0] * S, mask[1] * S, mask[2] * S, mask[3] * S, 0, 0, Math.PI * 2, true);
    pg.fill('evenodd');
    pg.strokeStyle = '#ffd21f'; pg.lineWidth = 2; pg.setLineDash([6, 5]);
    pg.beginPath(); pg.ellipse(mask[0] * S, mask[1] * S, mask[2] * S, mask[3] * S, 0, 0, Math.PI * 2); pg.stroke();
    pg.restore();
  }
  q('[data-back]').onclick = () => { show(1); draw(); };
  q('[data-save]').onclick = async () => {
    const name = (q('[data-name]').value || '').trim().slice(0, 10) || '샌드백';
    const btn = q('[data-save]'); btn.disabled = true; btn.textContent = '저장 중…';
    try {
      await onSave({ name, img: norm.url, eyeL: norm.eyeL, eyeR: norm.eyeR, mouth: norm.mouth, mask: mask.map(v => +v.toFixed(3)) });
      close();
    } catch (e) { console.error(e); btn.disabled = false; btn.textContent = '💾 다시 저장'; alert('저장하지 못했어요: ' + e.message); }
  };
}
