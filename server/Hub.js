// Trung tâm multiplayer: người chơi online, phòng chơi, ván đấu thẩm quyền (lockstep).
import { randomInt } from 'node:crypto';
import { GameManager } from '../src/game/GameManager.js';
import { applyAction, nextAIAction, normalizeAction, playersFromSeats } from '../src/game/OnlineProtocol.js';
import { CHARACTERS, getCharacter } from '../src/data/characters.js';

export class HubError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Bot Bin', 'Bot Bông', 'Bot Tí', 'Bot Mèo'];
const MAX_SEATS = 4;
const START_MONEY = [1500, 2000, 2500];
const MAX_ROUNDS = [0, 15, 30, 50];

export const DEFAULT_CONFIG = {
  turnTimeoutMs: 45000, // người chơi không thao tác -> máy chơi thay một bước
  offlineGraceMs: 12000, // mất kết nối trong lượt của mình -> máy chơi thay sau thời gian này
  aiDelayMs: 900, // nhịp chơi của máy
  ackWaitMs: 20000, // chờ các thiết bị phát xong hoạt ảnh tối đa
  roomIdleMs: 5 * 60000,
};

const clean = (s, max = 18) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const validChar = (id) => CHARACTERS.some((c) => c.id === id);

export class Hub {
  constructor({ profiles, config = {} }) {
    this.profiles = profiles;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clients = new Map(); // profileId -> { profile, streams:Set, roomCode, offlineSince }
    this.rooms = new Map();
    this._lobbyTimer = null;
    this._gc = setInterval(() => this._collectRooms(), 30000);
    this._gc.unref?.();
  }

  // ------------------------------------------------------------ clients & streams
  client(profile) {
    let c = this.clients.get(profile.id);
    if (!c) {
      c = { profile, streams: new Set(), roomCode: null, offlineSince: Date.now() };
      this.clients.set(profile.id, c);
    }
    return c;
  }

  isOnline(profileId) {
    return (this.clients.get(profileId)?.streams.size || 0) > 0;
  }

  attachStream(profile, stream) {
    const c = this.client(profile);
    const wasOnline = c.streams.size > 0;
    c.streams.add(stream);
    c.offlineSince = null;
    const room = c.roomCode && this.rooms.get(c.roomCode);
    stream.send('welcome', {
      profile: this.profiles.publicView(profile),
      lobby: this.lobbyView(),
      room: room ? this.roomView(room) : null,
    });
    if (!wasOnline) this._presenceChanged(c);
    return () => {
      c.streams.delete(stream);
      if (c.streams.size === 0) {
        c.offlineSince = Date.now();
        this._presenceChanged(c);
      }
    };
  }

  send(profileId, event, data) {
    const c = this.clients.get(profileId);
    if (c) for (const s of c.streams) s.send(event, data);
  }

  _presenceChanged(c) {
    const room = c.roomCode && this.rooms.get(c.roomCode);
    if (room) {
      this._broadcastRoomState(room);
      if (room.state === 'playing') this._schedule(room);
    }
    this._lobbyChanged();
  }

  // ------------------------------------------------------------ views
  lobbyView() {
    const online = [];
    for (const c of this.clients.values()) {
      if (!c.streams.size) continue;
      const room = c.roomCode && this.rooms.get(c.roomCode);
      online.push({
        id: c.profile.id, name: c.profile.name, characterId: c.profile.characterId,
        level: this.profiles.publicView(c.profile).level,
        status: room ? (room.state === 'playing' ? 'playing' : 'room') : 'lobby',
        roomCode: room && room.state === 'waiting' && room.isPublic ? room.code : null,
      });
    }
    const rooms = [...this.rooms.values()]
      .filter((r) => r.isPublic && r.state === 'waiting' && r.seats.length < MAX_SEATS)
      .map((r) => ({ code: r.code, host: this._seatName(r, r.hostId), count: r.seats.length, max: MAX_SEATS }));
    return { online, rooms };
  }

