# 쿵쾅 샌드백 — Claude 인수인계 문서 (먼저 읽기)

친구 사진 속 **진짜 사람(전신)을 오려낸 '사진 인형'**을 링 위에 세워 놓고, 같은 링크로 들어온 사람들이 다 같이 때리는 웹게임.
- 실제 주소: https://cheon-jaeryong.github.io/sandbag/  (GitHub Pages, `main` 루트)
- 저장소: https://github.com/CHEON-JAERYONG/sandbag (공개)
- **친구 얼굴이 보이는 링크 = 주소 + `#k=열쇠`** (열쇠는 `faces-src/KEY.txt`, 깃 제외). 열쇠 없이 열면 만화 얼굴 + 공개 체육관.
- 현재 버전: v1.1.0 (2026-11-24)
  - v1.1.0 사용자 요청 "샌드백 말고 사람이 맞는 것처럼, 얼굴 더 잘 보이게, 사진 속 인물 그대로(AI 영상처럼)" → 3D 샌드백 인형을 버리고 **사진 인형(포토 퍼펫)**으로 바꿈. AI 영상 생성은 유료/대형 모델이라 불가 → 무료 rembg로 배경을 지우고 사진 자체를 뼈대로 휘게 함(사용자에게 설명함).
  - v1.0.1: 체육관 기록 초기화(`reset` 상태) 받기

## 사용자 선호
- 한국어·쉬운 말. 확인한 것만 말하기. API 키/유료/가입 금지(공개 MQTT + GitHub Pages).
- 고치면 같은 주소에 반영: 수정 → 테스트 → commit/push → 실제 주소 확인.
- 커밋 작성자: `git -c user.name=CHEON-JAERYONG -c user.email=CHEON-JAERYONG@users.noreply.github.com commit ...`

## 실제 사람 사진 보호 (꼭 유지)
- 저장소는 공개라서 **사진 원본·정렬본·별명·열쇠는 절대 올리지 않음** → `faces-src/`(정렬된 jpg, faces.json 설정, KEY.txt)는 .gitignore.
- 기본 얼굴은 `faces/pack.bin` = AES-GCM 암호문(base64). 브라우저가 주소의 `#k=` 열쇠로 풀어서 씀. `#` 뒤는 서버로 안 보내짐.
- 게임 안에서 추가한 얼굴도 같은 열쇠로 암호화해서 MQTT 토픽 `.../f/<id>`에 남겨둠(retain). 체육관 토픽 이름도 열쇠의 해시(`gymIdOf`).

## 파일 구조 (빌드 없음)
| 파일 | 역할 |
|---|---|
| `index.html`, `style.css` | 화면(위: 체력바·참가자·설정 / 아래: 도구 8개·뎀프시·필살 / 시작창·설정창) |
| `js/main.js` | 전체 흐름: 조작(탭·꼬집기 끌기·간지럼 누르기), 도구별 반응표 `FXT`, `myHit`→`impact`, 콤보·게이지, KO/라운드(얼굴 교대), 뎀프시롤 `D`, 카메라, 온라인 처리 |
| `js/dummy.js` | **사진 인형**: 몸 사진 2층(몸통 `torso` + 앞에 있는 팔 `arm`, 팔 뒤는 메워 둠)을 격자로 만들고 뼈대 12개(골반·허리·가슴·목·허벅지/정강이/발×2·위팔·아래팔) 가중치로 CPU에서 휘게 함. 다리는 발을 바닥에 둔 2관절 IK(무릎 풀리면 바깥으로 굽음). 두께는 투명도에서 거리변환. 머리는 얼굴 사진 카드(볼록한 판, 투명한 곳 버림) + 셰이더 표정(찡그림·`><`/X/^^/소용돌이·눈물·멍·손자국·홍조). 물리: 발 기준 흔들림/KO 때 뒤로 쓰러짐(`B`), 허리(`W`), 머리(`H`), 무릎(`C`), 팔 반사 자세(`flinch`: face 막기·gut 배 움켜쥐기·head 머리 감싸기). 좌표: 몸은 '쉬는 자세' 좌표(`lp`, `toRest`), 머리는 카드 좌표(`headToUv`). `spot('gut'|'chest'|'sideL'|'sideR'|'thigh')`, `headSpotUV(u,v)`. 열쇠 없으면 `cartoonBody()` |
| `js/attacker.js` | 1인칭: 권투 글러브 2개(직선·훅·어퍼·바디), 맨손(싸대기·꿀밤·딱밤·꼬집기·간지럼 — 손가락 관절), 발차기 다리, 뿅망치. 팔/다리는 화면 오른쪽 아래 밖에서 들어오게 `armQ` |
| `js/fx.js` | 섬광·충격파·땀방울·집중선·잔상·의성어(퍽!)·데미지 숫자·말풍선·화면 흔들림 |
| `js/sound.js` | 효과음 전부 WebAudio 합성 + 브라우저 한국어 음성(speechSynthesis)으로 비명 |
| `js/net.js` | 공개 MQTT 2곳 동시 접속(emqx 8084, shiftr 443). 토픽 `cjr-sandbag/v1/<체육관>/m`(메시지) `/s`(상태 retain) `/f/<id>`(얼굴 retain) |
| `js/faces.js` | 열쇠 읽기/새로 만들기, 암·복호화, `pack.bin` 읽기, 만화 얼굴, 사진 정렬(`normalizePhoto`) |
| `js/editor.js` | 게임 안 "얼굴 추가": 사진 고르기 → 왼눈·오른눈·입 탭(확대/이동) → 얼굴 타원 조절 → 저장 |
| `js/tools.js` | 도구 목록·대사 |
| `vendor/` | three.js r170(module), mqtt 5.16.1 자체 보관 |

