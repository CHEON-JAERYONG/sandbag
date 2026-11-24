# 사진 인형 만들기 (내 PC에서 한 번만 실행, 무료 rembg 배경 제거 사용)
#  - 전신 사진 → 몸 오려내기(머리는 지움) + 두께 지도 + 관절 위치
#  - 얼굴 사진들 → 눈 기준으로 정렬한 머리(머리카락 포함) 오려내기
# 결과: faces-src/pack-plain.json  → node tools/make-pack.js 로 암호화해서 faces/pack.bin
# 설정: faces-src/faces.json  { source, body:{file, joints:{...}, headErase:[cx,cy,rx,ry], neckY}, faces:[{file,id,name,eL,eR,m,mask}] }
# 실행: <venv>/python tools/build-puppet.py   (rembg 필요: pip install "rembg[cpu]")
import json, os, sys, base64, io
import numpy as np, cv2
from rembg import remove, new_session

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'faces-src')
cfg = json.load(open(os.path.join(SRC, 'faces.json'), encoding='utf-8-sig'))
MODEL = os.environ.get('MODEL', 'u2net_human_seg')
session = new_session(MODEL)
OUT = os.path.join(SRC, 'puppet'); os.makedirs(OUT, exist_ok=True)

def imread(p):
    data = np.fromfile(p, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

masks = {}
def person_mask(path):
    if path in masks: return masks[path]
    img = imread(path)
    ok, buf = cv2.imencode('.png', img)
    m = remove(buf.tobytes(), session=session, only_mask=True, post_process_mask=True)
    mask = cv2.imdecode(np.frombuffer(m, np.uint8), cv2.IMREAD_GRAYSCALE)
    masks[path] = (img, mask)
    return img, mask

def largest_component(mask, seed=None):
    _, bw = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bw)
    if n <= 1: return mask
    if seed is not None and lab[seed[1], seed[0]] > 0: keep = lab[seed[1], seed[0]]
    else: keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    out = mask.copy(); out[lab != keep] = 0
    return out

def data_url(img, ext, q=88):
    if ext == 'webp': ok, buf = cv2.imencode('.webp', img, [cv2.IMWRITE_WEBP_QUALITY, q])
    elif ext == 'png': ok, buf = cv2.imencode('.png', img)
    else: ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, q])
    mime = {'webp': 'image/webp', 'png': 'image/png', 'jpg': 'image/jpeg'}[ext]
    return 'data:%s;base64,%s' % (mime, base64.b64encode(buf.tobytes()).decode())

