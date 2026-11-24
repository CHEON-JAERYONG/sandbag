// 통신: 공개 MQTT 중계 2곳에 동시 접속 (서버·가입·API 키 없음) — 오목/포탄대작전과 같은 방식
// 토픽: <루트>/<체육관>/m (일반 메시지), /s (현재 상태, 남겨두기), /f/<얼굴id> (추가한 얼굴, 남겨두기·암호화)
const BROKERS = [
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' }
];
export const TOPIC_ROOT = 'cjr-sandbag/v1/';

export function rid(n) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(n));
  let s = ''; for (let i = 0; i < n; i++) s += a[r[i] % a.length];
  return s;
}

export class Net {
  constructor(gym, me, h) {
    this.base = TOPIC_ROOT + gym + '/';
    this.me = me; this.h = h;
    this.clients = [];
    this.seen = new Map();
    this.faceSeen = new Map();
    this.lastState = 0;
  }
  connect() {
    if (typeof mqtt === 'undefined') { this.h.status && this.h.status(0, 'no-lib'); return; }
    this.clients = BROKERS.map((b, i) => {
      let c;
      try {
        c = mqtt.connect(b.url, {
          clientId: 'sb_' + this.me.id + '_' + rid(4), username: b.username, password: b.password,
          keepalive: 30, reconnectPeriod: 3000, connectTimeout: 10000, clean: true, queueQoSZero: false,
          will: { topic: this.base + 'm', payload: JSON.stringify({ t: 'bye', from: this.me.id, mid: 'w' + rid(9) }), qos: 0, retain: false }
        });
      } catch (e) { console.warn('broker', i, e); return null; }
      c.on('connect', () => {
        c.subscribe([this.base + 'm', this.base + 's', this.base + 'f/+'], { qos: 0 }, err => { if (err) console.warn('sub', i, err); });
        this.h.status && this.h.status(this.count());
        this.h.up && setTimeout(() => this.h.up(), 200);
      });
      c.on('message', (tp, buf, packet) => this.onRaw(tp, buf, packet));
      ['close', 'offline', 'reconnect', 'error'].forEach(ev => c.on(ev, e => {
        if (ev === 'error') console.warn('mqtt', i, e && e.message);
        this.h.status && this.h.status(this.count());
      }));
      return c;
    });
  }
  close() { for (const c of this.clients) if (c) try { c.end(true); } catch (e) { } this.clients = []; }
  count() { return this.clients.filter(c => c && c.connected).length; }
  pub(topic, s, opt) { for (const c of this.clients) if (c && c.connected) c.publish(this.base + topic, s, opt || { qos: 0 }); }

  send(obj) {
    obj.from = this.me.id; obj.mid = rid(10);
    this.mark(obj.mid);
    this.pub('m', JSON.stringify(obj));
  }
  setState(st) {
    st.ts = Date.now(); st.by = this.me.id;
    this.pub('s', JSON.stringify(st), { qos: 1, retain: true });
  }
  putFace(id, payload) { this.pub('f/' + id, payload, { qos: 1, retain: true }); }
  delFace(id) { this.pub('f/' + id, '', { qos: 1, retain: true }); }

  mark(mid) {
    this.seen.set(mid, Date.now());
    if (this.seen.size > 3000) { const cut = Date.now() - 120000; for (const [k, v] of this.seen) if (v < cut) this.seen.delete(k); }
  }
  onRaw(topic, buf) {
    const sub = topic.slice(this.base.length);
    if (sub.startsWith('f/')) {
      const id = sub.slice(2), s = buf.toString();
      if (this.faceSeen.get(id) === s.length + ':' + s.slice(-24)) return;
      this.faceSeen.set(id, s.length + ':' + s.slice(-24));
      this.h.face && this.h.face(id, s);
      return;
    }
    let d;
    try { d = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    if (sub === 's') {
      if (typeof d.ts !== 'number' || d.ts <= this.lastState) return;
      this.lastState = d.ts;
      this.h.state && this.h.state(d);
      return;
    }
    if (typeof d.mid !== 'string' || typeof d.from !== 'string' || this.seen.has(d.mid)) return;
    this.mark(d.mid);
    if (d.from === this.me.id) return;
    try { this.h.msg && this.h.msg(d); } catch (e) { console.error('msg', d.t, e); }
  }
}
