// 쿵쾅 샌드백 — 화면 흐름 · 조작 · 타격 처리 · 뎀프시롤 · KO/라운드 · 온라인(모두 같은 체육관)
import * as THREE from '../vendor/three.module.min.js';
import { createStage, CAM_BASE, CAM_LOOK, CAM_KO, LOOK_KO } from './stage.js?v=1.1.0';
import { Dummy, headToUv, cartoonBody } from './dummy.js?v=1.1.0';
import { Attacker } from './attacker.js?v=1.1.0';
import { FX } from './fx.js?v=1.1.0';
import { Sound, hasKoreanVoice } from './sound.js?v=1.1.0';
import { Net, rid } from './net.js?v=1.1.0';
import * as Faces from './faces.js?v=1.1.0';
import { openEditor } from './editor.js?v=1.1.0';
import { TOOLS, TOOL_IDS, ICON, LINES } from './tools.js?v=1.1.0';

const VERSION = '1.1.0';
const HP_MAX = 1500;
const $ = id => document.getElementById(id);
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10);
const store = Faces.store;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arr = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];

const isTouch = matchMedia('(pointer: coarse)').matches;
const stage = createStage($('view'), isTouch);
const dummy = new Dummy(stage.scene);
const atk = new Attacker(stage.camera);
const fx = new FX(stage, $('hud'), $('layer'));

/* ================= 상태 ================= */
let sid = null; try { sid = sessionStorage.getItem('sb.sid'); } catch (e) { }
if (!sid) { sid = rid(8); try { sessionStorage.setItem('sb.sid', sid); } catch (e) { } }
const me = { id: sid, name: store.get('sb.name', '') };
const G = {
  round: 1, hp: HP_MAX, faceId: null, kos: 0, inKO: false, koTimer: 0,
  combo: 0, lastHitT: 0, gauge: 0, tot: +store.get('sb.tot', 0) || 0, best: 0, myKO: +store.get('sb.ko', 0) || 0,
  roundDmg: new Map(), players: new Map(), stopT: 0, slowT: 0, lastAct: performance.now(), tool: 'punch', started: false,
  lastTaunt: 0, lastBubble: 0
};
let faces = [];      // 화면에 쓰는 얼굴 목록 (기본 묶음 → 방에서 추가한 얼굴)
let key = null, gym = 'pub', net = null;

/* ================= 얼굴 ================= */
const currentFace = () => faces.find(f => f.id === G.faceId) || faces[0];
function sortFaces() {
  faces.sort((a, b) => (a.src === b.src ? (a.order || 0) - (b.order || 0) : (a.src === 'room' ? 1 : -1)));
}
function applyFace(id, spin) {
  if (id) G.faceId = id;
  const f = currentFace();
  if (!f || dummy.face === f) return;
  if (spin) dummy.spinSwap(() => { dummy.setFace(f); dummy.setHpRatio(G.hp / HP_MAX); });
  else { dummy.setFace(f); dummy.setHpRatio(G.hp / HP_MAX); }
  updateHp();
  renderFaceList();
}
function nextFaceId() {
  if (!faces.length) return null;
  const i = Math.max(0, faces.indexOf(currentFace()));
  return faces[(i + 1) % faces.length].id;
}
async function addRoomFace(id, payload) {
  if (!payload) { // 지움
    const i = faces.findIndex(f => f.id === id && f.src === 'room');
    if (i >= 0) { const wasCur = currentFace() === faces[i]; faces.splice(i, 1); if (wasCur) applyFace(faces[0] && faces[0].id, true); renderFaceList(); }
    return;
  }
  if (!key) return;
  try {
    const rec = JSON.parse(await Faces.decryptText(key, payload));
    if (!rec || typeof rec.img !== 'string' || !rec.img.startsWith('data:image/') || rec.img.length > 900000) return;
    for (const k of ['eyeL', 'eyeR', 'mouth']) if (!Array.isArray(rec[k]) || rec[k].length !== 2 || rec[k].some(v => !isFinite(v))) return;
    rec.id = id; rec.src = 'room'; rec.name = cleanName(rec.name) || '샌드백';
    if (!Array.isArray(rec.mask) || rec.mask.length !== 4 || rec.mask.some(v => !isFinite(v))) rec.mask = [0.5, 0.48, 0.28, 0.42];
    const f = await Faces.buildFace(rec);
    f.order = rec.ts || 0; f.by = cleanName(rec.byName);
    const i = faces.findIndex(x => x.id === id);
    if (i >= 0) faces[i] = f; else faces.push(f);
    // 만화 얼굴은 진짜 얼굴이 생기면 뺌
    const ci = faces.findIndex(x => x.src === 'cartoon');
    if (ci >= 0 && faces.length > 1) faces.splice(ci, 1);
    sortFaces();
    if (G.faceId === id || !dummy.face || dummy.face.src === 'cartoon') applyFace(G.faceId === id ? id : (dummy.face && dummy.face.src !== 'cartoon' ? dummy.face.id : id), false);
    renderFaceList();
  } catch (e) { /* 다른 열쇠로 잠긴 얼굴 */ }
}

/* ================= 화면(HUD) ================= */
function updateHp() {
  const f = currentFace();
  $('hpName').textContent = f ? f.name : '샌드백';
  $('hpRound').textContent = 'ROUND ' + G.round;
  const r = G.hp / HP_MAX;
  $('hpFill').style.width = (r * 100).toFixed(1) + '%';
  $('hpFill').classList.toggle('low', r < 0.3);
  $('hpNum').textContent = Math.ceil(G.hp) + ' / ' + HP_MAX;
  $('koCount').textContent = G.kos;
}
let hpLagW = 100;
function tickHpLag(dt) {
  const target = G.hp / HP_MAX * 100;
  hpLagW = hpLagW > target ? Math.max(target, hpLagW - dt * 40) : target;
  $('hpLag').style.width = hpLagW.toFixed(1) + '%';
}
function updateGauge() {
  const g = G.gauge;
  $('dempsey').style.setProperty('--g', g.toFixed(1));
  $('superBtn').hidden = g < 100 || D.superOn;
}
let comboHide = 0;
function showCombo() {
  if (G.combo < 3) return;
  const el = $('combo');
  el.innerHTML = `<b>${G.combo}</b> COMBO`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  el.hidden = false;
  clearTimeout(comboHide); comboHide = setTimeout(() => { el.hidden = true; }, 1300);
}
function banner(text, cls = '', ms = 1400) {
  const el = document.createElement('div');
  el.className = 'banner ' + cls; el.innerHTML = text;
  $('layer').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
let toastT = 0;
function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}
function feed(icon, name, dmg) {
  const box = $('feed');
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `<span>${esc(name)}</span> ${icon} <b>-${dmg}</b>`;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}
function say(lines, force) {
  const now = performance.now();
  if (!force && now - G.lastBubble < 550) return;
  G.lastBubble = now;
  const text = pick(lines);
  fx.bubble(() => dummy.headTopWorld(), text, 1.3);
  Sound.say(text, { force });
}

