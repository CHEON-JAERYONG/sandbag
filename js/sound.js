// 효과음: 전부 WebAudio로 직접 합성(파일·키 없음) + 브라우저 내장 한국어 음성(speechSynthesis)으로 비명
let ctx = null, master = null, noiseBuf = null, comp = null;
let enabled = true, voiceOn = true;
let crowdNode = null, crowdGain = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master = ctx.createGain(); master.gain.value = 0.8;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function env(g, t, a, peak, dec, sustainEnd) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function out(pan, vol) {
  const g = ctx.createGain(); g.gain.value = vol;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); p.connect(master); }
  else g.connect(master);
  return g;
}
function noise(t, dur, type, freq, q, peak, a, dst, sweepTo) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 0.7;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, a || 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(dst);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, dur, peak, dst, a) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, a || 0.002, peak, dur);
  o.connect(g); g.connect(dst);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

const SFX = {
  whoosh(t, d, p = 1) { noise(t, 0.16 * p, 'bandpass', 500, 1.2, 0.5, 0.06, d, 2600); },
  punch(t, d, p = 1) { // 퍽 (얼굴)
    tone(t, 'sine', 150, 50, 0.16, 0.9 * p, d);
    noise(t, 0.09, 'lowpass', 1400, 0.8, 0.7 * p, 0.002, d);
    noise(t, 0.025, 'highpass', 2500, 0.7, 0.45, 0.001, d);
  },
  body(t, d, p = 1) { // 쿵 (몸통·샌드백)
    tone(t, 'sine', 95, 38, 0.24, 1.0 * p, d);
    noise(t, 0.14, 'lowpass', 650, 0.9, 0.8 * p, 0.002, d);
    noise(t, 0.03, 'bandpass', 1800, 1, 0.3, 0.001, d);
  },
  kick(t, d, p = 1) {
    SFX.whoosh(t - 0.05, d, 1.3);
    tone(t, 'sine', 120, 32, 0.35, 1.1 * p, d);
    noise(t, 0.2, 'lowpass', 900, 0.8, 0.9 * p, 0.002, d);
  },
  slap(t, d, p = 1) { // 짝
    noise(t, 0.11, 'bandpass', 2600, 0.6, 1.0 * p, 0.001, d);
    noise(t, 0.035, 'highpass', 4000, 0.7, 0.6, 0.001, d);
    tone(t, 'sine', 300, 120, 0.05, 0.3, d);
  },
  knock(t, d, p = 1) { // 꿀밤: 콩!
    tone(t, 'sine', 820, 520, 0.09, 0.7 * p, d);
    tone(t, 'triangle', 1650, 1200, 0.05, 0.3, d);
    noise(t, 0.02, 'bandpass', 3000, 2, 0.4, 0.001, d);
  },
  boing(t, d) { // 혹 솟음
    const o = tone(t, 'sine', 260, 0, 0.45, 0.35, d, 0.01);
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.12); o.frequency.exponentialRampToValueAtTime(420, t + 0.45);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 22; lg.gain.value = 40;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5);
  },
  flick(t, d, p = 1) { // 딱
    tone(t, 'square', 2400, 1800, 0.018, 0.35 * p, d);
    tone(t, 'sine', 1300, 900, 0.06, 0.5 * p, d);
  },
  squeak(t, d, p = 1) { // 뿅망치
    const o = tone(t, 'sine', 900, 0, 0.22, 0.55 * p, d, 0.005);
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(2100, t + 0.06); o.frequency.exponentialRampToValueAtTime(1200, t + 0.22);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 90;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.25);
    noise(t, 0.05, 'bandpass', 900, 1, 0.5, 0.001, d);
  },
  pinch(t, d) { // 꼬집: 고무 늘어나는 소리
    const o = tone(t, 'sawtooth', 300, 700, 0.25, 0.12, d, 0.02);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
  },
  snap(t, d) { // 놓을 때 뿅
    tone(t, 'sine', 380, 1300, 0.08, 0.5, d);
    noise(t, 0.04, 'bandpass', 1800, 1.5, 0.35, 0.001, d);
  },
  tickle(t, d) { noise(t, 0.08, 'highpass', 5000, 0.5, 0.12, 0.01, d); },
  bell(t, d, n = 1) { // 땡
    for (let k = 0; k < n; k++) {
      const tt = t + k * 0.32;
      [[740, 1], [1480 * 1.006, 0.5], [2210 * 0.993, 0.3], [3020, 0.18]].forEach(([f, a]) => tone(tt, 'sine', f, f * 0.995, 1.6, 0.4 * a, d, 0.002));
    }
  },
  crowd(t, d, p = 1) { noise(t, 2.2, 'bandpass', 900, 0.5, 0.35 * p, 0.25, d, 600); noise(t + 0.1, 1.8, 'bandpass', 1700, 0.8, 0.18 * p, 0.3, d, 1100); },
  perfect(t, d) { tone(t, 'triangle', 880, 1760, 0.12, 0.25, d); tone(t + 0.06, 'triangle', 1320, 2640, 0.14, 0.2, d); },
  power(t, d) { tone(t, 'sawtooth', 110, 880, 0.7, 0.2, d, 0.05); noise(t, 0.7, 'bandpass', 300, 1, 0.3, 0.1, d, 3000); },
  ko(t, d) {
    tone(t, 'sine', 90, 25, 0.6, 1.2, d);
    noise(t, 0.4, 'lowpass', 500, 0.8, 1.0, 0.002, d);
    SFX.bell(t + 0.25, d, 3);
    SFX.crowd(t + 0.3, d, 1.4);
  }
};

