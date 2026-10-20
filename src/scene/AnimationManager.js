import * as THREE from 'three';
import { BOARD_LAYOUT, COLOR_GROUPS, JAIL_POSITION } from '../data/boardData.js';
import { RUN_MIN_STEPS } from '../data/characterConfig.js';
import { ANIM_STATES as A } from '../characters/CharacterAnimationController.js';

const TOP_Y = BOARD_LAYOUT.tileHeight;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const never = () => new Promise(() => {});
const money = (n) => `$${n.toLocaleString('en-US')}`;

/**
 * Presenter 3D cho GameManager. Mỗi phương thức được gọi SAU khi logic game
 * đã xác nhận và áp dụng thay đổi, nên hoạt ảnh chỉ phản ánh trạng thái thật.
 * Không phương thức nào ở đây thay đổi trạng thái game.
 *
 * Ánh xạ sự kiện gameplay -> trạng thái animation của nhân vật:
 *   bắt đầu lượt: IDLE · tung xúc xắc: INTERACT (một lần) · di chuyển: WALK (RUN khi đi xa)
 *   mua đất / xây nhà / nhận thưởng / nhận tiền thuê: CELEBRATE (một lần) · trả tiền: SAD rồi về trạng thái nền
 *   vào tù: JUMP (một lần) rồi SAD · phá sản: SAD · thắng: CELEBRATE (một lần)
 */
export class AnimationManager {
  constructor({ sceneManager, cameraManager, boardView, diceView, effects, ui }) {
    this.sm = sceneManager;
    this.cam = cameraManager;
    this.board = boardView;
    this.dice = diceView;
    this.effects = effects;
    this.ui = ui;
    this.tweens = new Set();
    this.chars = new Map();
    this.labels = new Map();
    this.speed = 1;
    this.elapsed = 0;
    this.disposed = false;
    this.selectedId = null;
    this._unsub = this.sm.onUpdate((dt) => this.update(dt));
  }

  attach(game, characterControllers) {
    this.game = game;
    this.chars = characterControllers;
  }

  setSpeed(speed) {
    this.speed = speed;
    this.board.speed = speed;
    this.effects.speed = speed;
  }

  dispose() {
    this.disposed = true;
    this.tweens.clear();
    this._unsub();
    for (const label of this.labels.values()) {
      label.parent?.remove(label);
      label.material.map.dispose();
      label.material.dispose();
    }
    this.labels.clear();
    this.cam.stopFollow();
  }

  // ------------------------------------------------------------ tween engine
  tween(duration, onUpdate, ease = (t) => t) {
    if (this.disposed) return never();
    return new Promise((resolve) => {
      this.tweens.add({ t: 0, duration: Math.max(0.01, duration / this.speed), onUpdate, ease, resolve });
    });
  }

  wait(ms) {
    return this.tween(ms / 1000, () => {});
  }

  // Vòng lặp chung: tween + nhân vật (di chuyển, animation, hướng) đều dùng delta time.
  update(dt) {
    this.elapsed += dt;
    for (const tw of [...this.tweens]) {
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      tw.onUpdate(tw.ease(tw.t));
      if (tw.t >= 1) {
        this.tweens.delete(tw);
        tw.resolve();
      }
    }
    for (const c of this.chars.values()) c.update(dt * this.speed, this.elapsed);
    for (const [id, label] of this.labels) {
      const c = this.chars.get(id);
      if (c) label.position.set(c.root.position.x, c.root.position.y + c.height + 0.45, c.root.position.z);
    }
  }

  // ------------------------------------------------------------ helpers
  view(player) {
    return this.chars.get(player.id);
  }

  standPoint(player, tileId, jailed = false) {
    const p = this.game.board.getStandPoint(tileId, player.slot, jailed);
    return new THREE.Vector3(p.x, TOP_Y, p.z);
  }

  headPos(player) {
    const c = this.view(player);
    return c ? c.root.position.clone().add(new THREE.Vector3(0, c.height + 0.1, 0)) : this.board.bankPosition.clone();
  }

  baseState(player) {
    return player.bankrupt || player.inJail ? A.SAD : A.IDLE;
  }

  // Phát hoạt ảnh một lần; gameplay chỉ chờ tối đa maxMs (clip dài vẫn chạy hết rồi tự về trạng thái nền).
  async celebrate(player, maxMs = 1600) {
    const c = this.view(player);
    if (!c) return;
    await Promise.race([c.playOnce(A.CELEBRATE), this.wait(maxMs)]);
  }

  faceTile(player, tile) {
    const c = this.view(player);
    if (!c) return;
    if (tile.position.corner) this.faceCamera(c);
    else c.faceYaw(tile.position.rotY); // quay về phía công trình của ô
  }

  faceCamera(c, immediate = false) {
    const p = this.cam.camera.position;
    c.faceTowards(p.x, p.z, immediate);
  }

  placeAll() {
    for (const p of this.game.players.list) {
      const c = this.view(p);
      if (!c) continue;
      c.placeAt(this.standPoint(p, p.position, p.inJail));
      this.faceCamera(c, true);
      c.setBase(this.baseState(p));
      c.setBankrupt(p.bankrupt);
    }
    this.syncBoard();
  }