/* ================= 도구 막대 ================= */
function buildTools() {
  const bar = $('tools');
  bar.innerHTML = TOOLS.map(t => `<button class="tool" data-tool="${t.id}" title="${t.label} (${t.key})"><i>${t.icon}</i><span>${t.label}</span></button>`).join('');
  bar.addEventListener('click', e => {
    const b = e.target.closest('.tool'); if (!b) return;
    selectTool(b.dataset.tool);
  });
  selectTool(store.get('sb.tool', 'punch'));
}
function selectTool(id) {
  if (!TOOLS.find(t => t.id === id)) id = 'punch';
  G.tool = id; store.set('sb.tool', id);
  for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
  if (D.on) setDempsey(false);
  atk.setGlovesHidden(!(id === 'punch'));
}

/* ================= 타격 공통 ================= */
const zoneOf = (part, lp) => dummy.zoneOf(part, lp);
function hitStop(s) { G.stopT = Math.max(G.stopT, s); }

// 도구별 반응
const FXT = {
  punch: {
    icon: '👊', words: ['퍽!', '빡!', '팍!', '퍼억!'], color: '#ffe14a',
    sound: z => z === 'face' || z === 'top' ? 'punch' : 'body', radius: z => z === 'face' ? 0.24 : 0.3, dent: 1, squash: z => z === 'top' ? 1.2 : 0.7,
    shake: 0.09, stop: 0.065, burst: 1,
    react(h, z, side, uv) {
      if (z === 'face') {
        dummy.express({ sqL: 1, sqR: 1, shut: h.power > 3.4 ? 1 : 0.55, mode: 1, mW: 0.6, mO: 0.8, flash: 0.16, flashCol: '#ff7a7a' }, 0.35);
        dummy.addBruise(uv, 0.055, 0.2);
        dummy.addSwell(side, 0.045);
        const e = side < 0 ? dummy.u.eyeL.value : dummy.u.eyeR.value;
        if (Math.hypot(uv[0] - e.x, uv[1] - e.y) < 0.09) dummy.addBlackEye(side, 0.3);
        return LINES.face.concat(LINES.heavy);
      }
      if (z === 'top') { dummy.express({ shut: 1, mode: 1, mO: 0.5 }, 0.3); return LINES.light; }
      dummy.express({ sqL: 0.8, sqR: 0.8, mO: 1, mW: 0.3, shut: h.power > 3.4 ? 0.9 : 0, mode: 1 }, 0.4);
      return h.power > 3.4 ? LINES.body.concat(LINES.heavy) : LINES.body.concat(LINES.light);
    }
  },
  dempsey: {
    icon: '🥊', words: ['퍽!', '빡!', '퍼버벅!', '뻑!'], color: '#ff9b3d',
    sound: () => 'body', radius: () => 0.32, dent: 1.1, squash: () => 0.8, shake: 0.1, stop: 0.05, burst: 1.1, lines: 0.6,
    react(h) { dummy.express({ sqL: 1, sqR: 1, mO: 1, mW: 0.5, shut: 1, mode: 1 }, 0.3); return LINES.dempsey.concat(LINES.body); }
  },
  finish: {
    icon: '💥', words: ['뻐어억!!!', '콰과광!!!'], color: '#ff4040',
    sound: () => 'kick', radius: () => 0.3, dent: 1.3, squash: () => 2, shake: 0.5, stop: 0.12, burst: 2.6, lines: 2,
    react(h, z, side, uv) {
      dummy.express({ shut: 1, mode: 2, mO: 1, mW: 1, flash: 0.3, flashCol: '#ffffff' }, 1.2);
      dummy.addSwell(0, 0.25); dummy.setDizzy(3);
      return LINES.heavy;
    }
  },
  kick: {
    icon: '🦵', words: ['뻐억!!', '쾅!!', '콰앙!', '퍼어억!'], color: '#ff7b2e',
    sound: () => 'kick', radius: () => 0.42, dent: 1.2, squash: () => 1.4, shake: 0.22, stop: 0.09, burst: 1.6, lines: 1.2,
    react(h, z, side, uv) {
      dummy.express({ shut: 1, mode: 1, mO: 1, mW: 0.8, flash: 0.14, flashCol: '#ffd0a0' }, 0.6);
      if (z === 'face') { dummy.addBruise(uv, 0.07, 0.35); dummy.addSwell(side, 0.1); }
      if (h.power > 5) dummy.setDizzy(1.2);
      return LINES.kick.concat(LINES.heavy);
    }
  },
  slap: {
    icon: '✋', words: ['짝!', '쫙!', '짜악!', '찰싹!'], color: '#ff6b8a',
    sound: () => 'slap', radius: () => 0.2, dent: 0.45, squash: () => 0.3, headMul: 1.5, shake: 0.06, stop: 0.05, burst: 0.9,
    react(h, z, side, uv) {
      if (z === 'face' || z === 'top') {
        dummy.express({ [side < 0 ? 'sqL' : 'sqR']: 1, shut: 1, mode: 1, mW: 1, mO: 0.4, flash: 0.16, flashCol: '#ff5a5a', blush: 0.6 }, 0.45);
        dummy.addHandPrint(uv, side * 0.35 + rand(-0.25, 0.25));
        dummy.addSwell(side, 0.035);
        return LINES.slap;
      }
      dummy.express({ sqL: 0.7, sqR: 0.7, mO: 0.6 }, 0.3);
      return LINES.slap.concat(LINES.light);
    }
  },
  knuckle: {
    icon: '✊', words: ['콩!', '딱!', '꿍!', '콩콩!'], color: '#8fe3ff',
    sound: () => 'knock', radius: () => 0.15, dent: 0.6, squash: () => 2.0, shake: 0.06, stop: 0.06, burst: 0.8,
    react(h, z, side, uv) {
      dummy.express({ shut: 1, mode: 1, mO: 0.6, mW: 0.5 }, 0.5);
      if (h.part === 'head') { dummy.addBump(h.lp); Sound.play('boing', { delay: 0.06, vol: h.mine ? 1 : 0.5 }); }
      dummy.setDizzy(1.0);
      return LINES.knuckle;
    }
  },
  flick: {
    icon: '👆', words: ['딱!', '탁!', '따악!'], color: '#ffffff',
    sound: () => 'flick', radius: () => 0.1, dent: 0.5, squash: () => 0.3, headMul: 1.2, shake: 0.04, stop: 0.07, burst: 0.6,
    react(h, z, side, uv) {
      dummy.express({ shut: 1, mode: 1, mW: 0.5, mO: 0.2 }, 0.4);
      if (h.part === 'head') dummy.addBruise(uv, 0.035, 0.4);
      return LINES.flick;
    }
  },
  hammer: {
    icon: '🔨', words: ['뿅!', '뿅뿅!', '삑!', '뾱!'], color: '#ffd21f',
    sound: () => 'squeak', radius: () => 0.3, dent: 0.8, squash: () => 2.3, shake: 0.08, stop: 0.05, burst: 1.1,
    react(h, z) {
      dummy.express({ shut: 1, mode: 4, mO: 0.4, mW: 0.4 }, 1.0);
      dummy.setDizzy(2.2);
      if (h.part === 'head' && Math.random() < 0.3) dummy.addBump(h.lp);
      return LINES.hammer;
    }
  },
  pinch: {
    icon: '🤏', words: ['꼬집!', '쭈욱~', '뿅!'], color: '#ff9ad5',
    sound: () => 'snap', radius: () => 0.13, dent: 0, squash: () => 0, shake: 0.03, stop: 0, burst: 0.5,
    react(h, z, side, uv) {
      dummy.express({ [side < 0 ? 'sqL' : 'sqR']: 1, shut: 1, mode: 1, mW: 1 }, 0.4);
      if (h.part === 'head') dummy.addBruise(uv, 0.04, 0.25);
      return LINES.pinch;
    }
  },
  tickle: {
    icon: '🤣', words: ['간질간질', '꺄르르', '히히', '꼼지락'], color: '#b9ff8a',
    sound: () => 'tickle', radius: () => 0.2, dent: 0, squash: () => 0.15, shake: 0, stop: 0, burst: 0,
    react(h) {
      dummy.express({ shut: 1, mode: 3, mW: 1, mO: 0.7, blush: 0.5 }, 0.45);
      dummy.H.vy += rand(-1.5, 1.5); dummy.H.vz += rand(-1, 1);
      return LINES.tickle;
    }
  }
};

