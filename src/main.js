import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { CameraManager } from './scene/CameraManager.js';
import { AssetManager } from './scene/AssetManager.js';
import { AnimationManager } from './scene/AnimationManager.js';
import { BoardView } from './scene/BoardView.js';
import { DiceView } from './scene/DiceView.js';
import { EffectsManager } from './scene/EffectsManager.js';
import { CharacterAssetManager, LOAD_STATUS } from './characters/CharacterAssetManager.js';
import { CharacterController } from './characters/CharacterController.js';
import { CharacterDebugPanel } from './characters/CharacterDebugPanel.js';
import { BoardManager } from './game/BoardManager.js';
import { GameManager } from './game/GameManager.js';
import { applyAction } from './game/OnlineProtocol.js';
import { UIManager } from './ui/UIManager.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { CharacterPreview } from './ui/CharacterPreview.js';
import { NetClient } from './net/NetClient.js';
import { resolveServerBase } from './net/config.js';
import { OnlineSession } from './online/OnlineSession.js';
import { CHARACTERS, getCharacter } from './data/characters.js';
import { applyModelOverrides, PLACEHOLDER_POLICY } from './data/characterConfig.js';

const SETTINGS_KEY = 'co-ty-phu-3d:settings';
const ui = new UIManager();
const app = {
  scene: null, camera: null, assets: null, charAssets: null, board: null, dice: null, effects: null, fx: null, game: null,
  characters: new Map(), thumbs: {}, settings: loadSettings(), debug: null,
  // online
  mode: 'boot', // 'lobby' | 'room' | 'online-game' | 'offline-menu' | 'offline-game'
  net: null, lobby: null, room: null, session: null, pendingActions: [],
};
window.__coTyPhu = app; // tiện cho gỡ lỗi / kiểm thử tự động

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* bộ nhớ trình duyệt không khả dụng */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 32px "Baloo 2"'), document.fonts.load('700 32px "Baloo 2"')]),
      sleep(2500),
    ]);
  } catch {
    /* dùng phông dự phòng */
  }
}

// ------------------------------------------------------------ characters
// GLB đã tải -> bản clone có skeleton riêng. Thiếu GLB -> chỉ tạo mô hình tạm khi
// được cho phép rõ ràng (allowPlaceholder); nơi gọi phải hiển thị việc này cho người chơi.
function createCharacter(def, player, { allowPlaceholder }) {
  const asset = app.charAssets.cloneCharacter(def.id) || (allowPlaceholder ? app.charAssets.createPlaceholder(def.id) : null);
  if (!asset) return null;
  return new CharacterController({ asset, player, def });
}

function characterStatusLine(def) {
  const e = app.charAssets.status(def.id);
  if (e.status === LOAD_STATUS.LOADED) return `✔ ${def.name}: ${e.path}`;
  if (e.status === LOAD_STATUS.FAILED) return `✘ ${def.name}: thiếu/lỗi ${e.path}`;
  return `… ${def.name}: đang tải ${e.path}`;
}

// Ảnh đại diện nhân vật được render từ chính mô hình 3D.
async function renderThumbnails() {
  const size = 192;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#ffd9b0', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(0.35, 1.0, 2.6);
  cam.lookAt(0, 0.68, 0);
  const thumbs = {};
  for (const def of CHARACTERS) {
    const ctrl = createCharacter(def, { id: -1, color: def.color, name: def.name }, { allowPlaceholder: true });
    ctrl.faceYaw(0.25, true);
    ctrl.update(0.5);
    scene.add(ctrl.root);
    renderer.render(scene, cam);
    thumbs[def.id] = renderer.domElement.toDataURL('image/png');
    ctrl.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return thumbs;
}

// ------------------------------------------------------------ picking
function setupPicking() {
  const canvas = app.scene.renderer.domElement;
  app.scene.raycaster.layers.enableAll();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved < 6 && quick) handleClick(e.clientX, e.clientY);
  });
  let last = 0;
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - last < 80 || e.buttons) return;
    last = now;
    const hit = pickAt(e.clientX, e.clientY);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  });
}

