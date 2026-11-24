// 때리는 쪽(1인칭): 권투 글러브 2개, 맨손(싸대기·꼬집기·꿀밤·딱밤·간지럼), 발차기 다리, 뿅망치
// 모두 카메라에 붙어 있고, 목표는 월드 좌표로 받아 매 프레임 카메라 기준으로 바꿔 따라감(뎀프시롤로 카메라가 움직여도 정확)
import * as THREE from '../vendor/three.module.min.js';

const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
};
// 손(또는 다리)이 p에 있을 때 팔꿈치(무릎)는 p+elbow 쪽 → 팔이 화면 밖으로 빠지게. up = 손등 방향
const armQ = (p, elbow, up) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p.clone().add(elbow), p, up));
const nv = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const bez = (a, b, c, t, out) => {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
};

function makeGlove(side) {
  const g = new THREE.Group();
  const leather = new THREE.MeshPhysicalMaterial({ color: 0xc4121f, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), leather);
  fist.scale.set(0.2, 0.18, 0.25); fist.position.set(0, 0, -0.05);
  const knuck = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), leather);
  knuck.scale.set(0.19, 0.165, 0.14); knuck.position.set(0, 0.03, -0.2);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 6, 12), leather);
  thumb.position.set(side * -0.16, -0.06, -0.08); thumb.rotation.set(-1.2, 0, side * 0.3);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.26, 24), leather);
  cuff.rotation.x = Math.PI / 2; cuff.position.set(0, -0.01, 0.2);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.07, 24), white);
  band.rotation.x = Math.PI / 2; band.position.set(0, -0.01, 0.17);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 16), new THREE.MeshStandardMaterial({ color: 0xd9a07e, roughness: 0.6 }));
  arm.rotation.x = Math.PI / 2; arm.position.set(0, -0.01, 0.9);
  for (const m of [fist, knuck, thumb, cuff, band, arm]) { m.castShadow = true; g.add(m); }
  return g;
}

/* 맨손: 손바닥 + 손가락 5개(마디 2개) — 손끝이 -z(앞) 방향, 손바닥은 -y 쪽 */
function makeHand() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xe2ad8b, roughness: 0.55 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.85 });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin);
  palm.scale.set(0.2, 0.07, 0.22); palm.castShadow = true; g.add(palm);
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.25, 6, 14), skin);
  wrist.rotation.x = Math.PI / 2; wrist.position.set(0, 0, 0.3); g.add(wrist);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 14), skin);
  fore.rotation.x = Math.PI / 2; fore.position.set(0, 0, 0.62); g.add(fore);
  const cuffM = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 1.4, 16), sleeve);
  cuffM.rotation.x = Math.PI / 2; cuffM.position.set(0, 0, 1.65); g.add(cuffM);
  const fingers = [];
  const xs = [-0.13, -0.045, 0.045, 0.13], lens = [0.15, 0.17, 0.16, 0.13];
  for (let i = 0; i < 4; i++) {
    const k = new THREE.Group(); k.position.set(xs[i], 0, -0.19); g.add(k);
    const s1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, lens[i], 5, 10), skin);
    s1.rotation.x = Math.PI / 2; s1.position.z = -lens[i] / 2; s1.castShadow = true; k.add(s1);
    const j = new THREE.Group(); j.position.z = -lens[i]; k.add(j);
    const s2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, lens[i] * 0.75, 5, 10), skin);
    s2.rotation.x = Math.PI / 2; s2.position.z = -lens[i] * 0.375; s2.castShadow = true; j.add(s2);
    fingers.push({ k, j, len: lens[i] });
  }
  // 엄지
  const tk = new THREE.Group(); tk.position.set(-0.17, -0.01, -0.02); tk.rotation.set(0, 0.9, 0); g.add(tk);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.12, 5, 10), skin);
  t1.rotation.x = Math.PI / 2; t1.position.z = -0.06; tk.add(t1);
  const tj = new THREE.Group(); tj.position.z = -0.12; tk.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.09, 5, 10), skin);
  t2.rotation.x = Math.PI / 2; t2.position.z = -0.045; tj.add(t2);
  const thumb = { k: tk, j: tj };
  // 자세: curl[손가락] (양수 = 손바닥 쪽으로 굽힘), thumb: [벌림, 굽힘]
  const cur = { f: [0, 0, 0, 0], t: [0.9, 0.2], spread: 0 };
  function apply(p) {
    fingers.forEach((f, i) => {
      const c = p.f[i];
      f.k.rotation.set(-c * 0.9, (i - 1.5) * p.spread * 0.12, 0);
      f.j.rotation.set(-c * 1.1, 0, 0);
    });
    thumb.k.rotation.set(-p.t[1] * 0.6, p.t[0], 0);
    thumb.j.rotation.set(-p.t[1] * 0.8, 0, 0);
  }
  const POSES = {
    open: { f: [0.05, 0.03, 0.05, 0.08], t: [0.9, 0.1], spread: 1 },
    fist: { f: [1.55, 1.6, 1.6, 1.55], t: [0.2, 1.1], spread: 0 },
    knuckle: { f: [1.6, 1.25, 1.6, 1.6], t: [0.15, 1.2], spread: 0 },
    pinchOpen: { f: [0.5, 1.5, 1.6, 1.6], t: [0.25, 0.1], spread: 0 },
    pinch: { f: [0.85, 1.5, 1.6, 1.6], t: [0.05, 0.55], spread: 0 },
    flickLoad: { f: [0.2, 1.7, 0.4, 0.5], t: [0.05, 1.0], spread: 0.5 },
    flick: { f: [0.2, -0.15, 0.4, 0.5], t: [0.25, 0.5], spread: 0.5 },
    tickle: { f: [0.6, 0.6, 0.6, 0.6], t: [0.8, 0.4], spread: 1 }
  };
  function setPose(name, mix = 1, wiggle = 0, time = 0) {
    const p = POSES[name];
    for (let i = 0; i < 4; i++) cur.f[i] += (p.f[i] + (wiggle ? Math.sin(time * 30 + i * 1.3) * wiggle : 0) - cur.f[i]) * mix;
    cur.t[0] += (p.t[0] - cur.t[0]) * mix; cur.t[1] += (p.t[1] - cur.t[1]) * mix;
    cur.spread += (p.spread - cur.spread) * mix;
    apply(cur);
  }
  setPose('open');
  g.scale.setScalar(1.35);
  return { g, setPose };
}