  _seatName(room, profileId) {
    return room.seats.find((s) => s.profileId === profileId)?.name || '?';
  }

  roomView(room) {
    const cur = room.game && !room.game.over ? room.game.currentPlayer.id : null;
    return {
      code: room.code,
      isPublic: room.isPublic,
      hostId: room.hostId,
      state: room.state,
      settings: room.settings,
      seq: room.actions.length,
      turnSeat: cur,
      seats: room.seats.map((s, i) => ({
        index: i,
        id: s.profileId,
        bot: s.bot,
        name: s.name,
        characterId: s.characterId,
        ready: s.bot || s.ready || s.profileId === room.hostId,
        left: !!s.left,
        online: s.bot ? true : this.isOnline(s.profileId) && !s.left,
        level: s.profileId ? this.profiles.publicView(this.clients.get(s.profileId).profile).level : null,
        auto: room.state === 'playing' && this._serverControlled(room, i),
      })),
      result: room.result,
    };
  }

  _members(room) {
    return room.seats.filter((s) => s.profileId && !s.left).map((s) => s.profileId);
  }

  _broadcast(room, event, data) {
    for (const id of this._members(room)) this.send(id, event, data);
  }

  _broadcastRoomState(room) {
    this._broadcast(room, 'room', this.roomView(room));
  }

  _lobbyChanged() {
    if (this._lobbyTimer) return;
    this._lobbyTimer = setTimeout(() => {
      this._lobbyTimer = null;
      const view = this.lobbyView();
      for (const c of this.clients.values()) for (const s of c.streams) s.send('lobby', view);
    }, 150);
  }

  // ------------------------------------------------------------ commands
  async command(profile, cmd, data = {}) {
    const c = this.client(profile);
    switch (cmd) {
      case 'profile': return this._setProfile(c, data);
      case 'createRoom': return this._createRoom(c, !!data.isPublic);
      case 'joinRoom': return this._joinRoom(c, clean(data.code, 8).toUpperCase());
      case 'quickPlay': return this._quickPlay(c);
      case 'leaveRoom': return this._leaveRoom(c);
      case 'setSeat': return this._setSeat(c, data);
      case 'addBot': return this._addBot(c);
      case 'removeBot': return this._removeBot(c, Number(data.index));
      case 'setSettings': return this._setSettings(c, data);
      case 'startGame': return this._startGame(c);
      case 'invite': return this._invite(c, String(data.to || ''));
      case 'action': return this._action(c, data.action, Number(data.seq));
      case 'ack': return this._ack(c, Number(data.seq));
      case 'sync': return this._sync(c);
      case 'backToRoom': return this._backToRoom(c);
      default: throw new HubError(`Lệnh không hợp lệ: ${cmd}`);
    }
  }

  _setProfile(c, { name, characterId }) {
    const patch = {};
    if (name !== undefined) {
      const n = clean(name);
      if (n.length < 2) throw new HubError('Tên cần ít nhất 2 ký tự');
      patch.name = n;
    }
    if (characterId !== undefined) {
      if (!validChar(characterId)) throw new HubError('Nhân vật không hợp lệ');
      patch.characterId = characterId;
    }
    this.profiles.update(c.profile, patch);
    const room = this._roomOf(c);
    if (room && room.state === 'waiting') {
      const seat = room.seats.find((s) => s.profileId === c.profile.id);
      if (seat && patch.name) seat.name = patch.name;
      this._broadcastRoomState(room);
    }
    this._lobbyChanged();
    return { profile: this.profiles.publicView(c.profile) };
  }

  _roomOf(c) {
    const room = c.roomCode && this.rooms.get(c.roomCode);
    if (!room) c.roomCode = null;
    return room || null;
  }

  _requireRoom(c) {
    const room = this._roomOf(c);
    if (!room) throw new HubError('Bạn chưa ở trong phòng nào');
    return room;
  }