function pickAt(x, y) {
  const charRoots = [...app.characters.values()].map((v) => v.root);
  const hits = app.scene.pick(x, y, [...charRoots, ...app.board.pickables]);
  if (!hits.length) return null;
  const charHit = hits.find((h) => h.object.userData.playerId !== undefined);
  if (charHit) return { playerId: charHit.object.userData.playerId };
  const tileHit = hits.find((h) => h.object.userData.tileId !== undefined);
  return tileHit ? { tileId: tileHit.object.userData.tileId } : null;
}

function handleClick(x, y) {
  if (!app.game) return;
  const hit = pickAt(x, y);
  if (!hit) return;
  if (hit.playerId !== undefined) {
    controller.focusPlayer(hit.playerId);
    ui.showPlayerInfo(hit.playerId);
  } else {
    controller.selectTile(hit.tileId);
  }
}

// ------------------------------------------------------------ controller (UI -> game)
const report = async (promise) => {
  const r = await promise;
  if (r && !r.ok && r.reason) ui.toast(r.reason, 'warn');
  return r;
};

const humanGuard = () => {
  if (!app.game || !app.game.isHumanTurn) {
    if (app.game && !app.game.over) ui.toast('Chưa đến lượt của bạn', 'warn', 1500);
    return false;
  }
  return true;
};

const controller = {
  roll: () => humanGuard() && report(app.game.rollDice()),
  buy: () => humanGuard() && report(app.game.buyProperty()),
  decline: () => humanGuard() && report(Promise.resolve(app.game.declinePurchase())),
  endTurn: () => humanGuard() && report(app.game.endTurn()),
  build: (id) => humanGuard() && report(app.game.buildOn(id)),
  sell: (id) => humanGuard() && report(app.game.sellBuilding(id)),
  mortgage: (id) => humanGuard() && report(app.game.mortgageTile(id)),
  unmortgage: (id) => humanGuard() && report(app.game.unmortgageTile(id)),
  payJail: () => humanGuard() && report(app.game.payJailFine()),
  useJailCard: () => humanGuard() && report(app.game.useJailCard()),
  resetCamera: () => {
    app.board.setHighlight(null);
    ui.closeTilePanel();
    app.camera.reset();
  },
  toggleFollow: () => {
    app.camera.followEnabled = !app.camera.followEnabled;
    return app.camera.followEnabled;
  },
  isFollowing: () => app.camera.followEnabled,
  selectTile: (tileId) => {
    if (tileId === null || tileId === undefined) return;
    const tile = app.game.board.getTile(tileId);
    app.board.setHighlight(tileId);
    ui.showTileInfo(tileId);
    app.camera.focusPoint(tile.position.x, tile.position.z);
  },
  onTilePanelClosed: () => app.board.setHighlight(null),
  // Zoom camera tới nhân vật và bật vòng chọn (không đổi material của model).
  focusPlayer: (playerId) => {
    const c = app.characters.get(playerId);
    if (!c) return;
    app.fx?.selectCharacter(playerId);
    app.camera.focusPoint(c.root.position.x, c.root.position.z, { distance: 4.5, height: 2.6 });
  },
  onPlayerInfoClosed: () => app.fx?.selectCharacter(null),
  characterSource: (playerId) => app.characters.get(playerId)?.source,
  toggleDebug: () => app.debug?.toggle(),
  newGame: () => showMenu(),
};
app.controller = controller;

