// 샌드백 인형: 사진 얼굴을 입힌 3D 머리 + 맨투맨 샌드백 몸통 + 스프링 받침 + 흐느적 팔
// 물리(흔들림·목 휘청·찌그러짐), 맞은 자리 움푹 들어감, 꼬집어 늘리기, 표정(찡그림·><·X·^^·눈물·멍·손자국·혹)
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex } from './stage.js';

const HR = new THREE.Vector3(0.5, 0.62, 0.56); // 머리 반지름(x,y,z)
const FS = 1.5;      // 얼굴 사진 1칸(UV) = 1.5 단위
const EYE_V = 0.45;  // 정렬된 사진에서 눈 높이(v)
const EYE_Y = -0.02; // 머리 안에서 눈 높이(y)
const BODY_PIVOT_Y = 0.62, BODY_TOP = 1.8, NECK_Y = 1.74, HEAD_UP = 0.8, HS = 1.2;

const v3 = () => new THREE.Vector3();
const _a = v3(), _b = v3(), _c = v3(), _q = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const G = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));

export function uvToHead(u, v, out = new THREE.Vector3()) {
  const x = (u - 0.5) * FS, y = EYE_Y - (v - EYE_V) * FS;
  const nx = x / HR.x, ny = y / HR.y;
  const z = HR.z * 0.97 * Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));
  return out.set(x, y, z);
}
export function headToUv(p) { return [0.5 + p.x / FS, EYE_V - (p.y - EYE_Y) / FS]; }

/* ---------------- 셰이더(얼굴) ---------------- */
const FACE_PARS = /* glsl */`
uniform sampler2D faceMap;
uniform float faceOn;
uniform vec2 eyeL; uniform vec2 eyeR; uniform vec2 mouthP;
uniform vec4 maskE;
uniform vec3 skinCol; uniform vec3 hairCol;
uniform vec2 squint; uniform float shut; uniform float eyeMode;
uniform vec2 mouthAmt;
uniform float tears; uniform float blush; uniform float uTime;
uniform vec4 flash;
uniform vec4 bruises[8];
uniform vec4 hands[3];
uniform vec2 blackEye;
varying vec2 vFaceUv; varying float vFront; varying float vHair;
float gFaceMask;
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
  vec3 baseC = mix(skinCol, hairCol, vHair);
  vec3 col = baseC;
  vec2 uv = vFaceUv;
  float frontF = smoothstep(0.0, 0.3, vFront);
  gFaceMask = 0.0;
  if (faceOn > 0.5) {
    vec2 me = (uv - maskE.xy) / maskE.zw;
    gFaceMask = (1.0 - smoothstep(0.55, 1.0, length(me))) * smoothstep(0.1, 0.42, vFront);
    if (gFaceMask > 0.001) {
      vec2 suv = mouthWarp(uv, mouthP, mouthAmt);
      suv = eyeWarp(suv, eyeL, squint.x * 1.9);
      suv = eyeWarp(suv, eyeR, squint.y * 1.9);
      vec3 ph = texture2D(faceMap, suv).rgb;
      if (shut > 0.01) {
        float emL = gauss2(uv - eyeL, vec2(0.08, 0.048));
        float emR = gauss2(uv - eyeR, vec2(0.08, 0.048));
        vec3 lidL = texture2D(faceMap, vec2(uv.x, eyeL.y + 0.085 + (uv.y - eyeL.y) * 0.3)).rgb;
        vec3 lidR = texture2D(faceMap, vec2(uv.x, eyeR.y + 0.085 + (uv.y - eyeR.y) * 0.3)).rgb;
        ph = mix(ph, lidL, shut * smoothstep(0.2, 0.65, emL));
        ph = mix(ph, lidR, shut * smoothstep(0.2, 0.65, emR));
        if (eyeMode > 0.5) {
          float mk = max(eyeMark(uv, eyeL, 1.0, eyeMode), eyeMark(uv, eyeR, -1.0, eyeMode));
          ph = mix(ph, vec3(0.012, 0.008, 0.008), mk * shut);
        }
      }
      col = mix(baseC, ph, gFaceMask);
    }
  }
  for (int i = 0; i < 8; i++) {
    vec4 b = bruises[i];
    if (b.w > 0.001) {
      float g = gauss2(uv - b.xy, vec2(b.z));
      col = mix(col, col * vec3(0.5, 0.26, 0.42), clamp(g * b.w, 0.0, 0.85) * frontF);
    }
  }
  col = mix(col, col * vec3(0.32, 0.17, 0.33), clamp(gauss2(uv - eyeL, vec2(0.085, 0.062)) * blackEye.x, 0.0, 0.85) * frontF);
  col = mix(col, col * vec3(0.32, 0.17, 0.33), clamp(gauss2(uv - eyeR, vec2(0.085, 0.062)) * blackEye.y, 0.0, 0.85) * frontF);
  float bl = (gauss2(uv - eyeL - vec2(-0.03, 0.12), vec2(0.075, 0.05)) + gauss2(uv - eyeR - vec2(0.03, 0.12), vec2(0.075, 0.05))) * blush;
  col = mix(col, vec3(0.75, 0.06, 0.07), clamp(bl, 0.0, 0.55) * frontF);
  for (int i = 0; i < 3; i++) {
    vec4 h = hands[i];
    if (h.w > 0.001) {
      vec2 d = uv - h.xy; float cs = cos(h.z), sn = sin(h.z);
      vec2 q = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) / 0.085;
      col = mix(col, col * vec3(1.25, 0.28, 0.28), handPrint(q) * h.w * 0.8 * frontF);
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
      col = mix(col, vec3(0.45, 0.75, 1.0) * flow + 0.1, clamp(st * tears, 0.0, 0.9) * frontF);
    }
  }
  col = mix(col, flash.rgb, flash.a);
  diffuseColor.rgb = col;
`;

function makeHeadMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 faceUv; attribute float aFront; attribute float aHair;
varying vec2 vFaceUv; varying float vFront; varying float vHair;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFaceUv = faceUv; vFront = aFront; vHair = aHair;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FACE_PARS)
      .replace('#include <map_fragment>', FACE_MAIN)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.2;`);
  };
  return mat;
}

function buildHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 96, 72);
  const p = g.attributes.position, n = p.count;
  const fuv = new Float32Array(n * 2), front = new Float32Array(n), hair = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let sx = HR.x, sz = HR.z;
    if (y < 0) { sx *= 1 - 0.3 * y * y; sz *= 1 - 0.1 * y * y; } else { sx *= 1 - 0.05 * y * y; }
    const X = x * sx, Y = y * HR.y, Z = z * sz * (z > 0 ? 0.97 : 1);
    p.setXYZ(i, X, Y, Z);
    fuv[i * 2] = 0.5 + X / FS; fuv[i * 2 + 1] = EYE_V - (Y - EYE_Y) / FS;
    front[i] = z;
    const h = y - z * 0.55 + 0.05;
    hair[i] = THREE.MathUtils.smoothstep(h, 0.0, 0.22);
  }
  g.setAttribute('faceUv', new THREE.BufferAttribute(fuv, 2));
  g.setAttribute('aFront', new THREE.BufferAttribute(front, 1));
  g.setAttribute('aHair', new THREE.BufferAttribute(hair, 1));
  g.computeVertexNormals();
  return g;
}

function buildBagGeometry() {
  const prof = [[0.0, 0], [0.36, 0], [0.45, 0.04], [0.49, 0.16], [0.5, 0.34], [0.5, 0.8], [0.51, 1.05], [0.535, 1.3], [0.55, 1.44], [0.53, 1.57], [0.46, 1.67], [0.34, 1.74], [0.2, 1.785], [0.001, 1.8]];
  const curve = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(70).map(pt => new THREE.Vector2(Math.max(0.001, pt.x), pt.y));
  pts[0].set(0.001, 0); pts[pts.length - 1].set(0.001, BODY_TOP);
  const g = new THREE.LatheGeometry(pts, 72, Math.PI, Math.PI * 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, p.getZ(i) * 0.8);
    uv.setY(i, p.getY(i) / BODY_TOP);
  }
  g.computeVertexNormals();
  return g;
}

/* 몸통 그림: 맨투맨(흰 몸판 + 회색 래글런 소매) + 빨간 가죽 샌드백 + 이름 */
function drawBagTexture(g, W, H, name) {
  const yOf = y => (1 - y / BODY_TOP) * H; // 몸통 높이 → 캔버스 y
  // 샌드백 가죽
  const red = g.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= 8; i++) red.addColorStop(i / 8, i % 2 ? '#b0101c' : '#c8192a');
  g.fillStyle = red; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, yOf(0.95) + Math.random() * (H - yOf(0.95)), 3, 2); }
  g.setLineDash([10, 8]); g.strokeStyle = 'rgba(255,220,200,0.45)'; g.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const x = (i + 0.5) * W / 8; g.beginPath(); g.moveTo(x, yOf(0.9)); g.lineTo(x, H); g.stroke(); }
  g.setLineDash([]);
  // 검은 띠
  for (const yy of [0.18, 0.62]) {
    g.fillStyle = '#16161a'; g.fillRect(0, yOf(yy + 0.05), W, yOf(yy - 0.05) - yOf(yy + 0.05));
    g.fillStyle = '#c9c9cf'; for (let i = 0; i < 4; i++) g.fillRect(i * W / 4 + W / 8 - 14, yOf(yy + 0.04), 28, yOf(yy - 0.04) - yOf(yy + 0.04));
  }
  // 맨투맨
  const shirtBottom = yOf(0.9);
  g.fillStyle = '#ecebe6'; g.fillRect(0, 0, W, shirtBottom);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`; g.fillRect(Math.random() * W, Math.random() * shirtBottom, 2, 2); }
  // 래글런 소매(옆구리 쪽 u=0.25, 0.75 → 앞이 0.5)
  g.fillStyle = '#a3a7ae';
  for (const us of [0.0, 0.5, 1.0]) {
    const cx = us * W;
    g.beginPath();
    g.moveTo(cx - 0.17 * W, 0); g.lineTo(cx + 0.17 * W, 0);
    g.lineTo(cx + 0.075 * W, yOf(1.28)); g.lineTo(cx - 0.075 * W, yOf(1.28));
    g.closePath(); g.fill();
  }
  // 밑단 고무단
  g.fillStyle = '#dcdbd5'; g.fillRect(0, yOf(1.0), W, yOf(0.9) - yOf(1.0));
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 9) { g.beginPath(); g.moveTo(x, yOf(1.0)); g.lineTo(x, yOf(0.9)); g.stroke(); }
  // 이름 (앞면 u=0.5)
  const cx = W / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 104px "Black Han Sans", "Malgun Gothic", sans-serif';
  g.lineWidth = 14; g.strokeStyle = '#1a0508'; g.strokeText(name, cx, yOf(0.4));
  g.fillStyle = '#fff6e0'; g.fillText(name, cx, yOf(0.4));
  g.font = '900 40px "Black Han Sans", sans-serif';
  g.fillStyle = 'rgba(255,240,220,0.85)'; g.fillText('SANDBAG', cx, yOf(0.75));
}

