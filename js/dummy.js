// 사진 인형(포토 퍼펫): 전신 사진에서 오려낸 진짜 몸(몸통 층 + 팔 층) + 얼굴 사진 머리 카드
// 사진 자체를 관절(뼈대)로 휘게 해서 맞는 모습을 보여줌: 허리 꺾임·무릎 풀림·고개 휘청·팔로 막기/배 움켜쥐기/머리 감싸기·KO 때 뒤로 쓰러짐
// 머리 카드는 셰이더로 찡그림·><·X·^^·소용돌이 눈·눈물·멍·손자국·홍조, 맞은 자리 움푹, 꼬집어 늘리기
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex } from './stage.js?v=1.1.0';

export const FS = 1.55;      // 머리 카드: 얼굴 사진 UV 1칸 = 1.55 단위
const BODY_H = 5.3;          // 몸 사진(목 아래~바닥) 높이
const DEPTH = 0.38;          // 몸 두께(가운데)
const HEAD_DOME = 0.34;      // 머리 카드 볼록함

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const G = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = v3(), _w = v3();

function domeZ(u, v) {
  const d = 1 - ((u - 0.5) / 0.37) ** 2 - ((v - 0.47) / 0.47) ** 2;
  return d > 0 ? HEAD_DOME * Math.sqrt(d) : 0;
}
export function headToUv(p) { return [0.5 + p.x / FS, 0.5 - p.y / FS]; }
export function uvToHead(u, v, out = v3()) { return out.set((u - 0.5) * FS, (0.5 - v) * FS, domeZ(u, v)); }

/* ---------------- 머리 카드 셰이더 ---------------- */
const FACE_PARS = /* glsl */`
uniform sampler2D faceMap;
uniform vec2 eyeL; uniform vec2 eyeR; uniform vec2 mouthP;
uniform vec2 squint; uniform float shut; uniform float eyeMode;
uniform vec2 mouthAmt;
uniform float tears; uniform float blush; uniform float uTime;
uniform vec4 flash;
uniform vec4 bruises[8];
uniform vec4 hands[3];
uniform vec2 blackEye;
varying vec2 vFaceUv;
vec3 gCol;
float gauss2(vec2 d, vec2 s){ vec2 q = d / s; return exp(-dot(q, q)); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 eyeWarp(vec2 uv, vec2 e, float k){
  vec2 d = uv - e;
  float w = exp(-(d.x * d.x) / (0.075 * 0.075) - (d.y * d.y) / (0.05 * 0.05));
  d.y *= 1.0 + k * w;
  return e + d;
}
vec2 mouthWarp(vec2 uv, vec2 m, vec2 amt){
  vec2 d = uv - m;
  float w = exp(-(d.x * d.x) / (0.12 * 0.12) - (d.y * d.y) / (0.075 * 0.075));
  d.x *= 1.0 - amt.x * 0.42 * w;
  d.y *= 1.0 - amt.y * 0.5 * w;
  return m + d;
}
float eyeMark(vec2 uv, vec2 e, float side, float mode){
  vec2 q = (uv - e) / 0.05;
  q.x *= side;
  float d = 1e3;
  if (mode < 1.5) {
    d = min(sdSeg(q, vec2(-0.85, -0.6), vec2(0.65, 0.0)), sdSeg(q, vec2(0.65, 0.0), vec2(-0.85, 0.6)));
  } else if (mode < 2.5) {
    d = min(sdSeg(q, vec2(-0.75, -0.65), vec2(0.75, 0.65)), sdSeg(q, vec2(-0.75, 0.65), vec2(0.75, -0.65)));
  } else if (mode < 3.5) {
    d = min(sdSeg(q, vec2(-0.85, 0.35), vec2(0.0, -0.4)), sdSeg(q, vec2(0.0, -0.4), vec2(0.85, 0.35)));
  } else {
    float r = length(q);
    float a = atan(q.y, q.x) + uTime * 7.0 * side;
    d = abs(fract(r * 2.4 - a / 6.2831853) - 0.5) / 2.4;
    if (r > 0.95) d = 1e3;
  }
  return 1.0 - smoothstep(0.1, 0.18, d);
}
float handPrint(vec2 q){
  float d = length((q - vec2(0.0, 0.3)) / vec2(0.5, 0.42)) - 1.0;
  d *= 0.45;
  d = min(d, sdSeg(q, vec2(-0.33, 0.05), vec2(-0.42, -0.8)) - 0.11);
  d = min(d, sdSeg(q, vec2(-0.11, 0.0), vec2(-0.13, -1.0)) - 0.11);
  d = min(d, sdSeg(q, vec2(0.11, 0.0), vec2(0.13, -0.98)) - 0.11);
  d = min(d, sdSeg(q, vec2(0.33, 0.05), vec2(0.4, -0.72)) - 0.1);
  d = min(d, sdSeg(q, vec2(0.45, 0.35), vec2(0.9, -0.05)) - 0.11);
  return 1.0 - smoothstep(-0.02, 0.06, d);
}
`;
const FACE_MAIN = /* glsl */`
  vec2 uv = vFaceUv;
  if (texture2D(faceMap, uv).a < 0.5) discard;
  vec2 suv = mouthWarp(uv, mouthP, mouthAmt);
  suv = eyeWarp(suv, eyeL, squint.x * 1.9);
  suv = eyeWarp(suv, eyeR, squint.y * 1.9);
  vec3 col = texture2D(faceMap, suv).rgb;
  if (shut > 0.01) {
    float emL = gauss2(uv - eyeL, vec2(0.08, 0.048));
    float emR = gauss2(uv - eyeR, vec2(0.08, 0.048));
    vec3 lidL = texture2D(faceMap, vec2(uv.x, eyeL.y + 0.085 + (uv.y - eyeL.y) * 0.3)).rgb;
    vec3 lidR = texture2D(faceMap, vec2(uv.x, eyeR.y + 0.085 + (uv.y - eyeR.y) * 0.3)).rgb;
    col = mix(col, lidL, shut * smoothstep(0.2, 0.65, emL));
    col = mix(col, lidR, shut * smoothstep(0.2, 0.65, emR));
    if (eyeMode > 0.5) {
      float mk = max(eyeMark(uv, eyeL, 1.0, eyeMode), eyeMark(uv, eyeR, -1.0, eyeMode));
      col = mix(col, vec3(0.012, 0.008, 0.008), mk * shut);
    }
  }
  for (int i = 0; i < 8; i++) {
    vec4 b = bruises[i];
    if (b.w > 0.001) col = mix(col, col * vec3(0.5, 0.26, 0.42), clamp(gauss2(uv - b.xy, vec2(b.z)) * b.w, 0.0, 0.85));
  }
  col = mix(col, col * vec3(0.32, 0.17, 0.33), clamp(gauss2(uv - eyeL, vec2(0.085, 0.062)) * blackEye.x, 0.0, 0.85));
  col = mix(col, col * vec3(0.32, 0.17, 0.33), clamp(gauss2(uv - eyeR, vec2(0.085, 0.062)) * blackEye.y, 0.0, 0.85));
  float bl = (gauss2(uv - eyeL - vec2(-0.03, 0.12), vec2(0.075, 0.05)) + gauss2(uv - eyeR - vec2(0.03, 0.12), vec2(0.075, 0.05))) * blush;
  col = mix(col, vec3(0.75, 0.06, 0.07), clamp(bl, 0.0, 0.55));
  for (int i = 0; i < 3; i++) {
    vec4 h = hands[i];
    if (h.w > 0.001) {
      vec2 d = uv - h.xy; float cs = cos(h.z), sn = sin(h.z);
      vec2 q = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) / 0.085;
      col = mix(col, col * vec3(1.25, 0.28, 0.28), handPrint(q) * h.w * 0.8);
    }
  }
  if (tears > 0.01) {
    for (int k = 0; k < 2; k++) {
      vec2 e = k == 0 ? eyeL : eyeR;
      float sd = k == 0 ? -1.0 : 1.0;
      float y = uv.y - e.y - 0.025;
      float x = uv.x - (e.x + sd * (0.025 + y * 0.12) + 0.006 * sin(uv.y * 45.0 + uTime * 4.0));
      float wdt = 0.009 + y * 0.03;
      float st = (1.0 - smoothstep(wdt, wdt + 0.008, abs(x))) * smoothstep(-0.01, 0.01, y) * (1.0 - smoothstep(0.32, 0.45, y));
      float flow = 0.65 + 0.35 * sin(y * 70.0 - uTime * 14.0);
      col = mix(col, vec3(0.45, 0.75, 1.0) * flow + 0.1, clamp(st * tears, 0.0, 0.9));
    }
  }
  col = mix(col, flash.rgb, flash.a);
  gCol = col;
  diffuseColor.rgb = col * 0.32;
`;
function makeHeadMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFaceUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FACE_PARS)
      .replace('#include <map_fragment>', FACE_MAIN)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gCol * 0.74;');
  };
  return mat;
}

