import { TILE_TYPES as T, COLOR_GROUPS, STATION_RENT, UTILITY_MULTIPLIER } from '../data/boardData.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (reason) => ({ ok: false, reason });

// Luật sở hữu đất: mua, tính tiền thuê, xây/bán nhà, thế chấp.
// Lớp này chỉ thay đổi cấu trúc sở hữu; tiền do BankManager xử lý.
export class PropertyManager {
  constructor(board, players) {
    this.board = board;
    this.players = players;
  }

  isOwnable(t) {
    return t.type === T.PROPERTY || t.type === T.STATION || t.type === T.UTILITY;
  }

  level(t) {
    return t.hotel ? 5 : t.houses;
  }

  houseCost(t) {
    return COLOR_GROUPS[t.group]?.houseCost ?? 0;
  }

  ownedBy(playerId) {
    return this.board.ownedBy(playerId);
  }

  hasMonopoly(playerId, group) {
    if (!group) return false;
    const tiles = this.board.groupTiles(group);
    return tiles.length > 0 && tiles.every((t) => t.owner === playerId);
  }

  groupHasBuildings(group) {
    return this.board.groupTiles(group).some((t) => this.level(t) > 0);
  }

  canBuy(player, t) {
    if (!this.isOwnable(t)) return no('Ô này không thể mua');
    if (t.owner !== null) return no('Ô này đã có chủ');
    if (player.money < t.price) return no(`Không đủ tiền (cần $${t.price})`);
    return ok({ cost: t.price });
  }

  assignOwner(t, player) {
    t.owner = player.id;
  }

  calculateRent(t, ctx = {}) {
    if (t.owner === null || t.mortgaged) return 0;
    if (t.type === T.PROPERTY) {
      if (t.hotel) return t.rent[5];
      if (t.houses > 0) return t.rent[t.houses];
      return this.hasMonopoly(t.owner, t.group) ? t.rent[0] * 2 : t.rent[0];
    }
    if (t.type === T.STATION) {
      const n = this.board.ofType(T.STATION).filter((s) => s.owner === t.owner).length;
      return STATION_RENT[n - 1] * (ctx.stationMultiplier || 1);
    }
    if (t.type === T.UTILITY) {
      const n = this.board.ofType(T.UTILITY).filter((s) => s.owner === t.owner).length;
      const mult = ctx.utilityMultiplier || UTILITY_MULTIPLIER[n - 1];
      return (ctx.diceTotal || 7) * mult;
    }
    return 0;
  }

  // Bảng giá thuê để hiển thị cho người chơi.
  rentTable(t) {
    if (t.type === T.PROPERTY) {
      return [
        ['Đất trống', t.rent[0]],
        ['Đủ bộ màu', t.rent[0] * 2],
        ['1 nhà', t.rent[1]],
        ['2 nhà', t.rent[2]],
        ['3 nhà', t.rent[3]],
        ['4 nhà', t.rent[4]],
        ['Khách sạn', t.rent[5]],
      ];
    }
    if (t.type === T.STATION) return STATION_RENT.map((r, i) => [`${i + 1} nhà ga`, r]);
    if (t.type === T.UTILITY) return UTILITY_MULTIPLIER.map((m, i) => [`${i + 1} công ty`, `${m} × xúc xắc`]);
    return [];
  }

  canBuild(player, t) {
    if (t.type !== T.PROPERTY) return no('Chỉ có thể xây trên ô đất');
    if (t.owner !== player.id) return no('Bạn không sở hữu ô này');
    if (!this.hasMonopoly(player.id, t.group)) return no('Cần sở hữu toàn bộ nhóm màu');
    const group = this.board.groupTiles(t.group);
    if (group.some((g) => g.mortgaged)) return no('Có ô trong nhóm đang thế chấp');
    const lvl = this.level(t);
    if (lvl >= 5) return no('Đã có khách sạn');
    const min = Math.min(...group.map((g) => this.level(g)));
    if (lvl > min) return no('Phải xây đều các ô trong nhóm');
    const cost = this.houseCost(t);
    if (player.money < cost) return no(`Không đủ tiền (cần $${cost})`);
    return ok({ cost, kind: lvl === 4 ? 'hotel' : 'house' });
  }

