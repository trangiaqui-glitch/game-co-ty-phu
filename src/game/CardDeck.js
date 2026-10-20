import { shuffle } from '../utils/random.js';

export class CardDeck {
  constructor(kind, cards, rng = Math.random) {
    this.kind = kind;
    this.cards = cards;
    this.rng = rng;
    this.held = new Set(); // thẻ "ra tù" đang nằm trong tay người chơi
    this._reshuffle();
  }

  _reshuffle() {
    this.order = shuffle(this.cards.map((_, i) => i), this.rng);
    this.pointer = 0;
  }

  draw() {
    for (let tries = 0; tries < this.cards.length * 2; tries++) {
      if (this.pointer >= this.order.length) this._reshuffle();
      const card = this.cards[this.order[this.pointer++]];
      if (!this.held.has(card.id)) return card;
    }
    throw new Error('Bộ thẻ trống');
  }

  hold(cardId) {
    this.held.add(cardId);
  }

  release(cardId) {
    this.held.delete(cardId);
  }
}
