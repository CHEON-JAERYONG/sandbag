// 기본 얼굴 묶음 만들기: faces-src/(정렬된 jpg + landmarks.json) → 암호화 → faces/pack.bin
// 열쇠는 faces-src/KEY.txt 에 보관(깃에 안 올라감). 없으면 새로 만듦.
// 순서: powershell -ExecutionPolicy Bypass -File tools/normalize-faces.ps1  →  node tools/make-pack.js
//       MASKS='{"a":[0.4,0.47,0.26,0.4]}' node tools/make-pack.js   (얼굴 테두리 덮어쓰기)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = path.join(root, 'faces-src');
const keyFile = path.join(src, 'KEY.txt');

const b64u = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
if (!key) { key = b64u(crypto.randomBytes(16)); fs.writeFileSync(keyFile, key); console.log('새 열쇠를 만들었어요'); }

// 얼굴마다 사진이 보이는 타원(중심 u,v, 반지름 u,v)은 faces.json → landmarks.json 의 mask
const MASKS = process.env.MASKS ? JSON.parse(process.env.MASKS) : {};

const marks = JSON.parse(fs.readFileSync(path.join(src, 'landmarks.json'), 'utf8').replace(/^\uFEFF/, ''));
const faces = marks.map(m => ({
  id: 'p-' + m.id,
  name: m.name,
  img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(src, m.file)).toString('base64'),
  eyeL: m.eyeL, eyeR: m.eyeR, mouth: m.mouth,
  mask: MASKS[m.id] || (Array.isArray(m.mask) ? m.mask : [0.5, 0.48, 0.28, 0.42])
}));
const plain = JSON.stringify({ v: 1, faces });
const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv('aes-128-gcm', fromB64u(key), iv);
const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
const out = Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64');
fs.mkdirSync(path.join(root, 'faces'), { recursive: true });
fs.writeFileSync(path.join(root, 'faces', 'pack.bin'), out);
console.log(`faces/pack.bin 저장 (${faces.length}개, ${(out.length / 1024).toFixed(0)}KB)`);
console.log('열쇠 링크: #k=' + key);