  _requireHost(c) {
    const room = this._requireRoom(c);
    if (room.hostId !== c.profile.id) throw new HubError('Chỉ chủ phòng mới làm được việc này', 403);
    return room;
  }

  _freeCharacter(room, preferred) {
    const used = new Set(room.seats.map((s) => s.characterId));
    if (preferred && validChar(preferred) && !used.has(preferred)) return preferred;
    return CHARACTERS.find((ch) => !used.has(ch.id))?.id;
  }

  _newCode() {
    let code;
    do code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    while (this.rooms.has(code));
    return code;
  }

  _leaveCurrent(c) {
    const room = this._roomOf(c);
    if (!room) return;
    if (room.state === 'playing') throw new HubError(`Bạn đang chơi trong phòng ${room.code}. Hãy rời ván trước.`);
    this._leaveRoom(c);
  }

  _createRoom(c, isPublic) {
    this._leaveCurrent(c);
    const room = {
      code: this._newCode(), isPublic, hostId: c.profile.id, state: 'waiting', createdAt: Date.now(),
      settings: { startMoney: 1500, maxRounds: 30 },
      seats: [], game: null, seed: null, players: null, actions: [], queue: Promise.resolve(),
      acks: new Map(), timer: null, timerToken: 0, deadline: null, lastCommitAt: 0, result: null, emptySince: null,
    };
    this.rooms.set(room.code, room);
    this._seat(room, c);
    return { room: this.roomView(room) };
  }

  _seat(room, c) {
    room.seats.push({
      profileId: c.profile.id, bot: false, name: c.profile.name,
      characterId: this._freeCharacter(room, c.profile.characterId), ready: false, left: false,
    });
    c.roomCode = room.code;
    room.emptySince = null;
    this._broadcastRoomState(room);
    this._lobbyChanged();
  }

  _joinRoom(c, code) {
    const room = this.rooms.get(code);
    if (!room) throw new HubError(`Không tìm thấy phòng ${code || ''}`.trim(), 404);
    const mine = room.seats.find((s) => s.profileId === c.profile.id);
    if (mine) {
      // Vào lại phòng / ván đang chơi của chính mình.
      mine.left = false;
      c.roomCode = room.code;
      this._broadcastRoomState(room);
      if (room.state === 'playing') this._schedule(room);
      this._lobbyChanged();
      return { room: this.roomView(room) };
    }
    if (room.state !== 'waiting') throw new HubError('Phòng đang chơi, không thể tham gia');
    if (room.seats.length >= MAX_SEATS) throw new HubError('Phòng đã đủ 4 người');
    this._leaveCurrent(c);
    this._seat(room, c);
    return { room: this.roomView(room) };
  }

  _quickPlay(c) {
    const current = this._roomOf(c);
    if (current && current.state === 'waiting') return { room: this.roomView(current) };
    const open = [...this.rooms.values()]
      .filter((r) => r.isPublic && r.state === 'waiting' && r.seats.length < MAX_SEATS && r.seats.some((s) => !s.bot && this.isOnline(s.profileId)))
      .sort((a, b) => b.seats.length - a.seats.length || a.createdAt - b.createdAt)[0];
    if (open) return this._joinRoom(c, open.code);
    return this._createRoom(c, true);
  }

  _leaveRoom(c) {
    const room = this._roomOf(c);
    c.roomCode = null;
    if (!room) return { ok: true };
    const idx = room.seats.findIndex((s) => s.profileId === c.profile.id);
    if (room.state === 'playing') {
      // Giữ ghế trong ván (người chơi khác vẫn thấy nhân vật); máy chơi thay.
      if (idx >= 0) room.seats[idx].left = true;
      this._schedule(room);
    } else if (idx >= 0) {
      room.seats.splice(idx, 1);
    }
    if (room.hostId === c.profile.id) {
      const next = room.seats.find((s) => !s.bot && !s.left && s.profileId);
      room.hostId = next ? next.profileId : null;
    }
    if (!room.seats.some((s) => !s.bot && !s.left)) this._closeRoom(room);
    else this._broadcastRoomState(room);
    this._lobbyChanged();
    return { ok: true };
  }