// 타격을 화면에 보여줌 (내 것/남의 것 공통)
function impact(h) {
  const F = FXT[h.tool] || FXT.punch;
  const z = zoneOf(h.part, h.lp);
  const P = dummy.hit({ part: h.part, lp: h.lp, dir: h.dir, power: h.power, radius: F.radius(z), dent: F.dent, squash: F.squash(z), headMul: F.headMul });
  const vol = h.mine ? 1 : 0.5;
  Sound.play(F.sound(z), { p: Math.min(1.5, h.power / 3), pan: clamp(P.x / 2.5, -1, 1), vol });
  if (F.burst) fx.burst(P, F.burst * (h.crit ? 1.35 : 1));
  if (h.tool !== 'tickle' && h.tool !== 'pinch') {
    const spray = h.dir.clone().multiplyScalar(0.8).add(V(0, 0.5, 0));
    fx.sweat(P, spray, Math.round(6 + h.power * 3), 2 + h.power * 0.5);
  }
  if (h.tool !== 'tickle' || Math.random() < 0.35) fx.word(P, pick(F.words), (h.tool === 'finish' ? 1.8 : h.tool === 'kick' ? 1.3 : 1) * (h.crit ? 1.25 : 1) * (h.mine ? 1 : 0.75), F.color);
  if (h.dmg > 0) fx.damage(P, h.dmg, h.mine, h.crit);
  if (!h.mine) fx.tag(P, h.name, F.icon);
  if (h.mine) {
    fx.shake(F.shake * (h.crit ? 1.4 : 1));
    if (F.stop) hitStop(F.stop * (h.crit ? 1.4 : 1));
    if (F.lines || h.crit) fx.speedLines(P, 0.14, F.lines || 0.7);
    if (navigator.vibrate && isTouch && F.shake > 0.05) try { navigator.vibrate(Math.round(15 + F.shake * 80)); } catch (e) { }
  } else fx.shake(F.shake * 0.3);
  const side = h.lp.x < 0 ? -1 : 1;
  const uv = h.part === 'head' ? headToUv(h.lp) : [0.5, 0.5];
  const lines = F.react(h, z, side, uv);
  // 사람처럼 반사적으로 막거나 움켜쥠
  if (h.tool !== 'tickle' && h.tool !== 'pinch') {
    if (z === 'face' && Math.random() < 0.55) dummy.flinch('face', 0.35 + Math.random() * 0.25);
    else if (z === 'gut' || z === 'low') dummy.flinch('gut', 0.6);
    else if (z === 'top') dummy.flinch('head', 0.55);
  } else if (h.tool === 'tickle' && Math.random() < 0.3) dummy.flinch(Math.random() < 0.5 ? 'gut' : 'out', 0.3);
  if (G.hp / HP_MAX < 0.25 && Math.random() < 0.4 && !G.inKO) say(LINES.low);
  else if (lines && (h.mine || Math.random() < 0.2)) say(lines);
}

function myHit(h) {
  const now = performance.now();
  G.lastAct = now;
  G.combo = now - G.lastHitT < 1200 ? G.combo + 1 : 1;
  G.lastHitT = now;
  if (G.inKO) h.dmg = 0;
  else h.dmg = Math.max(1, Math.round(h.dmg * (1 + Math.min(G.combo, 40) * 0.015)));
  h.mine = true; h.name = me.name;
  impact(h);
  showCombo();
  if (h.dmg > 0) {
    G.tot += h.dmg; G.best = Math.max(G.best, G.combo);
    G.gauge = Math.min(100, G.gauge + h.dmg * 0.11 + (h.crit ? 3 : 0));
    updateGauge();
    addRoundDmg(me.id, me.name, h.dmg);
    if (net) net.send({ t: 'hit', r: G.round, k: h.tool, p: h.part, l: arr(h.lp), d: arr(h.dir), w: +h.power.toFixed(2), g: h.dmg, c: h.crit ? 1 : 0, n: me.name });
    applyDamage(h.dmg, me.id, me.name, true);
  }
}
function addRoundDmg(id, name, dmg) {
  const o = G.roundDmg.get(id) || { name, dmg: 0 };
  o.dmg += dmg; o.name = name;
  G.roundDmg.set(id, o);
}
function applyDamage(dmg, byId, byName, mine) {
  if (G.inKO || dmg <= 0) return;
  G.hp = Math.max(0, G.hp - dmg);
  dummy.setHpRatio(G.hp / HP_MAX);
  updateHp();
  if (G.hp <= 0) {
    if (mine) announceKO(byId, byName);
    else {
      clearTimeout(G.koTimer);
      const r = G.round;
      G.koTimer = setTimeout(() => { if (G.round === r && !G.inKO) announceKO(byId, byName); }, 1500);
    }
  }
}