## 온라인 규칙
- 메시지: `hit`(때림: 부위·위치·방향·힘·데미지·라운드), `pinch`(꼬집기 늘린 벡터), `ko`(막타, 다음 얼굴), `face`(얼굴 바꾸기), `hb`(4초마다 이름·점수·라운드·체력), `dempsey`(필살 알림), `bye`.
- 체력 1500은 각자 계산(받은 hit의 데미지를 뺌). 막타 친 사람이 `ko` + 상태(`s`, retain)를 보냄. 남의 타격으로 0이 되면 1.5초 기다렸다 대신 알림.
- 늦게 온 사람은 retain 상태로 라운드·얼굴·KO 수를 맞춤. 게임 중 라운드가 앞선 상태가 먼저 오면 KO 장면 뒤에 적용.
- 6초마다 아이디가 제일 작은 사람이 상태를 갱신.

## 얼굴 바꾸기 (나중에 이미지만 바꾸고 싶을 때)
1. **게임 안에서**(쉬움): ⚙️ 설정 → 얼굴 추가 → 사진 → 눈·눈·입 → 저장. 같은 링크 모두에게 바로 보임(배포 불필요). ✕로 지움.
2. **기본 묶음(몸+머리) 다시 만들기**: `faces-src/faces.json` = { source: 사진 폴더, body: {file, joints(원본 px: pelvis spine chest neck shL elL wrL haL shR hipL knL anL toL hipR knR anR toR — L/R은 **화면 기준 왼/오른쪽**), armPoly(앞에 있는 팔 윤곽), headErase, neckY, floorY}, faces: [{file,id,name,eL,eR,m,mask, seg:false(배경 못 지우는 사진은 타원), ellK}] }
   → `<venv>/python tools/build-puppet.py` (rembg 필요: `python -m venv venv && venv/Scripts/pip install "rembg[cpu]"`, 첫 실행 때 모델 자동 다운로드 — 이번엔 scratchpad에 venv 만들었음, 없으면 다시 만들기) → `faces-src/pack-plain.json` + `faces-src/puppet/*.png`(확인용)
   → `node tools/make-pack.js` (pack-plain.json을 KEY.txt 열쇠로 암호화 → faces/pack.bin) → commit/push. 관절·팔 윤곽은 사진에 격자 그려서 읽음. (`normalize-faces.ps1`은 옛 방식, 이제 안 씀)

## 테스트
```bash
python -m http.server 8777 --bind 127.0.0.1     # 게임 폴더에서
cd tools && npm install                         # 처음 한 번 (playwright-core, 설치된 크롬 사용)
node tools/shot.js                              # 도구 8개 캡처 (PLAN=punch,kick BURST=3 DELAY=90 DEMPSEY=1 KO=1, 폰: TAG=m W=390 H=844 DPR=2 MOBILE=1)
node tools/test-online.js                       # PC+폰+늦게 온 사람: 체력·KO·라운드 동기화 (테스트용 새 열쇠)
node tools/test-face.js                         # 얼굴 추가 → 다른 화면에 도착
node tools/test-fall.js                         # KO 쓰러짐·배 맞기 자세를 물리 직접 돌려 캡처(헤드리스는 느려서 실제 시간으론 확인 어려움)
# 실제 주소: BASE=https://cheon-jaeryong.github.io/sandbag/ node tools/test-online.js
```
캡처는 `tools/shots/`(깃 제외) — 직접 열어 눈으로 확인. 헤드리스는 swiftshader라 느림(실제 기기는 훨씬 부드러움).
`shot.js`를 진짜 열쇠로 돌리면 실제 체육관 라운드/KO 기록이 바뀜 → KO 테스트는 `KEY=아무거나`로. 바뀌었으면 `node tools/reset-gym.js`(실제 주소에서 라운드1·KO0으로).
버전 올릴 때: `js/main.js`의 `VERSION` + `index.html`의 `?v=` 2곳 + **모든 js의 import 경로 `?v=`** (한 줄: `for f in js/*.js; do sed -i -E "s#from '\./([a-z]+)\.js(\?v=[0-9.]+)?'#from './.js?v=새버전'#g" $f; done`) — 섞여서 옛 파일을 읽으면 깨짐.

## 디버그
콘솔 `window.__sb` → `G`(상태), `D`(뎀프시), `dummy`, `atk`, `net`, `faces`, `selectTool()`, `setDempsey()`, `startSuper()`, `myHit()`.

## 다음 아이디어
- 도구 추가(물풍선·간지럼 깃털·전기), 맞은 횟수 랭킹 저장, 표정 사진 여러 장(맞을 때 다른 사진으로), 카톡 미리보기 이미지(og.png), 효과음 다양화.
