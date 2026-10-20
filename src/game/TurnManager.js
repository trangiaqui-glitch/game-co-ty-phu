export const PHASES = Object.freeze({
  ROLL: 'roll', // chờ tung xúc xắc
  MOVING: 'moving', // đang xử lý tung / di chuyển
  BUY: 'buy', // đang quyết định mua ô vừa đến
  END: 'end', // chỉ còn kết thúc lượt
  OVER: 'over',
});

export class TurnManager {
  constructor(players, rng = Math.random) {
    this.players = players;
    this.rng = rng;
    this.index = 0;
    this.phase = PHASES.ROLL;
    this.round = 1;
    this.turnCount = 1;
  }

  get current() {
    return this.players.list[this.index];
  }

  rollDie() {
    return 1 + Math.floor(this.rng() * 6);
  }

  rollDice() {
    return [this.rollDie(), this.rollDie()];
  }

  // Chuyển sang người chơi kế tiếp chưa phá sản.
  next() {
    const list = this.players.list;
    let i = this.index;
    for (let guard = 0; guard < list.length; guard++) {
      i = (i + 1) % list.length;
      if (i === 0) this.round++;
      if (!list[i].bankrupt) break;
    }
    this.index = i;
    this.turnCount++;
    return this.current;
  }
}