/* ================= KO · 라운드 ================= */
function announceKO(byId, byName) {
  const next = nextFaceId();
  const r = G.round;
  if (net) {
    net.send({ t: 'ko', r, by: byId, n: byName, f: next });
    net.setState({ round: r + 1, face: next, kos: G.kos + 1, hp: HP_MAX });
  }
  doKO(r, byId, byName, next);
}
function doKO(r, byId, byName, next) {
  if (G.inKO || r !== G.round) return;
  G.inKO = true; G.kos++;
  clearTimeout(G.koTimer);
  if (byId === me.id) { G.myKO++; store.set('sb.ko', G.myKO); }
  dummy.setKO(true);
  G.slowT = 0.9;
  Sound.play('ko');
  fx.speedLines(dummy.headWorld(), 0.6, 2.2, '255,255,255');
  fx.flash('rgba(255,255,255,0.9)', 0.12);
  fx.shake(0.4);
  say(LINES.ko, true);
  let mvp = null;
  for (const [, o] of G.roundDmg) if (!mvp || o.dmg > mvp.dmg) mvp = o;
  setTimeout(() => {
    banner(`K.O.!!`, 'ko', 2600);
    const info = `<div class="ko-info">🏆 막타: <b>${esc(byName || '누군가')}</b>${mvp ? `<br>💪 이번 판 최다 데미지: <b>${esc(mvp.name)}</b> (${mvp.dmg})` : ''}</div>`;
    banner(info, 'ko-sub', 3200);
    confetti();
  }, 350);
  updateHp();
  setTimeout(() => nextRound(r + 1, next), 4300);
}
function nextRound(r, faceId) {
  if (r <= G.round && !G.inKO) return;
  G.round = r; G.hp = HP_MAX; G.inKO = false; G.roundDmg.clear();
  hpLagW = 100;
  dummy.setKO(false);
  if (faceId && faceId !== (currentFace() && currentFace().id)) applyFace(faceId, true);
  else { dummy.resetDamage(); dummy.setHpRatio(1); }
  updateHp();
  Sound.play('bell');
  banner(`ROUND ${r}`, 'round', 1500);
  setTimeout(() => say(LINES.revive, true), 900);
}
function confetti() {
  const box = $('layer');
  for (let i = 0; i < 46; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = rand(0, 100) + 'vw';
    c.style.background = pick(['#ff4d6d', '#ffd21f', '#4dd2ff', '#7dff6b', '#ffffff', '#c86bff']);
    c.style.animationDuration = rand(1.6, 3) + 's';
    c.style.animationDelay = rand(0, 0.5) + 's';
    c.style.setProperty('--dx', rand(-120, 120) + 'px');
    box.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }
}

/* ================= 조작 ================= */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(e) {
  const r = stage.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera);
}
function pickTarget(e) {
  setRay(e);
  const hits = ray.intersectObjects(dummy.hitMeshes, false);
  for (const h of hits) { // 사진의 투명한 곳은 건너뜀
    const d = dummy.describeHit(h);
    if (d) { d.point = h.point.clone(); return d; }
  }
  return null;
}
// 빗나갔을 때: 인형 앞 평면 위의 점
function airPoint(e) {
  setRay(e);
  const plane = new THREE.Plane(V(0, 0, 1), -0.4);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? p : dummy.headWorld();
}
const camPos = () => stage.camera.getWorldPosition(new THREE.Vector3());
// 머리 꼭대기/이마 같은 정해진 자리 (얼굴 사진 기준 u,v)
const headSpot = (u, v) => dummy.headSpotUV(clamp(u, 0.25, 0.75), clamp(v, 0.02, 0.95));
const topV = () => (dummy.topV ?? 0.08);
const uOf = t => t && t.part === 'head' ? headToUv(t.lp)[0] : 0.5;
const crit = () => Math.random() < 0.1;

