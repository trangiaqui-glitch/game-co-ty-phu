import { BOARD_TILES, BOARD_LAYOUT, TILE_TYPES, JAIL_POSITION } from '../data/boardData.js';

const { tileWidth: W, cornerSize: C } = BOARD_LAYOUT;
export const BOARD_SIZE = 2 * C + 9 * W;
const HALF = BOARD_SIZE / 2;
// Góc xoay của từng cạnh: trục -z cục bộ của ô luôn hướng vào tâm bàn cờ.
const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

// Vị trí đứng của tối đa 4 người chơi trong một ô (toạ độ cục bộ x, z).
const SLOT_OFFSETS = [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.4], [0.5, 0.4]];
const CORNER_SLOTS = [[-0.65, -0.1], [0.65, -0.1], [-0.65, 0.85], [0.65, 0.85]];
const JAIL_VISIT_SLOTS = [[0.75, 0.85], [0.8, -0.1], [-0.15, 0.95], [-1.0, 0.95]];
const JAIL_CELL_CENTER = [-0.72, -0.72];
const JAIL_CELL_SLOTS = [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]];

export function computeTilePosition(index) {
  const side = Math.floor(index / 10);
  const k = index % 10;
  const rotY = SIDE_ROT[side];
  const inner = HALF - C / 2;
  if (k === 0) {
    const corners = [[inner, inner], [-inner, inner], [-inner, -inner], [inner, -inner]];
    const [x, z] = corners[side];
    return { x, z, rotY, side, corner: true, width: C, depth: C };
  }
  const along = HALF - C - (k - 0.5) * W;
  let x;
  let z;
  switch (side) {
    case 0: x = along; z = inner; break;
    case 1: x = -inner; z = along; break;
    case 2: x = -along; z = -inner; break;
    default: x = inner; z = -along; break;
  }
  return { x, z, rotY, side, corner: false, width: W, depth: C };
}

// Chuyển toạ độ cục bộ của ô sang toạ độ thế giới (khớp với Object3D.rotation.y).
export function localToWorld(pos, lx, lz) {
  const c = Math.cos(pos.rotY);
  const s = Math.sin(pos.rotY);
  return { x: pos.x + lx * c + lz * s, z: pos.z - lx * s + lz * c };
}

export class BoardManager {
  constructor() {
    this.tiles = BOARD_TILES.map((def) => this._createTile(def));
  }

  _createTile(def) {
    return {
      ...def,
      rent: def.rent ? [...def.rent] : undefined,
      owner: null,
      houses: 0,
      hotel: 0, // cấp khách sạn: 0 = chưa có, 1 = có khách sạn
      mortgaged: false,
      position: computeTilePosition(def.id),
    };
  }

  reset() {
    this.tiles = BOARD_TILES.map((def) => this._createTile(def));
  }

  get size() {
    return this.tiles.length;
  }

  getTile(id) {
    const n = this.tiles.length;
    return this.tiles[((id % n) + n) % n];
  }

  groupTiles(group) {
    return this.tiles.filter((t) => t.group === group);
  }

  ofType(type) {
    return this.tiles.filter((t) => t.type === type);
  }

  ownedBy(playerId) {
    return this.tiles.filter((t) => t.owner === playerId);
  }

  nearest(from, type) {
    for (let i = 1; i <= this.tiles.length; i++) {
      const t = this.tiles[(from + i) % this.tiles.length];
      if (t.type === type) return t.id;
    }
    return null;
  }

  // Điểm đứng (toạ độ thế giới) của người chơi `slot` trên ô `tileId`.
  getStandPoint(tileId, slot = 0, jailed = false) {
    const pos = this.getTile(tileId).position;
    const i = slot % 4;
    if (tileId === JAIL_POSITION) {
      if (jailed) {
        const [ox, oz] = JAIL_CELL_SLOTS[i];
        return localToWorld(pos, JAIL_CELL_CENTER[0] + ox, JAIL_CELL_CENTER[1] + oz);
      }
      const [lx, lz] = JAIL_VISIT_SLOTS[i];
      return localToWorld(pos, lx, lz);
    }
    const [lx, lz] = pos.corner ? CORNER_SLOTS[i] : SLOT_OFFSETS[i];
    return localToWorld(pos, lx, lz);
  }

  // Điểm giữa đường đi (dùng cho các bước trung gian khi di chuyển).
  getPathPoint(tileId, slot = 0) {
    return this.getStandPoint(tileId, slot, false);
  }

  static get JAIL_CELL_CENTER() {
    return JAIL_CELL_CENTER;
  }
}

export { TILE_TYPES };