// Điều khiển khi chơi online: thao tác được gửi lên máy chủ, chỉ chạy khi máy chủ xác nhận và phát lại.
const onlineController = {
  ...controller,
  online: true,
  isMyTurn: () => !!app.session?.isMyTurn(),
  mySeat: () => app.session?.seat ?? -1,
  syncing: () => !!app.session && app.session.received > app.session.applied,
  isSending: () => !!app.session?.sending,
  presence: (playerId) => {
    const s = app.room?.seats[playerId];
    if (!s) return null;
    return { you: !!s.id && s.id === app.net?.profile?.id, online: s.online, auto: s.auto && !s.bot, bot: s.bot };
  },
  turnTimer: () => {
    const t = app.session?.timer;
    return t && t.deadline > performance.now() && app.game && !app.game.over && app.game.currentPlayer.id === t.seat ? t : null;
  },
  newGame: () => leaveOnlineGame(),
};
const sendAct = async (action) => {
  if (!app.session?.isMyTurn()) {
    if (app.game && !app.game.over) ui.toast('Chưa đến lượt của bạn', 'warn', 1500);
    return { ok: false };
  }
  const r = await app.session.send(action);
  if (!r.ok && r.reason) ui.toast(r.reason, 'warn');
  return r;
};
Object.assign(onlineController, {
  roll: () => sendAct({ type: 'roll' }),
  buy: () => sendAct({ type: 'buy' }),
  decline: () => sendAct({ type: 'decline' }),
  endTurn: () => sendAct({ type: 'end' }),
  build: (id) => sendAct({ type: 'build', tileId: id }),
  sell: (id) => sendAct({ type: 'sell', tileId: id }),
  mortgage: (id) => sendAct({ type: 'mortgage', tileId: id }),
  unmortgage: (id) => sendAct({ type: 'unmortgage', tileId: id }),
  payJail: () => sendAct({ type: 'payJail' }),
  useJailCard: () => sendAct({ type: 'useJailCard' }),
});

// ------------------------------------------------------------ game lifecycle
function teardownGame() {
  app.debug?.setHelpers(false);
  app.session?.dispose();
  app.session = null;
  if (app.game) app.game.dispose();
  if (app.fx) app.fx.dispose();
  for (const v of app.characters.values()) v.dispose();
  app.characters.clear();
  app.effects.clear();
  ui.unbindGame();
  app.board.resetAll();
  app.game = null;
  app.fx = null;
}

function showMenu() {
  teardownGame();
  app.mode = 'offline-menu';
  app.lobby?.hideAll();
  app.camera.setAutoRotate(true);
  app.camera.reset(1.2);
  ui.showMenu({
    characters: CHARACTERS,
    settings: app.settings,
    onStart: startGame,
    modelStatus: (id) => app.charAssets.status(id),
    allowPlaceholderDefault: app.settings.allowPlaceholder ?? PLACEHOLDER_POLICY.allowByDefault,
  });
}

async function startGame(config) {
  teardownGame();
  app.settings = {
    playerCount: config.playerCount, players: config.allPlayers, startMoney: config.startMoney,
    maxRounds: config.maxRounds, quality: config.quality, speed: config.speed, allowPlaceholder: config.allowPlaceholder,
  };
  saveSettings(app.settings);

  // Kiểm tra mô hình trước khi tạo ván: không âm thầm thay thế nhân vật thiếu GLB.
  const missing = config.players
    .map((p) => app.charAssets.status(p.characterId))
    .filter((e) => e.status !== LOAD_STATUS.LOADED);
  if (missing.length && !config.allowPlaceholder) {
    ui.toast(`Thiếu mô hình GLB: ${missing.map((e) => e.path).join(', ')}. Hãy thêm file hoặc cho phép dùng mô hình tạm.`, 'error', 8000);
    return;
  }
  app.scene.setQuality(config.quality);
  app.effects.quality = app.scene.quality.particles;
  app.camera.setAutoRotate(false);
  app.mode = 'offline-game';

  const fx = new AnimationManager({
    sceneManager: app.scene, cameraManager: app.camera, boardView: app.board, diceView: app.dice, effects: app.effects, ui,
  });
  fx.setSpeed(config.speed);
  const game = new GameManager({
    players: config.players, startMoney: config.startMoney, maxRounds: config.maxRounds, presenter: fx, aiDelay: 1 / config.speed,
  });
  // Model đã được tải sẵn từ lúc khởi động; đổi lượt / ván mới chỉ clone, không tải lại.
  for (const p of game.players.list) {
    const ctrl = createCharacter(getCharacter(p.characterId), p, { allowPlaceholder: config.allowPlaceholder });
    app.scene.scene.add(ctrl.root);
    app.characters.set(p.id, ctrl);
  }
  fx.attach(game, app.characters);
  fx.placeAll();
  app.fx = fx;
  app.game = game;
  ui.hideMenu();
  ui.bindGame(game, controller);
  if (missing.length) {
    ui.toast(`Đang dùng MÔ HÌNH TẠM (chưa có GLB) cho: ${missing.map((e) => getCharacter(e.id).name).join(', ')}`, 'warn', 7000);
  }
  await app.camera.reset(1.0);
  game.start();
}