  selectCharacter(playerId) {
    this.selectedId = playerId;
    for (const [id, c] of this.chars) c.setSelected(id === playerId);
  }

  _setTurnIndicator(player) {
    for (const [id, c] of this.chars) c.setActiveTurn(id === player.id && !player.bankrupt);
  }

  ownerColor(tile) {
    if (tile.owner === null) return null;
    return this.game.players.get(tile.owner)?.color || null;
  }

  syncBoard() {
    for (const t of this.game.board.tiles) this.board.syncTile(t, this.ownerColor(t));
  }

  // ------------------------------------------------------------ presenter API
  async turnStart(player) {
    const c = this.view(player);
    this.ui.announceTurn(player);
    this._setTurnIndicator(player);
    if (!c) return;
    this.cam.stopFollow();
    if (this.cam.followEnabled && !this.cam.userInteracting) this.cam.panTo(c.root.position, 0.9);
    this.faceCamera(c);
    c.setBase(this.baseState(player));
    c.play(this.baseState(player));
    await this.wait(500);
  }

  async rollDice(d1, d2, player) {
    const c = player && this.view(player);
    if (c) {
      this.faceCamera(c);
      c.playOnce(A.INTERACT); // động tác tung xúc xắc (clip Interact của GLB nếu có)
    }
    this.ui.setDiceRolling(true);
    await this.dice.roll([d1, d2], 1.15 / this.speed);
    this.ui.setDiceRolling(false, d1, d2);
    if (d1 === d2) this.effects.confettiBurst(new THREE.Vector3(0, 1, 0.8), 40);
    await this.wait(200);
  }

  // Đi tuần tự qua từng ô (không dịch chuyển tức thời) với tốc độ không đổi.
  async movePlayer(player, path, { passedGo = false } = {}) {
    const c = this.view(player);
    if (!c || !path.length) return;
    this.cam.follow(c.root);
    c.setBase(this.baseState(player));
    const points = path.map((tileId) => this.standPoint(player, tileId, false));
    await c.moveAlong(points, {
      run: path.length >= RUN_MIN_STEPS,
      onPoint: (i) => {
        this.board.bumpTile(path[i]);
        if (path[i] === 0 && passedGo) this.effects.coinFountain(this.headPos(player), 10);
      },
    });
    this.cam.stopFollow();
  }

  async landed(player, tile) {
    this.faceTile(player, tile);
    this.ui.showLandingInfo?.(player, tile); // thẻ thông tin ô vừa đến (mọi người chơi đều thấy)
    await this.wait(220);
  }

  async sendToJail(player) {
    const c = this.view(player);
    if (!c) return;
    const from = c.root.position.clone();
    const target = this.standPoint(player, JAIL_POSITION, true);
    this.cam.follow(c.root);
    c.faceTowards(target.x, target.z);
    c.setBase(A.SAD);
    c.playOnce(A.JUMP, A.SAD);
    // Bị "bắt" bay qua bàn cờ vào phòng giam: đây là quỹ đạo dịch chuyển, không phải animation nhân vật.
    await this.tween(1.2, (t) => {
      c.root.position.lerpVectors(from, target, t);
      c.root.position.y = TOP_Y + Math.sin(Math.PI * t) * 3.5;
    }, easeInOut);
    c.placeAt(target);
    this.effects.dust(target, 10);
    this.faceCamera(c);
    c.play(A.SAD);
    this.cam.stopFollow();
    await this.wait(700);
  }

  async releaseFromJail(player) {
    const c = this.view(player);
    if (!c) return;
    c.setBase(A.IDLE);
    await c.moveAlong([this.standPoint(player, JAIL_POSITION, false)]);
    this.faceCamera(c);
  }

  async purchase(player, tile) {
    const at = this.board.tileWorldPosition(tile.id, 0.6);
    this.ui.floatText(this.headPos(player), `-${money(tile.price)}`, 'neg');
    const coins = this.effects.flyCoins(this.headPos(player), this.board.bankPosition, 6);
    const glow = this.board.glow(tile.id, player.color);
    const flag = this.board.setOwner(tile, player.color, true);
    this.effects.confettiBurst(at, 70);
    this.faceTile(player, tile);
    await Promise.all([coins, glow, flag, this.celebrate(player)]);
  }

  bandPosition(tile) {
    const view = this.board.tileView(tile.id);
    view.anchor.updateMatrixWorld(true);
    return view.anchor.localToWorld(new THREE.Vector3(0, TOP_Y + 0.1, -1.22));
  }

  async build(player, tile, kind) {
    const at = this.bandPosition(tile);
    const cost = COLOR_GROUPS[tile.group]?.houseCost || 0;
    this.ui.floatText(this.headPos(player), `-${money(cost)}`, 'neg');
    const coins = this.effects.flyCoins(this.headPos(player), at, 4, 0.7);
    this.board.setHighlight(tile.id);
    await coins;
    await this.board.syncBuildings(tile, true);
    this.effects.dust(at, kind === 'hotel' ? 14 : 8);
    if (kind === 'hotel') this.effects.confettiBurst(at, 50);
    await this.celebrate(player, 1200);
    if (this.board.highlightedTile === tile.id && !this.ui.isTilePanelOpen(tile.id)) this.board.setHighlight(null);
  }