# ---------------- 몸 ----------------
B = cfg['body']
img, mask = person_mask(os.path.join(cfg['source'], B['file']))
J = B['joints']
mask = largest_component(mask, tuple(J['chest']))
# 머리 지우기(머리는 얼굴 사진 카드로 따로 붙임)
cx, cy, rx, ry = B['headErase']
yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
head = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1) & (yy < B['neckY'])
mask[head] = 0
mask = cv2.GaussianBlur(mask, (3, 3), 0)
ys, xs = np.where(mask > 20)
pad = 6
x0, x1 = max(0, xs.min() - pad), min(mask.shape[1], xs.max() + pad)
y0, y1 = max(0, ys.min() - pad), min(mask.shape[0], ys.max() + pad)
crop = img[y0:y1, x0:x1]; m = mask[y0:y1, x0:x1]
rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = m
# 테두리 색 번짐 줄이기: 투명한 곳 색을 안쪽 색으로 채움
inside = (m > 128).astype(np.uint8)
fill = cv2.inpaint(crop, 255 - inside * 255, 3, cv2.INPAINT_TELEA)
rgba[:, :, :3] = np.where(inside[:, :, None] > 0, crop, fill)
# 두께 지도: 테두리에서 멀수록 두꺼움 (팔/다리처럼 가는 곳은 얇게)
dt = cv2.distanceTransform((m > 100).astype(np.uint8), cv2.DIST_L2, 5)
dt = np.sqrt(np.clip(dt / 60.0, 0, 1))
dt = cv2.GaussianBlur(dt, (0, 0), 4)
depth = (np.clip(dt, 0, 1) * 255).astype(np.uint8)
# 팔 따로 떼기: 팔(소매+손) 층 + 팔 뒤 몸통은 주변 색으로 메움
arm = np.zeros(m.shape, np.uint8)
poly = np.array([[p[0] - x0, p[1] - y0] for p in B['armPoly']], np.int32)
cv2.fillPoly(arm, [poly], 255)
arm = cv2.GaussianBlur(arm, (5, 5), 0)
arm_rgba = rgba.copy(); arm_rgba[:, :, 3] = (m.astype(float) * arm / 255).astype(np.uint8)
hole = cv2.dilate((arm > 40).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
torso_rgb = cv2.inpaint(rgba[:, :, :3], hole, 9, cv2.INPAINT_TELEA)
torso_rgb = np.where(hole[:, :, None] > 0, cv2.GaussianBlur(torso_rgb, (0, 0), 6), torso_rgb)
torso = rgba.copy(); torso[:, :, :3] = torso_rgb
cv2.imwrite(os.path.join(OUT, 'torso.png'), torso)
cv2.imwrite(os.path.join(OUT, 'arm.png'), arm_rgba)
cv2.imwrite(os.path.join(OUT, 'body.png'), rgba)
cv2.imwrite(os.path.join(OUT, 'depth.png'), depth)
joints = {k: [int(v[0] - x0), int(v[1] - y0)] for k, v in J.items()}
body = {'img': data_url(torso, 'webp', 90), 'arm': data_url(arm_rgba, 'webp', 92), 'depth': data_url(depth, 'png'), 'w': int(x1 - x0), 'h': int(y1 - y0), 'joints': joints,
        'floorY': int(B['floorY'] - y0)}
print('몸:', body['w'], 'x', body['h'], '관절', len(joints))

# ---------------- 머리(얼굴 사진들) ----------------
W = 512
faces = []
for f in cfg['faces']:
    img, mask = person_mask(os.path.join(cfg['source'], f['file']))
    if f.get('seg') is False: mask = np.full(mask.shape, 255, np.uint8)
    eL, eR, mo = np.array(f['eL'], float), np.array(f['eR'], float), np.array(f['m'], float)
    c = (eL + eR) / 2; e = eR - eL; de = np.hypot(*e)
    perp = np.array([-e[1], e[0]]) / de
    dm = np.dot(mo - c, perp)
    s = 0.26 * W / max(de, dm / 1.08)
    ang = np.degrees(np.arctan2(e[1], e[0]))
    M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, s)
    M[0, 2] += W / 2 - c[0]; M[1, 2] += 0.45 * W - c[1]
    rgb = cv2.warpAffine(img, M, (W, W), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    al = cv2.warpAffine(mask, M, (W, W), flags=cv2.INTER_LINEAR, borderValue=0)
    # 머리 주변만 (다른 사람·어깨 빼기): 넉넉한 타원 + 사용자 조정 타원(mask)을 합침
    yy, xx = np.mgrid[0:W, 0:W] / W
    mk = f.get('mask', [0.5, 0.48, 0.28, 0.42])
    kx, ky = f.get('ellK', [1.32, 1.18]) if f.get('seg') is not False else [1.0, 1.0]
    ell = ((xx - mk[0]) / (mk[2] * kx)) ** 2 + ((yy - (mk[1] - (0.04 if f.get('seg') is not False else 0))) / (mk[3] * ky)) ** 2
    keep = np.clip((1.0 - ell) / 0.12, 0, 1)
    # 목 아래는 서서히 지움
    neck = np.clip((0.97 - yy) / 0.08, 0, 1)
    al = (al.astype(float) * keep * neck).astype(np.uint8)
    al = largest_component(al, (W // 2, int(0.5 * W)))
    al = cv2.GaussianBlur(al, (3, 3), 0)
    rgba = cv2.cvtColor(rgb, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = al
    cv2.imwrite(os.path.join(OUT, 'head-%s.png' % f['id']), rgba)
    tf = lambda p: [round(float(M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2]) / W, 4), round(float(M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2]) / W, 4)]
    faces.append({'id': 'p-' + f['id'], 'name': f['name'], 'img': data_url(rgba, 'webp', 90), 'alpha': True,
                  'eyeL': tf(eL), 'eyeR': tf(eR), 'mouth': tf(mo), 'mask': mk})
    print('머리', f['id'], '눈', faces[-1]['eyeL'], faces[-1]['eyeR'])

json.dump({'v': 2, 'body': body, 'faces': faces}, open(os.path.join(SRC, 'pack-plain.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('저장: faces-src/pack-plain.json')