let holdState = null; // 꼬집기·간지럼
function onDown(e) {
  if (!G.started || e.button > 0) return;
  Sound.unlock();
  e.preventDefault();
  G.lastAct = performance.now();
  if (D.superOn) { D.speed = Math.min(17, D.speed + 0.35); return; }
  if (D.on) { dempseyHook(false); return; }
  const t = pickTarget(e);
  const tool = G.tool;
  if (tool === 'punch') return doPunch(t, e);
  if (tool === 'kick') return doKick(t, e);
  if (tool === 'slap') return doSlap(t, e);
  if (tool === 'knuckle') return doKnuckle(t);
  if (tool === 'flick') return doFlick(t);
  if (tool === 'hammer') return doHammer(t);
  if (tool === 'pinch' || tool === 'tickle') return startHold(tool, t, e);
}
function doPunch(t, e) {
  if (!t) { // 허공
    const p = airPoint(e);
    if (atk.punch(p, { kind: 'straight', onImpact: () => Sound.play('whoosh', { p: 0.8 }) })) Sound.play('whoosh', { p: 0.6 });
    return;
  }
  const z = zoneOf(t.part, t.lp);
  let kind = 'straight';
  const huv = t.part === 'head' ? headToUv(t.lp) : null;
  if (z === 'face' && huv[1] > dummy.u.mouthP.value.y + 0.02) kind = 'upper';
  else if (z === 'gut' || z === 'low' || z === 'leg') kind = 'body';
  else if (huv ? Math.abs(huv[0] - 0.5) > 0.17 : Math.abs(t.lp.x) > 0.5) kind = 'hook';
  const side = kind === 'hook' || kind === 'body' ? (t.lp.x > 0 ? 1 : -1) : 0;
  const lp = t.lp.clone(), part = t.part;
  atk.punch(t.point, {
    side: side || undefined, kind, onImpact: () => {
      const base = camPos();
      const dir = t.point.clone().sub(base).normalize();
      if (kind === 'hook' || kind === 'body') dir.add(V(-side * 0.9, 0.05, 0)).normalize();
      if (kind === 'upper') dir.add(V(0, 1.1, 0)).normalize();
      const c = crit();
      const pw = (kind === 'upper' ? 4.6 : kind === 'hook' ? 3.8 : 3.2) * (c ? 1.4 : 1);
      const dmg = (kind === 'upper' ? rand(22, 30) : z === 'face' ? rand(16, 24) : rand(12, 19)) * (c ? 1.8 : 1);
      myHit({ tool: 'punch', part, lp, dir, power: pw, dmg, crit: c });
    }
  });
  Sound.play('whoosh', { p: 0.5, vol: 0.5 });
}
function doKick(t, e) {
  const target = t || dummy.spot('gut');
  if (!atk.kick(target.point, () => {
    const dir = V(-0.75, 0.25, -0.62).normalize();
    const c = crit();
    myHit({ tool: 'kick', part: target.part, lp: target.lp, dir, power: (c ? 8 : 6), dmg: rand(32, 45) * (c ? 1.7 : 1), crit: c });
  })) return;
}
function doSlap(t, e) {
  let target = t;
  if (!target || target.part !== 'head') {
    const r = stage.renderer.domElement.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width < 0.5 ? -1 : 1;
    target = headSpot(0.5 + sx * 0.17, 0.63);
  }
  const side = target.lp.x >= 0 ? 1 : -1;
  atk.slap(target.point, side, () => {
    const dir = V(-side * 1, 0.05, -0.3).normalize();
    const c = crit();
    myHit({ tool: 'slap', part: target.part, lp: target.lp, dir, power: c ? 3.8 : 2.8, dmg: rand(12, 18) * (c ? 1.8 : 1), crit: c });
  });
}
function doKnuckle(t) {
  const u = t && t.part === 'head' ? 0.5 + (uOf(t) - 0.5) * 0.6 : 0.5 + rand(-0.08, 0.08);
  const target = headSpot(u, topV() + 0.07);
  atk.knuckle(target.point, () => {
    const c = crit();
    myHit({ tool: 'knuckle', part: 'head', lp: target.lp, dir: V(0, -1, -0.15).normalize(), power: c ? 3.4 : 2.6, dmg: rand(14, 20) * (c ? 1.8 : 1), crit: c });
  });
}
function doFlick(t) {
  const u = t && t.part === 'head' ? clamp(uOf(t), 0.4, 0.6) : 0.5;
  const target = headSpot(u, Math.max(topV() + 0.16, dummy.u.eyeL.value.y - 0.13));
  atk.flick(target.point, () => {
    const c = crit();
    myHit({ tool: 'flick', part: 'head', lp: target.lp, dir: V(0, 0.25, -1).normalize(), power: c ? 2.6 : 2.0, dmg: rand(8, 12) * (c ? 1.8 : 1), crit: c });
  });
}
function doHammer(t) {
  const target = t && t.part === 'head' ? t : headSpot(0.5 + rand(-0.06, 0.06), topV() + 0.1);
  atk.hammer(target.point, () => {
    const c = crit();
    myHit({ tool: 'hammer', part: target.part, lp: target.lp, dir: V(-0.2, -1, -0.2).normalize(), power: c ? 3.2 : 2.4, dmg: rand(10, 15) * (c ? 1.8 : 1), crit: c });
  });
}
function holdPlane(e) {
  setRay(e);
  const p = new THREE.Vector3();
  const n = camPos().sub(holdState.anchor).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, holdState.anchor);
  return ray.ray.intersectPlane(plane, p) ? p : holdState.anchor.clone();
}
function startHold(kind, t, e) {
  if (!t) return;
  if (!atk.holdStart(kind, t.point)) return;
  holdState = { kind, t, anchor: t.point.clone(), start: performance.now(), max: 0, lastTick: 0, d: null, id: e.pointerId };
  if (kind === 'pinch' && (t.part === 'head' || t.part === 'body' || t.part === 'arm')) {
    holdState.d = dummy.grab(t.part, t.lp);
    Sound.play('pinch');
    const side = t.lp.x < 0 ? -1 : 1;
    dummy.express({ [side < 0 ? 'sqL' : 'sqR']: 1, mW: 0.6 }, 0.3);
    say(LINES.pinch);
  }
  try { stage.renderer.domElement.setPointerCapture(e.pointerId); } catch (er) { }
}
function onMove(e) {
  if (!holdState || e.pointerId !== holdState.id) return;
  const p = holdPlane(e);
  if (holdState.kind === 'pinch') {
    if (holdState.d) {
      const k = dummy.pull(holdState.d, p);
      holdState.max = Math.max(holdState.max, k);
      atk.holdMove(dummy.grabWorld(holdState.d));
    }
  } else {
    const t = pickTarget(e);
    if (t) { holdState.t = t; atk.holdMove(t.point); }
  }
}
function onUp(e) {
  if (!holdState || (e.pointerId !== undefined && e.pointerId !== holdState.id)) return;
  const hs = holdState; holdState = null;
  atk.holdEnd();
  if (hs.kind === 'pinch' && hs.d) {
    const pw = hs.d.pullWorld ? hs.d.pullWorld.clone() : V(0, 0, 0);
    const dur = (performance.now() - hs.start) / 1000;
    dummy.release(hs.d);
    const stretch = hs.max;
    const c = stretch > 0.85 && Math.random() < 0.3;
    myHit({ tool: 'pinch', part: hs.t.part, lp: hs.t.lp, dir: pw.lengthSq() > 1e-6 ? pw.clone().normalize().negate() : V(0, 0, -1), power: 1 + stretch * 2, dmg: (4 + stretch * 26) * (c ? 1.6 : 1), crit: c });
    if (net) net.send({ t: 'pinch', r: G.round, p: hs.t.part, l: arr(hs.t.lp), v: arr(pw), s: +Math.min(1.2, dur).toFixed(2) });
  }
}
function tickHold(dt) {
  const hs = holdState; if (!hs) return;
  const now = performance.now();
  if (hs.kind === 'tickle' && now - hs.lastTick > 230) {
    hs.lastTick = now;
    const t = hs.t;
    const dir = V(rand(-1, 1), rand(-0.3, 0.3), -0.6).normalize();
    myHit({ tool: 'tickle', part: t.part, lp: t.lp, dir, power: 0.6, dmg: 2, crit: false });
  }
  if (hs.kind === 'pinch' && hs.d && hs.d.pullWorld) {
    // 잡아당기면 머리/몸이 끌려옴
    const isHead = hs.t.part === 'head';
    const P = dummy.grabWorld(hs.d, false);
    const pivot = (isHead ? dummy.neck : dummy.body).getWorldPosition(new THREE.Vector3());
    const tq = P.sub(pivot).cross(hs.d.pullWorld).applyQuaternion(dummy.root.getWorldQuaternion(new THREE.Quaternion()).invert());
    const S = isHead ? dummy.H : dummy.W, k = isHead ? 26 : 10;
    S.vx += tq.x * k * dt; S.vy += tq.y * k * dt; S.vz += tq.z * k * dt;
    const side = hs.t.lp.x < 0 ? -1 : 1;
    const st = hs.d.pullWorld.length();
    dummy.express({ [side < 0 ? 'sqL' : 'sqR']: Math.min(1, st * 2.5), mW: Math.min(1, st * 2), shut: st > 0.35 ? 1 : 0, mode: 1 }, 0.1);
    if (st > 0.3 && now - (hs.lastSay || 0) > 1500) { hs.lastSay = now; say(LINES.pinch); }
  }
}