  async sellBuilding(player, tile, kind, refund) {
    const at = this.bandPosition(tile);
    await this.board.syncBuildings(tile, true);
    this.ui.floatText(this.headPos(player), `+${money(refund)}`, 'pos');
    await this.effects.flyCoins(at, this.headPos(player), 3, 0.6);
  }

  async mortgage(player, tile, value) {
    this.board.setMortgaged(tile, true);
    this.ui.floatText(this.headPos(player), `+${money(value)}`, 'pos');
    await this.effects.flyCoins(this.board.bankPosition, this.headPos(player), 4, 0.7);
  }

  async unmortgage(player, tile, cost) {
    this.board.setMortgaged(tile, false);
    this.board.glow(tile.id, player.color);
    this.ui.floatText(this.headPos(player), `-${money(cost)}`, 'neg');
    await this.effects.flyCoins(this.headPos(player), this.board.bankPosition, 4, 0.7);
  }

  // Trả tiền (thuê, thuế, phí): người trả buồn (SAD) trong lúc tiền xu bay sang người nhận / ngân hàng,
  // người nhận ăn mừng; sau đó người trả về trạng thái nền.
  async transferMoney(from, to, amount, reason = '') {
    const fromPos = from ? this.headPos(from) : this.board.bankPosition.clone();
    const toPos = to ? this.headPos(to) : this.board.bankPosition.clone();
    const payer = from && this.view(from);
    if (from) {
      this.ui.floatText(fromPos, `-${money(amount)}`, 'neg');
      payer?.play(A.SAD, { fade: 0.3 });
      if (to) this.ui.announce(`${from.name} trả ${money(amount)} cho ${to.name}${reason ? ` · ${reason}` : ''}`, 'bad');
    }
    const count = Math.min(12, Math.max(3, Math.round(amount / 40)));
    await this.effects.flyCoins(fromPos, toPos, count, 0.95);
    if (to) {
      this.ui.floatText(toPos, `+${money(amount)}`, 'pos');
      this.view(to)?.playOnce(A.CELEBRATE);
    }
    if (payer && from) {
      await this.wait(500);
      payer.play(this.baseState(from), { fade: 0.4 });
    }
  }

  async reward(player, amount, label) {
    this.effects.coinFountain(this.headPos(player), Math.min(24, 8 + amount / 20));
    this.ui.floatText(this.headPos(player), `+${money(amount)}${label ? ` · ${label}` : ''}`, 'pos');
    await this.celebrate(player, 1400);
  }

  async showCard(player, card, kind) {
    const deck = this.board.decks[kind];
    if (deck) {
      const c = deck.card;
      c.visible = true;
      c.position.copy(deck.position);
      c.rotation.set(0, deck.rotY, 0);
      const up = new THREE.Vector3(deck.position.x * 0.5, 3.2, deck.position.z + 2);
      await this.tween(0.55, (t) => {
        c.position.lerpVectors(deck.position, up, t);
        c.rotation.set(t * 1.1, deck.rotY + t * Math.PI * 2, 0);
      }, easeInOut);
    }
    await this.ui.showCard(card, kind, 2800 / this.speed);
    if (deck) deck.card.visible = false;
  }

  _bankruptLabel(player) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const g = canvas.getContext('2d');
    g.fillStyle = '#D32F2F';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, 248, 88, 24);
    else g.rect(4, 4, 248, 88);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '800 54px "Baloo 2", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PHÁ SẢN', 128, 52);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.3, 0.49, 1);
    sprite.renderOrder = 10;
    this.sm.scene.add(sprite);
    this.labels.set(player.id, sprite);
  }

  async bankrupt(player, creditor, tiles) {
    const c = this.view(player);
    this.ui.announce(`${player.name} đã phá sản!`, 'bad');
    if (creditor) {
      await this.effects.flyCoins(this.headPos(player), this.headPos(creditor), 8, 1);
    }
    if (c) {
      c.setBase(A.SAD);
      c.play(A.SAD, { fade: 0.4 });
      c.setBankrupt(true);
      c.setActiveTurn(false);
      this._bankruptLabel(player);
    }
    for (const t of tiles) this.board.syncTile(t, this.ownerColor(t));
    if (creditor) for (const t of tiles) this.board.glow(t.id, creditor.color);
    await this.wait(1600);
  }

  async gameOver(winner) {
    for (const c of this.chars.values()) c.setActiveTurn(false);
    if (!winner) return;
    const c = this.view(winner);
    if (!c) return;
    this.cam.panTo(c.root.position, 1.2);
    this.faceCamera(c);
    c.playOnce(A.CELEBRATE);
    for (let i = 0; i < 3; i++) {
      this.effects.confettiBurst(c.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 90);
      await this.wait(700);
    }
  }
}