  _closeRoom(room) {
    clearTimeout(room.timer);
    room.timerToken++;
    room.game?.dispose();
    for (const s of room.seats) {
      const c = s.profileId && this.clients.get(s.profileId);
      if (c && c.roomCode === room.code) c.roomCode = null;
    }
    this.rooms.delete(room.code);
    this._lobbyChanged();
  }

  _requireWaiting(room) {
    if (room.state !== 'waiting') throw new HubError('Phòng không ở trạng thái chờ');
  }

  _setSeat(c, { characterId, ready }) {
    const room = this._requireRoom(c);
    this._requireWaiting(room);
    const seat = room.seats.find((s) => s.profileId === c.profile.id);
    if (characterId !== undefined) {
      if (!validChar(characterId)) throw new HubError('Nhân vật không hợp lệ');
      if (room.seats.some((s) => s !== seat && s.characterId === characterId)) throw new HubError('Nhân vật này đã có người chọn');
      seat.characterId = characterId;
      this.profiles.update(c.profile, { characterId });
    }
    if (ready !== undefined) seat.ready = !!ready;
    this._broadcastRoomState(room);
    return { room: this.roomView(room) };
  }

  _addBot(c) {
    const room = this._requireHost(c);
    this._requireWaiting(room);
    if (room.seats.length >= MAX_SEATS) throw new HubError('Phòng đã đủ 4 người');
    const used = new Set(room.seats.map((s) => s.name));
    room.seats.push({
      profileId: null, bot: true, name: BOT_NAMES.find((n) => !used.has(n)) || 'Bot',
      characterId: this._freeCharacter(room), ready: true, left: false,
    });
    this._broadcastRoomState(room);
    this._lobbyChanged();
    return { room: this.roomView(room) };
  }

  _removeBot(c, index) {
    const room = this._requireHost(c);
    this._requireWaiting(room);
    if (!room.seats[index]?.bot) throw new HubError('Ghế này không phải máy');
    room.seats.splice(index, 1);
    this._broadcastRoomState(room);
    this._lobbyChanged();
    return { room: this.roomView(room) };
  }

  _setSettings(c, data) {
    const room = this._requireHost(c);
    this._requireWaiting(room);
    if (data.startMoney !== undefined) {
      if (!START_MONEY.includes(Number(data.startMoney))) throw new HubError('Tiền khởi điểm không hợp lệ');
      room.settings.startMoney = Number(data.startMoney);
    }
    if (data.maxRounds !== undefined) {
      if (!MAX_ROUNDS.includes(Number(data.maxRounds))) throw new HubError('Giới hạn vòng không hợp lệ');
      room.settings.maxRounds = Number(data.maxRounds);
    }
    if (data.isPublic !== undefined) room.isPublic = !!data.isPublic;
    this._broadcastRoomState(room);
    this._lobbyChanged();
    return { room: this.roomView(room) };
  }

  _invite(c, to) {
    const room = this._requireRoom(c);
    this._requireWaiting(room);
    if (!this.isOnline(to)) throw new HubError('Người chơi này không còn online');
    if (room.seats.some((s) => s.profileId === to)) throw new HubError('Người này đã ở trong phòng');
    this.send(to, 'invite', { from: c.profile.name, fromId: c.profile.id, code: room.code });
    return { ok: true };
  }

