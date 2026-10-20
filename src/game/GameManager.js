import { EventEmitter } from '../utils/EventEmitter.js';
import { createRng } from '../utils/random.js';
import { BoardManager } from './BoardManager.js';
import { PlayerManager } from './PlayerManager.js';
import { PropertyManager } from './PropertyManager.js';
import { TurnManager, PHASES } from './TurnManager.js';
import { BankManager } from './BankManager.js';
import { CardDeck } from './CardDeck.js';
import { AIController } from './AIController.js';
import { NullPresenter } from './NullPresenter.js';
import {
  TILE_TYPES as T, GO_SALARY, JAIL_FINE, JAIL_POSITION, MAX_JAIL_TURNS, BANK_INTEREST,
} from '../data/boardData.js';
import { CHANCE_CARDS, COMMUNITY_CARDS, DECK_TITLES } from '../data/cards.js';

const fail = (reason) => ({ ok: false, reason });
const money = (n) => `$${n.toLocaleString('en-US')}`;

/**
 * Điều phối toàn bộ luật chơi. Mọi thay đổi trạng thái được thực hiện và xác nhận
 * ở đây TRƯỚC, sau đó mới gọi presenter (AnimationManager) để phát hoạt ảnh
 * phản ánh trạng thái đó. Presenter không bao giờ thay đổi trạng thái game.
 *
 * Sự kiện: 'update', 'log', 'transaction', 'turnStart', 'dice', 'card', 'bankrupt', 'gameOver'.
 */
export class GameManager extends EventEmitter {
  constructor({
    players, startMoney = 1500, maxRounds = 0, seed = null, presenter = null, autoAI = true, aiDelay = 1,
  } = {}) {
    super();
    this.rng = createRng(seed);
    this.board = new BoardManager();
    this.bank = new BankManager();
    this.players = new PlayerManager(players, startMoney);
    this.property = new PropertyManager(this.board, this.players);
    this.turn = new TurnManager(this.players, this.rng);
    this.decks = {
      chance: new CardDeck('chance', CHANCE_CARDS, this.rng),
      community: new CardDeck('community', COMMUNITY_CARDS, this.rng),
    };
    this.ai = new AIController(this);
    this.fx = presenter || new NullPresenter();
    this.autoAI = autoAI;
    this.aiDelay = aiDelay;
    this.maxRounds = maxRounds;
    this.startMoney = startMoney;

    this.busy = false;
    this.over = false;
    this.started = false;
    this.disposed = false;
    this.winner = null;
    this.pendingPurchase = null;
    this.canRollAgain = false;
    this.lastDice = null;
    this.logEntries = [];
    this._bankruptCount = 0;
    this._aiToken = 0;

    this.bank.on('transaction', (tx) => this.emit('transaction', tx));
  }

  // ------------------------------------------------------------------ queries
  get currentPlayer() {
    return this.turn.current;
  }

  get phase() {
    return this.turn.phase;
  }

  get isHumanTurn() {
    return this.started && !this.over && !this.currentPlayer.isAI;
  }

  canRoll() {
    return !this.busy && !this.over && this.started
      && (this.phase === PHASES.ROLL || (this.phase === PHASES.BUY && this.canRollAgain));
  }

  canBuy() {
    if (this.busy || this.over || this.phase !== PHASES.BUY || this.pendingPurchase === null) return false;
    return this.property.canBuy(this.currentPlayer, this.board.getTile(this.pendingPurchase)).ok;
  }

  canDecline() {
    return !this.busy && !this.over && this.phase === PHASES.BUY;
  }

  canEndTurn() {
    return !this.busy && !this.over && this.started
      && (this.phase === PHASES.END || (this.phase === PHASES.BUY && !this.canRollAgain));
  }

  canManage() {
    return !this.busy && !this.over && this.started
      && [PHASES.ROLL, PHASES.BUY, PHASES.END].includes(this.phase);
  }

  canPayJailFine() {
    const p = this.currentPlayer;
    return !this.busy && !this.over && this.phase === PHASES.ROLL && p.inJail && p.money >= JAIL_FINE;
  }

  canUseJailCard() {
    const p = this.currentPlayer;
    return !this.busy && !this.over && this.phase === PHASES.ROLL && p.inJail && p.jailCards.length > 0;
  }