/* ================= 뎀프시롤 ================= */
const D = { on: false, superOn: false, phase: 0, speed: 5.5, auto: 0, lastIdx: null, finisher: false, lastCross: null };
function setDempsey(on) {
  if (D.superOn && !on) return;
  D.on = on;
  atk.setGuard(on);
  if (on) { atk.setGlovesHidden(false); D.phase = 0; D.speed = 5.5; banner('뎀프시 롤!', 'dempsey', 1100); Sound.play('power'); toast('좌우로 흔들릴 때 화면을 탭! 끝에서 치면 PERFECT', 2500); }
  else atk.setGlovesHidden(G.tool !== 'punch');
  $('dempsey').classList.toggle('on', on);
}
function startSuper() {
  if (G.gauge < 100 || D.superOn || G.inKO) return;
  G.gauge = 0; updateGauge();
  D.superOn = true; D.on = true; D.auto = 14; D.speed = 6; D.lastIdx = null; D.finisher = false;
  atk.setGuard(true); atk.setGlovesHidden(false);
  $('dempsey').classList.add('on');
  $('superBtn').hidden = true;
  banner('필살<br>뎀프시 롤!!', 'dempsey big', 1600);
  Sound.play('power');
  fx.speedLines(null, 0.5, 1.5, '255,200,120');
  if (net) net.send({ t: 'dempsey', n: me.name });
  setTimeout(() => say(LINES.dempsey, true), 400);
}
const bodySideSpot = side => dummy.spot(side > 0 ? 'sideR' : 'sideL');
function dempseyHook(auto) {
  const s = Math.sin(D.phase);
  const side = s >= 0 ? 1 : -1;
  const perfect = auto || Math.abs(Math.cos(D.phase)) < 0.42;
  const spot = bodySideSpot(side);
  const sp = D.speed / 5.5;
  const ok = atk.punch(spot.point, {
    side, kind: 'hook', speed: sp, onImpact: () => {
      const dir = V(-side * 0.85, 0.08, -0.5).normalize();
      const sup = D.superOn;
      const dmg = rand(18, 26) * (perfect ? 1.5 : 1) * (sup ? 1.35 : 1);
      myHit({ tool: 'dempsey', part: 'body', lp: spot.lp, dir, power: (perfect ? 4.2 : 3.2) * (sup ? 1.15 : 1), dmg, crit: perfect && !sup });
      if (perfect && !auto) {
        fx.domAt(spot.point, 'perfect', 'PERFECT!', 700, 0, -90);
        Sound.play('perfect');
        D.speed = Math.min(12, D.speed + 0.7);
        G.gauge = Math.min(100, G.gauge + 4); updateGauge();
      }
    }
  });
  if (ok) Sound.play('whoosh', { p: 0.7, vol: 0.6 });
}
function finisher() {
  const target = headSpot(0.5, Math.min(0.9, dummy.u.mouthP.value.y + 0.1));
  atk.punch(target.point, {
    side: 1, kind: 'upper', speed: 0.8, onImpact: () => {
      myHit({ tool: 'finish', part: 'head', lp: target.lp, dir: V(0, 0.8, -0.6).normalize(), power: 9, dmg: 160, crit: true });
      G.slowT = Math.max(G.slowT, 0.7);
      fx.flash('rgba(255,255,255,0.95)', 0.14);
      banner('마무리!!', 'dempsey big', 1200);
      setTimeout(() => { D.superOn = false; setDempsey(false); }, 450);
    }
  });
}
function updateDempsey(dt, sdt) {
  const active = D.on || D.superOn;
  if (active) {
    D.phase += D.speed * sdt;
    const s = Math.sin(D.phase);
    cam.weave.set(s * 0.62, -0.2 - Math.abs(s) * 0.06 + Math.cos(D.phase * 2) * 0.07, -0.1);
    cam.roll = -s * 0.1;
    const idx = Math.floor((D.phase - Math.PI / 2) / Math.PI);
    if (D.lastIdx === null) D.lastIdx = idx;
    if (idx !== D.lastIdx) {
      D.lastIdx = idx;
      if (D.superOn) {
        if (D.auto > 0) { D.auto--; dempseyHook(true); D.speed = Math.min(17, D.speed + 0.8); }
        else if (!D.finisher) { D.finisher = true; finisher(); }
      } else Sound.play('whoosh', { p: 0.4, vol: 0.25 });
    }
    if (!D.superOn) D.speed += (5.5 - D.speed) * (1 - Math.exp(-dt * 0.7));
  } else {
    cam.weave.multiplyScalar(Math.exp(-dt * 8));
    cam.roll *= Math.exp(-dt * 8);
  }
}

/* ================= 카메라 ================= */
const cam = { weave: new THREE.Vector3(), roll: 0, ko: 0 };
function updateCamera(dt) {
  const c = stage.camera;
  // KO: 바닥에 쓰러진 모습을 위에서 내려다봄
  const koT = G.inKO && dummy.B.x < -0.5 ? 1 : 0;
  cam.ko += (koT - cam.ko) * (1 - Math.exp(-dt * 2.2));
  const pos = CAM_BASE.clone().add(cam.weave).lerp(CAM_KO, cam.ko);
  const look = CAM_LOOK.clone().addScaledVector(cam.weave, 0.35).lerp(LOOK_KO, cam.ko);
  const sh = fx.shakeOffset();
  if (sh) { pos.add(sh); look.add(sh.multiplyScalar(0.5)); }
  c.position.copy(pos);
  c.lookAt(look);
  if (cam.roll) c.rotateZ(cam.roll);
}