function makeLeg() {
  const g = new THREE.Group();
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2b3d63, roughness: 0.9 });
  const shoeW = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 });
  const shoeG = new THREE.MeshStandardMaterial({ color: 0x5b6270, roughness: 0.55 });
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.3, 6, 16), jeans);
  shin.rotation.x = Math.PI / 2; shin.position.z = 0.85; shin.castShadow = true; g.add(shin);
  const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 16), shoeG);
  shoe.rotation.set(0, 0, Math.PI / 2); shoe.scale.set(1, 1.2, 0.85); shoe.position.set(0.18, 0, 0.02); shoe.castShadow = true; g.add(shoe);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.3), shoeW);
  sole.position.set(0.18, 0, 0.13); g.add(sole);
  const swoosh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.02), shoeW);
  swoosh.position.set(0.2, 0.1, -0.08); swoosh.rotation.z = 0.2; g.add(swoosh);
  return g;
}

function makeHammer() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xff2a3a, roughness: 0.35, clearcoat: 0.8 });
  const yel = new THREE.MeshPhysicalMaterial({ color: 0xffd21f, roughness: 0.35, clearcoat: 0.8 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 1.25, 14), yel);
  handle.position.y = 0.62; g.add(handle);
  const head = new THREE.Group(); head.position.y = 1.3; g.add(head);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 24), red);
  body.rotation.z = Math.PI / 2; head.add(body);
  for (let i = -2; i <= 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.025, 8, 24), red);
    r.rotation.y = Math.PI / 2; r.position.x = i * 0.09; head.add(r);
  }
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 24), yel);
    cap.rotation.z = Math.PI / 2; cap.position.x = s * 0.29; head.add(cap);
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { g, head };
}

export class Attacker {
  constructor(camera) {
    this.cam = camera;
    this.time = 0;
    this.guard = false;
    this.gloves = [-1, 1].map(side => {
      const m = makeGlove(side);
      m.scale.setScalar(0.72); camera.add(m);
      return { side, m, anim: null, rest: new THREE.Vector3(side * 0.56, -0.5, -1.6), restRot: new THREE.Euler(0.35, side * -0.25, side * 0.25) };
    });
    this.hand = makeHand(); camera.add(this.hand.g);
    this.hand.g.visible = false;
    this.leg = makeLeg(); camera.add(this.leg); this.leg.visible = false;
    this.ham = makeHammer(); camera.add(this.ham.g); this.ham.g.visible = false;
    this.anims = [];
    this.nextGlove = 1;
    this.handBusy = false;
    this.glovesHidden = false;
    this.trails = []; // 화면 잔상용: {obj, pts:[]}
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }

  toCam(world, out) { return this.cam.worldToLocal(out.copy(world)); }

  setGlovesHidden(h) { this.glovesHidden = h; }