  getRanking() {
    return [...this.players.list].sort((a, b) => {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      if (a.bankrupt && b.bankrupt) return b.bankruptOrder - a.bankruptOrder;
      return this.property.netWorth(b) - this.property.netWorth(a);
    });
  }

  log(text, kind = 'info') {
    const entry = { text, kind, turn: this.turn.turnCount, round: this.turn.round, time: Date.now() };
    this.logEntries.push(entry);
    if (this.logEntries.length > 400) this.logEntries.shift();
    this.emit('log', entry);
  }

  // ------------------------------------------------------------------ lifecycle
  async start() {
    if (this.started) return;
    this.started = true;
    this.log(`Ván đấu bắt đầu với ${this.players.count} người chơi, mỗi người ${money(this.startMoney)}.`, 'system');
    await this._beginTurn();
  }

  dispose() {
    this.disposed = true;
    this._aiToken++;
    this.removeAllListeners();
  }

  async _beginTurn() {
    const p = this.currentPlayer;
    this.turn.phase = PHASES.ROLL;
    this.canRollAgain = false;
    this.pendingPurchase = null;
    p.doublesCount = 0;
    this.log(`Lượt của ${p.name}${p.inJail ? ' (đang ở trong tù)' : ''}.`, 'turn');
    this.emit('turnStart', p);
    this.emit('update');
    await this.fx.turnStart(p);
    if (p.isAI && this.autoAI) this._scheduleAI();
  }

  _scheduleAI() {
    const token = ++this._aiToken;
    setTimeout(() => {
      if (token !== this._aiToken || this.over || this.disposed) return;
      this.playAITurn().catch((err) => console.error('[AI]', err));
    }, 500 * this.aiDelay);
  }

  async _lock(fn) {
    if (this.busy) return fail('Đang xử lý, vui lòng đợi');
    this.busy = true;
    this.emit('update');
    try {
      await fn();
      return { ok: true };
    } catch (err) {
      console.error(err);
      this.log(`Lỗi: ${err.message}`, 'error');
      return fail(err.message);
    } finally {
      this.busy = false;
      if (!this.disposed) this.emit('update');
    }
  }

  _settlePhase() {
    const p = this.currentPlayer;
    if (this.over) {
      this.turn.phase = PHASES.OVER;
      return;
    }
    if (p.bankrupt) {
      this.turn.phase = PHASES.END;
      return;
    }
    if (p.inJail) this.canRollAgain = false;
    if (this.pendingPurchase !== null) this.turn.phase = PHASES.BUY;
    else this.turn.phase = this.canRollAgain ? PHASES.ROLL : PHASES.END;
  }

  _declinePending(p) {
    if (this.pendingPurchase === null) return;
    const tile = this.board.getTile(this.pendingPurchase);
    this.log(`${p.name} không mua ${tile.name}.`, 'info');
    this.pendingPurchase = null;
  }

  // ------------------------------------------------------------------ player actions
  async rollDice() {
    if (!this.canRoll()) return fail('Chưa thể tung xúc xắc lúc này');
    const result = await this._lock(async () => {
      const p = this.currentPlayer;
      if (this.phase === PHASES.BUY) this._declinePending(p);
      this.turn.phase = PHASES.MOVING;
      const [d1, d2] = this.turn.rollDice();
      const total = d1 + d2;
      const isDouble = d1 === d2;
      this.lastDice = [d1, d2];
      this.emit('dice', { d1, d2, player: p });
      await this.fx.rollDice(d1, d2, p);
      this.log(`${p.name} tung được ${d1} + ${d2} = ${total}${isDouble ? ' (đôi!)' : ''}.`, 'dice');
      this.canRollAgain = false;

      if (p.inJail) {
        if (isDouble) {
          this._release(p);
          this.log(`${p.name} tung được đôi và ra tù!`, 'good');
          await this.fx.releaseFromJail(p);
        } else {
          p.jailTurns += 1;
          if (p.jailTurns >= MAX_JAIL_TURNS) {
            this.log(`${p.name} đã ở tù ${MAX_JAIL_TURNS} lượt, buộc trả ${money(JAIL_FINE)}.`, 'warn');
            const paid = await this._pay(p, null, JAIL_FINE, 'Phí ra tù');
            if (!paid) return;
            this._release(p);
            await this.fx.releaseFromJail(p);
          } else {
            this.log(`${p.name} vẫn ở trong tù (lượt ${p.jailTurns}/${MAX_JAIL_TURNS}).`, 'warn');
            return;
          }
        }
        await this._moveBy(p, total);
        await this._resolveLanding(p, { diceTotal: total });
        return;
      }

      if (isDouble) {
        p.doublesCount += 1;
        if (p.doublesCount >= 3) {
          this.log(`${p.name} tung đôi 3 lần liên tiếp và bị đưa vào tù!`, 'bad');
          await this._sendToJail(p);
          return;
        }
        this.canRollAgain = true;
      }
      await this._moveBy(p, total);
      await this._resolveLanding(p, { diceTotal: total });
    });
    this._settlePhase();
    this.emit('update');
    await this._autoAdvanceIfBankrupt();
    return result;
  }

