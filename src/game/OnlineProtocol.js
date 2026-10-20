import { PHASES } from './TurnManager.js';

// Giao thức chơi online dùng chung cho máy chủ (Node) và trình duyệt.
//
// Mô hình "lockstep có máy chủ thẩm quyền":
// - Mọi thiết bị tạo GameManager với cùng seed + cùng danh sách người chơi.
// - Người chơi gửi HÀNH ĐỘNG (không gửi trạng thái). Máy chủ áp dụng hành động lên bản game
//   không giao diện của nó; chỉ khi hợp lệ mới gán số thứ tự (seq) và phát cho cả phòng.
// - Mỗi thiết bị áp dụng đúng chuỗi hành động đó theo thứ tự => cùng xúc xắc, cùng vị trí,
//   cùng tiền, cùng chủ đất (logic game hoàn toàn tất định theo seed), kèm hoạt ảnh 3D đầy đủ.

export const ACTION_METHODS = {
  roll: 'rollDice',
  buy: 'buyProperty',
  decline: 'declinePurchase',
  end: 'endTurn',
  build: 'buildOn',
  sell: 'sellBuilding',
  mortgage: 'mortgageTile',
  unmortgage: 'unmortgageTile',
  payJail: 'payJailFine',
  useJailCard: 'useJailCard',
};
const TILE_ACTIONS = new Set(['build', 'sell', 'mortgage', 'unmortgage']);

export function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object' || !ACTION_METHODS[raw.type]) return null;
  if (TILE_ACTIONS.has(raw.type)) {
    const tileId = Number(raw.tileId);
    if (!Number.isInteger(tileId) || tileId < 0 || tileId > 39) return null;
    return { type: raw.type, tileId };
  }
  return { type: raw.type };
}

// Áp dụng một hành động lên GameManager; trả về { ok, reason }.
export async function applyAction(game, action) {
  const a = normalizeAction(action);
  if (!a) return { ok: false, reason: 'Hành động không hợp lệ' };
  const method = ACTION_METHODS[a.type];
  const result = TILE_ACTIONS.has(a.type) ? await game[method](a.tileId) : await game[method]();
  return result || { ok: false, reason: 'Không có kết quả' };
}

// Hành động tiếp theo của máy (hoặc của người chơi hết giờ / mất kết nối) theo đúng
// chiến lược AIController, tách thành từng bước để có thể phát cho mọi thiết bị.
export function nextAIAction(game) {
  if (!game.started || game.over || game.busy) return null;
  const p = game.currentPlayer;
  const ai = game.ai;
  switch (game.phase) {
    case PHASES.ROLL: {
      if (p.inJail) {
        const choice = ai.jailChoice(p);
        if (choice === 'card' && game.canUseJailCard()) return { type: 'useJailCard' };
        if (choice === 'pay' && game.canPayJailFine()) return { type: 'payJail' };
      }
      const manage = ai.nextManageAction(p);
      if (manage) return { type: manage.type, tileId: manage.tile.id };
      return game.canRoll() ? { type: 'roll' } : null;
    }
    case PHASES.BUY: {
      const tile = game.board.getTile(game.pendingPurchase);
      if (ai.shouldBuy(p, tile) && game.canBuy()) return { type: 'buy' };
      return { type: 'decline' };
    }
    case PHASES.END: {
      const manage = ai.nextManageAction(p);
      if (manage) return { type: manage.type, tileId: manage.tile.id };
      return { type: 'end' };
    }
    default:
      return null;
  }
}

// Danh sách người chơi cho GameManager từ các ghế trong phòng.
export function playersFromSeats(seats, getCharacter) {
  return seats.map((s) => ({
    name: s.name,
    characterId: s.characterId,
    color: getCharacter(s.characterId).color,
    isAI: !!s.bot,
  }));
}