  // ------------------------------------------------------------ game
  async _startGame(c) {
    const room = this._requireHost(c);
    this._requireWaiting(room);
    if (room.seats.length < 2) throw new HubError('Cần ít nhất 2 người chơi (có thể thêm máy)');
    const notReady = room.seats.filter((s) => !s.bot && s.profileId !== room.hostId && !s.ready);
    if (notReady.length) throw new HubError(`Đang chờ sẵn sàng: ${notReady.map((s) => s.name).join(', ')}`);
    const offline = room.seats.filter((s) => !s.bot && !this.isOnline(s.profileId));
    if (offline.length) throw new HubError(`Mất kết nối: ${offline.map((s) => s.name).join(', ')}`);

    room.seed = randomInt(2 ** 31);
    room.players = playersFromSeats(room.seats, getCharacter);
    room.game = new GameManager({
      players: room.players, startMoney: room.settings.startMoney, maxRounds: room.settings.maxRounds, seed: room.seed, autoAI: false,
    });
    await room.game.start();
    room.actions = [];
    room.acks.clear();
    room.result = null;
    room.state = 'playing';
    room.lastCommitAt = Date.now();
    this._broadcast(room, 'gameStart', this._gameData(room));
    this._broadcastRoomState(room);
    this._lobbyChanged();
    this._schedule(room);
    return { ok: true };
  }

  _gameData(room) {
    return {
      code: room.code, seed: room.seed, players: room.players, settings: room.settings, actions: room.actions,
    };
  }

  _sync(c) {
    const room = this._requireRoom(c);
    return { room: this.roomView(room), game: room.state === 'waiting' ? null : this._gameData(room) };
  }

  _enqueue(room, fn) {
    const run = room.queue.then(fn);
    room.queue = run.catch(() => {});
    return run;
  }

  async _action(c, raw, seq) {
    const room = this._requireRoom(c);
    return this._enqueue(room, async () => {
      if (room.state !== 'playing') throw new HubError('Ván đấu chưa bắt đầu hoặc đã kết thúc');
      const g = room.game;
      const seatIdx = room.seats.findIndex((s) => s.profileId === c.profile.id);
      if (seatIdx < 0 || room.seats[seatIdx].left) throw new HubError('Bạn không ngồi trong ván này', 403);
      if (g.currentPlayer.id !== seatIdx) throw new HubError('Chưa đến lượt của bạn');
      // Chống áp dụng nhầm khi trạng thái vừa đổi (ví dụ máy vừa chơi thay do hết giờ).
      if (seq !== room.actions.length) throw new HubError('Trạng thái ván vừa thay đổi, hãy thử lại', 409);
      const action = normalizeAction(raw);
      if (!action) throw new HubError('Hành động không hợp lệ');
      const r = await applyAction(g, action);
      if (!r.ok) return { ok: false, reason: r.reason };
      this._commit(room, action, seatIdx, null);
      return { ok: true, seq: room.actions.length };
    });
  }

  _ack(c, seq) {
    const room = this._roomOf(c);
    if (room && Number.isInteger(seq)) room.acks.set(c.profile.id, Math.max(seq, room.acks.get(c.profile.id) || 0));
    return { ok: true };
  }

  _commit(room, action, seat, auto) {
    const entry = { seq: room.actions.length + 1, action, seat, auto };
    room.actions.push(entry);
    room.lastCommitAt = Date.now();
    this._broadcast(room, 'action', entry);
    if (room.game.over) this._finish(room);
    else this._schedule(room);
  }

  _serverControlled(room, seatIdx) {
    const s = room.seats[seatIdx];
    return !!s && (s.bot || s.left);
  }