  async buyProperty() {
    if (!this.canBuy()) return fail('Không thể mua ô này');
    const result = await this._lock(async () => {
      const p = this.currentPlayer;
      const tile = this.board.getTile(this.pendingPurchase);
      this.property.assignOwner(tile, p);
      this.bank.debit(p, tile.price, `Mua ${tile.name}`);
      this.pendingPurchase = null;
      this.log(`${p.name} mua ${tile.name} với giá ${money(tile.price)}.`, 'good');
      await this.fx.purchase(p, tile);
    });
    this._settlePhase();
    this.emit('update');
    return result;
  }

  declinePurchase() {
    if (!this.canDecline()) return fail('Không có giao dịch mua nào đang chờ');
    this._declinePending(this.currentPlayer);
    this._settlePhase();
    this.emit('update');
    return { ok: true };
  }

  async endTurn() {
    if (!this.canEndTurn()) return fail('Chưa thể kết thúc lượt');
    return this._lock(async () => {
      if (this.phase === PHASES.BUY) this._declinePending(this.currentPlayer);
      await this._advanceTurn();
    });
  }

  async buildOn(tileId) {
    if (!this.canManage()) return fail('Chưa thể xây lúc này');
    const p = this.currentPlayer;
    const tile = this.board.getTile(tileId);
    const check = this.property.canBuild(p, tile);
    if (!check.ok) return fail(check.reason);
    return this._lock(async () => {
      const { cost, kind } = this.property.build(p, tile);
      this.bank.debit(p, cost, `Xây ${kind === 'hotel' ? 'khách sạn' : 'nhà'} tại ${tile.name}`);
      this.log(`${p.name} xây ${kind === 'hotel' ? 'khách sạn' : `nhà thứ ${tile.houses}`} tại ${tile.name} (${money(cost)}).`, 'good');
      await this.fx.build(p, tile, kind);
    });
  }

  async sellBuilding(tileId) {
    if (!this.canManage()) return fail('Chưa thể bán lúc này');
    const p = this.currentPlayer;
    const tile = this.board.getTile(tileId);
    const check = this.property.canSell(p, tile);
    if (!check.ok) return fail(check.reason);
    return this._lock(() => this._doSell(p, tile));
  }

  async mortgageTile(tileId) {
    if (!this.canManage()) return fail('Chưa thể thế chấp lúc này');
    const p = this.currentPlayer;
    const tile = this.board.getTile(tileId);
    const check = this.property.canMortgage(p, tile);
    if (!check.ok) return fail(check.reason);
    return this._lock(() => this._doMortgage(p, tile));
  }

  async unmortgageTile(tileId) {
    if (!this.canManage()) return fail('Chưa thể chuộc lúc này');
    const p = this.currentPlayer;
    const tile = this.board.getTile(tileId);
    const check = this.property.canUnmortgage(p, tile);
    if (!check.ok) return fail(check.reason);
    return this._lock(async () => {
      const { cost } = this.property.unmortgage(p, tile);
      this.bank.debit(p, cost, `Chuộc ${tile.name}`);
      this.log(`${p.name} chuộc lại ${tile.name} (${money(cost)}).`, 'info');
      await this.fx.unmortgage(p, tile, cost);
    });
  }

  async payJailFine() {
    if (!this.canPayJailFine()) return fail('Không thể trả phí ra tù');
    return this._lock(async () => {
      const p = this.currentPlayer;
      this.bank.debit(p, JAIL_FINE, 'Phí ra tù');
      this._release(p);
      this.log(`${p.name} trả ${money(JAIL_FINE)} để ra tù.`, 'info');
      await this.fx.transferMoney(p, null, JAIL_FINE, 'Phí ra tù');
      await this.fx.releaseFromJail(p);
    });
  }

