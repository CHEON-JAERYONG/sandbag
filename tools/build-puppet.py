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
sessions = {}
def sess(name):
    if name not in sessions: sessions[name] = new_session(name)
    return sessions[name]
OUT = os.path.join(SRC, 'puppet'); os.makedirs(OUT, exist_ok=True)

def imread(p):
    data = np.fromfile(p, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

masks = {}
def person_mask(path, model=None):
    model = model or MODEL
    if (path, model) in masks: return masks[(path, model)]
    img = imread(path)
    ok, buf = cv2.imencode('.png', img)
    m = remove(buf.tobytes(), session=sess(model), only_mask=True, post_process_mask=(model == 'u2net_human_seg'))
    mask = cv2.imdecode(np.frombuffer(m, np.uint8), cv2.IMREAD_GRAYSCALE)
    masks[(path, model)] = (img, mask)
    return img, mask

def largest_component(mask, seed=None):
    _, bw = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bw)
    if n <= 1: return mask
    if seed is not None and lab[seed[1], seed[0]] > 0: keep = lab[seed[1], seed[0]]
    else: keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    comp = (lab == keep).astype(np.uint8) * 255
    comp = cv2.dilate(comp, np.ones((9, 9), np.uint8))   # 부드러운 테두리(머리카락 끝)는 살림
    return (mask.astype(np.uint16) * comp // 255).astype(np.uint8)

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
inE = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
if 'collar' in B:
    # 깃 선(원본 px 점들) 위쪽을 지움 → 몸 윗선이 곧은 선이 아니라 목이 들어가는 U자 깃 모양
    cp = np.array(B['collar'], float)
    cyx = np.interp(np.arange(mask.shape[1]), cp[:, 0], cp[:, 1])
    inX = (xx >= cp[0, 0]) & (xx <= cp[-1, 0])
    head = (inE | inX) & (yy < cyx[None, :])
else:
    head = inE & (yy < B['neckY'])
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
if 'neckBox' in B:  # 3D 목 자리: [가운데 x, 반폭, 깃 맨 아래 y] (원본 px → 몸 그림 px)
    nb = B['neckBox']; body['neckBox'] = [int(nb[0] - x0), int(nb[1]), int(nb[2] - y0)]
print('몸:', body['w'], 'x', body['h'], '관절', len(joints))

# ---------------- 머리(얼굴 사진들) ----------------
# 얼굴마다 faces.json에: keep(머리 윤곽 다각형, 원본 px — 위는 넉넉히, 아래는 턱선), add(AI가 놓친 머리카락), chin(턱 끝)
# 턱 아래(목·옷)는 버림 → 게임에서 3D 목이 대신함. 머리카락 꼭대기~턱이 그림 안에 꼭 들어가게 얼굴마다 크기를 맞춤.
W = 512
TOP, HEADH = 0.05, 0.80        # 머리 꼭대기 위치, 꼭대기~턱 높이(그림 높이 대비)
faces = []

def poly_fill(pts, shape, M=None, feather=0):
    P = np.array(pts, float)
    if M is not None: P = np.c_[P, np.ones(len(P))] @ M.T
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(P * 8).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=3)
    m = m.astype(np.float32) / 255
    return cv2.GaussianBlur(m, (0, 0), feather) if feather > 0 else m

for f in cfg['faces']:
    img, mask = person_mask(os.path.join(cfg['source'], f['file']), f.get('model', 'birefnet-portrait'))
    mask = mask.copy()
    if f.get('seg') is False: mask = np.full(mask.shape, 255, np.uint8)
    eL, eR, mo = np.array(f['eL'], float), np.array(f['eR'], float), np.array(f['m'], float)
    c = (eL + eR) / 2; e = eR - eL; de = np.hypot(*e)
    ang = np.degrees(np.arctan2(e[1], e[0]))
    perp = np.array([-e[1], e[0]]) / de
    chin = np.array(f['chin'], float) if 'chin' in f else mo + 0.48 * np.dot(mo - c, perp) * perp
    # 머리 범위(눈을 수평으로 돌린 좌표)로 크기·위치 정하기
    R = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, 1.0)
    hm = mask.astype(np.float32) / 255
    if 'keep' in f:
        hm = hm * poly_fill(f['keep'], mask.shape)
        if 'add' in f: hm = np.maximum(hm, poly_fill(f['add'], mask.shape) * poly_fill(f['keep'], mask.shape))
    ys, xs = np.where(hm > 0.5)
    rx_ = R[0, 0] * xs + R[0, 1] * ys + R[0, 2]; ry_ = R[1, 0] * xs + R[1, 1] * ys + R[1, 2]
    chin_r = R @ np.array([chin[0], chin[1], 1.0])
    top_r = float(np.percentile(ry_, 0.2)); x0_r, x1_r = float(np.percentile(rx_, 0.3)), float(np.percentile(rx_, 99.7))
    s = min(HEADH * W / (chin_r[1] - top_r), 0.94 * W / (x1_r - x0_r))
    # 원본 → (눈 수평 회전 R) → 배율 s → 머리 가로 가운데를 0.5, 꼭대기를 TOP에
    M = np.array([[s * R[0, 0], s * R[0, 1], s * R[0, 2] + W / 2 - s * (x0_r + x1_r) / 2],
                  [s * R[1, 0], s * R[1, 1], s * R[1, 2] + TOP * W - s * top_r]])
    rgb = cv2.warpAffine(img, M, (W, W), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    al = cv2.warpAffine(mask, M, (W, W), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32) / 255
    if 'keep' in f:
        keep = poly_fill(f['keep'], (W, W), M, 1.6)
        al = al * keep
        if 'add' in f: al = np.maximum(al, poly_fill(f['add'], (W, W), M, 2.5) * keep)
    else:  # 예전 방식(타원)
        yy, xx = np.mgrid[0:W, 0:W] / W
        mk = f.get('mask', [0.5, 0.48, 0.28, 0.42])
        ell = ((xx - mk[0]) / (mk[2] * 1.8)) ** 2 + ((yy - mk[1] + 0.04) / (mk[3] * 1.5)) ** 2
        al = al * np.clip((1.0 - ell) / 0.12, 0, 1)
    al = (np.clip(al, 0, 1) * 255).astype(np.uint8)
    tf = lambda p: [round(float(M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2]) / W, 4), round(float(M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2]) / W, 4)]
    mu = tf(mo)
    al = largest_component(al, (int(mu[0] * W), int(mu[1] * W)))
    # 테두리 색 번짐 줄이기
    inside = (al > 140).astype(np.uint8)
    fillc = cv2.inpaint(rgb, 255 - inside * 255, 3, cv2.INPAINT_TELEA)
    rgb = np.where(inside[:, :, None] > 0, rgb, fillc)
    rgba = cv2.cvtColor(rgb, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = al
    cv2.imwrite(os.path.join(OUT, 'head-%s.png' % f['id']), rgba)
    faces.append({'id': 'p-' + f['id'], 'name': f['name'], 'img': data_url(rgba, 'webp', 90), 'alpha': True,
                  'eyeL': tf(eL), 'eyeR': tf(eR), 'mouth': mu, 'chin': tf(chin), 'mask': f.get('mask', [0.5, 0.5, 0.25, 0.38])})
    print('머리', f['id'], '눈', faces[-1]['eyeL'], faces[-1]['eyeR'], '입', mu, '턱', faces[-1]['chin'], '배율', round(s, 3))

json.dump({'v': 2, 'body': body, 'faces': faces}, open(os.path.join(SRC, 'pack-plain.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('저장: faces-src/pack-plain.json')
