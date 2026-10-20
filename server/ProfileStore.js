// Hồ sơ người chơi (tài khoản khách): tên, nhân vật, cấp độ, xu, thành tích.
// Lưu trong data/profiles.json (thư mục này không được phục vụ qua web).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const START_COINS = 5000;
export const ACHIEVEMENTS = {
  firstGame: { icon: '🎲', name: 'Ván đầu tiên', desc: 'Hoàn thành một ván online' },
  firstWin: { icon: '🏆', name: 'Chiến thắng đầu tiên', desc: 'Thắng một ván online' },
  tycoon: { icon: '💰', name: 'Tỷ phú', desc: 'Kết thúc ván với tổng tài sản từ $5,000' },
  landlord: { icon: '🏘️', name: 'Đại địa chủ', desc: 'Sở hữu từ 8 ô đất khi kết thúc ván' },
  veteran: { icon: '⭐', name: 'Lão làng', desc: 'Chơi 10 ván online' },
};

export const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;
export const xpForLevel = (level) => (level - 1) ** 2 * 60;

const id = (n) => randomBytes(n).toString('base64url');

export class ProfileStore {
  constructor(file) {
    this.file = file;
    this.byToken = new Map();
    this.byId = new Map();
    this._saveTimer = null;
    if (file && existsSync(file)) {
      try {
        for (const p of JSON.parse(readFileSync(file, 'utf8'))) this._index(p);
      } catch (err) {
        console.error('[ProfileStore] Không đọc được', file, err.message);
      }
    }
  }

  _index(p) {
    this.byToken.set(p.token, p);
    this.byId.set(p.id, p);
  }

  create(name, characterId) {
    let pid;
    do pid = id(6); while (this.byId.has(pid));
    const p = {
      id: pid, token: id(24), name: name || `Khách ${pid.slice(0, 4)}`, characterId: characterId || 'businessman',
      xp: 0, coins: START_COINS, games: 0, wins: 0, achievements: [], createdAt: Date.now(),
    };
    this._index(p);
    this.save();
    return p;
  }

  get(token) {
    return token ? this.byToken.get(token) || null : null;
  }

  update(p, patch) {
    Object.assign(p, patch);
    this.save();
  }

  // Công khai cho người khác: không bao giờ chứa token.
  publicView(p) {
    return {
      id: p.id, name: p.name, characterId: p.characterId, level: levelFromXp(p.xp), xp: p.xp,
      nextLevelXp: xpForLevel(levelFromXp(p.xp) + 1), levelXp: xpForLevel(levelFromXp(p.xp)),
      coins: p.coins, games: p.games, wins: p.wins, achievements: p.achievements,
    };
  }

  // Thưởng sau ván online. Trả về phần thay đổi để hiển thị.
  reward(p, { won, netWorth, tiles }) {
    const xp = 50 + (won ? 150 : 0) + Math.min(100, Math.floor(netWorth / 100));
    const coins = (won ? 500 : 100) + Math.floor(netWorth / 50);
    const before = levelFromXp(p.xp);
    p.xp += xp;
    p.coins += coins;
    p.games += 1;
    if (won) p.wins += 1;
    const unlocked = [];
    const unlock = (key, cond) => {
      if (cond && !p.achievements.includes(key)) {
        p.achievements.push(key);
        unlocked.push(key);
      }
    };
    unlock('firstGame', true);
    unlock('firstWin', won);
    unlock('tycoon', netWorth >= 5000);
    unlock('landlord', tiles >= 8);
    unlock('veteran', p.games >= 10);
    this.save();
    return { xp, coins, levelUp: levelFromXp(p.xp) > before, level: levelFromXp(p.xp), unlocked };
  }

  save() {
    if (!this.file) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        writeFileSync(tmp, JSON.stringify([...this.byId.values()], null, 1));
        renameSync(tmp, this.file);
      } catch (err) {
        console.error('[ProfileStore] Không lưu được hồ sơ:', err.message);
      }
    }, 200);
  }
}
