// 괴롭히기 도구 목록 · 대사
export const TOOLS = [
  { id: 'punch', icon: '👊', label: '펀치', key: '1' },
  { id: 'kick', icon: '🦵', label: '발차기', key: '2' },
  { id: 'slap', icon: '✋', label: '싸대기', key: '3' },
  { id: 'knuckle', icon: '✊', label: '꿀밤', key: '4' },
  { id: 'pinch', icon: '🤏', label: '꼬집기', key: '5' },
  { id: 'flick', icon: '👆', label: '딱밤', key: '6' },
  { id: 'hammer', icon: '🔨', label: '뿅망치', key: '7' },
  { id: 'tickle', icon: '🤣', label: '간지럼', key: '8' }
];
export const TOOL_IDS = new Set([...TOOLS.map(t => t.id), 'dempsey', 'finish']);
export const ICON = Object.fromEntries(TOOLS.map(t => [t.id, t.icon]).concat([['dempsey', '🥊'], ['finish', '💥']]));

export const LINES = {
  light: ['윽!', '억!', '아야!', '읏!', '아얏!', '엌'],
  heavy: ['으악!', '꾸에엑!', '커헉!', '아아악!', '크헉!'],
  face: ['내 얼굴!', '얼굴은 안 돼!', '아 코!', '으아악 얼굴!', '잘생긴 얼굴을!'],
  body: ['욱!', '커억…', '배가…', '헉!', '우욱'],
  kick: ['으아아악!', '날아간다~', '꾸에에엑!', '발은 반칙이지!'],
  slap: ['짝?!', '왜 때려?!', '엄마한테 이를 거야!', '아니 왜!', '뺨은 아니지!'],
  knuckle: ['아얏!', '머리 터져!', '혹 났잖아!', '아야야야'],
  flick: ['딱밤 반칙!', '이마가!', '앗 따가!', '아 진짜!'],
  hammer: ['뿅?', '어지러워…', '뿅뿅?!', '별이 보여…'],
  pinch: ['아 아 아파!', '놔! 놔!', '살살 해!', '볼 늘어나!', '아파아파아파'],
  tickle: ['크크크 하지 마!', '으히히히', '간지러워 크큭', '아하하 그만!', '히히힛'],
  low: ['살려줘…', '잘못했어요…', '그만…', '흐어엉', '봐주세요…'],
  ko: ['으어어…', '졌다…', '엄마…', '꼬르륵…'],
  taunt: ['그게 다야?', '간지럽네~', '더 세게 때려 봐!', '모기가 물었나?', '에이 약해~', '하나도 안 아프지롱'],
  dempsey: ['뭐, 뭐야 이거!', '으아아 멈춰!', '흔들지 마!', '눈이 안 따라가!'],
  revive: ['다시 덤벼!', '아까는 봐준 거야', '이번엔 안 맞아!', '부활!']
};
