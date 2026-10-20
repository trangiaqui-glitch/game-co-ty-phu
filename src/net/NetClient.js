import { EventEmitter } from '../utils/EventEmitter.js';

const TOKEN_KEY = 'co-ty-phu-3d:token';
const EVENTS = ['welcome', 'lobby', 'room', 'gameStart', 'action', 'timer', 'gameOver', 'profile', 'invite'];

function storage(fn, fallback = null) {
  try {
    return fn(localStorage);
  } catch {
    return fallback;
  }
}

/**
 * Kết nối tới máy chủ multiplayer: SSE nhận sự kiện realtime, POST /api/cmd gửi lệnh.
 * EventSource tự kết nối lại khi rớt mạng; mỗi lần kết nối lại máy chủ gửi 'welcome'
 * để giao diện đồng bộ lại. Sự kiện: 'status' ('connecting'|'online'|'offline') + các sự kiện máy chủ.
 */
export class NetClient extends EventEmitter {
  constructor(base = '') {
    super();
    this.base = base;
    this.token = storage((s) => s.getItem(TOKEN_KEY));
    // Cho phép mở nhiều tab như nhiều người chơi khác nhau khi thử trên một máy: ?guest
    if (new URLSearchParams(location.search).has('guest')) this.token = sessionStorage.getItem(TOKEN_KEY);
    this.profile = null;
    this.status = 'offline';
    this.es = null;
  }

  async available() {
    try {
      const r = await fetch(`${this.base}/api/health`, { cache: 'no-store' });
      return r.ok && (await r.json()).ok === true;
    } catch {
      return false;
    }
  }

  async connect(name) {
    const r = await this._post({ cmd: 'hello', token: this.token, name });
    if (!r.token) throw new Error(r.error || 'Không kết nối được máy chủ');
    this.token = r.token;
    this.profile = r.profile;
    if (new URLSearchParams(location.search).has('guest')) sessionStorage.setItem(TOKEN_KEY, r.token);
    else storage((s) => s.setItem(TOKEN_KEY, r.token));
    this._openStream();
    return r.profile;
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  _openStream() {
    this.es?.close();
    this._setStatus('connecting');
    const es = new EventSource(`${this.base}/api/stream?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.onopen = () => this._setStatus('online');
    es.onerror = () => this._setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    for (const ev of EVENTS) {
      es.addEventListener(ev, (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        if (ev === 'welcome' || ev === 'profile') this.profile = ev === 'welcome' ? data.profile : data;
        this.emit(ev, data);
      });
    }
  }

  async _post(body) {
    const res = await fetch(`${this.base}/api/cmd`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': this.token || '' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /** Gửi lệnh; trả về { ok, ... } hoặc { ok:false, error }. Không ném lỗi mạng. */
  async cmd(cmd, data = {}) {
    try {
      const r = await this._post({ cmd, ...data });
      if (r.profile) this.profile = r.profile;
      return r;
    } catch (err) {
      return { ok: false, error: `Mất kết nối máy chủ (${err.message})` };
    }
  }

  close() {
    this.es?.close();
    this.es = null;
    this._setStatus('offline');
  }
}
