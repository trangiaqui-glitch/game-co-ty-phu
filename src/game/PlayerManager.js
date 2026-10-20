export class PlayerManager {
  constructor(configs, startMoney = 1500) {
    if (!Array.isArray(configs) || configs.length < 2 || configs.length > 4) {
      throw new Error('Cần từ 2 đến 4 người chơi');
    }
    this.list = configs.map((c, i) => ({
      id: i,
      slot: i,
      name: c.name || `Người chơi ${i + 1}`,
      characterId: c.characterId,
      color: c.color || '#888888',
      isAI: !!c.isAI,
      money: startMoney,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [], // [{ deck: 'chance'|'community', cardId }]
      bankrupt: false,
      bankruptOrder: null,
      doublesCount: 0,
    }));
  }

  get count() {
    return this.list.length;
  }

  get(id) {
    return this.list.find((p) => p.id === id) || null;
  }

  active() {
    return this.list.filter((p) => !p.bankrupt);
  }

  others(player) {
    return this.list.filter((p) => p.id !== player.id && !p.bankrupt);
  }
}