export const Sound = {
  unlock() {
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    loadVoices();
  },
  setEnabled(v) { enabled = v; if (crowdGain) crowdGain.gain.value = v ? 0.05 : 0; },
  setVoice(v) { voiceOn = v; if (!v) try { speechSynthesis.cancel(); } catch (e) { } },
  get enabled() { return enabled; }, get voiceOn() { return voiceOn; },
  play(name, o = {}) {
    if (!enabled || !ensure() || ctx.state !== 'running') return;
    const fn = SFX[name]; if (!fn) return;
    const d = out(o.pan || 0, o.vol == null ? 1 : o.vol);
    fn(ctx.currentTime + (o.delay || 0) + 0.005, d, o.p == null ? 1 : o.p);
  },
  // 잔잔한 관중 웅성거림
  ambience(on) {
    if (!ensure()) return;
    if (on && !crowdNode) {
      crowdNode = ctx.createBufferSource(); crowdNode.buffer = noiseBuf; crowdNode.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.4;
      crowdGain = ctx.createGain(); crowdGain.gain.value = enabled ? 0.05 : 0;
      crowdNode.connect(f); f.connect(crowdGain); crowdGain.connect(master); crowdNode.start();
    }
  },
  say(text, o = {}) { speak(text, o); }
};

/* ---------- 목소리 ---------- */
let koVoice = null, lastSay = 0, speakingUntil = 0;
function loadVoices() {
  try {
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      koVoice = vs.find(v => /ko(-|_)KR/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /^ko/i.test(v.lang)) || null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  } catch (e) { }
}
function speak(text, o) {
  if (!voiceOn || !enabled || !('speechSynthesis' in window) || !koVoice) return false;
  const now = performance.now();
  if (!o.force && now < speakingUntil && now - lastSay < 900) return false;
  if (now - lastSay < 260) return false;
  lastSay = now;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = koVoice; u.lang = koVoice.lang;
    u.pitch = o.pitch ?? (1.1 + Math.random() * 0.7);
    u.rate = o.rate ?? (1.15 + Math.random() * 0.3);
    u.volume = o.volume ?? 1;
    speakingUntil = now + 250 + text.length * 120;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
export function hasKoreanVoice() { return !!koVoice; }