// ------------------------------------------------------------ online: sảnh, phòng, ván đấu
function showLobby() {
  teardownGame();
  ui.hideMenu();
  app.camera.setAutoRotate(true);
  app.camera.reset(1.2);
  if (app.room && app.room.state !== 'playing') {
    app.mode = 'room';
    app.lobby.showRoom(app.room);
  } else {
    app.mode = 'lobby';
    app.lobby.showLobby();
    app.lobby.showRejoin(app.room || (app.rejoinCode ? { code: app.rejoinCode, state: 'playing' } : null));
  }
}

function onRoom(room, { welcome = false } = {}) {
  const prev = app.room;
  app.room = room;
  if (room) app.rejoinCode = null;
  if (app.mode === 'online-game') {
    if (!room || room.code !== app.session?.code) return;
    ui.scheduleRefresh();
    // Kết nối lại giữa ván: nếu máy chủ đã đi trước mà thiếu sự kiện thì đồng bộ lại.
    if (welcome && app.session && room.seq > app.session.received) resyncOnline('kết nối lại');
    return;
  }
  if (app.mode !== 'lobby' && app.mode !== 'room') return; // đang chơi offline: không làm phiền
  if (!room) {
    app.lobby.leaveRoomView();
    if (app.mode === 'room' || prev) showLobby();
    return;
  }
  if (room.state === 'playing') {
    // Tải lại trang / mở lại giữa ván: tự quay lại ván (lệnh gameStart đã xử lý trường hợp vừa bắt đầu).
    if (welcome) rejoinOnline(room.code);
    else app.lobby.showRejoin(room);
    return;
  }
  app.mode = 'room';
  app.lobby.showRoom(room);
}

async function rejoinOnline(code) {
  const r = await app.net.cmd('joinRoom', { code });
  if (!r.ok) {
    ui.toast(r.error, 'warn');
    app.rejoinCode = null;
    app.lobby.showRejoin(null);
    return;
  }
  app.room = r.room;
  const s = await app.net.cmd('sync');
  if (s.ok && s.game) await startOnlineGame(s.game);
}

let resyncing = false;
async function resyncOnline(reason) {
  if (resyncing) return;
  resyncing = true;
  console.warn(`[online] Đồng bộ lại ván đấu: ${reason}`);
  ui.toast('Đang đồng bộ lại ván đấu với máy chủ...', 'info', 2500);
  try {
    const s = await app.net.cmd('sync');
    if (s.ok && s.game) {
      app.room = s.room;
      await startOnlineGame(s.game);
    }
  } finally {
    resyncing = false;
  }
}