  async useJailCard() {
    if (!this.canUseJailCard()) return fail('Không có thẻ ra tù');
    return this._lock(async () => {
      const p = this.currentPlayer;
      const card = p.jailCards.shift();
      this.decks[card.deck].release(card.cardId);
      this._release(p);
      this.log(`${p.name} dùng thẻ ra tù miễn phí.`, 'good');
      await this.fx.releaseFromJail(p);
    });
  }

  // ------------------------------------------------------------------ AI
  async playAITurn() {
    const p = this.currentPlayer;
    if (!p.isAI || this.over || this.disposed) return;
    let guard = 0;
    while (!this.over && !this.disposed && this.currentPlayer === p && !p.bankrupt && guard++ < 60) {
      await this.fx.wait(450);
      if (this.disposed) return;
      const phase = this.phase;
      if (phase === PHASES.ROLL) {
        if (p.inJail) {
          const choice = this.ai.jailChoice(p);
          if (choice === 'card') await this.useJailCard();
          else if (choice === 'pay') await this.payJailFine();
        }
        await this._aiManage(p);
        await this.rollDice();
      } else if (phase === PHASES.BUY) {
        const tile = this.board.getTile(this.pendingPurchase);
        if (this.ai.shouldBuy(p, tile) && this.canBuy()) await this.buyProperty();
        else this.declinePurchase();
      } else if (phase === PHASES.END) {
        await this._aiManage(p);
        await this.endTurn();
      } else {
        break;
      }
    }
  }

  async _aiManage(p) {
    for (let i = 0; i < 12; i++) {
      if (this.over || p.bankrupt || this.disposed) return;
      const action = this.ai.nextManageAction(p);
      if (!action) return;
      const r = action.type === 'build' ? await this.buildOn(action.tile.id) : await this.unmortgageTile(action.tile.id);
      if (!r.ok) return;
    }
  }

  // ------------------------------------------------------------------ internals
  _release(p) {
    p.inJail = false;
    p.jailTurns = 0;
  }

  async _advanceTurn() {
    if (this.over) return;
    this.turn.next();
    if (this.maxRounds > 0 && this.turn.round > this.maxRounds) {
      this.log(`Đã hết ${this.maxRounds} vòng chơi. Xếp hạng theo tổng tài sản.`, 'system');
      await this._endGame(this.getRanking()[0]);
      return;
    }
    await this._beginTurn();
  }

  async _autoAdvanceIfBankrupt() {
    if (this.over || this.disposed) return;
    if (this.currentPlayer.bankrupt) {
      await this._lock(() => this._advanceTurn());
    }
  }

  async _moveBy(p, steps, { collectGo = true } = {}) {
    if (steps === 0) return;
    const dir = Math.sign(steps);
    const path = [];
    let pos = p.position;
    let passedGo = false;
    for (let i = 0; i < Math.abs(steps); i++) {
      pos = (pos + dir + this.board.size) % this.board.size;
      path.push(pos);
      if (dir > 0 && pos === 0) passedGo = true;
    }
    p.position = pos;
    const salary = passedGo && collectGo;
    if (salary) this.bank.credit(p, GO_SALARY, 'Đi qua ô Bắt đầu');
    await this.fx.movePlayer(p, path, { passedGo: salary });
    if (salary) {
      this.log(`${p.name} đi qua ô Bắt đầu, nhận ${money(GO_SALARY)}.`, 'good');
      await this.fx.reward(p, GO_SALARY, 'Qua ô Bắt đầu');
    }
    this.emit('update');
  }

  async _moveTo(p, target, opts) {
    const steps = (target - p.position + this.board.size) % this.board.size;
    await this._moveBy(p, steps, opts);
  }

  async _sendToJail(p) {
    p.position = JAIL_POSITION;
    p.inJail = true;
    p.jailTurns = 0;
    p.doublesCount = 0;
    this.canRollAgain = false;
    this.log(`${p.name} bị đưa vào tù!`, 'bad');
    this.emit('update');
    await this.fx.sendToJail(p);
  }

