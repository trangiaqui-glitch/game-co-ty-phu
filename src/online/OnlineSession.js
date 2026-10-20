import { EventEmitter } from '../utils/EventEmitter.js';
import { applyAction } from '../game/OnlineProtocol.js';

/**
 * Phía trình duyệt của ván online (lockstep).
 * - Nhận hành động đã được máy chủ xác nhận (seq tăng dần) và áp dụng TUẦN TỰ lên GameManager cục bộ,
 *   có hoạt ảnh 3D; xong mỗi hành động thì báo 'ack' để máy chủ biết thiết bị đã bắt kịp.
 * - Thao tác của người chơi KHÔNG áp dụng trực tiếp: gửi lên máy chủ, chỉ khi máy chủ phát lại mới chạy.
 * - Thiếu seq (mất gói khi rớt mạng) hoặc kết quả khác máy chủ -> phát 'desync' để tải lại toàn bộ.
 *
 * Sự kiện: 'change', 'desync', 'applied'.
 */
export class OnlineSession extends EventEmitter {
  constructor({ net, game, seat, code, applied = 0 }) {
    super();
    this.net = net;
    this.game = game;
    this.seat = seat;
    this.code = code;
    this.applied = applied;
    this.received = applied;
    this.pendingSeq = null;
    this.sending = false;
    this.queue = Promise.resolve();
    this.disposed = false;
    this.timer = null; // { seat, deadline, offline }
    if (applied) net.cmd('ack', { seq: applied });
  }

  dispose() {
    this.disposed = true;
    this.removeAllListeners();
  }

  get idle() {
    return this.applied === this.received && !this.game.busy;
  }

  isMyTurn() {
    const g = this.game;
    return !this.disposed && g.started && !g.over && g.currentPlayer.id === this.seat && this.idle
      && !this.sending && (this.pendingSeq === null || this.applied >= this.pendingSeq);
  }

  onAction(entry) {
    if (this.disposed || entry.seq <= this.received) return;
    if (entry.seq !== this.received + 1) {
      this.emit('desync', `thiếu hành động ${this.received + 1}..${entry.seq - 1}`);
      return;
    }
    this.received = entry.seq;
    this.queue = this.queue.then(() => this._apply(entry));
  }

  async _apply(entry) {
    if (this.disposed) return;
    const r = await applyAction(this.game, entry.action);
    if (this.disposed) return;
    if (!r.ok) {
      this.emit('desync', `hành động ${entry.seq} (${entry.action.type}) không khớp: ${r.reason}`);
      return;
    }
    this.applied = entry.seq;
    if (this.pendingSeq !== null && this.applied >= this.pendingSeq) this.pendingSeq = null;
    this.net.cmd('ack', { seq: entry.seq });
    this.emit('applied', entry);
    this.emit('change');
  }

  setTimer(t) {
    this.timer = t && t.seq === this.received ? { seat: t.seat, deadline: performance.now() + t.remainingMs, offline: t.offline } : null;
    this.emit('change');
  }

  async send(action) {
    if (!this.isMyTurn()) return { ok: false, reason: 'Chưa đến lượt của bạn' };
    this.sending = true;
    this.emit('change');
    const r = await this.net.cmd('action', { action, seq: this.applied });
    this.sending = false;
    if (r.ok && r.seq) this.pendingSeq = r.seq; // chờ máy chủ phát lại hành động này
    this.emit('change');
    if (!r.ok) return { ok: false, reason: r.error || r.reason };
    return { ok: true };
  }
}