// Dựng ván online: tạo game với cùng seed, phát lại (không hoạt ảnh) các hành động đã có, rồi gắn đồ hoạ 3D.
async function startOnlineGame(data) {
  teardownGame();
  app.lobby.hideAll();
  ui.hideMenu();
  app.mode = 'online-game';
  app.pendingActions = [];
  const me = app.net.profile?.id;
  const seat = app.room?.seats.findIndex((s) => s.id === me) ?? -1;
  const game = new GameManager({
    players: data.players, startMoney: data.settings.startMoney, maxRounds: data.settings.maxRounds, seed: data.seed, autoAI: false,
  });
  await game.start();
  for (const e of data.actions) {
    const r = await applyAction(game, e.action);
    if (!r.ok) console.error(`[online] Phát lại hành động ${e.seq} lỗi: ${r.reason}`);
  }

  const quality = app.settings.quality || 'high';
  app.scene.setQuality(quality);
  app.effects.quality = app.scene.quality.particles;
  app.camera.setAutoRotate(false);
  const fx = new AnimationManager({
    sceneManager: app.scene, cameraManager: app.camera, boardView: app.board, diceView: app.dice, effects: app.effects, ui,
  });
  fx.setSpeed(1);
  const missing = [];
  for (const p of game.players.list) {
    const ctrl = createCharacter(getCharacter(p.characterId), p, { allowPlaceholder: true });
    if (ctrl.source !== 'glb' && ctrl.source !== 'toon') missing.push(p.name);
    app.scene.scene.add(ctrl.root);
    app.characters.set(p.id, ctrl);
  }
  game.fx = fx;
  fx.attach(game, app.characters);
  fx.placeAll();
  app.fx = fx;
  app.game = game;
  const session = new OnlineSession({ net: app.net, game, seat, code: data.code, applied: data.actions.length });
  session.on('change', () => ui.scheduleRefresh());
  session.on('desync', (reason) => resyncOnline(reason));
  app.session = session;
  ui.bindGame(game, onlineController);
  if (missing.length) ui.toast(`Đang dùng MÔ HÌNH TẠM (chưa có GLB) cho: ${missing.join(', ')}`, 'warn', 6000);
  if (seat < 0) ui.toast('Bạn đang xem ván đấu (không có ghế)', 'info');
  await app.camera.reset(1.0);
  if (!game.over) session.queue = session.queue.then(() => fx.turnStart(game.currentPlayer));
  for (const e of app.pendingActions) session.onAction(e);
  app.pendingActions = [];
}

async function leaveOnlineGame() {
  const over = app.game?.over;
  teardownGame();
  if (over) {
    // Ván đã kết thúc: về phòng để xem kết quả, phần thưởng và chơi lại.
    showLobby();
    return;
  }
  const code = app.room?.code;
  await app.net.cmd('leaveRoom');
  app.room = null;
  app.rejoinCode = code || null; // ghế vẫn giữ trong ván (máy chơi thay) -> có thể quay lại
  showLobby();
}

async function initOnline() {
  const net = new NetClient(resolveServerBase());
  app.net = net;
  const preview = new CharacterPreview(document.getElementById('avatar-canvas'), app.charAssets);
  const lobby = new LobbyUI({ ui, net, characters: CHARACTERS, modelStatus: (id) => app.charAssets.status(id), preview });
  app.lobby = lobby;
  lobby.on.onOffline = () => showMenu();
  lobby.on.onRejoin = (code) => rejoinOnline(code);
  document.getElementById('btn-menu-lobby').onclick = () => showLobby();
  net.on('status', (s) => lobby.setNetStatus(s));
  net.on('welcome', (w) => {
    lobby.renderProfile();
    lobby.renderLobby(w.lobby);
    onRoom(w.room, { welcome: true });
  });
  net.on('lobby', (v) => lobby.renderLobby(v));
  net.on('profile', () => lobby.renderProfile());
  net.on('room', (room) => onRoom(room));
  net.on('gameStart', (data) => {
    if (app.mode === 'room' || app.mode === 'lobby') startOnlineGame(data);
  });
  net.on('action', (e) => {
    if (app.session && !app.session.disposed) app.session.onAction(e);
    else if (app.mode === 'online-game') app.pendingActions.push(e);
  });
  net.on('timer', (t) => app.session?.setTimer(t));
  net.on('invite', (inv) => lobby.showInvite(inv));

  const ok = await net.available();
  lobby.setAvailable(ok);
  if (!ok) {
    lobby.setNetStatus('offline');
    return;
  }
  try {
    await net.connect(app.settings.onlineName);
  } catch (err) {
    console.error('[online]', err);
    lobby.setAvailable(false);
    lobby.setNetStatus('offline');
    return;
  }
  // Link mời: ?room=MÃ
  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    const r = await net.cmd('joinRoom', { code: code.toUpperCase() });
    if (!r.ok) ui.toast(r.error, 'warn', 4000);
  }
}