  async _resolveLanding(p, ctx = {}) {
    if (this.over || p.bankrupt) return;
    const tile = this.board.getTile(p.position);
    await this.fx.landed(p, tile);
    switch (tile.type) {
      case T.PROPERTY:
      case T.STATION:
      case T.UTILITY:
        await this._landOnOwnable(p, tile, ctx);
        break;
      case T.CHANCE:
        await this._drawCard(p, 'chance', ctx);
        break;
      case T.COMMUNITY:
        await this._drawCard(p, 'community', ctx);
        break;
      case T.TAX:
        this.log(`${p.name} phải nộp ${tile.name} ${money(tile.amount)}.`, 'bad');
        await this._pay(p, null, tile.amount, tile.name);
        break;
      case T.BANK: {
        const raw = Math.round((p.money * BANK_INTEREST.rate) / 10) * 10;
        const interest = Math.min(BANK_INTEREST.max, Math.max(BANK_INTEREST.min, raw));
        this.bank.credit(p, interest, 'Lãi ngân hàng');
        this.log(`${p.name} nhận lãi ngân hàng ${money(interest)}.`, 'good');
        await this.fx.reward(p, interest, 'Lãi ngân hàng');
        break;
      }
      case T.GO_TO_JAIL:
        await this._sendToJail(p);
        break;
      case T.JAIL:
        this.log(`${p.name} ghé thăm nhà tù.`, 'info');
        break;
      case T.REST:
        this.log(`${p.name} nghỉ ngơi ở ${tile.name}.`, 'info');
        break;
      default:
        break;
    }
  }

  async _landOnOwnable(p, tile, ctx) {
    if (tile.owner === null) {
      if (p.money >= tile.price) {
        this.pendingPurchase = tile.id;
        this.log(`${tile.name} chưa có chủ — giá ${money(tile.price)}.`, 'info');
      } else {
        this.log(`${p.name} không đủ tiền mua ${tile.name} (${money(tile.price)}).`, 'warn');
      }
      return;
    }
    if (tile.owner === p.id) {
      this.log(`${p.name} dừng tại đất của mình: ${tile.name}.`, 'info');
      return;
    }
    const owner = this.players.get(tile.owner);
    if (tile.mortgaged) {
      this.log(`${tile.name} đang thế chấp — miễn tiền thuê.`, 'info');
      return;
    }
    const rent = this.property.calculateRent(tile, ctx);
    this.log(`${p.name} trả tiền thuê ${money(rent)} cho ${owner.name} (${tile.name}).`, 'bad');
    await this._pay(p, owner.id, rent, `Thuê ${tile.name}`);
  }

  async _drawCard(p, kind, ctx) {
    const deck = this.decks[kind];
    const card = deck.draw();
    this.log(`${p.name} rút thẻ ${DECK_TITLES[kind]}: “${card.text}”`, 'card');
    this.emit('card', { player: p, card, kind });
    await this.fx.showCard(p, card, kind);
    await this._applyCard(p, card, kind, ctx);
  }

  async _applyCard(p, card, kind, ctx) {
    const a = card.action;
    switch (a.type) {
      case 'money':
        if (a.amount >= 0) {
          this.bank.credit(p, a.amount, card.text);
          await this.fx.reward(p, a.amount, DECK_TITLES[kind]);
        } else {
          await this._pay(p, null, -a.amount, card.text);
        }
        break;
      case 'moveTo':
        await this._moveTo(p, a.tile);
        await this._resolveLanding(p, ctx);
        break;
      case 'moveBack':
        await this._moveBy(p, -a.steps);
        await this._resolveLanding(p, ctx);
        break;
      case 'nearest': {
        const type = a.kind === 'station' ? T.STATION : T.UTILITY;
        const target = this.board.nearest(p.position, type);
        await this._moveTo(p, target);
        const special = a.kind === 'station' ? { stationMultiplier: 2 } : { utilityMultiplier: 10 };
        await this._resolveLanding(p, { ...ctx, ...special });
        break;
      }
      case 'jail':
        await this._sendToJail(p);
        break;
      case 'jailCard':
        this.decks[kind].hold(card.id);
        p.jailCards.push({ deck: kind, cardId: card.id });
        this.log(`${p.name} giữ thẻ ra tù miễn phí.`, 'good');
        break;
      case 'repairs': {
        const { houses, hotels } = this.property.countBuildings(p.id);
        const cost = houses * a.house + hotels * a.hotel;
        if (cost > 0) {
          this.log(`${p.name} trả ${money(cost)} sửa chữa (${houses} nhà, ${hotels} khách sạn).`, 'bad');
          await this._pay(p, null, cost, 'Sửa chữa nhà cửa');
        } else {
          this.log(`${p.name} chưa có công trình nào — không mất phí.`, 'info');
        }
        break;
      }
      case 'payEach':
        for (const other of this.players.others(p)) {
          if (this.over || p.bankrupt) break;
          const paid = await this._pay(p, other.id, a.amount, card.text);
          if (!paid) break;
        }
        break;
      case 'collectEach':
        for (const other of this.players.others(p)) {
          if (this.over) break;
          await this._pay(other, p.id, a.amount, card.text);
        }
        break;
      default:
        console.warn('Thẻ không xác định', card);
    }
  }

