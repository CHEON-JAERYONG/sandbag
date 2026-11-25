// 얼굴: 비밀 열쇠(#k=…) 관리 · 암호화(AES-GCM, 브라우저 내장) · 기본 얼굴 묶음(faces/pack.bin) · 만화 얼굴 · 사진 정렬
// 열쇠가 있는 링크로 들어온 사람만 사진 얼굴이 보임. 저장소/중계 서버에는 암호화된 글자만 올라감.
import * as THREE from '../vendor/three.module.min.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
export { store };

const b64 = {
  enc(bytes) { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
  dec(str) { const s = atob(str), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
};
const b64u = {
  enc(bytes) { return b64.enc(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return b64.dec(str); }
};

/* ---------- 열쇠 ---------- */
export function readKey() {
  const m = location.hash.match(/k=([A-Za-z0-9_-]{16,64})/);
  if (m) { store.set('sb.key', m[1]); return m[1]; }
  if (/(^|[#&])pub(=|&|$)/.test(location.hash)) return null;
  const k = store.get('sb.key', null);
  if (k) { try { history.replaceState(null, '', location.pathname + location.search + '#k=' + k); } catch (e) { } }
  return k;
}
export function newKey() { return b64u.enc(crypto.getRandomValues(new Uint8Array(16))); }
export function forgetKey() { store.del('sb.key'); }
export async function gymIdOf(key) {
  if (!key) return 'pub';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sandbag:' + key)));
  return Array.from(h.slice(0, 6)).map(x => x.toString(16).padStart(2, '0')).join('');
}
async function aesKey(key) { return crypto.subtle.importKey('raw', b64u.dec(key), 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), new TextEncoder().encode(text)));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  return b64.enc(all);
}
export async function decryptText(key, data) {
  const all = b64.dec(data.trim());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(key), all.slice(12));
  return new TextDecoder().decode(pt);
}

/* ---------- 이미지 → 얼굴 ---------- */
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function avgColor(g, x, y, w, h, darkest) {
  const d = g.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], d[i] + d[i + 1] + d[i + 2]]);
  px.sort((a, b) => a[3] - b[3]);
  let list = px;
  if (darkest) list = px.slice(0, Math.max(1, Math.floor(px.length * darkest)));
  else list = px.slice(Math.floor(px.length * 0.2), Math.max(Math.floor(px.length * 0.2) + 1, Math.floor(px.length * 0.85)));
  const s = [0, 0, 0];
  for (const p of list) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
  return s.map(v => Math.round(v / list.length));
}
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export async function buildFace(rec) {
  const img = await loadImg(rec.img);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height;
  // 오려낸 투명도가 없는 사진(게임에서 추가한 얼굴)은 얼굴 타원으로 오려냄
  if (!rec.alpha) {
    const m = rec.mask || [0.5, 0.48, 0.28, 0.42];
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    const mg = mc.getContext('2d');
    mg.translate(m[0] * W, m[1] * H); mg.scale(m[2] * W, m[3] * H);
    const grd = mg.createRadialGradient(0, 0, 0.8, 0, 0, 1);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = grd; mg.beginPath(); mg.arc(0, 0, 1, 0, Math.PI * 2); mg.fill();
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mc, 0, 0); g.globalCompositeOperation = 'source-over';
  }
  const all = g.getImageData(0, 0, W, H).data;
  const alphaAt = (u, v) => all[(Math.min(H - 1, Math.max(0, Math.round(v * H))) * W + Math.min(W - 1, Math.max(0, Math.round(u * W)))) * 4 + 3];
  // 머리 꼭대기(가운데 줄에서 처음 보이는 곳)
  let topV = 0.1;
  for (let y = 0; y < H; y++) { let hit = false; for (let x = Math.round(W * 0.4); x < W * 0.6; x += 2) if (all[(y * W + x) * 4 + 3] > 128) { hit = true; break; } if (hit) { topV = y / H; break; } }
  // 머리(정수리~턱) 덩어리의 가로 가운데
  let sx = 0, sw = 0;
  const eyeY = (rec.eyeL[1] + rec.eyeR[1]) / 2;
  // 턱 끝: 기본 묶음은 사진에서 찍어 둔 값, 게임에서 추가한 얼굴은 눈·입 거리로 어림
  const chinV = rec.chin ? rec.chin[1] : Math.min(0.95, rec.mouth[1] + 0.48 * (rec.mouth[1] - eyeY));
  const y0 = Math.round(topV * H), y1 = Math.round(chinV * H);
  for (let y = y0; y < y1; y += 2) for (let x = 0; x < W; x += 2) { const a = all[(y * W + x) * 4 + 3]; if (a > 100) { sx += x * a; sw += a; } }
  const centerU = sw ? sx / sw / W : 0.5;
  const sk1 = avgColor(g, (rec.eyeL[0] - 0.04) * W, (rec.eyeL[1] + 0.1) * H, 0.08 * W, 0.06 * H);
  const sk2 = avgColor(g, (rec.eyeR[0] - 0.04) * W, (rec.eyeR[1] + 0.1) * H, 0.08 * W, 0.06 * H);
  let skin = sk1.map((v, i) => (v + sk2[i]) / 2);
  let hair = avgColor(g, 0.3 * W, 0.03 * H, 0.4 * W, 0.14 * H, 0.4);
  const hl = hair[0] + hair[1] + hair[2];
  if (hl > 150) hair = hair.map(v => v * 150 / hl);
  const tex = new THREE.Texture(c);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return {
    id: rec.id, name: rec.name || '샌드백', src: rec.src || 'pack', rec,
    eyeL: rec.eyeL, eyeR: rec.eyeR, mouth: rec.mouth, mask: rec.mask || [0.5, 0.48, 0.28, 0.42],
    skin: hex(skin), hair: hex(hair), tex, thumb: rec.img, alphaAt, topV, centerU, chinV
  };
}