/* ================= 온라인 ================= */
function onMsg(d) {
  const p = G.players.get(d.from);
  if (p) p.t = Date.now();
  switch (d.t) {
    case 'hit': onRemoteHit(d); break;
    case 'pinch': onRemotePinch(d); break;
    case 'ko': if (typeof d.r === 'number') { if (d.r > G.round && !G.inKO) { G.round = d.r; } doKO(d.r, String(d.by || ''), cleanName(d.n), d.f ? String(d.f) : null); } break;
    case 'face': if (typeof d.f === 'string' && !G.inKO) { applyFace(d.f, true); toast(`${cleanName(d.n) || '누군가'}님이 얼굴을 바꿨어요`); } break;
    case 'hb': onHb(d); break;
    case 'bye': G.players.delete(d.from); renderPlayers(); break;
    case 'dempsey': banner(`${esc(cleanName(d.n))}의<br>뎀프시 롤!`, 'dempsey', 1300); break;
  }
}
const num = (v, a, b, d = 0) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : d);
const vec = (a, lim) => Array.isArray(a) && a.length === 3 ? V(num(a[0], -lim, lim), num(a[1], -lim, lim), num(a[2], -lim, lim)) : null;
function onRemoteHit(d) {
  if (!TOOL_IDS.has(d.k) || !['head', 'body', 'arm'].includes(d.p)) return;
  if (d.r !== G.round) return;
  const lp = vec(d.l, 8), dir = vec(d.d, 2);
  if (!lp || !dir || dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const h = { tool: d.k, part: d.p, lp, dir, power: num(d.w, 0, 10, 2), dmg: Math.round(num(d.g, 0, 400)), crit: !!d.c, mine: false, name: cleanName(d.n) || '친구' };
  impact(h);
  addRoundDmg(d.from, h.name, h.dmg);
  feed(ICON[h.tool] || '👊', h.name, h.dmg);
  applyDamage(h.dmg, d.from, h.name, false);
}
function onRemotePinch(d) {
  if (d.r !== G.round || !['head', 'body', 'arm'].includes(d.p)) return;
  const lp = vec(d.l, 8), v = vec(d.v, 1);
  if (!lp || !v) return;
  const g = dummy.grab(d.p, lp);
  const target = dummy.grabWorld(g, false).add(v);
  dummy.pull(g, target);
  setTimeout(() => dummy.release(g), 120 + num(d.s, 0, 1.2, 0.3) * 600);
}
function onHb(d) {
  const name = cleanName(d.n) || '친구';
  const s = d.s || {};
  G.players.set(d.from, { name, t: Date.now(), tot: num(s.tot, 0, 1e9), ko: num(s.ko, 0, 1e6), best: num(s.best, 0, 1e5) });
  if (typeof d.r === 'number' && d.r > G.round && !G.inKO) { // 내가 뒤처졌으면 따라감
    G.round = d.r; G.hp = num(d.hp, 0, HP_MAX, HP_MAX); if (typeof d.f === 'string') applyFace(d.f, false); updateHp();
  }
  renderPlayers();
}
function sendHb() {
  if (!net) return;
  net.send({ t: 'hb', n: me.name, r: G.round, hp: Math.round(G.hp), f: G.faceId, s: { tot: G.tot, ko: G.myKO, best: G.best } });
  store.set('sb.tot', G.tot);
}
function online() {
  const now = Date.now();
  return [...G.players.entries()].filter(([, p]) => now - p.t < 13000);
}
function isLeader() { return online().every(([id]) => me.id < id); }
function onState(st) {
  if (typeof st.round !== 'number') return;
  // 게임 중에 라운드가 넘어간 상태가 먼저 오면 KO 장면이 먼저 나오도록 잠깐 기다림
  if (G.started && performance.now() - G.joinT > 3000 && !st.reset && (G.inKO || st.round > G.round)) {
    clearTimeout(G.stateTimer);
    G.stateTimer = setTimeout(() => { if (!G.inKO && st.round > G.round) applyState(st); }, G.inKO ? 5000 : 1600);
    return;
  }
  applyState(st);
}
function applyState(st) {
  const fresh = Date.now() - (st.ts || 0) < 10 * 60 * 1000;
  if (st.round > G.round || (st.round === G.round && !G.started) || (st.reset && !G.inKO)) {
    G.round = st.round;
    G.kos = num(st.kos, 0, 1e7, G.kos);
    G.hp = fresh ? num(st.hp, 1, HP_MAX, HP_MAX) : HP_MAX;
    dummy.setHpRatio(G.hp / HP_MAX);
  } else if (st.round === G.round) G.kos = Math.max(G.kos, num(st.kos, 0, 1e7));
  if (st.reset) G.kos = num(st.kos, 0, 1e7, 0);
  if (typeof st.face === 'string') applyFace(st.face, G.started && performance.now() - G.joinT > 3000);
  updateHp();
}
function renderPlayers() {
  const list = online().map(([id, p]) => ({ id, ...p }));
  list.push({ id: me.id, name: me.name + ' (나)', tot: G.tot, ko: G.myKO, best: G.best, me: true });
  list.sort((a, b) => b.tot - a.tot);
  $('onlineN').textContent = list.length;
  $('playerList').innerHTML = list.map((p, i) => `<li class="${p.me ? 'me' : ''}"><em>${i + 1}</em><b>${esc(p.name)}</b><span>💥${p.tot.toLocaleString()}</span><span>🏆${p.ko}</span><span>🔥${p.best}</span></li>`).join('');
}
function netStatus(n) {
  const el = $('netDot');
  el.className = 'dot ' + (n === 2 ? 'good' : n === 1 ? 'ok' : 'bad');
  el.title = n ? `중계 ${n}/2 연결` : '연결 중…';
}

/* ================= 얼굴 목록 화면 ================= */
function renderFaceList() {
  const box = $('faceList'); if (!box) return;
  const cur = currentFace();
  box.innerHTML = faces.map(f => `<div class="fthumb ${f === cur ? 'cur' : ''}" data-id="${esc(f.id)}">
    <img src="${f.thumb}" alt=""><span>${esc(f.name)}</span>${f.src === 'room' ? `<button class="fdel" data-del="${esc(f.id)}" title="지우기">✕</button>` : ''}</div>`).join('')
    + (key ? `<div class="fthumb add" id="faceAdd"><i>＋</i><span>얼굴 추가</span></div>` : '');
}
function switchFaceTo(id) {
  if (G.inKO) return;
  applyFace(id, true);
  if (net) { net.send({ t: 'face', f: id, n: me.name }); net.setState({ round: G.round, face: id, kos: G.kos, hp: Math.round(G.hp) }); }
}
async function saveNewFace(rec) {
  const id = 'r-' + rid(8);
  const full = { ...rec, ts: Date.now(), byName: me.name };
  const payload = await Faces.encryptText(key, JSON.stringify(full));
  if (net) net.putFace(id, payload);
  await addRoomFace(id, payload);
  switchFaceTo(id);
  toast('얼굴을 추가했어요! 같은 링크로 들어온 모두에게 보여요');
}

/* ================= 화면 연결 ================= */
function bindUi() {
  const cv = stage.renderer.domElement;
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => stage.resize());
  $('dempsey').addEventListener('click', () => { Sound.unlock(); if (!D.superOn) setDempsey(!D.on); });
  $('superBtn').addEventListener('click', () => { Sound.unlock(); startSuper(); });
  $('btnPlayers').addEventListener('click', () => { renderPlayers(); $('players').hidden = !$('players').hidden; });
  $('btnSettings').addEventListener('click', () => { renderFaceList(); $('settings').hidden = false; });
  $('btnNextFace').addEventListener('click', () => { const id = nextFaceId(); if (id) switchFaceTo(id); });
  $('btnShare').addEventListener('click', shareLink);
  $('setShare').addEventListener('click', shareLink);
  for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click', () => { el.closest('.modal, .panel').hidden = true; });
  $('optSound').checked = store.get('sb.sound', '1') === '1';
  $('optVoice').checked = store.get('sb.voice', '1') === '1';
  Sound.setEnabled($('optSound').checked); Sound.setVoice($('optVoice').checked);
  $('optSound').addEventListener('change', e => { Sound.setEnabled(e.target.checked); store.set('sb.sound', e.target.checked ? '1' : '0'); });
  $('optVoice').addEventListener('change', e => { Sound.setVoice(e.target.checked); store.set('sb.voice', e.target.checked ? '1' : '0'); if (e.target.checked && !hasKoreanVoice()) toast('이 기기엔 한국어 음성이 없어서 말풍선만 나와요'); });
  $('faceList').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      if (net) net.delFace(id);
      addRoomFace(id, '');
      return;
    }
    if (e.target.closest('#faceAdd')) {
      openEditor({ onSave: saveNewFace });
      return;
    }
    const f = e.target.closest('.fthumb');
    if (f && f.dataset.id) switchFaceTo(f.dataset.id);
  });
  $('newGym').addEventListener('click', () => {
    const k = Faces.newKey();
    location.hash = 'k=' + k;
    location.reload();
  });
  $('pubGym').addEventListener('click', () => {
    Faces.forgetKey();
    location.hash = 'pub';
    location.reload();
  });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || !G.started) return;
    const t = TOOLS.find(t => t.key === e.key);
    if (t) { selectTool(t.id); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (G.gauge >= 100 && !D.superOn && D.on) startSuper(); else setDempsey(!D.on); } }
    if (e.key === 'f' || e.key === 'F' || e.key === 'j' || e.key === 'J') { if (D.on && !D.superOn) dempseyHook(false); else if (D.superOn) D.speed = Math.min(17, D.speed + 0.35); }
    if (e.key === 'n' || e.key === 'N') $('btnNextFace').click();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sendHb(); });
}
async function shareLink() {
  const url = location.href;
  try {
    if (navigator.share && isTouch) { await navigator.share({ title: '쿵쾅 샌드백', text: '같이 때리러 와!', url }); return; }
  } catch (e) { return; }
  try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요! 친구에게 보내면 같은 체육관으로 와요'); }
  catch (e) { prompt('이 링크를 복사해서 보내세요', url); }
}