// 격자 판(가로 nx, 세로 ny), uv는 위가 0 (flipY=false 텍스처와 맞춤)
function gridGeometry(nx, ny, keep) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { pos.push(0, 0, 0); uv.push(i / nx, j / ny); }
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (keep && !keep(i, j)) continue;
    idx.push(id(i, j), id(i, j + 1), id(i + 1, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// 투명도로 두께 지도(테두리에서 멀수록 두꺼움)
function depthFromAlpha(alpha, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = alpha[i] > 100 ? INF : 0;
  const pass = (x, y, dx, dy, c) => { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) return; const k = y * w + x, n = yy * w + xx; if (d[n] + c < d[k]) d[k] = d[n] + c; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { pass(x, y, -1, 0, 1); pass(x, y, 0, -1, 1); pass(x, y, -1, -1, 1.414); pass(x, y, 1, -1, 1.414); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { pass(x, y, 1, 0, 1); pass(x, y, 0, 1, 1); pass(x, y, 1, 1, 1.414); pass(x, y, -1, 1, 1.414); }
  for (let i = 0; i < w * h; i++) d[i] = Math.sqrt(Math.min(1, d[i] / 60));
  return d;
}
function segDist(px, py, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = px - a[0], wy = py - a[1];
  const L = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / L, 0, 1);
  return Math.hypot(wx - vx * t, wy - vy * t);
}
async function imageData(src) {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  return { canvas: c, data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
function texOf(canvas) {
  const t = new THREE.Texture(canvas);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/* ---------------- 열쇠 없을 때 쓰는 만화 몸 ---------------- */
export const DEFAULT_JOINTS = { pelvis: [228, 526], spine: [223, 389], chest: [223, 159], neck: [228, 26], shL: [185, 100], elL: [112, 335], wrL: [185, 462], haL: [215, 525], shR: [315, 52], hipL: [161, 539], knL: [115, 759], anL: [68, 939], toL: [58, 1029], hipR: [301, 526], knR: [301, 792], anR: [241, 946], toR: [268, 1019] };
export function cartoonBody() {
  const W = 385, H = 1074, J = DEFAULT_JOINTS;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const torso = mk(), g = torso.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
  line([J.hipL, J.knL, J.anL], 74, '#2b3d63'); line([J.hipR, J.knR, J.anR], 74, '#25365a');
  for (const [a, t] of [[J.anL, J.toL], [J.anR, J.toR]]) { line([a, t], 60, '#6b717c'); line([[a[0] - 10, a[1] + 40], [t[0] + 10, t[1] + 20]], 22, '#f0f0f0'); }
  g.fillStyle = '#2b3d63'; g.fillRect(J.hipL[0] - 40, J.pelvis[1] - 40, J.hipR[0] - J.hipL[0] + 80, 90);
  g.fillStyle = '#ecebe6';
  g.beginPath(); g.moveTo(J.neck[0] - 60, 10); g.lineTo(J.neck[0] + 60, 10); g.lineTo(J.shR[0] + 20, J.shR[1] + 40); g.lineTo(J.hipR[0] + 30, J.pelvis[1] - 10);
  g.lineTo(J.hipL[0] - 60, J.pelvis[1] - 10); g.lineTo(60, 120); g.closePath(); g.fill();
  const arm = mk(), a = arm.getContext('2d'); a.lineCap = 'round'; a.lineJoin = 'round';
  a.strokeStyle = '#a3a7ae'; a.lineWidth = 76; a.beginPath(); a.moveTo(...J.shL); a.lineTo(...J.elL); a.lineTo(...J.wrL); a.stroke();
  a.fillStyle = '#e9bf9f'; a.beginPath(); a.ellipse(J.haL[0], J.haL[1], 34, 44, 0.4, 0, Math.PI * 2); a.fill();
  return { img: torso.toDataURL('image/png'), arm: arm.toDataURL('image/png'), w: W, h: H, joints: J, floorY: 1052 };
}

/* ---------------- 인형 ---------------- */
export class Dummy {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();          // 발 기준으로 흔들리고 쓰러짐
    scene.add(this.root);
    this.time = 0;
    this.koMode = false;
    this.ready = false;
    // 관절 표시용(다른 코드가 위치를 물어볼 때)
    this.neck = new THREE.Object3D(); this.body = new THREE.Object3D(); this.root.add(this.neck, this.body);
    this.headGrp = new THREE.Group(); this.root.add(this.headGrp);
    this.headInner = new THREE.Group(); this.headGrp.add(this.headInner);

    // 머리 카드
    this.u = {
      faceMap: { value: null },
      eyeL: { value: new THREE.Vector2(0.37, 0.45) }, eyeR: { value: new THREE.Vector2(0.63, 0.45) }, mouthP: { value: new THREE.Vector2(0.5, 0.72) },
      squint: { value: new THREE.Vector2() }, shut: { value: 0 }, eyeMode: { value: 0 },
      mouthAmt: { value: new THREE.Vector2() }, tears: { value: 0 }, blush: { value: 0 }, uTime: { value: 0 },
      flash: { value: new THREE.Vector4(1, 1, 1, 0) },
      bruises: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      hands: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
      blackEye: { value: new THREE.Vector2() }
    };
    const hg = gridGeometry(72, 72);
    this.head = new THREE.Mesh(hg, makeHeadMaterial(this.u));
    this.head.castShadow = true; this.head.userData.part = 'head';
    this.head.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
    this.headInner.add(this.head);
    this.headMesh = { mesh: this.head, rest: null, base: null, dirty: true, active: false };
    {
      const p = hg.attributes.position, uv = hg.attributes.uv;
      for (let i = 0; i < p.count; i++) { const u = uv.getX(i), v = uv.getY(i); p.setXYZ(i, (u - 0.5) * FS, (0.5 - v) * FS, domeZ(u, v)); }
      hg.computeVertexNormals();
      this.headMesh.rest = new Float32Array(p.array); this.headMesh.base = new Float32Array(p.array);
      p.setUsage(THREE.DynamicDrawUsage);
    }

    // 별(어지러움)
    const starTex = canvasTex(64, 64, (g) => {
      g.translate(32, 32); g.fillStyle = '#ffe14a'; g.strokeStyle = '#a86a00'; g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    });
    this.starGrp = new THREE.Group(); this.headGrp.add(this.starGrp);
    this.stars = Array.from({ length: 5 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.26); this.starGrp.add(s); return s;
    });
    this.dizzy = 0;
    this.bumps = [];
    this.skinCol = new THREE.Color(0xe9bf9f);

    // 물리 상태
    this.B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };     // 발 기준 흔들림/쓰러짐
    this.W = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };     // 허리(옆으로 꺾임 z, 앞으로 숙임 x, 비틀림 y)
    this.H = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };     // 머리
    this.C = { c: 0, v: 0 };                                // 무릎 풀림(주저앉음)
    this.S = { h: 0, vh: 0 };                               // 머리 찌그러짐
    this.A = { a: 0, va: 0, e: 0, ve: 0, pose: null, poseT: 0 }; // 보이는 팔(어깨 a, 팔꿈치 e — 화면 안에서 돌기)
    this.spin = null;
    this.deformers = [];

    // 표정
    this.ex = { sqL: 0, sqR: 0, shut: 0, mode: 0, mW: 0, mO: 0, tears: 0, blush: 0, flash: 0 };
    this.hold = {};
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.flashCol = new THREE.Color(1, 1, 1);
    this.damage = { swellL: 0, swellR: 0, bruises: [], hands: [], blackL: 0, blackR: 0, hpRatio: 1 };
    this.face = null;
    this.hitMeshes = [this.head];
    this.mats = [];
  }

  /* ---------- 몸 만들기 (사진 → 격자 → 뼈대 가중치) ---------- */
  async setBody(rec) {
    const [tor, arm] = await Promise.all([imageData(rec.img), imageData(rec.arm)]);
    const J = rec.joints, W = tor.w, H = tor.h;
    this.J = J; this.bw = W; this.bh = H; this.floorY = rec.floorY;
    const K = this.K = BODY_H / rec.floorY;
    this.toRest = (px, py, out = v3()) => out.set((px - J.pelvis[0]) * K, (rec.floorY - py) * K, 0);
    const alphaT = new Uint8Array(W * H), alphaA = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { alphaT[i] = tor.data[i * 4 + 3]; alphaA[i] = arm.data[i * 4 + 3]; }
    this.alphaT = alphaT; this.alphaA = alphaA;
    const depth = depthFromAlpha(alphaT, W, H);
    this.depth = depth;
    // 왼쪽 어깨(안 보이는 팔 쪽)는 대칭으로
    const shLt = [J.chest[0] - (J.shR[0] - J.chest[0]), J.shR[1]];
    const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // 뼈 목록: 0 pelvis 1 spine 2 chest 3 neck 4 thL 5 shinL 6 footL 7 thR 8 shinR 9 footR 10 upL 11 loL
    this.bones = [
      { n: 'pelvis', p: J.pelvis, segs: [[J.hipL, J.hipR], [J.pelvis, mid(J.pelvis, J.spine)]] },
      { n: 'spine', p: J.spine, parent: 0, segs: [[mid(J.pelvis, J.spine), mid(J.spine, J.chest)]] },
      { n: 'chest', p: J.chest, parent: 1, segs: [[mid(J.spine, J.chest), J.neck], [shLt, J.shR]] },
      { n: 'neck', p: J.neck, parent: 2, segs: [[J.neck, [J.neck[0], J.neck[1] - 30]]] },
      { n: 'thL', p: J.hipL, segs: [[J.hipL, J.knL]] }, { n: 'shinL', p: J.knL, segs: [[J.knL, J.anL]] }, { n: 'footL', p: J.anL, segs: [[J.anL, J.toL]] },
      { n: 'thR', p: J.hipR, segs: [[J.hipR, J.knR]] }, { n: 'shinR', p: J.knR, segs: [[J.knR, J.anR]] }, { n: 'footR', p: J.anR, segs: [[J.anR, J.toR]] },
      { n: 'upL', p: J.shL, parent: 2, segs: [[J.shL, J.elL]] }, { n: 'loL', p: J.elL, parent: 10, segs: [[J.elL, J.wrL], [J.wrL, J.haL]] }
    ];
    for (const b of this.bones) { b.rest = this.toRest(b.p[0], b.p[1]); b.m = new THREE.Matrix4(); }
    this.boneSets = { torso: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], arm: [10, 11, 2] };
    // 메시 2개
    for (const old of this.mats) old.dispose && old.dispose();
    if (this.torso) { this.root.remove(this.torso); this.root.remove(this.arm); }
    this.layers = {};
    const mkLayer = (name, img, alpha, zOff, set) => {
      const nx = Math.round(W / 9), ny = Math.round(H / 9);
      const near = (i, j) => { // 그 칸 근처에 보이는 점이 있나
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
          const x = Math.round(clamp((i + dx) / nx * W, 0, W - 1)), y = Math.round(clamp((j + dy) / ny * H, 0, H - 1));
          if (alpha[y * W + x] > 20) return true;
        }
        return false;
      };
      const g = gridGeometry(nx, ny, near);
      const pos = g.attributes.position, uv = g.attributes.uv, n = pos.count;
      const rest = new Float32Array(n * 3), wi = new Uint8Array(n * 3), ww = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const px = uv.getX(k) * W, py = uv.getY(k) * H;
        const x = Math.round(clamp(px, 0, W - 1)), y = Math.round(clamp(py, 0, H - 1));
        const r = this.toRest(px, py);
        rest[k * 3] = r.x; rest[k * 3 + 1] = r.y; rest[k * 3 + 2] = depth[y * W + x] * DEPTH + zOff;
        const ds = set.map(bi => ({ bi, d: Math.min(...this.bones[bi].segs.map(s => segDist(px, py, s[0], s[1]))) })).sort((a, b) => a.d - b.d).slice(0, 3);
        let sum = 0;
        for (const o of ds) { o.w = Math.exp(-(o.d - ds[0].d) / 16); sum += o.w; }
        ds.forEach((o, t) => { wi[k * 3 + t] = o.bi; ww[k * 3 + t] = o.w / sum; });
      }
      pos.array.set(rest); pos.setUsage(THREE.DynamicDrawUsage);
      g.computeVertexNormals();
      g.boundingSphere = new THREE.Sphere(v3(0, BODY_H / 2, 0), BODY_H * 1.2);
      const tex = texOf(img.canvas);
      const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x525252, alphaTest: 0.5, roughness: 0.95, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.74, toneMapped: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
      mesh.userData.part = name === 'arm' ? 'arm' : 'body';
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.mats.push(mat, tex);
      const L = { name, mesh, rest, base: new Float32Array(rest), wi, ww, alpha, set, W, H };
      this.layers[name] = L;
      return mesh;
    };
    this.torso = mkLayer('torso', tor, alphaT, 0, this.boneSets.torso);
    this.arm = mkLayer('arm', arm, alphaA, 0.06, this.boneSets.arm);
    this.bag = this.torso;
    this.hitMeshes = [this.head, this.arm, this.torso];
    this.neckRest = this.toRest(J.neck[0], J.neck[1]);
    this.spineRest = this.toRest(J.spine[0], J.spine[1]);
    // 다리 IK 기준
    const R = (k) => this.toRest(J[k][0], J[k][1]);
    this.legs = ['L', 'R'].map(s => {
      const h0 = R('hip' + s), k0 = R('kn' + s), a0 = R('an' + s);
      const bend = Math.sign((k0.x - h0.x) * (a0.y - h0.y) - (k0.y - h0.y) * (a0.x - h0.x)) || 1;
      return { s, h0, k0, a0, L1: h0.distanceTo(k0), L2: k0.distanceTo(a0), bend, th: s === 'L' ? 4 : 7, sh: s === 'L' ? 5 : 8 };
    });
    this.ready = true;
    this.update(0);
  }

  setName(name) { this.name = name; }

  /* 얼굴(머리 카드) 바꾸기 */
  setFace(face) {
    this.face = face;
    const u = this.u;
    u.faceMap.value = face.tex || null;
    this.head.customDepthMaterial.map = face.tex || null;
    this.head.customDepthMaterial.needsUpdate = true;
    u.eyeL.value.set(face.eyeL[0], face.eyeL[1]);
    u.eyeR.value.set(face.eyeR[0], face.eyeR[1]);
    u.mouthP.value.set(face.mouth[0], face.mouth[1]);
    this.skinCol.set(face.skin || '#e6b898');
    this.name = face.name;
    this.chinV = Math.min(0.93, face.mouth[1] + 0.14);
    this.topV = face.topV ?? 0.08;
    this.resetDamage();
  }

  resetDamage() {
    const d = this.damage;
    d.swellL = d.swellR = 0; d.bruises = []; d.hands = []; d.blackL = d.blackR = 0; d.hpRatio = 1;
    for (const b of this.bumps) this.headInner.remove(b.mesh);
    this.bumps = [];
    this.dizzy = 0;
    this.applyStatic();
    this.syncDecals();
  }

  // 머리 카드 굴곡(코·눈두덩) + 부은 볼
  applyStatic() {
    const M = this.headMesh, f = this.face, uv = this.head.geometry.attributes.uv;
    const eL = f ? f.eyeL : [0.37, 0.45], eR = f ? f.eyeR : [0.63, 0.45], mo = f ? f.mouth : [0.5, 0.72];
    const mx = (eL[0] + eR[0]) / 2, my = (eL[1] + eR[1]) / 2;
    const nose = [mx + (mo[0] - mx) * 0.55, my + (mo[1] - my) * 0.55];
    const d = this.damage;
    for (let i = 0, n = uv.count; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      let z = 0.09 * G(u - nose[0], v - nose[1], 0.045, 0.07);
      z -= 0.03 * (G(u - eL[0], v - eL[1], 0.055, 0.035) + G(u - eR[0], v - eR[1], 0.055, 0.035));
      z += 0.025 * G(u - mo[0], v - mo[1] + 0.01, 0.09, 0.045);
      z += d.swellL * 0.13 * G(u - eL[0] + 0.03, v - eL[1] - 0.15, 0.09, 0.09);
      z += d.swellR * 0.13 * G(u - eR[0] - 0.03, v - eR[1] - 0.15, 0.09, 0.09);
      M.base[i * 3 + 2] = M.rest[i * 3 + 2] + z * (domeZ(u, v) > 0 ? 1 : 0.3);
    }
    M.dirty = true;
  }

  syncDecals() {
    const u = this.u, d = this.damage;
    for (let i = 0; i < 8; i++) { const b = d.bruises[i]; if (b) u.bruises.value[i].set(b[0], b[1], b[2], b[3]); else u.bruises.value[i].set(0, 0, 0.1, 0); }
    for (let i = 0; i < 3; i++) { const h = d.hands[i]; if (h) u.hands.value[i].set(h[0], h[1], h[2], h[3]); else u.hands.value[i].set(0, 0, 0, 0); }
    u.blackEye.value.set(d.blackL, d.blackR);
  }

  /* ---------- 맞은 자리 ---------- */
  // 레이캐스트 결과 → 투명한 곳이면 null
  describeHit(hit) {
    const part = hit.object.userData.part;
    if (part === 'head') {
      const uv = hit.uv; if (!uv || !this.face) return null;
      if (this.face.alphaAt && this.face.alphaAt(uv.x, uv.y) < 128) return null;
      const lp = this.headInner.worldToLocal(hit.point.clone());
      return { part: 'head', lp, zone: this.zoneOf('head', lp) };
    }
    const L = part === 'arm' ? this.layers.arm : this.layers.torso;
    const px = hit.uv.x * L.W, py = hit.uv.y * L.H;
    const a = L.alpha[Math.round(clamp(py, 0, L.H - 1)) * L.W + Math.round(clamp(px, 0, L.W - 1))];
    if (a < 128) return null;
    const lp = this.toRest(px, py);
    lp.z = this.depth[Math.round(clamp(py, 0, this.bh - 1)) * this.bw + Math.round(clamp(px, 0, this.bw - 1))] * DEPTH;
    return { part, lp, zone: this.zoneOf(part, lp) };
  }
  // 부위 이름: head → face/top, body → body/gut/low/leg, arm → arm
  zoneOf(part, lp) {
    if (part === 'head') {
      const [, v] = headToUv(lp);
      return v < (this.topV ?? 0.08) + 0.14 ? 'top' : 'face';
    }
    if (part === 'arm') return 'arm';
    const b = this.dominantBone(lp, 'torso');
    if (b <= 0) return 'low';
    if (b === 1) return 'gut';
    if (b === 2 || b === 3) return 'body';
    return 'leg';
  }
  restToPx(lp) { return [lp.x / this.K + this.J.pelvis[0], this.floorY - lp.y / this.K]; }
  weightsAt(lp, layer) {
    const L = this.layers[layer];
    const [px, py] = this.restToPx(lp);
    const ds = L.set.map(bi => ({ bi, d: Math.min(...this.bones[bi].segs.map(s => segDist(px, py, s[0], s[1]))) })).sort((a, b) => a.d - b.d).slice(0, 3);
    let sum = 0; for (const o of ds) { o.w = Math.exp(-(o.d - ds[0].d) / 16); sum += o.w; }
    return ds.map(o => ({ bi: o.bi, w: o.w / sum }));
  }
  dominantBone(lp, layer) { return this.weightsAt(lp, layer)[0].bi; }
  // 쉬는 자세 좌표 → 지금 월드 좌표
  worldOf(part, lp, out = v3()) {
    if (part === 'head') return this.headInner.localToWorld(out.copy(lp));
    if (!this.ready) return out.copy(lp);
    const ws = this.weightsAt(lp, part === 'arm' ? 'arm' : 'torso');
    out.set(0, 0, 0);
    for (const { bi, w } of ws) out.addScaledVector(_v.copy(lp).applyMatrix4(this.bones[bi].m), w);
    return this.root.localToWorld(out);
  }
  partObj(part) { return part === 'head' ? this.headInner : this.root; }
  // 몸 사진 좌표(px)의 자리 → 투명하면 가운데 쪽으로 옮김
  bodySpotPx(px, py) {
    const J = this.J, L = this.layers.torso;
    let x = px; const y = clamp(py, 0, L.H - 1);
    for (let i = 0; i < 30; i++) {
      if (L.alpha[Math.round(y) * L.W + Math.round(clamp(x, 0, L.W - 1))] > 160) break;
      x += (J.chest[0] - x) * 0.15;
    }
    const lp = this.toRest(x, y);
    lp.z = this.depth[Math.round(y) * this.bw + Math.round(clamp(x, 0, this.bw - 1))] * DEPTH;
    return { part: 'body', lp, point: this.worldOf('body', lp) };
  }
  spot(name) {
    const J = this.J;
    if (name === 'gut') return this.bodySpotPx(J.spine[0] + 25, (J.spine[1] + J.pelvis[1]) / 2 - 20);
    if (name === 'chest') return this.bodySpotPx(J.chest[0] + 40, J.chest[1] + 50);
    if (name === 'sideL') return this.bodySpotPx(J.chest[0] - 115, J.spine[1] - 50 + Math.random() * 60);
    if (name === 'sideR') return this.bodySpotPx(J.chest[0] + 105, J.spine[1] - 50 + Math.random() * 60);
    return this.bodySpotPx(J.hipR[0] - 10, (J.hipR[1] + J.knR[1]) / 2);
  }

  /* 타격: dir=월드 방향(단위), power≈1~10 */
  hit(o) {
    const { part, lp, dir } = o;
    const power = o.power || 2;
    const zone = this.zoneOf(part, lp);
    const P = this.worldOf(part, lp, v3());
    const J = dir.clone().multiplyScalar(power);
    const rootInv = this.root.getWorldQuaternion(_q).invert();
    const lj = J.clone().applyQuaternion(rootInv);   // 인형 기준 방향
    // 허리 기준 회전
    const waist = this.body.getWorldPosition(v3());
    const tw = P.clone().sub(waist).cross(J);
    if (part === 'head') {
      const nw = this.neck.getWorldPosition(v3());
      const th = P.clone().sub(nw).cross(J).applyQuaternion(rootInv);
      const m = o.headMul || 1;
      this.H.vx += th.x / 0.9 * m; this.H.vy += th.y / 1.0 * m; this.H.vz += th.z / 0.75 * m;
      this.W.vx += tw.x * 0.06; this.W.vz += tw.z * 0.08;
    } else if (zone === 'gut' || zone === 'low') {
      // 배를 맞으면 앞으로 푹 숙이고 무릎이 풀림
      this.W.vx += power * 0.55; this.W.vz += lj.x * 0.25;
      this.C.v += power * 0.55;
      this.H.vx += power * 0.6;
    } else if (zone === 'leg') {
      this.C.v += power * 0.7; this.B.vz += -lj.x * 0.05; this.W.vz += lj.x * 0.2;
    } else if (part === 'arm') {
      this.A.va += lj.x * 0.9 + lj.y * 0.4; this.A.ve += lj.x * 0.6;
      this.W.vz += lj.x * 0.1;
    } else {
      const t = tw.applyQuaternion(rootInv);
      this.W.vx += t.x / 4.5; this.W.vy += t.y / 5; this.W.vz += t.z / 3.2;
    }
    // 발 기준 흔들림(조금)
    const rb = P.clone().sub(this.root.getWorldPosition(v3())).cross(J).applyQuaternion(rootInv);
    this.B.vx += rb.x / 70; this.B.vz += rb.z / 55; this.B.vy += rb.y / 40;
    if (o.squash && part === 'head') this.S.vh -= o.squash;
    // 움푹
    if (o.dent !== 0) {
      if (part === 'head') {
        const ld = dir.clone().applyQuaternion(this.headInner.getWorldQuaternion(_q).invert()).normalize();
        this.addDeformer('head', lp, ld, o.radius || 0.25, (o.dent ?? 1) * power * 0.8);
      } else if (part === 'body') {
        const ld = lj.clone().normalize(); ld.z = Math.min(ld.z, -0.6); ld.normalize();
        this.addDeformer('torso', lp, ld, (o.radius || 0.3) * 1.15, (o.dent ?? 1) * power * 0.7);
      }
    }
    return P;
  }

  addDeformer(layer, p, vec, radius, v0) {
    if (this.deformers.length > 10) this.deformers.shift();
    const d = { layer, p: p.clone(), vec: vec.clone(), r: radius, a: 0, v: v0, k: 170, c: 8, pull: false };
    this.deformers.push(d);
    return d;
  }
  // 꼬집기
  grab(part, lp) {
    const layer = part === 'head' ? 'head' : part === 'arm' ? 'arm' : 'torso';
    const d = { layer, part, p: lp.clone(), vec: v3(), r: part === 'head' ? 0.14 : 0.2, a: 0, v: 0, k: 260, c: 14, pull: true, goal: 1, held: true, lp: lp.clone() };
    this.deformers.push(d);
    return d;
  }
  grabWorld(d, withPull = true) {
    const p = d.p.clone(); if (withPull) p.addScaledVector(d.vec, d.a);
    return this.worldOf(d.part === 'head' ? 'head' : d.part, p);
  }
  pull(d, worldTarget) {
    const grabW = this.grabWorld(d, false);
    const pw = worldTarget.clone().sub(grabW);
    const len = pw.length(), max = d.part === 'head' ? 0.75 : 0.6;
    if (len > max) pw.multiplyScalar(max / len);
    d.pullWorld = pw;
    const obj = d.part === 'head' ? this.headInner : this.root;
    const s = obj.getWorldScale(v3());
    d.vec.copy(pw).applyQuaternion(obj.getWorldQuaternion(_q).invert()).divide(s);
    return pw.length() / max;
  }
  release(d) { d.held = false; d.goal = 0; d.k = 220; d.c = 5.5; d.pullWorld = null; }

  addBump(lp) {
    const n = lp.clone();
    for (const b of this.bumps) {
      if (b.n.distanceTo(n) < 0.3) {
        if (b.stack < 2) {
          b.stack++;
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), b.mesh.material);
          m.position.set(0, 0.12, 0); m.scale.setScalar(0.01); b.mesh.add(m);
          b.subs.push({ m, s: 0, v: 9 });
        } else b.v += 6;
        return;
      }
    }
    if (this.bumps.length >= 4) return;
    const mat = new THREE.MeshStandardMaterial({ color: this.skinCol.clone().lerp(new THREE.Color(0xff6a6a), 0.35), roughness: 0.45 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), mat);
    mesh.position.set(lp.x, lp.y + 0.04, Math.max(0.05, lp.z));
    mesh.scale.setScalar(0.01); mesh.castShadow = true;
    this.headInner.add(mesh);
    this.bumps.push({ mesh, n, s: 0, v: 10, stack: 0, subs: [] });
  }

  setDizzy(sec) { this.dizzy = Math.max(this.dizzy, sec); }
  // 사람처럼 반사적으로: 'face' 얼굴 막기, 'gut' 배 움켜쥐기, 'head' 머리 감싸기
  flinch(kind, sec = 0.45) {
    if (this.koMode) return;
    const P = { face: [1.95, 0.75], gut: [0.55, 0.85], head: [2.75, 1.05], out: [-0.7, 0.2] }[kind];
    if (!P) return;
    this.A.pose = P; this.A.poseT = sec;
  }

  express(p, hold = 0.35) {
    const ex = this.ex;
    for (const k of ['sqL', 'sqR', 'shut', 'mW', 'mO', 'tears', 'blush', 'flash']) {
      if (p[k] != null) { ex[k] = Math.max(ex[k], p[k]); this.hold[k] = Math.max(this.hold[k] || 0, p[k + 'Hold'] ?? hold); }
    }
    if (p.mode != null && !this.koMode) { ex.mode = p.mode; this.hold.mode = Math.max(this.hold.mode || 0, hold); }
    if (p.flashCol) this.flashCol.set(p.flashCol);
  }
  addBruise(uv, size, amt) {
    const list = this.damage.bruises;
    for (const b of list) if (Math.hypot(b[0] - uv[0], b[1] - uv[1]) < size * 0.8) { b[3] = Math.min(1, b[3] + amt); b[2] = Math.min(0.12, b[2] + 0.004); this.syncDecals(); return; }
    list.push([uv[0], uv[1], size, amt]); if (list.length > 8) list.shift();
    this.syncDecals();
  }
  addHandPrint(uv, angle) { const l = this.damage.hands; l.push([uv[0], uv[1], angle, 1]); if (l.length > 3) l.shift(); this.syncDecals(); }
  addSwell(side, amt) {
    const d = this.damage;
    if (side <= 0) d.swellL = Math.min(1, d.swellL + amt);
    if (side >= 0) d.swellR = Math.min(1, d.swellR + amt);
    this.applyStatic();
  }
  addBlackEye(side, amt) { const d = this.damage; if (side < 0) d.blackL = Math.min(1, d.blackL + amt); else d.blackR = Math.min(1, d.blackR + amt); this.syncDecals(); }
  setHpRatio(r) { this.damage.hpRatio = r; }
  setKO(on) {
    this.koMode = on;
    if (on) { this.ex.mode = 2; this.B.vx -= 1.2; this.C.v += 2; this.H.vx -= 2; this.setDizzy(4.5); this.A.pose = null; }
    else { this.ex.mode = 0; this.B.vx += 2.5; }
  }
  spinSwap(cb) { this.spin = { t: 0, dur: 0.7, cb, done: false }; }

  headTopWorld(out = v3()) { return this.headInner.localToWorld(out.set(0, (0.5 - (this.topV ?? 0.08)) * FS + 0.08, 0.1)); }
  headWorld(out = v3()) { return this.headInner.localToWorld(out.set(0, 0.05 * FS, 0.3)); }
  headSpotUV(u, v) { const lp = uvToHead(u, v); return { part: 'head', lp, point: this.headInner.localToWorld(lp.clone()) }; }

  /* ---------------- 매 프레임 ---------------- */
  update(dt) {
    this.time += dt;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < sub; i++) this.step(dt / sub);
    if (!this.ready) return;
    this.pose(dt);
    this.updateExpression(dt);
    this.updateDeform();
  }

  step(dt) {
    const B = this.B, W = this.W, H = this.H, C = this.C, S = this.S, A = this.A;
    const ko = this.koMode;
    const t = this.time;
    // 발 기준: 서 있을 땐 단단히, KO면 뒤로 쓰러짐
    const bx = ko ? -1.47 : Math.sin(t * 0.9) * 0.01;
    const kb = ko ? 9 : 55, cb = ko ? 2.6 : 7;
    const ax = -kb * (B.x - bx) - cb * B.vx - (ko ? 6 : 0);
    const az = -kb * B.z - cb * B.vz, ay = -40 * B.y - 5 * B.vy;
    B.vx += ax * dt; B.vz += az * dt; B.vy += ay * dt;
    B.x += B.vx * dt; B.z += B.vz * dt; B.y += B.vy * dt;
    if (B.x < -1.5) { B.x = -1.5; B.vx = Math.abs(B.vx) * 0.35; }   // 바닥에 쿵
    if (B.x > 0.35) { B.x = 0.35; B.vx *= -0.3; }
    B.z = clamp(B.z, -0.3, 0.3); B.y = clamp(B.y, -0.5, 0.5);
    // 허리
    const wtx = ko ? -0.15 : 0.03 + Math.sin(t * 1.6) * 0.015;
    const kw = 30, cw = 3.4;
    const wax = -kw * (W.x - wtx) - cw * W.vx, waz = -kw * W.z - cw * W.vz, way = -34 * W.y - 3.6 * W.vy;
    W.vx += wax * dt; W.vz += waz * dt; W.vy += way * dt;
    W.x += W.vx * dt; W.z += W.vz * dt; W.y += W.vy * dt;
    if (Math.abs(W.x) > 0.85) { W.x = Math.sign(W.x) * 0.85; W.vx *= -0.3; }
    if (Math.abs(W.z) > 0.7) { W.z = Math.sign(W.z) * 0.7; W.vz *= -0.3; }
    W.y = clamp(W.y, -0.6, 0.6);
    // 무릎
    C.v += (-48 * (C.c - (ko ? 0 : 0)) - 8 * C.v) * dt; C.c += C.v * dt; C.c = clamp(C.c, 0, 1);
    if (C.c <= 0 && C.v < 0) C.v = 0;
    // 머리
    const dz = this.dizzy > 0 ? 1 : 0;
    const htx = ko ? 0.5 : Math.sin(t * 2.3) * 0.03 * dz;
    const htz = (ko ? 0.3 : 0) + Math.sin(t * 3.1) * 0.14 * dz;
    const kh = ko ? 30 : 85, ch = ko ? 2.4 : 5;
    H.vx += (-kh * (H.x - htx) - ch * H.vx - wax * 0.7 - ax * 0.4) * dt;
    H.vy += (-kh * 0.8 * H.y - ch * H.vy - way * 0.5) * dt;
    H.vz += (-kh * (H.z - htz) - ch * H.vz - waz * 0.9 - az * 0.5) * dt;
    H.x += H.vx * dt; H.y += H.vy * dt; H.z += H.vz * dt;
    for (const k of ['x', 'z']) if (Math.abs(H[k]) > 0.9) { H[k] = Math.sign(H[k]) * 0.9; H['v' + k] *= -0.3; }
    H.y = clamp(H.y, -0.5, 0.5);
    S.vh += (-240 * S.h - 7 * S.vh) * dt; S.h += S.vh * dt; S.h = clamp(S.h, -0.45, 0.45);
    // 팔: 반사 자세가 있으면 그쪽으로, 아니면 흐느적
    if (A.poseT > 0) A.poseT -= dt; else A.pose = null;
    const [pa, pe] = A.pose || (ko ? [0.35, 0.2] : [0, 0]);
    const ka = A.pose ? 70 : 22, ca = A.pose ? 9 : 1.6;
    A.va += (-ka * (A.a - pa) - ca * A.va + waz * 0.9 + az * 1.2) * dt;
    A.ve += (-ka * (A.e - pe) - ca * A.ve - (A.pose ? 0 : A.va * 0.3)) * dt;
    A.a += A.va * dt; A.e += A.ve * dt;
    A.a = clamp(A.a, -1.4, 3.2); A.e = clamp(A.e, -0.6, 2.4);
    // 변형기
    for (const d of this.deformers) {
      if (d.pull) d.v += (d.k * (d.goal - d.a) - d.c * d.v) * dt;
      else d.v += (-d.k * d.a - d.c * d.v) * dt;
      d.a += d.v * dt;
    }
  }

  // 뼈대 행렬 계산
  pose(dt) {
    const B = this.B, W = this.W, H = this.H, C = this.C, A = this.A;
    this.root.rotation.set(B.x, B.y, B.z, 'YXZ');
    const bones = this.bones;
    const T = (p) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
    const Ti = (p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z);
    const R = (x, y, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    const local = (b, rot, extra) => {
      const m = T(b.rest).multiply(rot).multiply(Ti(b.rest));
      if (extra) m.premultiply(extra);
      return m;
    };
    const drop = C.c * 0.85;
    // 골반 (무릎이 풀리면 아래로)
    bones[0].m.copy(local(bones[0], R(0, W.y * 0.2, W.z * 0.15), new THREE.Matrix4().makeTranslation(0, -drop, 0)));
    bones[1].m.copy(bones[0].m).multiply(local(bones[1], R(W.x * 0.55, W.y * 0.5, W.z * 0.55)));
    const breathe = Math.sin(this.time * 1.7) * 0.01;
    bones[2].m.copy(bones[1].m).multiply(local(bones[2], R(W.x * 0.45 + breathe, W.y * 0.5, W.z * 0.45)));
    bones[3].m.copy(bones[2].m).multiply(local(bones[3], R(H.x * 0.2, 0, H.z * 0.25)));
    bones[10].m.copy(bones[2].m).multiply(local(bones[10], R(0, 0, A.a)));
    bones[11].m.copy(bones[10].m).multiply(local(bones[11], R(0, 0, A.e)));
    // 다리: 발은 바닥에 그대로, 골반 높이에 맞춰 무릎을 바깥으로 굽힘(2관절 IK)
    for (const L of this.legs) {
      const h = L.h0.clone().applyMatrix4(bones[0].m), a = L.a0;
      const dx = a.x - h.x, dy = a.y - h.y;
      let d = Math.hypot(dx, dy);
      d = clamp(d, Math.abs(L.L1 - L.L2) + 0.01, L.L1 + L.L2 - 0.001);
      const base = Math.atan2(dy, dx);
      const cosA = clamp((L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d), -1, 1);
      const ang = base + L.bend * Math.acos(cosA);
      const k = v3(h.x + Math.cos(ang) * L.L1, h.y + Math.sin(ang) * L.L1, 0);
      const r0 = Math.atan2(L.k0.y - L.h0.y, L.k0.x - L.h0.x), r1 = Math.atan2(k.y - h.y, k.x - h.x);
      bones[L.th].m.copy(T(v3(h.x, h.y, 0))).multiply(R(0, 0, r1 - r0)).multiply(Ti(v3(L.h0.x, L.h0.y, 0)));
      const s0 = Math.atan2(L.a0.y - L.k0.y, L.a0.x - L.k0.x), s1 = Math.atan2(a.y - k.y, a.x - k.x);
      bones[L.sh].m.copy(T(k)).multiply(R(0, 0, s1 - s0)).multiply(Ti(v3(L.k0.x, L.k0.y, 0)));
      bones[L.sh + 1].m.identity();
    }
    // 관절 표시 위치
    this.neck.position.copy(this.neckRest).applyMatrix4(bones[3].m);
    this.body.position.copy(this.spineRest).applyMatrix4(bones[1].m);
    // 머리: 목 위에 (턱이 목에 오도록)
    // 얼굴 바꿀 때: 쏙 작아졌다가 뿅 커짐
    let pop = 1;
    const spinY = 0;
    if (this.spin) {
      const sp = this.spin; sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      pop = k < 0.4 ? 1 - k / 0.4 : Math.min(1.25, (k - 0.4) / 0.4 * 1.25) - (k > 0.8 ? (k - 0.8) / 0.2 * 0.25 : 0);
      pop = Math.max(0.02, pop);
      if (!sp.done && k >= 0.4) { sp.done = true; sp.cb && sp.cb(); }
      if (k >= 1) this.spin = null;
    }
    const nq = new THREE.Quaternion().setFromRotationMatrix(bones[3].m);
    this.headGrp.position.copy(this.neck.position).add(v3(0, 0.02, 0.2).applyQuaternion(nq));
    this.headGrp.quaternion.copy(nq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(H.x * 0.7, H.y * 0.7 + spinY, H.z * 0.8, 'YXZ')));
    const sh = 1 + this.S.h;
    this.headGrp.scale.set(pop / Math.sqrt(sh), pop * sh, pop / Math.sqrt(sh));
    this.headInner.position.set(0, ((this.chinV ?? 0.86) - 0.5) * FS - 0.06, 0);
    // 혹
    for (const b of this.bumps) {
      b.v += (-120 * (b.s - 1) - 6 * b.v) * dt; b.s += b.v * dt; b.mesh.scale.setScalar(Math.max(0.01, b.s));
      for (const s of b.subs) { s.v += (-120 * (s.s - 1) - 6 * s.v) * dt; s.s += s.v * dt; s.m.scale.setScalar(Math.max(0.01, s.s)); }
    }
    // 별
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.starGrp.visible = this.dizzy > 0;
    if (this.starGrp.visible) {
      const top = this.headInner.position.y + (0.5 - (this.topV ?? 0.08)) * FS;
      this.stars.forEach((s, i) => {
        const a = this.time * 4 + i * Math.PI * 2 / this.stars.length;
        s.position.set(Math.cos(a) * 0.75, top + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.5 + 0.2);
        s.material.opacity = Math.min(1, this.dizzy * 2);
      });
    }
  }

  updateExpression(dt) {
    const ex = this.ex, u = this.u, d = this.damage;
    for (const k of ['sqL', 'sqR', 'shut', 'mW', 'mO', 'tears', 'blush', 'flash']) {
      if ((this.hold[k] || 0) > 0) this.hold[k] -= dt;
      else ex[k] *= Math.exp(-dt * (k === 'flash' ? 22 : k === 'tears' ? 1.5 : 7));
    }
    if ((this.hold.mode || 0) > 0) this.hold.mode -= dt;
    else if (!this.koMode && ex.shut < 0.15) ex.mode = 0;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 2.2 + Math.random() * 3.5; }
    if (this.blink > 0) this.blink -= dt;
    const bl = this.blink > 0 ? 1 : 0;
    const hp = d.hpRatio;
    const lowSquint = hp < 0.4 ? (0.4 - hp) * 0.8 : 0;
    u.squint.value.set(Math.min(1, ex.sqL + bl + lowSquint), Math.min(1, ex.sqR + bl + lowSquint));
    let shut = ex.shut, mode = ex.mode;
    if (this.koMode) { shut = 1; mode = 2; }
    else if (this.dizzy > 0.3 && shut < 0.5 && hp < 0.5) { shut = 0.9; mode = 4; }
    u.shut.value = shut; u.eyeMode.value = mode;
    u.mouthAmt.value.set(Math.min(1, ex.mW + (this.koMode ? 0.3 : 0)), Math.min(1, ex.mO + (this.koMode ? 0.8 : 0)));
    u.tears.value = Math.min(1, ex.tears + (hp < 0.35 ? 0.75 : 0) + (this.koMode ? 1 : 0));
    u.blush.value = Math.min(1, ex.blush + (1 - hp) * 0.5);
    u.flash.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b, Math.min(0.85, ex.flash));
    u.uTime.value = this.time;
  }

  // 변형(움푹·꼬집기) + 뼈대 입히기
  updateDeform() {
    this.deformers = this.deformers.filter(d => d.held || Math.abs(d.a) > 0.0015 || Math.abs(d.v) > 0.01);
    // 머리 카드
    {
      const M = this.headMesh, list = this.deformers.filter(d => d.layer === 'head');
      if (list.length || M.dirty || M.active) {
        const pos = this.head.geometry.attributes.position, arr = pos.array, base = M.base;
        arr.set(base);
        for (const d of list) this.applyDeformer(d, base, arr);
        pos.needsUpdate = true;
        this.head.geometry.computeVertexNormals();
        this.head.geometry.computeBoundingSphere();
        M.dirty = false; M.active = list.length > 0;
      }
    }
    // 몸 층: 변형 후 뼈대 가중치로 위치 계산
    const bm = this.bones.map(b => b.m.elements);
    for (const key of ['torso', 'arm']) {
      const L = this.layers[key];
      const list = this.deformers.filter(d => d.layer === key || (key === 'arm' && d.layer === 'torso' && false));
      const tmp = L.base; tmp.set(L.rest);
      for (const d of list) this.applyDeformer(d, L.rest, tmp);
      const pos = L.mesh.geometry.attributes.position, arr = pos.array, wi = L.wi, ww = L.ww;
      for (let k = 0, n = arr.length / 3; k < n; k++) {
        const x = tmp[k * 3], y = tmp[k * 3 + 1], z = tmp[k * 3 + 2];
        let ox = 0, oy = 0, oz = 0;
        for (let t = 0; t < 3; t++) {
          const w = ww[k * 3 + t]; if (w < 0.001) continue;
          const e = bm[wi[k * 3 + t]];
          ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
          oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
          oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        arr[k * 3] = ox; arr[k * 3 + 1] = oy; arr[k * 3 + 2] = oz;
      }
      pos.needsUpdate = true;
      L.mesh.geometry.computeVertexNormals();
    }
  }
  applyDeformer(d, base, arr) {
    const r2 = d.r * d.r, cut = r2 * 9;
    const px = d.p.x, py = d.p.y, pz = d.p.z;
    const vx = d.vec.x * d.a, vy = d.vec.y * d.a, vz = d.vec.z * d.a;
    for (let i = 0, n = arr.length; i < n; i += 3) {
      const dx = base[i] - px, dy = base[i + 1] - py, dz = (base[i + 2] - pz) * 0.5;
      const q = dx * dx + dy * dy + dz * dz;
      if (q > cut) continue;
      const w = Math.exp(-q / r2);
      arr[i] += vx * w; arr[i + 1] += vy * w; arr[i + 2] += vz * w;
    }
  }
}
