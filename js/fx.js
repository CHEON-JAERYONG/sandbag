// 효과: 타격 섬광 · 충격파 · 땀방울 · 만화 집중선 · 휘두른 잔상 · 의성어 글자 · 데미지 숫자 · 말풍선 · 화면 흔들림
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex } from './stage.js?v=1.1.0';

const rand = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(stage, hud, layer) {
    this.stage = stage; this.hud = hud; this.layer = layer;
    this.g = hud.getContext('2d');
    this.time = 0;
    this.sprites = [];
    this.lines = [];
    this.shakeAmt = 0;
    this.flashes = [];
    this.burstTex = canvasTex(256, 256, (g, w) => {
      g.translate(w / 2, w / 2);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,245,200,0.95)'); grd.addColorStop(0.6, 'rgba(255,190,80,0.35)'); grd.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = grd;
      g.beginPath();
      const n = 14;
      for (let i = 0; i < n * 2; i++) { const r = i % 2 ? w * 0.16 : w * (0.36 + Math.random() * 0.14), a = i * Math.PI / n; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    });
    this.ringTex = canvasTex(256, 256, (g, w) => {
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 10;
      g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke();
    });
    // 땀방울(인스턴스)
    const dropG = new THREE.SphereGeometry(0.03, 8, 6);
    const dropM = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
    this.N = 260;
    this.drops = new THREE.InstancedMesh(dropG, dropM, this.N);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    stage.scene.add(this.drops);
    this.dropState = Array.from({ length: this.N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
    this.dropIdx = 0;
    this._m = new THREE.Matrix4();
    this.bubbles = [];
  }

  toScreen(world) {
    const v = world.clone().project(this.stage.camera);
    const { w, h } = this.stage.size;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, z: v.z };
  }

  burst(p, size = 1, tint) {
    const m = new THREE.SpriteMaterial({ map: this.burstTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: tint || 0xffffff, rotation: Math.random() * 6 });
    const s = new THREE.Sprite(m); s.position.copy(p); s.renderOrder = 10;
    this.stage.scene.add(s);
    this.sprites.push({ s, t: 0, dur: 0.16, from: 0.25 * size, to: 1.5 * size, fade: true });
    const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.8 }));
    r.position.copy(p); r.renderOrder = 10;
    this.stage.scene.add(r);
    r.material.opacity = 0.55;
    this.sprites.push({ s: r, t: 0, dur: 0.25, from: 0.15 * size, to: 1.25 * size, fade: true });
  }

  sweat(p, dir, n = 14, speed = 3) {
    for (let i = 0; i < n; i++) {
      const d = this.dropState[this.dropIdx]; this.dropIdx = (this.dropIdx + 1) % this.N;
      d.life = rand(0.5, 1.0);
      d.p.copy(p);
      d.v.copy(dir).multiplyScalar(speed * rand(0.4, 1.2)).add(new THREE.Vector3(rand(-1.6, 1.6), rand(0.2, 2.2), rand(-1.2, 1.2)));
      d.s = rand(0.5, 1.4);
    }
  }

  // 화면 좌표 기준 만화 집중선
  speedLines(world, dur = 0.14, strength = 1, color = '255,255,255') {
    const c = world ? this.toScreen(world) : { x: this.stage.size.w / 2, y: this.stage.size.h / 2 };
    const n = Math.round(40 + strength * 40);
    const rays = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, w: rand(1, 5) * strength, r0: rand(0.12, 0.32) }));
    this.lines.push({ c, t: 0, dur, rays, color, strength });
  }

  flash(color = 'rgba(255,255,255,0.8)', dur = 0.08) { this.flashes.push({ color, t: 0, dur }); }
  shake(a) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  // DOM 글자
  domAt(world, cls, html, life = 900, dx = 0, dy = 0) {
    const s = this.toScreen(world);
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    el.style.left = (s.x + dx) + 'px';
    el.style.top = (s.y + dy) + 'px';
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), life);
    return el;
  }
  word(world, text, size = 1, color = '#ffe14a') {
    const el = this.domAt(world, 'onoma', text, 800, rand(-40, 40), rand(-50, -10));
    el.style.setProperty('--rot', rand(-18, 18) + 'deg');
    el.style.setProperty('--sz', (42 * size) + 'px');
    el.style.color = color;
  }
  damage(world, n, mine, crit) {
    const el = this.domAt(world, 'dmg' + (mine ? ' mine' : '') + (crit ? ' crit' : ''), '-' + n, 900, rand(-30, 30), rand(-80, -50));
    return el;
  }
  tag(world, name, icon) {
    this.domAt(world, 'htag', `${icon} ${name}`, 1100, rand(-30, 30), rand(10, 40));
  }
  bubble(getWorld, text, dur = 1.4) {
    for (const b of this.bubbles) b.el.remove();
    const el = document.createElement('div');
    el.className = 'bubble'; el.textContent = text;
    this.layer.appendChild(el);
    this.bubbles = [{ el, getWorld, until: this.time + dur }];
  }

  update(dt, trails) {
    this.time += dt;
    // 스프라이트
    for (const o of this.sprites) {
      o.t += dt;
      const k = Math.min(1, o.t / o.dur);
      o.s.scale.setScalar(o.from + (o.to - o.from) * (1 - Math.pow(1 - k, 3)));
      if (o.fade) o.s.material.opacity = 1 - k;
      if (k >= 1) { this.stage.scene.remove(o.s); o.s.material.dispose(); o.dead = true; }
    }
    this.sprites = this.sprites.filter(o => !o.dead);
    // 땀
    const m = this._m; let any = false;
    for (let i = 0; i < this.N; i++) {
      const d = this.dropState[i];
      if (d.life > 0) {
        d.life -= dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
        if (d.p.y < 0.02) { d.p.y = 0.02; d.v.multiplyScalar(0.3); d.v.y = Math.abs(d.v.y) * 0.2; }
        const s = d.s * Math.min(1, d.life * 4);
        const sp = d.v.length();
        m.makeScale(s, s * (1 + sp * 0.12), s).setPosition(d.p);
        any = true;
      } else m.makeScale(0, 0, 0);
      this.drops.setMatrixAt(i, m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    this.drops.visible = any;
    // 말풍선 위치
    for (const b of this.bubbles) {
      const s = this.toScreen(b.getWorld());
      b.el.style.left = s.x + 'px'; b.el.style.top = s.y + 'px';
      if (this.time > b.until) { b.el.classList.add('out'); setTimeout(() => b.el.remove(), 300); b.dead = true; }
    }
    this.bubbles = this.bubbles.filter(b => !b.dead);
    this.drawHud(dt, trails);
    this.shakeAmt *= Math.exp(-dt * 9);
  }

  shakeOffset() {
    const a = this.shakeAmt;
    if (a < 0.002) return null;
    return new THREE.Vector3(rand(-a, a), rand(-a, a), 0).multiplyScalar(0.6);
  }

  drawHud(dt, trails) {
    const g = this.g, { w, h } = this.stage.size;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.hud.width !== Math.round(w * dpr) || this.hud.height !== Math.round(h * dpr)) {
      this.hud.width = Math.round(w * dpr); this.hud.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // 잔상
    for (const tr of trails || []) {
      if (tr.pts.length < 2) continue;
      const pts = tr.pts.map(o => this.toScreen(o.p));
      for (let i = 1; i < pts.length; i++) {
        const k = i / pts.length;
        g.strokeStyle = `rgba(${tr.color},${0.22 * k * k})`;
        g.lineWidth = 3 + 22 * k;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
      }
    }
    // 집중선
    for (const L of this.lines) {
      L.t += dt;
      const k = L.t / L.dur;
      const R = Math.hypot(w, h);
      g.fillStyle = `rgba(${L.color},${0.9 * (1 - k)})`;
      for (const r of L.rays) {
        const a = r.a, r0 = R * (r.r0 - k * 0.05), r1 = R;
        const x0 = L.c.x + Math.cos(a) * r0, y0 = L.c.y + Math.sin(a) * r0;
        const pa = a + Math.PI / 2;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(L.c.x + Math.cos(a) * r1 + Math.cos(pa) * r.w * 6, L.c.y + Math.sin(a) * r1 + Math.sin(pa) * r.w * 6);
        g.lineTo(L.c.x + Math.cos(a) * r1 - Math.cos(pa) * r.w * 6, L.c.y + Math.sin(a) * r1 - Math.sin(pa) * r.w * 6);
        g.closePath(); g.fill();
      }
    }
    this.lines = this.lines.filter(L => L.t < L.dur);
    for (const f of this.flashes) {
      f.t += dt;
      g.globalAlpha = Math.max(0, 1 - f.t / f.dur);
      g.fillStyle = f.color; g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    this.flashes = this.flashes.filter(f => f.t < f.dur);
  }
}