  // Lên lịch bước tiếp theo: chờ các thiết bị phát xong hoạt ảnh (ack), rồi máy chơi
  // (ghế máy / người đã rời) hoặc bật đồng hồ đếm lượt cho người chơi.
  _schedule(room) {
    clearTimeout(room.timer);
    const token = ++room.timerToken;
    room.deadline = null;
    const tick = () => {
      if (token !== room.timerToken || room.state !== 'playing' || room.game.over) return;
      const seq = room.actions.length;
      const lagging = room.seats.filter((s) => s.profileId && !s.left && this.isOnline(s.profileId) && (room.acks.get(s.profileId) || 0) < seq);
      if (lagging.length && Date.now() - room.lastCommitAt < this.config.ackWaitMs) {
        room.timer = setTimeout(tick, 120);
        return;
      }
      const cur = room.game.currentPlayer.id;
      if (this._serverControlled(room, cur)) {
        room.timer = setTimeout(() => this._autoStep(room, token, 'bot'), this.config.aiDelayMs);
        return;
      }
      const online = this.isOnline(room.seats[cur].profileId);
      const limit = online ? this.config.turnTimeoutMs : this.config.offlineGraceMs;
      room.deadline = Date.now() + limit;
      this._broadcast(room, 'timer', { seat: cur, seq, remainingMs: limit, offline: !online });
      room.timer = setTimeout(() => this._autoStep(room, token, online ? 'timeout' : 'offline'), limit);
    };
    tick();
  }

  _autoStep(room, token, reason) {
    return this._enqueue(room, async () => {
      if (token !== room.timerToken || room.state !== 'playing' || room.game.over) return;
      const action = nextAIAction(room.game);
      if (!action) {
        room.timer = setTimeout(() => this._autoStep(room, token, reason), 300);
        return;
      }
      const seat = room.game.currentPlayer.id;
      const r = await applyAction(room.game, action);
      if (!r.ok) {
        console.error(`[Hub] Phòng ${room.code}: máy không thực hiện được ${action.type}: ${r.reason}`);
        this._schedule(room);
        return;
      }
      this._commit(room, action, seat, reason);
    });
  }

  _finish(room) {
    clearTimeout(room.timer);
    room.timerToken++;
    room.state = 'finished';
    const g = room.game;
    const ranking = g.getRanking();
    room.result = {
      winner: g.winner ? g.winner.id : null,
      ranking: ranking.map((p) => {
        const seat = room.seats[p.id];
        const netWorth = g.property.netWorth(p);
        const tiles = g.property.ownedBy(p.id).length;
        let reward = null;
        const c = seat.profileId && this.clients.get(seat.profileId);
        if (c) reward = this.profiles.reward(c.profile, { won: g.winner?.id === p.id, netWorth, tiles });
        return { seat: p.id, name: p.name, characterId: p.characterId, bot: seat.bot, netWorth, money: p.money, tiles, bankrupt: p.bankrupt, reward };
      }),
    };
    this._broadcast(room, 'gameOver', room.result);
    for (const s of room.seats) if (s.profileId) this.send(s.profileId, 'profile', this.profiles.publicView(this.clients.get(s.profileId).profile));
    this._broadcastRoomState(room);
    this._lobbyChanged();
  }

  _backToRoom(c) {
    const room = this._requireRoom(c);
    if (room.state !== 'finished') throw new HubError('Ván đấu chưa kết thúc');
    room.state = 'waiting';
    room.game?.dispose();
    room.game = null;
    room.actions = [];
    room.result = null;
    room.seats = room.seats.filter((s) => s.bot || (!s.left && this.isOnline(s.profileId)));
    for (const s of room.seats) s.ready = false;
    if (!room.seats.some((s) => s.profileId === room.hostId)) room.hostId = room.seats.find((s) => s.profileId)?.profileId || null;
    for (const s of room.seats) {
      const m = s.profileId && this.clients.get(s.profileId);
      if (m) m.roomCode = room.code;
    }
    this._broadcastRoomState(room);
    this._lobbyChanged();
    return { room: this.roomView(room) };
  }

  _collectRooms() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const anyone = room.seats.some((s) => s.profileId && !s.left && this.isOnline(s.profileId));
      if (anyone) {
        room.emptySince = null;
      } else {
        room.emptySince ??= now;
        if (now - room.emptySince > this.config.roomIdleMs) this._closeRoom(room);
      }
    }
  }

  dispose() {
    clearInterval(this._gc);
    for (const room of [...this.rooms.values()]) this._closeRoom(room);
  }
}