/* ---------------- 인형 ---------------- */
export class Dummy {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.time = 0;
    this.koMode = false;

    // 받침 + 스프링
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181d, roughness: 0.75 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.86, 0.24, 48), baseMat);
    base.position.y = 0.12; base.castShadow = true; base.receiveShadow = true;
    this.root.add(base);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde6, metalness: 0.95, roughness: 0.22 });
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 32), chrome);
      r.castShadow = true;
      this.root.add(r); this.rings.push(r);
    }

    // 몸통 기준점
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.bagCanvas = document.createElement('canvas'); this.bagCanvas.width = 1024; this.bagCanvas.height = 1024;
    this.bagTex = new THREE.CanvasTexture(this.bagCanvas); this.bagTex.colorSpace = THREE.SRGBColorSpace; this.bagTex.anisotropy = 4;
    this.bag = new THREE.Mesh(buildBagGeometry(), new THREE.MeshStandardMaterial({ map: this.bagTex, roughness: 0.6 }));
    this.bag.castShadow = true; this.bag.receiveShadow = true;
    this.bag.userData.part = 'body';
    this.body.add(this.bag);
    this.setName('샌드백');

    // 팔
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xe9bf9f, roughness: 0.6 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xa3a7ae, roughness: 0.85 });
    this.arms = [-1, 1].map(side => {
      const sh = new THREE.Group(); sh.position.set(side * 0.5, 1.5, 0); this.body.add(sh);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 6, 14), sleeveMat);
      up.position.y = -0.3; up.castShadow = true; up.userData.part = side < 0 ? 'armL' : 'armR'; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.62; sh.add(el);
      const fo = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.36, 6, 14), sleeveMat);
      fo.position.y = -0.24; fo.castShadow = true; fo.userData.part = up.userData.part; el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), this.skinMat);
      hand.scale.set(0.9, 1.2, 0.75); hand.position.y = -0.56; hand.castShadow = true; hand.userData.part = up.userData.part; el.add(hand);
      return { side, sh, el, meshes: [up, fo, hand], a: 0.05, va: 0, b: side * 0.2, vb: 0, e: 0.15, ve: 0 };
    });

    // 목 · 머리
    this.neck = new THREE.Group(); this.neck.position.set(0, NECK_Y, 0); this.body.add(this.neck);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 20), this.skinMat);
    neckMesh.position.y = 0.16; neckMesh.castShadow = true; this.neck.add(neckMesh);
    this.headGrp = new THREE.Group(); this.headGrp.position.set(0, HEAD_UP, 0.03); this.neck.add(this.headGrp);

    this.u = {
      faceMap: { value: null }, faceOn: { value: 0 },
      eyeL: { value: new THREE.Vector2(0.37, 0.45) }, eyeR: { value: new THREE.Vector2(0.63, 0.45) }, mouthP: { value: new THREE.Vector2(0.5, 0.72) },
      maskE: { value: new THREE.Vector4(0.5, 0.48, 0.28, 0.42) },
      skinCol: { value: new THREE.Color(0xe9bf9f) }, hairCol: { value: new THREE.Color(0x1a1b20) },
      squint: { value: new THREE.Vector2() }, shut: { value: 0 }, eyeMode: { value: 0 },
      mouthAmt: { value: new THREE.Vector2() }, tears: { value: 0 }, blush: { value: 0 }, uTime: { value: 0 },
      flash: { value: new THREE.Vector4(1, 1, 1, 0) },
      bruises: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      hands: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
      blackEye: { value: new THREE.Vector2() }
    };
    this.head = new THREE.Mesh(buildHeadGeometry(), makeHeadMaterial(this.u));
    this.head.castShadow = true; this.head.userData.part = 'head';
    this.headGrp.add(this.head);
    // 바가지 머리(머리카락 덮개)
    const hairTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * w, l = 40 + Math.random() * 200, v = 150 + Math.random() * 105;
        g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 1 + Math.random() * 2;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 10, l); g.stroke();
      }
    });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1b20, map: hairTex, roughness: 0.5 });
    const capG = new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, 1.8);
    capG.scale(HR.x * 1.075, HR.y * 1.06, HR.z * 1.08);
    this.hairCap = new THREE.Mesh(capG, this.hairMat);
    this.hairCap.rotation.x = -0.5; this.hairCap.position.set(0, 0.025, -0.02);
    this.hairCap.castShadow = true; this.hairCap.userData.part = 'head';
    this.headGrp.add(this.hairCap);
    this.ears = [-1, 1].map(s => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.skinMat);
      e.scale.set(0.06, 0.14, 0.1); e.position.set(s * 0.475, -0.1, -0.02); e.rotation.y = s * 0.3;
      e.userData.part = 'head'; this.headGrp.add(e);
      return e;
    });

    // 혹 · 반창고 · 별
    this.bumps = [];
    this.starGrp = new THREE.Group(); this.headGrp.add(this.starGrp);
    const starTex = canvasTex(64, 64, (g) => {
      g.translate(32, 32); g.fillStyle = '#ffe14a'; g.strokeStyle = '#a86a00'; g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    });
    this.stars = Array.from({ length: 5 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.22); this.starGrp.add(s); return s;
    });
    this.dizzy = 0;

    // 물리 상태
    this.B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tx: 0 };
    this.H = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    this.S = { b: 0, vb: 0, h: 0, vh: 0 };
    this.prevBV = new THREE.Vector3();
    this.spin = null;

    // 변형
    this.meshes = { head: this.prepDeform(this.head), body: this.prepDeform(this.bag) };
    this.deformers = [];

    // 표정
    this.ex = { sqL: 0, sqR: 0, shut: 0, mode: 0, mW: 0, mO: 0, tears: 0, blush: 0, flash: 0 };
    this.hold = {};
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.flashCol = new THREE.Color(1, 1, 1);
    this.damage = { swellL: 0, swellR: 0, bruises: [], hands: [], blackL: 0, blackR: 0, blush: 0, hpRatio: 1 };
    this.face = null;
    this.hitMeshes = [this.head, this.hairCap, ...this.ears, this.bag, ...this.arms.flatMap(a => a.meshes)];
    this.update(0);
  }

  prepDeform(mesh) {
    const pos = mesh.geometry.attributes.position;
    pos.setUsage(THREE.DynamicDrawUsage);
    const rest = new Float32Array(pos.array);
    const nrm = new Float32Array(mesh.geometry.attributes.normal.array);
    return { mesh, rest, nrm, base: new Float32Array(rest), dirty: true, active: false };
  }

  setName(name) {
    const g = this.bagCanvas.getContext('2d');
    drawBagTexture(g, this.bagCanvas.width, this.bagCanvas.height, name || '샌드백');
    this.bagTex.needsUpdate = true;
    this.name = name;
  }

  /* 얼굴 바꾸기: face = {tex, eyeL, eyeR, mouth, mask, skin, hair, name} */
  setFace(face) {
    this.face = face;
    const u = this.u;
    u.faceMap.value = face.tex || null;
    u.faceOn.value = face.tex ? 1 : 0;
    u.eyeL.value.set(face.eyeL[0], face.eyeL[1]);
    u.eyeR.value.set(face.eyeR[0], face.eyeR[1]);
    u.mouthP.value.set(face.mouth[0], face.mouth[1]);
    const m = face.mask || [0.5, 0.48, 0.28, 0.42];
    u.maskE.value.set(m[0], m[1], m[2], m[3]);
    u.skinCol.value.set(face.skin || '#e6b898');
    u.hairCol.value.set(face.hair || '#1a1b20');
    this.skinMat.color.set(face.skin || '#e6b898');
    this.hairMat.color.set(face.hair || '#1a1b20');
    if (face.name && face.name !== this.name) this.setName(face.name);
    this.resetDamage();
  }

  resetDamage() {
    const d = this.damage;
    d.swellL = d.swellR = 0; d.bruises = []; d.hands = []; d.blackL = d.blackR = 0; d.blush = 0; d.hpRatio = 1;
    for (const b of this.bumps) this.headGrp.remove(b.mesh);
    this.bumps = [];
    this.dizzy = 0;
    this.applyStatic();
    this.syncDecals();
  }

  // 얼굴 굴곡(코·눈두덩) + 부은 볼
  applyStatic() {
    const H = this.meshes.head, f = this.face;
    const g = H.mesh.geometry, fuv = g.attributes.faceUv.array, fr = g.attributes.aFront.array;
    const eL = f ? f.eyeL : [0.37, 0.45], eR = f ? f.eyeR : [0.63, 0.45], mo = f ? f.mouth : [0.5, 0.72];
    const mx = (eL[0] + eR[0]) / 2, my = (eL[1] + eR[1]) / 2;
    const nose = [mx + (mo[0] - mx) * 0.55, my + (mo[1] - my) * 0.55];
    const d = this.damage;
    for (let i = 0, n = fr.length; i < n; i++) {
      let disp = 0;
      if (fr[i] > 0.05) {
        const u = fuv[i * 2], v = fuv[i * 2 + 1];
        disp += 0.075 * G(u - nose[0], v - nose[1], 0.045, 0.07);
        disp -= 0.028 * (G(u - eL[0], v - eL[1], 0.055, 0.035) + G(u - eR[0], v - eR[1], 0.055, 0.035));
        disp += 0.02 * G(u - mo[0], v - mo[1] + 0.01, 0.09, 0.045);
        disp += 0.025 * G(u - mx, v - my + 0.07, 0.25, 0.06) * 0; // 자리만
        disp += d.swellL * 0.11 * G(u - eL[0] + 0.03, v - eL[1] - 0.15, 0.09, 0.09);
        disp += d.swellR * 0.11 * G(u - eR[0] - 0.03, v - eR[1] - 0.15, 0.09, 0.09);
        disp *= THREE.MathUtils.smoothstep(fr[i], 0.05, 0.45);
      }
      H.base[i * 3] = H.rest[i * 3] + H.nrm[i * 3] * disp;
      H.base[i * 3 + 1] = H.rest[i * 3 + 1] + H.nrm[i * 3 + 1] * disp;
      H.base[i * 3 + 2] = H.rest[i * 3 + 2] + H.nrm[i * 3 + 2] * disp;
    }
    H.dirty = true;
  }

  syncDecals() {
    const u = this.u, d = this.damage;
    for (let i = 0; i < 8; i++) {
      const b = d.bruises[i];
      if (b) u.bruises.value[i].set(b[0], b[1], b[2], b[3]); else u.bruises.value[i].set(0, 0, 0.1, 0);
    }
    for (let i = 0; i < 3; i++) {
      const h = d.hands[i];
      if (h) u.hands.value[i].set(h[0], h[1], h[2], h[3]); else u.hands.value[i].set(0, 0, 0, 0);
    }
    u.blackEye.value.set(d.blackL, d.blackR);
  }

  /* 맞은 자리(head/body/arm) 정보 */
  partObj(part) {
    if (part === 'head') return this.headGrp;
    if (part === 'armL') return this.arms[0].sh;
    if (part === 'armR') return this.arms[1].sh;
    return this.body;
  }
  // 레이캐스트 결과 → {part, lp(부위 기준 좌표), zone}
  describeHit(obj, worldPoint) {
    const part = obj.userData.part || 'body';
    const o = this.partObj(part);
    const lp = o.worldToLocal(worldPoint.clone());
    let zone = part;
    if (part === 'head') {
      zone = (lp.y > 0.3 || (lp.y > 0.12 && lp.z < 0.25) || lp.z < -0.1) ? 'top' : 'face';
    } else if (part === 'body') {
      zone = lp.y < 0.75 ? 'low' : 'body';
    }
    return { part, lp, zone };
  }
  worldOf(part, lp, out = new THREE.Vector3()) {
    return this.partObj(part).localToWorld(out.copy(lp));
  }

  /* 타격: dir=월드 방향(단위), power≈1~10 */
  hit(o) {
    const { part, lp, dir } = o;
    const power = o.power || 2;
    const P = this.worldOf(part, lp, v3());
    const J = _a.copy(dir).multiplyScalar(power);
    // 몸통 회전 충격
    const pivot = this.body.getWorldPosition(_b);
    const r = _c.copy(P).sub(pivot);
    const tau = r.clone().cross(J);
    const bodyShare = part === 'head' ? 0.35 : (part === 'body' ? 1 : 0.5);
    this.B.vx += tau.x * bodyShare / 6.0;
    this.B.vy += tau.y * bodyShare / 4.2;
    this.B.vz += tau.z * bodyShare / 6.0;
    if (part === 'head') {
      const nw = this.neck.getWorldPosition(v3());
      const th = P.clone().sub(nw).cross(J);
      this.H.vx += th.x / 0.95 * (o.headMul || 1);
      this.H.vy += th.y / 0.8 * (o.headMul || 1);
      this.H.vz += th.z / 0.95 * (o.headMul || 1);
    } else if (part === 'armL' || part === 'armR') {
      const a = this.arms[part === 'armL' ? 0 : 1];
      const lj = J.clone().applyQuaternion(this.body.getWorldQuaternion(_q).invert());
      a.va += -lj.z * 1.6; a.vb += lj.x * 1.6;
    } else {
      // 몸을 맞으면 고개가 반대로 휘청
      this.H.vx += tau.x * 0.12; this.H.vz += tau.z * 0.12;
    }
    if (o.squash) {
      if (part === 'head') this.S.vh -= o.squash; else this.S.vb -= o.squash;
    }
    // 움푹 들어감
    if (o.dent !== 0 && (part === 'head' || part === 'body')) {
      const obj = part === 'head' ? this.head : this.bag;
      const inv = obj.getWorldQuaternion(_q).invert();
      const ld = dir.clone().applyQuaternion(inv).normalize();
      const sc = part === 'head' ? this.headGrp.scale : null;
      const mp = obj.worldToLocal(P.clone());
      if (sc) { /* worldToLocal 이 스케일을 이미 반영 */ }
      this.addDeformer(part, mp, ld, o.radius || 0.3, (o.dent ?? 1) * power * 0.85);
    }
    return P;
  }

  addDeformer(part, p, vec, radius, v0) {
    if (this.deformers.length > 10) this.deformers.shift();
    const d = { part, p: p.clone(), vec: vec.clone(), r: radius, a: 0, v: v0, k: 170, c: 8, pull: false };
    this.deformers.push(d);
    this.meshes[part].active = true;
    return d;
  }

  // 꼬집기: 잡은 자리를 끌어당김
  grab(part, lp) {
    const obj = part === 'head' ? this.head : this.bag;
    const mp = obj.worldToLocal(this.worldOf(part, lp, v3()));
    const d = { part, p: mp, vec: v3(), r: part === 'head' ? 0.13 : 0.17, a: 0, v: 0, k: 260, c: 14, pull: true, goal: 1, held: true, lp: lp.clone() };
    this.deformers.push(d);
    this.meshes[part].active = true;
    return d;
  }
  pull(d, worldTarget) {
    const obj = d.part === 'head' ? this.head : this.bag;
    const grabW = obj.localToWorld(d.p.clone());
    const pw = worldTarget.clone().sub(grabW);
    const len = pw.length(), max = d.part === 'head' ? 0.7 : 0.55;
    if (len > max) pw.multiplyScalar(max / len);
    d.pullWorld = pw;
    const inv = obj.getWorldQuaternion(_q).invert();
    const s = obj.getWorldScale(v3());
    d.vec.copy(pw).applyQuaternion(inv).divide(s);
    return pw.length() / max;
  }
  release(d) {
    d.held = false; d.goal = 0; d.k = 220; d.c = 5.5;
    d.pullWorld = null;
  }

  addBump(lp) {
    // 가까운 혹이 있으면 그 위에 하나 더(겹혹)
    const n = lp.clone().normalize();
    for (const b of this.bumps) {
      if (b.n.distanceTo(n) < 0.35) {
        if (b.stack < 2) {
          b.stack++;
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), b.mesh.material);
          m.position.copy(n).multiplyScalar(0.13); m.scale.setScalar(0.01); b.mesh.add(m);
          b.subs.push({ m, s: 0, v: 9 });
        } else { b.v += 6; }
        return;
      }
    }
    if (this.bumps.length >= 4) return;
    const mat = new THREE.MeshStandardMaterial({ color: this.skinMat.color.clone().lerp(new THREE.Color(0xff6a6a), 0.35), roughness: 0.45 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), mat);
    const surf = n.clone().multiply(new THREE.Vector3(HR.x * 1.08, HR.y * 1.06, HR.z * 1.08));
    mesh.position.copy(surf); mesh.scale.setScalar(0.01);
    mesh.castShadow = true;
    this.headGrp.add(mesh);
    this.bumps.push({ mesh, n, s: 0, v: 10, stack: 0, subs: [] });
  }

  setDizzy(sec) { this.dizzy = Math.max(this.dizzy, sec); }

  /* 표정: 값은 0~1, hold초 동안 유지 후 풀림 */
  express(p, hold = 0.35) {
    const ex = this.ex;
    for (const k of ['sqL', 'sqR', 'shut', 'mW', 'mO', 'tears', 'blush', 'flash']) {
      if (p[k] != null) { ex[k] = Math.max(ex[k], p[k]); this.hold[k] = Math.max(this.hold[k] || 0, p[k + 'Hold'] ?? hold); }
    }
    if (p.mode != null && (this.ex.mode !== 2 || !this.koMode)) { ex.mode = p.mode; this.hold.mode = Math.max(this.hold.mode || 0, hold); }
    if (p.flashCol) this.flashCol.set(p.flashCol);
  }

  addBruise(uv, size, amt) {
    const list = this.damage.bruises;
    for (const b of list) {
      if (Math.hypot(b[0] - uv[0], b[1] - uv[1]) < size * 0.8) { b[3] = Math.min(1, b[3] + amt); b[2] = Math.min(0.12, b[2] + 0.004); this.syncDecals(); return; }
    }
    list.push([uv[0], uv[1], size, amt]);
    if (list.length > 8) list.shift();
    this.syncDecals();
  }
  addHandPrint(uv, angle) {
    const l = this.damage.hands;
    l.push([uv[0], uv[1], angle, 1]);
    if (l.length > 3) l.shift();
    this.syncDecals();
  }
  addSwell(side, amt) {
    const d = this.damage;
    if (side <= 0) d.swellL = Math.min(1, d.swellL + amt);
    if (side >= 0) d.swellR = Math.min(1, d.swellR + amt);
    this.applyStatic();
  }
  addBlackEye(side, amt) {
    const d = this.damage;
    if (side < 0) d.blackL = Math.min(1, d.blackL + amt); else d.blackR = Math.min(1, d.blackR + amt);
    this.syncDecals();
  }
  setHpRatio(r) { this.damage.hpRatio = r; }

  setKO(on) {
    this.koMode = on;
    if (on) { this.ex.mode = 2; this.B.vx -= 2.2; this.H.vx -= 3; this.setDizzy(4); }
    else { this.ex.mode = 0; }
  }
  // 얼굴 바꿀 때 머리 한 바퀴
  spinSwap(cb) { this.spin = { t: 0, dur: 0.75, cb, done: false }; }

  headTopWorld(out = new THREE.Vector3()) { return this.headGrp.localToWorld(out.set(0, 0.74, 0)); }
  headWorld(out = new THREE.Vector3()) { return this.headGrp.localToWorld(out.set(0, 0, 0.3)); }
  faceUvOf(lp) { return headToUv(lp); }

  /* ---------------- 매 프레임 ---------------- */
  update(dt) {
    this.time += dt;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.step(h);
    this.pose(dt);
    this.updateExpression(dt);
    this.updateDeform(dt);
  }

  step(dt) {
    const B = this.B, H = this.H, S = this.S;
    const ko = this.koMode;
    const breathe = Math.sin(this.time * 1.7) * 0.012;
    const tx = (ko ? -1.12 : 0) + breathe * 0.5;
    const kb = ko ? 18 : 26, cb = ko ? 3.4 : 1.9;
    const ax = -kb * (B.x - tx) - cb * B.vx;
    const az = -kb * B.z - cb * B.vz;
    const ay = -34 * B.y - 3.0 * B.vy;
    B.vx += ax * dt; B.vy += ay * dt; B.vz += az * dt;
    B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
    const lim = ko ? 1.3 : 0.95;
    if (B.x < -lim) { B.x = -lim; B.vx *= -0.35; } if (B.x > lim) { B.x = lim; B.vx *= -0.35; }
    if (Math.abs(B.z) > 0.95) { B.z = Math.sign(B.z) * 0.95; B.vz *= -0.35; }
    if (Math.abs(B.y) > 1.2) { B.y = Math.sign(B.y) * 1.2; B.vy *= -0.3; }
    // 머리: 목 스프링 + 몸 가속의 반대로 휘청
    const kh = ko ? 30 : 88, ch = ko ? 2.2 : 5.2;
    const dizzyWob = this.dizzy > 0 ? 1 : 0;
    const htx = ko ? 0.55 : Math.sin(this.time * 2.3) * 0.02 * dizzyWob;
    const htz = (ko ? 0.25 : 0) + Math.sin(this.time * 3.1) * 0.12 * dizzyWob;
    H.vx += (-kh * (H.x - htx) - ch * H.vx - ax * 0.85) * dt;
    H.vy += (-kh * 0.8 * H.y - ch * H.vy - ay * 0.6) * dt;
    H.vz += (-kh * (H.z - htz) - ch * H.vz - az * 0.85) * dt;
    H.x += H.vx * dt; H.y += H.vy * dt; H.z += H.vz * dt;
    for (const k of ['x', 'z']) if (Math.abs(H[k]) > 1.0) { H[k] = Math.sign(H[k]); H['v' + k] *= -0.3; }
    if (Math.abs(H.y) > 1.3) { H.y = Math.sign(H.y) * 1.3; H.vy *= -0.3; }
    // 찌그러짐
    S.vb += (-300 * S.b - 10 * S.vb) * dt; S.b += S.vb * dt;
    S.vh += (-240 * S.h - 7 * S.vh) * dt; S.h += S.vh * dt;
    S.b = clamp(S.b, -0.4, 0.4); S.h = clamp(S.h, -0.45, 0.45);
    // 팔
    for (const A of this.arms) {
      const s = A.side;
      const a0 = ko ? -0.6 : 0.05, b0 = s * (ko ? 0.9 : 0.2);
      const fa = -26 * (A.a - a0) - 1.4 * A.va - ax * 1.3 + Math.sin(this.time * 1.3 + s) * 0.2;
      const fb = -24 * (A.b - b0) - 1.4 * A.vb - az * 1.3 + s * B.vy * B.vy * 1.8;
      A.va += fa * dt; A.vb += fb * dt;
      A.a += A.va * dt; A.b += A.vb * dt;
      A.a = clamp(A.a, -2.6, 2.6); A.b = clamp(A.b, -2.2, 2.2);
      const fe = -40 * (A.e - 0.15) - 2.2 * A.ve - fa * 0.35;
      A.ve += fe * dt; A.e += A.ve * dt; A.e = clamp(A.e, -0.2, 2.4);
    }
    // 변형기
    for (const d of this.deformers) {
      if (d.pull) {
        d.v += (d.k * (d.goal - d.a) - d.c * d.v) * dt;
      } else {
        d.v += (-d.k * d.a - d.c * d.v) * dt;
      }
      d.a += d.v * dt;
    }
  }

  pose(dt) {
    const B = this.B, H = this.H, S = this.S;
    // 스프링 고리: 기울기를 위로 갈수록 크게
    const p = new THREE.Vector3(0, 0.26, 0), e = new THREE.Euler(), dir = new THREE.Vector3();
    const n = this.rings.length, seg = (BODY_PIVOT_Y - 0.24) / n;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      e.set(B.x * f, 0, B.z * f);
      dir.set(0, 1, 0).applyEuler(e);
      p.addScaledVector(dir, seg * 0.5);
      this.rings[i].position.copy(p);
      this.rings[i].rotation.set(Math.PI / 2 + B.x * f, 0, B.z * f);
      p.addScaledVector(dir, seg * 0.5);
    }
    this.body.position.copy(p);
    this.body.rotation.set(B.x, B.y, B.z, 'YXZ');
    const sb = 1 + S.b;
    this.body.scale.set(1 / Math.sqrt(sb), sb, 1 / Math.sqrt(sb));
    let spinY = 0;
    if (this.spin) {
      const sp = this.spin; sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      spinY = (1 - Math.pow(1 - k, 3)) * Math.PI * 2;
      if (!sp.done && k > 0.5) { sp.done = true; sp.cb && sp.cb(); }
      if (k >= 1) this.spin = null;
    }
    this.neck.rotation.set(H.x * 0.45, H.y * 0.4, H.z * 0.45, 'YXZ');
    this.headGrp.rotation.set(H.x * 0.6, H.y * 0.6 + spinY, H.z * 0.6, 'YXZ');
    const sh = 1 + S.h;
    this.headGrp.scale.set(HS / Math.sqrt(sh), HS * sh, HS / Math.sqrt(sh));
    for (const A of this.arms) {
      A.sh.rotation.set(A.a, 0, A.b);
      A.el.rotation.set(-A.e, 0, 0);
    }
    // 혹 커지기
    for (const b of this.bumps) {
      b.v += (-120 * (b.s - 1) - 6 * b.v) * dt; b.s += b.v * dt;
      b.mesh.scale.setScalar(Math.max(0.01, b.s));
      for (const s of b.subs) { s.v += (-120 * (s.s - 1) - 6 * s.v) * dt; s.s += s.v * dt; s.m.scale.setScalar(Math.max(0.01, s.s)); }
    }
    // 어지러움 별
    this.dizzy = Math.max(0, this.dizzy - dt);
    const showStars = this.dizzy > 0;
    this.starGrp.visible = showStars;
    if (showStars) {
      this.stars.forEach((s, i) => {
        const a = this.time * 4 + i * Math.PI * 2 / this.stars.length;
        s.position.set(Math.cos(a) * 0.62, 0.72 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.62);
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
    // 눈 깜빡임
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
    u.blush.value = Math.min(1, ex.blush + (1 - hp) * 0.55);
    u.flash.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b, Math.min(0.85, ex.flash));
    u.uTime.value = this.time;
  }

  updateDeform() {
    // 끝난 변형기 정리
    this.deformers = this.deformers.filter(d => d.held || Math.abs(d.a) > 0.0015 || Math.abs(d.v) > 0.01);
    for (const key of ['head', 'body']) {
      const M = this.meshes[key];
      const list = this.deformers.filter(d => d.part === key);
      if (!list.length && !M.dirty && !M.active) continue;
      const pos = M.mesh.geometry.attributes.position, arr = pos.array, base = M.base;
      arr.set(base);
      for (const d of list) {
        const r2 = d.r * d.r, cut = r2 * 9;
        const px = d.p.x, py = d.p.y, pz = d.p.z;
        const vx = d.vec.x * d.a, vy = d.vec.y * d.a, vz = d.vec.z * d.a;
        for (let i = 0, n = arr.length; i < n; i += 3) {
          const dx = base[i] - px, dy = base[i + 1] - py, dz = base[i + 2] - pz;
          const q = dx * dx + dy * dy + dz * dz;
          if (q > cut) continue;
          const w = Math.exp(-q / r2);
          arr[i] += vx * w; arr[i + 1] += vy * w; arr[i + 2] += vz * w;
        }
      }
      pos.needsUpdate = true;
      M.mesh.geometry.computeVertexNormals();
      M.mesh.geometry.computeBoundingSphere();
      M.dirty = false;
      M.active = list.length > 0;
    }
  }
}

export const HEAD = { HR, FS, EYE_V, EYE_Y };