  // Trả tiền: tự động thanh lý tài sản nếu thiếu; phá sản nếu vẫn không đủ.
  async _pay(payer, creditorId, amount, reason) {
    if (amount <= 0 || payer.bankrupt) return true;
    const creditor = creditorId === null ? null : this.players.get(creditorId);
    if (payer.money < amount) await this._raiseFunds(payer, amount);
    if (payer.money < amount) {
      await this._bankrupt(payer, creditor, reason);
      return false;
    }
    if (creditor) this.bank.transfer(payer, creditor, amount, reason);
    else this.bank.debit(payer, amount, reason);
    this.emit('update');
    await this.fx.transferMoney(payer, creditor, amount, reason);
    return true;
  }

  async _raiseFunds(p, amount) {
    for (let guard = 0; guard < 80 && p.money < amount; guard++) {
      const step = this.property.nextLiquidationStep(p);
      if (!step) break;
      if (step.action === 'sell') await this._doSell(p, step.tile);
      else await this._doMortgage(p, step.tile);
    }
  }

  async _doSell(p, tile) {
    const { refund, kind } = this.property.sell(p, tile);
    this.bank.credit(p, refund, `Bán ${kind === 'hotel' ? 'khách sạn' : 'nhà'} tại ${tile.name}`);
    this.log(`${p.name} bán ${kind === 'hotel' ? 'khách sạn' : 'một nhà'} tại ${tile.name} (+${money(refund)}).`, 'warn');
    await this.fx.sellBuilding(p, tile, kind, refund);
  }

  async _doMortgage(p, tile) {
    const { value } = this.property.mortgage(p, tile);
    this.bank.credit(p, value, `Thế chấp ${tile.name}`);
    this.log(`${p.name} thế chấp ${tile.name} (+${money(value)}).`, 'warn');
    await this.fx.mortgage(p, tile, value);
  }

  async _bankrupt(p, creditor, reason) {
    p.bankrupt = true;
    p.bankruptOrder = ++this._bankruptCount;
    p.inJail = false;
    const tiles = this.property.ownedBy(p.id);
    // Bán nốt mọi công trình còn lại cho ngân hàng.
    for (const t of tiles) {
      const value = this.property.level(t) * Math.floor(this.property.houseCost(t) / 2);
      if (value > 0) this.bank.credit(p, value, `Thanh lý công trình ${t.name}`);
      t.houses = 0;
      t.hotel = 0;
    }
    if (creditor) {
      if (p.money > 0) this.bank.transfer(p, creditor, p.money, `Tài sản phá sản của ${p.name}`);
      for (const t of tiles) t.owner = creditor.id;
      creditor.jailCards.push(...p.jailCards);
    } else {
      if (p.money > 0) this.bank.debit(p, p.money, `Tài sản phá sản của ${p.name}`);
      for (const t of tiles) {
        t.owner = null;
        t.mortgaged = false;
      }
      for (const c of p.jailCards) this.decks[c.deck].release(c.cardId);
    }
    p.jailCards = [];
    p.money = 0;
    this.log(`${p.name} PHÁ SẢN${creditor ? `, tài sản thuộc về ${creditor.name}` : ''} (${reason}).`, 'bad');
    this.emit('bankrupt', p);
    this.emit('update');
    await this.fx.bankrupt(p, creditor, tiles);
    const active = this.players.active();
    if (active.length <= 1) await this._endGame(active[0] || null);
  }

  async _endGame(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.turn.phase = PHASES.OVER;
    this.pendingPurchase = null;
    const ranking = this.getRanking();
    this.log(`Ván đấu kết thúc! Người chiến thắng: ${winner ? winner.name : 'không có'}.`, 'system');
    this.emit('update');
    this.emit('gameOver', { winner, ranking });
    await this.fx.gameOver(winner, ranking);
  }
}

export { PHASES };
