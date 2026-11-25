// 무대: 렌더러 · 카메라 · 조명 · 복싱 링 배경
import * as THREE from '../vendor/three.module.min.js';

export const CAM_BASE = new THREE.Vector3(0, 5.25, 6.3);
export const CAM_LOOK = new THREE.Vector3(0, 4.65, 0);
export const CAM_KO = new THREE.Vector3(0.6, 9.2, 3.2);
export const LOOK_KO = new THREE.Vector3(0, 0.4, -4.6);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createStage(container, lowPower) {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080f);
  scene.fog = new THREE.Fog(0x07080f, 16, 42);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  camera.position.copy(CAM_BASE);
  camera.lookAt(CAM_LOOK);
  scene.add(camera);

  // ---------- 조명 ----------
  const hemi = new THREE.HemisphereLight(0xaab8ff, 0x2a1a1a, 1.1);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xfff1dd, 420, 36, 0.62, 0.6, 1.6);
  key.position.set(2.2, 12, 6.5);
  key.target.position.set(0, 2.2, -1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 4; key.shadow.camera.far = 30;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffd9c4, 0.9);
  fill.position.set(-4, 3, 6);
  scene.add(fill);
  const rimL = new THREE.DirectionalLight(0x5f8cff, 2.6);
  rimL.position.set(-5, 4, -5);
  const rimR = new THREE.DirectionalLight(0xff5fa0, 2.0);
  rimR.position.set(5, 3.5, -4.5);
  scene.add(rimL, rimR);

  // ---------- 바닥 (링 매트) ----------
  const matTex = canvasTex(1024, 1024, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62);
    grd.addColorStop(0, '#2a4fa8'); grd.addColorStop(1, '#122556');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { // 캔버스 천 질감
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 10;
    g.beginPath(); g.arc(w / 2, h / 2, 150, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, 176, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '900 54px "Black Han Sans", sans-serif'; g.textAlign = 'center';
    g.fillText('쿵쾅 체육관', w / 2, h / 2 + 260);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeRect(30, 30, w - 60, h - 60);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 16), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -1.6);
  floor.receiveShadow = true;
  scene.add(floor);
  // 링 바깥 어두운 바닥
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.62; scene.add(outer);
  // 링 옆면 (에이프런)
  const apronTex = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#b3122a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = '900 36px "Black Han Sans", sans-serif'; g.textAlign = 'center';
    for (let i = 0; i < 4; i++) g.fillText('★ 쿵쾅 체육관 ★', w / 8 + i * w / 4, 46);
  });
  apronTex.wrapS = THREE.RepeatWrapping;
  const apron = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, map: apronTex, roughness: 0.8 }));
  apron.position.set(0, -0.31, -1.6); scene.add(apron);

  // ---------- 링 기둥 · 로프 ----------
  const ringGrp = new THREE.Group(); scene.add(ringGrp);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 0.85, roughness: 0.25 });
  const padMats = [new THREE.MeshStandardMaterial({ color: 0xc81e3a, roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x1e50c8, roughness: 0.5 })];
  const ropeMats = [new THREE.MeshStandardMaterial({ color: 0xe8243c, roughness: 0.45 }), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.45 }), new THREE.MeshStandardMaterial({ color: 0x2456e8, roughness: 0.45 })];
  const RX = 6.6, RZB = -9.2, RZF = 6.0, ropeY = [1.1, 1.9, 2.7];
  const corners = [[-RX, RZB], [RX, RZB], [-RX, RZF], [RX, RZF]];
  corners.forEach(([x, z], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 16), postMat);
    post.position.set(x, 1.6, z); post.castShadow = true; ringGrp.add(post);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.0, 0.38), padMats[i % 2]);
    pad.position.set(x, 1.95, z); ringGrp.add(pad);
  });
  const rope = (a, b, y, m) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 10), m);
    r.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    r.rotation.z = Math.PI / 2;
    r.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    r.castShadow = true;
    ringGrp.add(r);
  };
  ropeY.forEach((y, i) => {
    rope(corners[0], corners[1], y, ropeMats[i]);
    rope(corners[0], corners[2], y, ropeMats[i]);
    rope(corners[1], corners[3], y, ropeMats[i]);
  });

  // ---------- 배경 (관중석 · 불빛) ----------
  const crowdTex = canvasTex(2048, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#05060c'); grd.addColorStop(0.55, '#141830'); grd.addColorStop(1, '#090a14');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 관중 실루엣
    for (let row = 0; row < 5; row++) {
      const y0 = h * 0.48 + row * 42;
      for (let x = -20; x < w + 20; x += 26 + Math.random() * 10) {
        const s = 14 + row * 3 + Math.random() * 4;
        g.fillStyle = `rgba(${10 + row * 6},${12 + row * 6},${24 + row * 8},1)`;
        g.beginPath(); g.arc(x, y0 - s * 0.9, s * 0.55, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x, y0 + s * 0.4, s * 0.9, s * 0.9, 0, Math.PI, 0); g.fill();
        g.fillRect(x - s * 0.9, y0 + s * 0.4, s * 1.8, 60);
      }
    }
    // 카메라 플래시·조명 보케
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w, y = Math.random() * h * 0.5, r = 2 + Math.random() * 10;
      const c = ['255,220,160', '160,190,255', '255,140,190', '255,255,255'][i % 4];
      const gg = g.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, `rgba(${c},${0.25 + Math.random() * 0.5})`); gg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  crowdTex.wrapS = THREE.RepeatWrapping;
  const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 22, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({ map: crowdTex, side: THREE.BackSide, fog: false }));
  backdrop.position.set(0, 7, 6); scene.add(backdrop);

  // 조명 빛줄기
  const beamTex = canvasTex(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,240,220,0.0)'); grd.addColorStop(0.15, 'rgba(255,240,220,0.5)'); grd.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beams = [];
  [[-3.5, 0.25], [3.5, -0.25], [0, 0]].forEach(([x, rz], i) => {
    const b = new THREE.Mesh(new THREE.ConeGeometry(i === 2 ? 2.6 : 1.8, 11, 24, 1, true), beamMat);
    b.position.set(x, 6.2, i === 2 ? 0 : -2.5); b.rotation.z = rz;
    scene.add(b); beams.push(b);
  });

  // ---------- 크기 맞춤 ----------
  let viewW = 1, viewH = 1;
  function resize() {
    viewW = container.clientWidth || window.innerWidth;
    viewH = container.clientHeight || window.innerHeight;
    renderer.setSize(viewW, viewH, false);
    const aspect = viewW / viewH;
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? Math.min(68, 42 * Math.pow(0.8 / aspect, 0.72)) : 42;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    renderer, scene, camera, key, beams, resize,
    get size() { return { w: viewW, h: viewH }; }
  };
}

export { canvasTex };