  build(player, t) {
    const check = this.canBuild(player, t);
    if (!check.ok) throw new Error(check.reason);
    if (check.kind === 'hotel') {
      t.houses = 0;
      t.hotel = 1;
    } else {
      t.houses += 1;
    }
    return check;
  }

  canSell(player, t) {
    if (t.type !== T.PROPERTY) return no('Ô này không có công trình');
    if (t.owner !== player.id) return no('Bạn không sở hữu ô này');
    const lvl = this.level(t);
    if (lvl === 0) return no('Chưa có nhà để bán');
    const max = Math.max(...this.board.groupTiles(t.group).map((g) => this.level(g)));
    if (lvl < max) return no('Phải bán đều các ô trong nhóm');
    return ok({ refund: Math.floor(this.houseCost(t) / 2), kind: t.hotel ? 'hotel' : 'house' });
  }

  sell(player, t) {
    const check = this.canSell(player, t);
    if (!check.ok) throw new Error(check.reason);
    if (t.hotel) {
      t.hotel = 0;
      t.houses = 4;
    } else {
      t.houses -= 1;
    }
    return check;
  }

  mortgageValue(t) {
    return Math.floor(t.price / 2);
  }

  unmortgageCost(t) {
    return Math.ceil((t.price / 2) * 1.1);
  }

  canMortgage(player, t) {
    if (!this.isOwnable(t)) return no('Ô này không thể thế chấp');
    if (t.owner !== player.id) return no('Bạn không sở hữu ô này');
    if (t.mortgaged) return no('Ô này đã thế chấp');
    if (t.type === T.PROPERTY && this.groupHasBuildings(t.group)) return no('Phải bán hết nhà trong nhóm trước');
    return ok({ value: this.mortgageValue(t) });
  }

  mortgage(player, t) {
    const check = this.canMortgage(player, t);
    if (!check.ok) throw new Error(check.reason);
    t.mortgaged = true;
    return check;
  }

  canUnmortgage(player, t) {
    if (t.owner !== player.id) return no('Bạn không sở hữu ô này');
    if (!t.mortgaged) return no('Ô này không bị thế chấp');
    const cost = this.unmortgageCost(t);
    if (player.money < cost) return no(`Không đủ tiền (cần $${cost})`);
    return ok({ cost });
  }

  unmortgage(player, t) {
    const check = this.canUnmortgage(player, t);
    if (!check.ok) throw new Error(check.reason);
    t.mortgaged = false;
    return check;
  }

  countBuildings(playerId) {
    let houses = 0;
    let hotels = 0;
    for (const t of this.ownedBy(playerId)) {
      houses += t.houses;
      hotels += t.hotel;
    }
    return { houses, hotels };
  }

  buildableTiles(player) {
    return this.ownedBy(player.id).filter(
      (t) => t.type === T.PROPERTY && this.hasMonopoly(player.id, t.group) && this.level(t) < 5,
    );
  }

  netWorth(player) {
    let worth = player.money;
    for (const t of this.ownedBy(player.id)) {
      worth += t.mortgaged ? this.mortgageValue(t) : t.price;
      worth += this.level(t) * this.houseCost(t);
    }
    return worth;
  }

  // Bước thanh lý tài sản tiếp theo khi thiếu tiền: thế chấp đất lẻ trước,
  // sau đó bán nhà, cuối cùng thế chấp đất còn lại.
  nextLiquidationStep(player) {
    const owned = this.ownedBy(player.id);
    const loose = owned
      .filter((t) => this.canMortgage(player, t).ok && !(t.type === T.PROPERTY && this.hasMonopoly(player.id, t.group)))
      .sort((a, b) => a.price - b.price);
    if (loose.length) return { action: 'mortgage', tile: loose[0] };
    const sellable = owned
      .filter((t) => this.canSell(player, t).ok)
      .sort((a, b) => this.level(b) - this.level(a) || b.price - a.price);
    if (sellable.length) return { action: 'sell', tile: sellable[0] };
    const rest = owned.filter((t) => this.canMortgage(player, t).ok).sort((a, b) => a.price - b.price);
    if (rest.length) return { action: 'mortgage', tile: rest[0] };
    return null;
  }
}