/* ================= 시작 ================= */
function startGame() {
  const name = cleanName($('nameIn').value) || ('펀치왕' + Math.floor(Math.random() * 90 + 10));
  me.name = name; store.set('sb.name', name);
  Sound.unlock();
  Sound.ambience(true);
  $('start').hidden = true;
  $('hudTop').hidden = false; $('hudBottom').hidden = false;
  G.started = true;
  G.joinT = performance.now();
  selectTool(G.tool);
  G.lastAct = performance.now();
  net = new Net(gym, me, { msg: onMsg, state: onState, face: (id, s) => addRoomFace(id, s), status: netStatus, up: () => sendHb() });
  net.connect();
  setInterval(sendHb, 4000);
  setInterval(() => {
    renderPlayers();
    if (net && net.count() && isLeader() && !G.inKO) net.setState({ round: G.round, face: G.faceId, kos: G.kos, hp: Math.round(G.hp) });
  }, 6000);
  Sound.play('bell');
  banner(`ROUND ${G.round}`, 'round', 1400);
  setTimeout(() => say(LINES.taunt, true), 1200);
}

async function boot() {
  $('ver').textContent = 'v' + VERSION;
  key = Faces.readKey();
  gym = await Faces.gymIdOf(key);
  $('gymInfo').innerHTML = key
    ? '🔒 <b>비밀 체육관</b> — 이 링크를 받은 사람끼리만 같은 얼굴로 함께 때려요'
    : '🌐 <b>공개 체육관</b> — 만화 얼굴이에요. 친구 사진으로 하려면 설정에서 비밀 체육관을 만드세요';
  $('setGym').textContent = key ? '🔒 비밀 체육관 (열쇠 있음)' : '🌐 공개 체육관';
  $('nameIn').value = me.name;
  buildTools();
  atk.setGlovesHidden(true);
  bindUi();
  const pack = await Faces.loadPack(key, 'faces/pack.bin?v=' + VERSION);
  const recs = pack.faces;
  await dummy.setBody(pack.body || cartoonBody());
  const built = [];
  for (let i = 0; i < recs.length; i++) {
    try { const f = await Faces.buildFace(recs[i]); f.order = i; built.push(f); } catch (e) { console.warn(e); }
  }
  if (!built.length) { const f = await Faces.buildFace(Faces.cartoonRecord()); f.order = 0; built.push(f); }
  faces = built;
  if (!G.faceId) G.faceId = faces[0].id;
  applyFace(G.faceId, false);
  updateHp(); updateGauge();
  $('startBtn').disabled = false;
  $('startBtn').addEventListener('click', startGame);
  $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
  // 시작 전에도 방 상태/얼굴을 미리 받아 둠
}

/* ================= 매 프레임 ================= */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let scale = 1;
  if (G.stopT > 0) { G.stopT -= dt; scale = 0.04; }
  else if (G.slowT > 0) { G.slowT -= dt; scale = 0.22; }
  const sdt = dt * scale;
  updateDempsey(dt, sdt);
  tickHold(dt);
  dummy.update(sdt);
  atk.update(dt, sdt);
  updateCamera(dt);
  fx.update(dt, atk.trails);
  tickHpLag(dt);
  if (!G.started) { stage.camera.position.x += Math.sin(now / 1600) * 0.4; stage.camera.lookAt(CAM_LOOK); }
  // 한동안 안 때리면 도발
  if (G.started && !G.inKO && now - G.lastAct > 7000 && now - G.lastTaunt > 9000) {
    G.lastTaunt = now; say(LINES.taunt);
    dummy.express({ sqL: 0.5, mW: 0.5 }, 0.6);
  }
  stage.renderer.render(stage.scene, stage.camera);
}
requestAnimationFrame(frame);
boot();

window.__sb = { G, D, me, dummy, atk, fx, stage, get net() { return net; }, get faces() { return faces; }, selectTool, setDempsey, startSuper, myHit, impact, onMsg, applyFace, nextFaceId, THREE };