/* ---------- 기본 만화 얼굴 (열쇠 없을 때) ---------- */
export function cartoonRecord() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // 얼굴형 + 귀 + 목
  g.fillStyle = '#f1c7a5';
  g.fillRect(S * 0.4, S * 0.8, S * 0.2, S * 0.2);
  for (const x of [0.2, 0.8]) { g.beginPath(); g.ellipse(S * x, S * 0.5, S * 0.05, S * 0.08, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.ellipse(S * 0.5, S * 0.5, S * 0.3, S * 0.38, 0, 0, Math.PI * 2); g.fill();
  const shade = g.createRadialGradient(S * 0.5, S * 0.55, S * 0.1, S * 0.5, S * 0.55, S * 0.4);
  shade.addColorStop(0, 'rgba(255,230,210,0.5)'); shade.addColorStop(1, 'rgba(180,110,80,0.25)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = shade; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  // 바가지 머리
  g.fillStyle = '#1d1e24';
  g.beginPath(); g.ellipse(S * 0.5, S * 0.33, S * 0.33, S * 0.26, 0, Math.PI, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(S * 0.17, S * 0.33); g.lineTo(S * 0.83, S * 0.33); g.lineTo(S * 0.83, S * 0.36);
  for (let i = 10; i >= 0; i--) { const x = S * (0.17 + 0.66 * i / 10); g.lineTo(x, S * (0.34 + (i % 2) * 0.03)); }
  g.closePath(); g.fill();
  // 눈썹
  g.strokeStyle = '#2a2025'; g.lineWidth = 12; g.lineCap = 'round';
  for (const [x, s] of [[0.37, -1], [0.63, 1]]) { g.beginPath(); g.moveTo(S * (x - 0.07), S * 0.385 + s * 0); g.lineTo(S * (x + 0.07), S * 0.385); g.stroke(); }
  // 눈
  for (const x of [0.37, 0.63]) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(S * x, S * 0.45, S * 0.06, S * 0.035, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#26170f'; g.beginPath(); g.arc(S * x, S * 0.452, S * 0.03, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(S * x + 6, S * 0.445, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2418'; g.lineWidth = 4; g.beginPath(); g.ellipse(S * x, S * 0.45, S * 0.06, S * 0.035, 0, Math.PI, Math.PI * 2); g.stroke();
  }
  // 코
  g.strokeStyle = 'rgba(150,80,60,0.6)'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(S * 0.5, S * 0.5); g.quadraticCurveTo(S * 0.47, S * 0.6, S * 0.52, S * 0.6); g.stroke();
  // 입
  g.fillStyle = '#8a2a2a';
  g.beginPath(); g.moveTo(S * 0.42, S * 0.71); g.quadraticCurveTo(S * 0.5, S * 0.78, S * 0.58, S * 0.71); g.quadraticCurveTo(S * 0.5, S * 0.735, S * 0.42, S * 0.71); g.fill();
  g.fillStyle = 'rgba(255,120,120,0.3)';
  for (const x of [0.3, 0.7]) { g.beginPath(); g.ellipse(S * x, S * 0.58, 30, 18, 0, 0, Math.PI * 2); g.fill(); }
  return { id: 'cartoon', name: '샌드백군', src: 'cartoon', img: c.toDataURL('image/png'), alpha: true, eyeL: [0.37, 0.45], eyeR: [0.63, 0.45], mouth: [0.5, 0.72], mask: [0.5, 0.5, 0.33, 0.45] };
}

/* ---------- 사진 정렬 (얼굴 추가 화면에서 사용) ---------- */
// eL, eR, m = 원본 이미지 픽셀 좌표 → 눈이 수평이 되게 돌리고 크기를 맞춘 정사각 이미지
export function normalizePhoto(img, eL, eR, m, size = 384, quality = 0.86) {
  const cx = (eL[0] + eR[0]) / 2, cy = (eL[1] + eR[1]) / 2;
  const ex = eR[0] - eL[0], ey = eR[1] - eL[1];
  const de = Math.hypot(ex, ey) || 1;
  const px = -ey / de, py = ex / de;
  const dm = (m[0] - cx) * px + (m[1] - cy) * py;
  const ref = Math.max(de, dm / 1.08);
  const s = 0.26 * size / ref;
  const ang = Math.atan2(ey, ex);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#141418'; g.fillRect(0, 0, size, size);
  g.translate(size / 2, 0.45 * size); g.scale(s, s); g.rotate(-ang); g.translate(-cx, -cy);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0);
  const tf = (p) => {
    const dx = p[0] - cx, dy = p[1] - cy;
    const rx = dx * Math.cos(-ang) - dy * Math.sin(-ang), ry = dx * Math.sin(-ang) + dy * Math.cos(-ang);
    return [+(0.5 + rx * s / size).toFixed(4), +(0.45 + ry * s / size).toFixed(4)];
  };
  return { url: c.toDataURL('image/jpeg', quality), eyeL: tf(eL), eyeR: tf(eR), mouth: tf(m), canvas: c };
}

// { faces:[...], body: {img, arm, w, h, joints, floorY} | null }
export async function loadPack(key, url) {
  if (!key) return { faces: [], body: null };
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return { faces: [], body: null };
    const txt = await decryptText(key, await r.text());
    const pack = JSON.parse(txt);
    return { faces: (pack.faces || []).map(f => ({ ...f, src: 'pack' })), body: pack.body || null };
  } catch (e) { console.info('기본 얼굴 묶음 없음/열쇠 다름'); return { faces: [], body: null }; }
}
