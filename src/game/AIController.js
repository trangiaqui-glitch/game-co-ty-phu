import { TILE_TYPES as T } from '../data/boardData.js';

// Bộ não đơn giản cho người chơi máy.
export class AIController {
  constructor(game) {
    this.game = game;
  }

  get property() {
    return this.game.property;
  }

  shouldBuy(player, tile) {
    const after = player.money - tile.price;
    if (after < 0) return false;
    if (tile.type === T.PROPERTY) {
      const group = this.game.board.groupTiles(tile.group);
      const mine = group.filter((t) => t.owner === player.id).length;
      if (mine === group.length - 1) return true; // hoàn thành bộ màu
      const contested = group.some((t) => t.owner !== null && t.owner !== player.id);
      if (contested && after < 350) return false;
    }
    return after >= 120;
  }

  jailChoice(player) {
    if (player.jailCards.length) return 'card';
    const unowned = this.game.board.tiles.filter((t) => this.property.isOwnable(t) && t.owner === null).length;
    if (unowned >= 8 && player.money >= 300) return 'pay';
    return 'roll';
  }

  nextManageAction(player) {
    const owned = this.property.ownedBy(player.id);
    const mortgaged = owned.filter((t) => t.mortgaged).sort((a, b) => b.price - a.price);
    for (const t of mortgaged) {
      const check = this.property.canUnmortgage(player, t);
      if (check.ok && player.money - check.cost >= 450) return { type: 'unmortgage', tile: t };
    }
    const candidates = owned
      .map((t) => ({ t, check: this.property.canBuild(player, t) }))
      .filter((c) => c.check.ok && player.money - c.check.cost >= 220)
      .sort((a, b) => this.property.level(a.t) - this.property.level(b.t) || b.t.price - a.t.price);
    if (candidates.length) return { type: 'build', tile: candidates[0].t };
    return null;
  }
}