  /* ---------- 주먹 ---------- */
  // kind: straight | hook | upper | body ; side: -1(왼손) 1(오른손) 또는 자동
  punch(target, opt = {}) {
    let side = opt.side;
    if (!side) {
      const free = this.gloves.filter(g => !g.anim);
      if (!free.length) return false;
      side = free.find(g => g.side === this.nextGlove) ? this.nextGlove : free[0].side;
    }
    const G = this.gloves.find(g => g.side === side);
    if (G.anim) return false;
    this.nextGlove = -side;
    const kind = opt.kind || 'straight';
    const out = opt.speed ? 0.09 / opt.speed : 0.1, back = 0.17;
    G.anim = { t: 0, out, hold: 0.045, back, target: target.clone(), kind, onImpact: opt.onImpact, hit: false };
    this.trails.push({ obj: G.m, pts: [], until: this.time + out + 0.05, color: '255,255,255' });
    return true;
  }

  updateGloves(dt, simDt) {
    // 화면 폭에 맞춰 글러브 쉬는 자리(세로 화면에서도 보이게)
    const hw = 1.6 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * this.cam.aspect;
    const gx = Math.max(0.27, Math.min(0.56, hw * 0.72));
    for (const G of this.gloves) {
      G.rest.x = G.side * gx;
      const m = G.m;
      const bob = Math.sin(this.time * 3 + G.side) * 0.015;
      const guardPos = this._w.set(G.side * 0.3, -0.36, -1.15);
      const restP = this.guard ? guardPos : G.rest;
      const hideY = this.glovesHidden ? -0.9 : 0;
      if (!G.anim) {
        m.position.lerp(new THREE.Vector3(restP.x, restP.y + bob + hideY, restP.z), 1 - Math.exp(-dt * 14));
        const rr = this.guard ? new THREE.Euler(0.15, G.side * -0.5, G.side * 0.6) : G.restRot;
        m.quaternion.slerp(new THREE.Quaternion().setFromEuler(rr), 1 - Math.exp(-dt * 12));
        continue;
      }
      const A = G.anim;
      A.t += simDt;
      const end = this.toCam(A.target, this._v);
      // 글러브 크기만큼 앞에서 멈춤
      const startP = new THREE.Vector3(restP.x, restP.y, restP.z);
      const dir = end.clone().sub(startP).normalize();
      end.addScaledVector(dir, -0.16);
      let ctrl;
      if (A.kind === 'hook') ctrl = startP.clone().lerp(end, 0.5).add(new THREE.Vector3(G.side * 1.3, 0.25, 0.2));
      else if (A.kind === 'upper') ctrl = startP.clone().lerp(end, 0.5).add(new THREE.Vector3(G.side * 0.2, -1.0, 0.1));
      else if (A.kind === 'body') ctrl = startP.clone().lerp(end, 0.5).add(new THREE.Vector3(G.side * 0.7, -0.3, 0));
      else ctrl = startP.clone().lerp(end, 0.5).add(new THREE.Vector3(G.side * 0.1, 0.12, 0));
      let p;
      if (A.t < A.out) {
        const k = ease.in(Math.min(1, A.t / A.out) * 0.75 + 0.25 * (A.t / A.out));
        p = bez(startP, ctrl, end, k, new THREE.Vector3());
      } else if (A.t < A.out + A.hold) {
        if (!A.hit) { A.hit = true; A.onImpact && A.onImpact(); }
        p = end;
      } else {
        const k = ease.out(Math.min(1, (A.t - A.out - A.hold) / A.back));
        p = end.clone().lerp(startP, k);
        if (k >= 1) { G.anim = null; }
      }
      if (!A.hit && A.t >= A.out) { A.hit = true; A.onImpact && A.onImpact(); }
      m.position.copy(p);
      // 방향: 주먹이 목표를 향하게
      const look = new THREE.Matrix4().lookAt(p, end.clone().add(dir.clone().multiplyScalar(0.01)).addScaledVector(dir, 0.5), new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      const roll = A.kind === 'hook' ? G.side * -1.35 : A.kind === 'upper' ? G.side * 0.2 : A.kind === 'body' ? G.side * -0.8 : G.side * -0.25;
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(A.kind === 'upper' ? -0.9 : 0, 0, roll)));
      m.quaternion.slerp(q, A.t < A.out ? 0.6 : 0.25);
    }
  }

  /* ---------- 맨손/발/망치: 하나씩 ---------- */
  // 같은 물건이 아직 나가는 중이면 거절, 돌아오는 중이면 끊고 바로 새로 시작
  busyObj(obj) {
    if (this.holding && obj === this.hand.g && this.holding.release < 0) return true;
    return this.anims.some(a => a.obj === obj && a.t < a.out + a.hold);
  }
  busy() { return this.anims.length > 0 || !!this.holding; }

  // 공통 휘두르기: 경로(start→ctrl→end), 맞는 순간 콜백
  swing(obj, o) {
    if (this.busyObj(obj)) return false;
    this.anims = this.anims.filter(a => a.obj !== obj);
    if (this.holding && obj === this.hand.g) this.holding = null;
    obj.visible = true;
    const a = { obj, t: 0, ...o, hit: false };
    this.anims.push(a);
    if (o.trail) this.trails.push({ obj: o.trailObj || obj, pts: [], until: this.time + o.out + 0.06, color: o.trail });
    return true;
  }

  slap(target, fromSide, onImpact) {
    const H = this.hand, s = fromSide;
    const elbow = nv(s * 1, -0.75, 0.35);
    return this.swing(H.g, {
      kind: 'slap', target: target.clone(), out: 0.13, hold: 0.06, back: 0.22, onImpact, trail: '255,255,255',
      start: new THREE.Vector3(s * 2.6, -1.2, -2.6), ctrlOff: new THREE.Vector3(s * 0.9, 0.5, 0.2), stopOff: elbow.clone().multiplyScalar(0.3).add(new THREE.Vector3(s * 0.08, 0, 0)),
      elbow, up: new THREE.Vector3(s, 0.1, 0.15),
      pose: () => H.setPose('open', 0.5)
    });
  }
  knuckle(target, onImpact) {
    const H = this.hand;
    const elbow = nv(0.55, 0.75, 0.45);
    return this.swing(H.g, {
      kind: 'knuckle', target: target.clone(), out: 0.14, hold: 0.05, back: 0.2, onImpact, trail: '255,255,255',
      start: new THREE.Vector3(1.2, 2.2, -3.2), ctrlOff: new THREE.Vector3(0.3, 0.9, 0.3), stopOff: new THREE.Vector3(0.04, 0.3, 0.08),
      elbow, up: new THREE.Vector3(0, 0.2, 1),
      pose: () => H.setPose('knuckle', 0.5)
    });
  }
  flick(target, onImpact) {
    const H = this.hand;
    const elbow = nv(0.55, -0.6, 0.85);
    return this.swing(H.g, {
      kind: 'flick', target: target.clone(), out: 0.22, hold: 0.12, back: 0.2, onImpactAt: 0.26, onImpact,
      start: new THREE.Vector3(1.4, -1.6, -2.0), stopOff: elbow.clone().multiplyScalar(0.62),
      elbow, up: new THREE.Vector3(0, 1, 0.2),
      pose: (k, phase) => H.setPose(phase === 'hold' || (phase === 'out' && k < 0.95) ? 'flickLoad' : 'flick', phase === 'hold' ? 0.9 : 0.3)
    });
  }
  kick(target, onImpact) {
    return this.swing(this.leg, {
      kind: 'kick', target: target.clone(), out: 0.16, hold: 0.07, back: 0.28, onImpact, trail: '255,240,200',
      elbow: nv(0.85, -0.62, 0.55).multiplyScalar(1.45), up: new THREE.Vector3(0, -1, 0),
      start: new THREE.Vector3(3.2, -1.2, -2.4), ctrlOff: new THREE.Vector3(1.6, 0.2, 0.3), stopOff: new THREE.Vector3(0.2, 0, 0.12)
    });
  }
  hammer(target, onImpact) {
    const H = this.ham;
    return this.swing(H.g, {
      kind: 'hammer', target: target.clone(), out: 0.15, hold: 0.07, back: 0.25, onImpact, trail: '255,220,120', trailObj: H.head,
      start: new THREE.Vector3(1.0, -1.6, -1.5), pivotSwing: true,
      orient: () => new THREE.Euler(0, 0, 0)
    });
  }

  // 꼬집기 · 간지럼: 누르고 있는 동안 손이 따라다님
  holdStart(kind, target) {
    const H = this.hand;
    if (this.busyObj(H.g)) return false;
    this.anims = this.anims.filter(a => a.obj !== H.g);
    H.g.visible = true;
    this.holding = { kind, target: target.clone(), t: 0, closed: 0, release: -1 };
    const p = this.toCam(target, new THREE.Vector3());
    H.g.position.set(p.x + 1.0, p.y - 1.3, p.z + 0.9);
    return true;
  }
  holdMove(target) { if (this.holding) this.holding.target.copy(target); }
  holdEnd() { if (this.holding && this.holding.release < 0) this.holding.release = 0; }

  updateHold(dt) {
    const h = this.holding; if (!h) return;
    const H = this.hand;
    h.t += dt;
    const p = this.toCam(h.target, new THREE.Vector3());
    if (h.release >= 0) {
      h.release += dt;
      const k = Math.min(1, h.release / 0.25);
      H.setPose(h.kind === 'pinch' ? 'pinchOpen' : 'open', 0.4);
      H.g.position.lerp(new THREE.Vector3(p.x + 1.2, p.y - 1.5, p.z + 2.2), k * 0.35);
      if (k >= 1) { this.holding = null; H.g.visible = false; }
      return;
    }
    if (h.kind === 'pinch') {
      // 엄지·검지 끝이 잡은 곳에 오도록: 손은 팔꿈치 쪽(오른쪽 아래)으로 조금 물러나 있음
      const elbow = nv(0.75, -0.8, 0.5);
      const want = p.clone().addScaledVector(elbow, 0.5);
      H.g.position.lerp(want, 1 - Math.exp(-dt * 22));
      H.g.quaternion.copy(armQ(H.g.position, elbow, new THREE.Vector3(1, 0.35, 0.1)));
      H.setPose(h.t > 0.06 ? 'pinch' : 'pinchOpen', 0.35);
    } else {
      const elbow = nv(0.35, -1, 0.55);
      const want = p.clone().addScaledVector(elbow, 0.45).add(new THREE.Vector3(Math.sin(h.t * 22) * 0.06, Math.cos(h.t * 27) * 0.05, 0));
      H.g.position.lerp(want, 1 - Math.exp(-dt * 18));
      H.g.quaternion.copy(armQ(H.g.position, elbow, new THREE.Vector3(Math.sin(h.t * 18) * 0.3, 0.1, 1)));
      H.setPose('tickle', 0.5, 0.55, this.time);
    }
  }

  updateSwings(dt, simDt) {
    for (const a of this.anims) {
      a.t += simDt;
      const end = this.toCam(a.target, new THREE.Vector3());
      if (a.stopOff) end.add(a.stopOff);
      else {
        const d = end.clone().sub(a.start).normalize();
        end.addScaledVector(d, -0.12);
      }
      const ctrl = a.start.clone().lerp(end, 0.5).add(a.ctrlOff || new THREE.Vector3(0, 0.1, 0.1));
      let phase, k, p;
      if (a.t < a.out) { phase = 'out'; k = ease.in(a.t / a.out * 0.8 + 0.2 * a.t / a.out); p = bez(a.start, ctrl, end, k, new THREE.Vector3()); }
      else if (a.t < a.out + a.hold) { phase = 'hold'; k = 1; p = end; }
      else { phase = 'back'; k = ease.out(Math.min(1, (a.t - a.out - a.hold) / a.back)); p = end.clone().lerp(a.start, k); }
      const impactAt = a.onImpactAt != null ? a.onImpactAt : a.out;
      if (!a.hit && a.t >= impactAt) { a.hit = true; a.onImpact && a.onImpact(); }
      if (a.kind === 'hammer') {
        // 손잡이 끝을 중심으로 위에서 내려찍기
        const pivot = this.toCam(a.target, new THREE.Vector3()).add(new THREE.Vector3(0.55, -1.25, 0.9));
        const ang = phase === 'out' ? (1 - k) * 1.9 : phase === 'hold' ? 0 : k * 1.2;
        a.obj.position.copy(pivot);
        const toT = this.toCam(a.target, new THREE.Vector3()).sub(pivot);
        const base = Math.atan2(-toT.x, toT.y);
        a.obj.rotation.set(-ang * 0.9, 0, base + 0.12);
      } else {
        a.obj.position.copy(p);
        if (a.elbow) a.obj.quaternion.copy(armQ(p, a.elbow, a.up));
      }
      if (a.pose) a.pose(k, phase, a.t);
      if (phase === 'back' && k >= 1) a.done = true;
    }
    for (const a of this.anims) if (a.done) a.obj.visible = false;
    this.anims = this.anims.filter(a => !a.done);
  }

  setGuard(on) { this.guard = on; }

  update(dt, simDt) {
    this.time += dt;
    this.updateGloves(dt, simDt);
    this.updateSwings(dt, simDt);
    this.updateHold(dt);
    // 잔상 기록
    for (const tr of this.trails) {
      const w = tr.obj.getWorldPosition(new THREE.Vector3());
      tr.pts.push({ p: w, t: this.time });
      while (tr.pts.length && this.time - tr.pts[0].t > 0.06) tr.pts.shift();
    }
    this.trails = this.trails.filter(tr => this.time < tr.until + 0.1);
  }
}