// ------------------------------------------------------------ boot
async function boot() {
  try {
    ui.setLoading(0.03, 'Khởi tạo đồ hoạ 3D...');
    const container = document.getElementById('scene-container');
    app.scene = new SceneManager(container, app.settings.quality || 'high');
    app.camera = new CameraManager(app.scene.camera, app.scene.renderer.domElement);
    app.scene.onUpdate((dt) => app.camera.update(dt));
    ui.projector = (v) => app.scene.project(v);

    app.assets = new AssetManager({
      onError: (url) => ui.toast(`Không tải được mô hình "${url}". Đang dùng mô hình thay thế.`, 'error', 6000),
    });
    ui.setLoading(0.08, 'Đọc danh sách tài nguyên...');
    await app.assets.loadManifest();
    await app.assets.preload((p) => ui.setLoading(0.1 + p * 0.25, 'Tải mô hình GLB...'));

    ui.setLoading(0.38, 'Tải phông chữ...');
    await loadFonts();

    app.board = new BoardView(app.scene, app.assets, new BoardManager());
    await app.board.build((p) => ui.setLoading(0.4 + p * 0.35, 'Dựng bàn cờ 3D...'));
    app.scene.onUpdate((dt, t) => app.board.update(dt, t));

    app.dice = new DiceView(app.scene.scene);
    app.scene.onUpdate((dt) => app.dice.update(dt));
    app.effects = new EffectsManager(app.scene.scene);
    app.effects.quality = app.scene.quality.particles;
    app.scene.onUpdate((dt) => app.effects.update(dt));

    // Nhân vật GLB: tải song song, hiện trạng thái từng nhân vật trên màn hình tải.
    const overrides = applyModelOverrides();
    if (overrides.length) console.info('[main] Ghi đè model qua URL:', overrides);
    app.charAssets = new CharacterAssetManager(app.assets);
    const renderStatus = () => ui.setLoadingDetails(CHARACTERS.map(characterStatusLine));
    app.charAssets.on('status', renderStatus);
    await app.charAssets.preloadCharacters(CHARACTERS.map((c) => c.id), (p) => ui.setLoading(0.76 + p * 0.1, 'Tải nhân vật GLB...'));
    app.charAssets.off('status', renderStatus);
    const failed = CHARACTERS.map((c) => app.charAssets.status(c.id)).filter((e) => e.status === LOAD_STATUS.FAILED);
    if (failed.length) {
      ui.toast(`Không tải được ${failed.length}/${CHARACTERS.length} mô hình nhân vật GLB (${failed[0].error}). Mở 🐞 (F2) để xem đường dẫn từng file.`, 'error', 9000);
    }

    ui.setLoading(0.88, 'Tạo ảnh nhân vật...');
    app.thumbs = await renderThumbnails();
    ui.thumbs = app.thumbs;

    app.debug = new CharacterDebugPanel({
      charAssets: app.charAssets,
      scene: app.scene.scene,
      getControllers: () => [...app.characters.values()],
      getPlayers: () => app.game?.players.list || [],
    });
    ui.onToggleDebug = () => app.debug.toggle();
    if (new URLSearchParams(location.search).has('debug')) app.debug.toggle(true);

    setupPicking();
    ui.setLoading(0.94, 'Kết nối máy chủ online...');
    const offlineOnly = new URLSearchParams(location.search).get('mode') === 'offline';
    await initOnline();
    ui.setLoading(1, 'Sẵn sàng!');
    await sleep(failed.length ? 1200 : 200);
    ui.hideLoading();
    // ?mode=offline: vào thẳng menu chơi với máy (dùng cho kiểm thử / chơi một máy).
    if (offlineOnly) showMenu();
    else if (app.mode === 'boot') {
      showLobby();
      if (app.room?.state === 'playing') rejoinOnline(app.room.code); // tải lại trang giữa ván
    }
  } catch (err) {
    console.error(err);
    ui.fatal(err);
  }
}

window.addEventListener('error', (e) => ui.toast(`Lỗi: ${e.message}`, 'error', 5000));
window.addEventListener('unhandledrejection', (e) => ui.toast(`Lỗi: ${e.reason?.message || e.reason}`, 'error', 5000));

boot();
