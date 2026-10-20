import { EventEmitter } from '../utils/EventEmitter.js';

// Ngân hàng: nguồn tiền vô hạn. Mọi thay đổi tiền của người chơi đi qua đây
// để có nhật ký giao dịch đầy đủ.
export class BankManager extends EventEmitter {
  constructor() {
    super();
    this.transactions = [];
    this._seq = 0;
  }

  _check(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Số tiền không hợp lệ: ${amount}`);
  }

  _record(from, to, amount, reason) {
    const tx = { id: ++this._seq, from, to, amount, reason, time: Date.now() };
    this.transactions.push(tx);
    if (this.transactions.length > 500) this.transactions.shift();
    this.emit('transaction', tx);
    return tx;
  }

  credit(player, amount, reason = '') {
    this._check(amount);
    if (amount === 0) return null;
    player.money += amount;
    return this._record(null, player.id, amount, reason);
  }

  debit(player, amount, reason = '') {
    this._check(amount);
    if (amount === 0) return null;
    player.money -= amount;
    return this._record(player.id, null, amount, reason);
  }

  transfer(from, to, amount, reason = '') {
    this._check(amount);
    if (amount === 0) return null;
    from.money -= amount;
    to.money += amount;
    return this._record(from.id, to.id, amount, reason);
  }
}
