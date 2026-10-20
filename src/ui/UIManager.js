import { TILE_TYPES as T, TILE_TYPE_LABELS, COLOR_GROUPS, JAIL_FINE, MAX_JAIL_TURNS } from '../data/boardData.js';
import { DECK_TITLES } from '../data/cards.js';
import { PHASES } from '../game/TurnManager.js';

const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function tileColor(tile) {
  if (tile.group) return COLOR_GROUPS[tile.group].color;
  if (tile.type === T.STATION) return '#5D6D7E';
  if (tile.type === T.UTILITY) return '#26A69A';
  return '#B0A8C0';
}

// Giao diện DOM phủ trên scene 3D. Chỉ đọc trạng thái game và gọi controller;
// không tự thay đổi trạng thái game.
export class UIManager {
  constructor() {
    this.el = {
      loading: $('#loading-screen'),
      loadingBar: $('#loading-bar'),
      loadingText: $('#loading-text'),
      menu: $('#start-menu'),
      playerSetup: $('#player-setup'),
      hud: $('#hud'),
      players: $('#players-panel'),
      turnBadge: $('#turn-badge'),
      prompt: $('#prompt'),
      dice: $('#dice-display'),
      roll: $('#btn-roll'),
      buy: $('#btn-buy'),
      build: $('#btn-build'),
      end: $('#btn-end'),
      follow: $('#btn-follow'),
      tilePanel: $('#tile-panel'),
      logPanel: $('#log-panel'),
      logList: $('#log-list'),
      txList: $('#tx-list'),
      modalRoot: $('#modal-root'),
      toastRoot: $('#toast-root'),
      floatLayer: $('#float-layer'),
      banner: $('#banner'),
    };
    this.game = null;
    this.controller = null;
    this.thumbs = {};
    this.openTileId = null;
    this.unsubs = [];
    this.leaderboard = null;
    this.buildMenu = null;
    this.playerInfo = null;
    this._refreshQueued = false;
    this.projector = null;
    this._bindStatic();
  }

  // ------------------------------------------------------------ loading
  setLoading(progress, text) {
    this.el.loadingBar.style.width = `${Math.round(progress * 100)}%`;
    if (text) this.el.loadingText.textContent = text;
  }

  setLoadingDetails(lines) {
    const el = $('#loading-details');
    if (!el) return;
    el.innerHTML = lines.map((l) => `<li class="${l.startsWith('✘') ? 'bad' : l.startsWith('✔') ? 'good' : ''}">${esc(l)}</li>`).join('');
  }

  hideLoading() {
    this.el.loading.classList.add('fade-out');
    setTimeout(() => this.el.loading.classList.add('hidden'), 500);
  }

  fatal(err) {
    this.el.loading.classList.remove('hidden', 'fade-out');
    this.el.loadingText.innerHTML = `<b>Không thể khởi động game.</b><br>${esc(err?.message || err)}<br><small>Hãy chạy qua máy chủ web (xem README) và dùng trình duyệt hỗ trợ WebGL.</small>`;
    this.el.loadingText.classList.add('error');
  }

  // ------------------------------------------------------------ static bindings
  _bindStatic() {
    const c = (fn) => () => this.controller && fn(this.controller);
    this.el.roll.addEventListener('click', c((ctl) => ctl.roll()));
    this.el.buy.addEventListener('click', c((ctl) => ctl.buy()));
    this.el.build.addEventListener('click', () => this.openBuildMenu());
    this.el.end.addEventListener('click', c((ctl) => ctl.endTurn()));
    $('#btn-cam-reset').addEventListener('click', c((ctl) => ctl.resetCamera()));
    this.el.follow.addEventListener('click', c((ctl) => {
      const on = ctl.toggleFollow();
      this.el.follow.classList.toggle('active', on);
      this.toast(on ? 'Camera sẽ theo dõi nhân vật' : 'Đã tắt theo dõi nhân vật', 'info', 1800);
    }));
    $('#btn-leaderboard').addEventListener('click', () => this.openLeaderboard());
    $('#btn-log').addEventListener('click', () => this.el.logPanel.classList.toggle('collapsed'));
    $('#btn-menu').addEventListener('click', () => this.confirmNewGame());
    this.el.logPanel.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.el.logPanel.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      this.el.logList.classList.toggle('hidden', b.dataset.tab !== 'events');
      this.el.txList.classList.toggle('hidden', b.dataset.tab !== 'tx');
    }));
    $('#btn-log-collapse').addEventListener('click', () => this.el.logPanel.classList.toggle('collapsed'));
    document.querySelectorAll('[data-debug-toggle]').forEach((b) => b.addEventListener('click', () => this.onToggleDebug?.()));

    window.addEventListener('keydown', (e) => {
      if (!this.controller || this.el.hud.classList.contains('hidden')) return;
      if (e.target.closest('input, select, textarea') || this.el.modalRoot.querySelector('.modal-backdrop:not(.card-backdrop)')) return;
      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        this.controller.roll();
      } else if (key === 'b') this.controller.buy();
      else if (key === 'e') this.controller.endTurn();
      else if (key === 'h') this.openBuildMenu();
      else if (key === 'c') this.controller.resetCamera();
      else if (key === 'escape') this.closeTilePanel();
    });
  }

  // ------------------------------------------------------------ start menu
  showMenu({ characters, settings, onStart, modelStatus, allowPlaceholderDefault = true }) {
    this.characters = characters;
    this.modelStatus = modelStatus;
    const allowBox = $('#opt-placeholder');
    allowBox.checked = allowPlaceholderDefault;
    allowBox.onchange = () => this._renderPlayerSetup();
    const s = {
      count: settings.playerCount || 4,
      players: settings.players && settings.players.length === 4 ? settings.players : characters.slice(0, 4).map((ch, i) => ({
        name: ch.name, characterId: ch.id, isAI: i > 0,
      })),
    };
    this.menuState = s;
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');

    $('#opt-money').value = String(settings.startMoney || 1500);
    $('#opt-rounds').value = String(settings.maxRounds || 0);
    $('#opt-quality').value = settings.quality || 'high';
    $('#opt-speed').value = String(settings.speed || 1);

    const countBtns = this.el.menu.querySelectorAll('#player-count button');
    countBtns.forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.count) === s.count);
      b.onclick = () => {
        s.count = Number(b.dataset.count);
        countBtns.forEach((x) => x.classList.toggle('active', x === b));
        this._renderPlayerSetup();
      };
    });
    this._renderPlayerSetup();

    $('#btn-start').onclick = () => {
      const missing = this._missingModels();
      if (missing.length && !allowBox.checked) {
        this.toast(`Không thể bắt đầu: thiếu mô hình GLB ${missing.map((e) => e.path).join(', ')}`, 'error', 7000);
        return;
      }
      const players = s.players.slice(0, s.count).map((p) => {
        const ch = characters.find((c) => c.id === p.characterId);
        return { name: p.name.trim() || ch.name, characterId: ch.id, color: ch.color, isAI: p.isAI };
      });
      onStart({
        players,
        startMoney: Number($('#opt-money').value),
        maxRounds: Number($('#opt-rounds').value),
        quality: $('#opt-quality').value,
        speed: Number($('#opt-speed').value),
        playerCount: s.count,
        allPlayers: s.players,
        allowPlaceholder: allowBox.checked,
      });
    };
  }

  _missingModels() {
    const s = this.menuState;
    if (!this.modelStatus) return [];
    return s.players.slice(0, s.count).map((p) => this.modelStatus(p.characterId)).filter((e) => e.status !== 'loaded');
  }

  _renderModelWarning() {
    const box = $('#model-warning');
    const missing = this._missingModels();
    const allow = $('#opt-placeholder').checked;
    box.classList.toggle('hidden', !missing.length);
    box.classList.toggle('blocking', missing.length > 0 && !allow);
    box.innerHTML = missing.length ? `<b>⚠ Chưa có mô hình GLB cho ${missing.length} nhân vật đã chọn</b> (${esc(missing[0].error || missing[0].status)}):
      <div class="paths">${missing.map((e) => `<code>${esc(e.path)}</code>`).join(' ')}</div>
      ${allow ? 'Các nhân vật này sẽ dùng <b>mô hình tạm</b> (khối hình học) và được gắn nhãn “TẠM” trong game.'
    : 'Hãy thêm file GLB, chọn nhân vật khác, hoặc bật “Cho phép mô hình tạm”.'}` : '';
  }

  _renderPlayerSetup() {
    const s = this.menuState;
    const chars = this.characters;
    const root = this.el.playerSetup;
    root.innerHTML = '';
    for (let i = 0; i < s.count; i++) {
      const p = s.players[i];
      const ch = chars.find((c) => c.id === p.characterId) || chars[0];
      const status = this.modelStatus?.(ch.id);
      const glb = status?.status === 'loaded';
      const row = document.createElement('div');
      row.className = 'setup-row';
      row.style.setProperty('--pc', ch.color);
      row.innerHTML = `
        <button class="setup-avatar" title="Đổi nhân vật"><img src="${this.thumbs[ch.id] || ''}" alt="">
          <span class="model-badge ${glb ? 'glb' : 'tmp'}" title="${esc(glb ? status.path : `Thiếu ${status?.path || 'GLB'}`)}">${glb ? 'GLB' : 'TẠM'}</span></button>
        <div class="setup-fields">
          <input class="setup-name" maxlength="18" value="${esc(p.name)}" aria-label="Tên người chơi ${i + 1}">
          <select class="setup-char" aria-label="Nhân vật">
            ${chars.map((c) => `<option value="${c.id}" ${c.id === ch.id ? 'selected' : ''}>${esc(c.title)} — ${esc(c.name)}${this.modelStatus?.(c.id).status === 'loaded' ? '' : ' (chưa có GLB)'}</option>`).join('')}
          </select>
        </div>
        <div class="segmented small">
          <button data-ai="0" class="${p.isAI ? '' : 'active'}">Người</button>
          <button data-ai="1" class="${p.isAI ? 'active' : ''}">Máy</button>
        </div>`;
      const setChar = (id) => {
        const other = s.players.findIndex((q, j) => j !== i && j < s.count && q.characterId === id);
        if (other >= 0) {
          const oldName = s.players[other].name;
          s.players[other].characterId = p.characterId;
          const oldCh = chars.find((c) => c.id === p.characterId);
          if (chars.some((c) => c.name === oldName)) s.players[other].name = oldCh.name;
        }
        const wasDefault = chars.some((c) => c.name === p.name);
        p.characterId = id;
        if (wasDefault) p.name = chars.find((c) => c.id === id).name;
        this._renderPlayerSetup();
      };
      row.querySelector('.setup-char').onchange = (e) => setChar(e.target.value);
      row.querySelector('.setup-avatar').onclick = () => {
        const used = new Set(s.players.slice(0, s.count).map((q) => q.characterId));
        const idx = chars.findIndex((c) => c.id === p.characterId);
        for (let k = 1; k <= chars.length; k++) {
          const next = chars[(idx + k) % chars.length];
          if (!used.has(next.id)) return setChar(next.id);
        }
        return null;
      };
      row.querySelector('.setup-name').oninput = (e) => {
        p.name = e.target.value;
      };
      row.querySelectorAll('[data-ai]').forEach((b) => {
        b.onclick = () => {
          p.isAI = b.dataset.ai === '1';
          this._renderPlayerSetup();
        };
      });
      root.appendChild(row);
    }
    this._renderModelWarning();
  }

  hideMenu() {
    this.el.menu.classList.add('hidden');
  }

  // ------------------------------------------------------------ game binding
  bindGame(game, controller) {
    this.unbindGame();
    this.game = game;
    this.controller = controller;
    this.el.logList.innerHTML = '';
    this.el.txList.innerHTML = '';
    this.el.hud.classList.remove('hidden');
    // Điện thoại: thu gọn nhật ký để không che bàn cờ (mở lại bằng nút 📜).
    if (window.matchMedia?.('(max-width: 600px)').matches) this.el.logPanel.classList.add('collapsed');
    this.el.follow.classList.toggle('active', controller.isFollowing());
    this.setDiceRolling(false);
    this.unsubs.push(
      game.on('update', () => this.scheduleRefresh()),
      game.on('log', (e) => this.appendLog(e)),
      game.on('transaction', (tx) => this.appendTx(tx)),
      game.on('gameOver', (r) => setTimeout(() => this.showGameOver(r), 2400)),
    );
    for (const e of game.logEntries) this.appendLog(e);
    // Đồng hồ đếm lượt (online) cập nhật mỗi giây.
    this._timerTick = setInterval(() => {
      if (this.game && this._turnTimer()) {
        this._renderPlayers();
        this._renderPrompt();
      }
    }, 1000);
    this.refresh();
  }

  unbindGame() {
    clearInterval(this._timerTick);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.el.landing?.remove();
    this.el.landing = null;
    this.game = null;
    this.controller = null;
    this.closeTilePanel();
    this.el.modalRoot.innerHTML = '';
    this.leaderboard = null;
    this.buildMenu = null;
    this.playerInfo = null;
  }

  scheduleRefresh() {
    if (this._refreshQueued) return;
    this._refreshQueued = true;
    requestAnimationFrame(() => {
      this._refreshQueued = false;
      this.refresh();
    });
  }

  refresh() {
    const g = this.game;
    if (!g) return;
    this._renderPlayers();
    this._renderTurn();
    this._renderButtons();
    this._renderPrompt();
    if (this.openTileId !== null) this._renderTilePanel(this.openTileId);
    this.leaderboard?.render();
    this.buildMenu?.render();
    this.playerInfo?.render();
  }

  // Thiết bị này có được thao tác lúc này không (online: đúng ghế của mình; offline: lượt người thật).
  _canAct() {
    const g = this.game;
    if (!g) return false;
    return this.controller?.isMyTurn ? this.controller.isMyTurn() : g.isHumanTurn;
  }

  // Đồng hồ đếm lượt (online): { seat, deadline(performance.now), offline } | null
  _turnTimer() {
    return this.controller?.turnTimer?.() || null;
  }

  _renderPlayers() {
    const g = this.game;
    const cur = g.currentPlayer;
    const timer = this._turnTimer();
    this.el.players.innerHTML = '';
    for (const p of g.players.list) {
      const owned = g.property.ownedBy(p.id);
      const card = document.createElement('button');
      const presence = this.controller?.presence?.(p.id); // online: { you, online, auto, bot }
      card.className = `player-card${p === cur && !g.over ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}${presence?.you ? ' you' : ''}`;
      card.style.setProperty('--pc', p.color);
      const prev = this._lastMoney?.[p.id];
      const delta = prev === undefined ? 0 : p.money - prev;
      const b = g.property.countBuildings(p.id);
      const tags = [
        presence?.you ? '<span class="tag you">BẠN</span>' : '',
        p.isAI ? '<span class="tag">MÁY</span>' : '',
        presence && !presence.bot && !presence.online ? '<span class="tag off" title="Mất kết nối — máy sẽ chơi thay nếu hết giờ">OFFLINE</span>' : '',
        presence && !presence.bot && presence.auto ? '<span class="tag off" title="Đã rời ván — máy chơi thay">MÁY CHƠI THAY</span>' : '',
        this.controller?.characterSource(p.id) === 'placeholder' ? '<span class="tag tmp" title="Mô hình tạm — chưa có file GLB">TẠM</span>' : '',
      ].join('');
      const showTimer = timer && timer.seat === p.id && p === cur && !g.over;
      const left = showTimer ? Math.max(0, (timer.deadline - performance.now()) / 1000) : 0;
      card.innerHTML = `
        <img class="avatar" src="${this.thumbs[p.characterId] || ''}" alt="">
        <div class="pc-info">
          <div class="pc-name"><span class="nm">${esc(p.name)}</span>${tags}</div>
          <div class="pc-money ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${money(p.money)}</div>
          <div class="pc-assets" title="Số ô đất · nhà · khách sạn">🏠 ${owned.length} ô${b.houses ? ` · ${b.houses} nhà` : ''}${b.hotels ? ` · ${b.hotels} KS` : ''}</div>
          <div class="pc-chips">${owned.map((t) => `<i style="background:${tileColor(t)}" class="${t.mortgaged ? 'mort' : ''}" title="${esc(t.name)}"></i>`).join('')}</div>
        </div>
        <div class="pc-status">${p === cur && !g.over ? '<span class="badge turn">Đang đi</span>' : ''}${p.bankrupt ? '<span class="badge bad">Phá sản</span>' : p.inJail ? '<span class="badge warn">Trong tù</span>' : ''}${p.jailCards.length ? `<span class="badge">🎫×${p.jailCards.length}</span>` : ''}${showTimer ? `<span class="badge timer ${left < 10 ? 'low' : ''}">⏱ ${Math.ceil(left)}s</span>` : ''}</div>`;
      card.onclick = () => {
        this.showPlayerInfo(p.id);
        this.controller?.focusPlayer(p.id);
      };
      this.el.players.appendChild(card);
    }
    this._lastMoney = Object.fromEntries(g.players.list.map((p) => [p.id, p.money]));
  }

  _renderTurn() {
    const g = this.game;
    const p = g.currentPlayer;
    if (g.over) {
      this.el.turnBadge.innerHTML = `<span class="tb-round">Kết thúc</span><b>${g.winner ? `🏆 ${esc(g.winner.name)} thắng!` : 'Ván đấu kết thúc'}</b>`;
      return;
    }
    const rounds = g.maxRounds ? ` / ${g.maxRounds}` : '';
    this.el.turnBadge.style.setProperty('--pc', p.color);
    this.el.turnBadge.innerHTML = `
      <span class="tb-round">Vòng ${g.turn.round}${rounds}</span>
      <img src="${this.thumbs[p.characterId] || ''}" alt="">
      <b>Lượt của ${esc(p.name)}</b>${p.isAI ? '<span class="tag">MÁY</span>' : ''}`;
  }

  _renderButtons() {
    const g = this.game;
    const human = this._canAct();
    const p = g.currentPlayer;
    this.el.roll.disabled = !(human && g.canRoll());
    this.el.buy.disabled = !(human && g.canBuy());
    this.el.build.disabled = !(human && g.canManage() && g.property.buildableTiles(p).length > 0);
    this.el.end.disabled = !(human && g.canEndTurn());
    this.el.roll.classList.toggle('pulse', !this.el.roll.disabled);
    this.el.end.classList.toggle('pulse', !this.el.end.disabled && g.phase === PHASES.END);
    this.el.buy.classList.toggle('pulse', !this.el.buy.disabled);
    const title = g.phase === PHASES.BUY && g.pendingPurchase !== null ? g.board.getTile(g.pendingPurchase) : null;
    this.el.buy.innerHTML = title && !this.el.buy.disabled ? `🏠 Mua ${esc(title.name)} <small>${money(title.price)}</small>` : '🏠 Mua đất';
  }

  _renderPrompt() {
    const g = this.game;
    const p = g.currentPlayer;
    const el = this.el.prompt;
    let html = '';
    const online = !!this.controller?.isMyTurn;
    const timer = this._turnTimer();
    const timerText = timer && timer.seat === p.id ? ` <b class="countdown">⏱ ${Math.ceil(Math.max(0, timer.deadline - performance.now()) / 1000)}s</b>` : '';
    if (g.over) {
      html = `<span>🏁 Ván đấu đã kết thúc.</span> <button class="btn btn-small" data-act="results">Xem kết quả</button> <button class="btn btn-small btn-primary" data-act="new">${online ? 'Về phòng' : 'Ván mới'}</button>`;
    } else if (online && p.id !== this.controller.mySeat()) {
      const pres = this.controller.presence(p.id);
      html = p.isAI || pres?.auto
        ? `<span class="thinking">🤖 ${esc(p.name)} (máy) đang ${g.busy ? 'hành động' : 'suy nghĩ'}<i>.</i><i>.</i><i>.</i></span>`
        : `<span class="thinking">⏳ Đang chờ <b>${esc(p.name)}</b>${g.busy ? ' hành động' : ' thao tác'}${pres && !pres.online ? ' (mất kết nối)' : ''}<i>.</i><i>.</i><i>.</i>${timerText}</span>`;
    } else if (online && this.controller.syncing?.()) {
      html = '<span>⏳ Đang thực hiện (đồng bộ với mọi người chơi)...</span>';
    } else if (online && this.controller.isSending?.()) {
      html = '<span>📡 Đang gửi thao tác lên máy chủ...</span>';
    } else if (p.isAI) {
      html = `<span class="thinking">🤖 ${esc(p.name)} đang ${g.busy ? 'hành động' : 'suy nghĩ'}<i>.</i><i>.</i><i>.</i></span>`;
    } else if (g.busy) {
      html = '<span>⏳ Đang thực hiện...</span>';
    } else if (g.phase === PHASES.BUY) {
      const t = g.board.getTile(g.pendingPurchase);
      html = `<span>Mua <b>${esc(t.name)}</b> với giá <b>${money(t.price)}</b>? (Bạn có ${money(p.money)})</span>
        <button class="btn btn-small btn-buy" data-act="buy" ${g.canBuy() ? '' : 'disabled'}>Mua</button>
        <button class="btn btn-small" data-act="decline">Bỏ qua</button>
        <button class="btn btn-small btn-ghost" data-act="info">Chi tiết</button>`;
    } else if (g.phase === PHASES.ROLL && p.inJail) {
      html = `<span>🔒 Bạn đang ở trong tù (đã qua ${p.jailTurns}/${MAX_JAIL_TURNS} lượt). Tung được đôi để ra tù, hoặc:</span>
        <button class="btn btn-small" data-act="pay" ${g.canPayJailFine() ? '' : 'disabled'}>Trả ${money(JAIL_FINE)}</button>
        <button class="btn btn-small" data-act="card" ${g.canUseJailCard() ? '' : 'disabled'}>Dùng thẻ (${p.jailCards.length})</button>`;
    } else if (g.phase === PHASES.ROLL) {
      html = g.canRollAgain ? `<span>🎉 Bạn tung được đôi — hãy tung tiếp!${timerText}</span>` : `<span>🎲 Đến lượt bạn — hãy tung xúc xắc <kbd>Space</kbd>${timerText}</span>`;
    } else if (g.phase === PHASES.END) {
      html = `<span>Bạn có thể xây nhà, thế chấp đất hoặc kết thúc lượt <kbd>E</kbd>${timerText}</span>`;
    }
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
    el.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const ctl = this.controller;
        if (!ctl) return;
        switch (b.dataset.act) {
          case 'buy': ctl.buy(); break;
          case 'decline': ctl.decline(); break;
          case 'info': ctl.selectTile(g.pendingPurchase); break;
          case 'pay': ctl.payJail(); break;
          case 'card': ctl.useJailCard(); break;
          case 'results': this.showGameOver({ winner: g.winner, ranking: g.getRanking() }); break;
          case 'new': ctl.newGame(); break;
          default: break;
        }
      };
    });
  }

  // ------------------------------------------------------------ dice
  setDiceRolling(rolling, d1, d2) {
    const dice = this.el.dice.querySelectorAll('.die');
    this.el.dice.classList.toggle('rolling', rolling);
    if (!rolling && d1) {
      dice[0].textContent = d1;
      dice[1].textContent = d2;
      this.el.dice.classList.toggle('double', d1 === d2);
      this.el.dice.querySelector('.dice-sum').textContent = `= ${d1 + d2}`;
    } else if (!rolling) {
      dice[0].textContent = '–';
      dice[1].textContent = '–';
      this.el.dice.querySelector('.dice-sum').textContent = '';
    }
  }

  // ------------------------------------------------------------ tile panel
  isTilePanelOpen(tileId) {
    return this.openTileId === tileId;
  }

  showTileInfo(tileId) {
    this.openTileId = tileId;
    this.el.tilePanel.classList.remove('hidden');
    this._renderTilePanel(tileId);
  }

  closeTilePanel() {
    if (this.openTileId === null) return;
    this.openTileId = null;
    this.el.tilePanel.classList.add('hidden');
    this.controller?.onTilePanelClosed();
  }

  _renderTilePanel(tileId) {
    const g = this.game;
    if (!g) return;
    const t = g.board.getTile(tileId);
    const prop = g.property;
    const owner = t.owner !== null ? g.players.get(t.owner) : null;
    const color = tileColor(t);
    const ownable = prop.isOwnable(t);
    const cur = g.currentPlayer;
    const rows = [];
    rows.push(['Loại ô', TILE_TYPE_LABELS[t.type]]);
    if (t.group) rows.push(['Nhóm màu', `<i class="dot" style="background:${color}"></i>${COLOR_GROUPS[t.group].name}`]);
    if (ownable) {
      rows.push(['Giá mua', money(t.price)]);
      rows.push(['Chủ sở hữu', owner ? `<i class="dot" style="background:${owner.color}"></i>${esc(owner.name)}` : 'Ngân hàng (chưa có chủ)']);
      if (t.type === T.PROPERTY) {
        rows.push(['Công trình', t.hotel ? '🏨 1 khách sạn' : t.houses ? `🏠 × ${t.houses}` : 'Chưa có']);
        rows.push(['Giá xây', `${money(prop.houseCost(t))} / nhà`]);
      }
      rows.push(['Thế chấp', t.mortgaged ? `<b class="bad">Đang thế chấp</b> (chuộc ${money(prop.unmortgageCost(t))})` : `Giá trị ${money(prop.mortgageValue(t))}`]);
      if (owner) {
        const rentText = t.type === T.UTILITY
          ? `${prop.calculateRent(t, { diceTotal: 1 })} × tổng xúc xắc`
          : money(prop.calculateRent(t));
        rows.push(['Tiền thuê hiện tại', `<b>${rentText}</b>`]);
      }
    } else if (t.type === T.TAX) {
      rows.push(['Số tiền phải nộp', money(t.amount)]);
    }
    const here = g.players.list.filter((p) => p.position === t.id && !p.bankrupt);
    const table = prop.rentTable(t);
    const level = prop.level(t);

    const canAct = this._canAct();
    const human = canAct && t.owner === cur.id;
    const actions = [];
    if (canAct && g.phase === PHASES.BUY && g.pendingPurchase === t.id) {
      actions.push(this._actionBtn('buy', `Mua ${money(t.price)}`, g.canBuy(), '', 'btn-buy'));
    }
    if (human) {
      if (t.type === T.PROPERTY) {
        const b = prop.canBuild(cur, t);
        actions.push(this._actionBtn('build', b.ok ? `Xây ${b.kind === 'hotel' ? 'khách sạn' : 'nhà'} (${money(b.cost)})` : 'Xây nhà', b.ok && g.canManage(), b.reason, 'btn-build'));
        const s = prop.canSell(cur, t);
        actions.push(this._actionBtn('sell', s.ok ? `Bán ${s.kind === 'hotel' ? 'khách sạn' : 'nhà'} (+${money(s.refund)})` : 'Bán nhà', s.ok && g.canManage(), s.reason));
      }
      if (t.mortgaged) {
        const u = prop.canUnmortgage(cur, t);
        actions.push(this._actionBtn('unmortgage', `Chuộc lại (${money(prop.unmortgageCost(t))})`, u.ok && g.canManage(), u.reason));
      } else {
        const m = prop.canMortgage(cur, t);
        actions.push(this._actionBtn('mortgage', `Thế chấp (+${money(prop.mortgageValue(t))})`, m.ok && g.canManage(), m.reason));
      }
    }

    this.el.tilePanel.innerHTML = `
      <div class="tp-header" style="--tc:${color}">
        <div><small>${TILE_TYPE_LABELS[t.type]} · Ô ${t.id}</small><h2>${esc(t.name)}</h2></div>
        <button class="icon-btn small" data-close title="Đóng">✕</button>
      </div>
      <div class="tp-body">
        ${t.description ? `<p class="tp-desc">${esc(t.description)}</p>` : ''}
        <table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
        ${table.length ? `<h4>Bảng tiền thuê</h4><table class="rent">${table.map(([k, v], i) => {
          const active = owner && t.type === T.PROPERTY && ((level === 0 && i === (prop.hasMonopoly(t.owner, t.group) ? 1 : 0)) || (level > 0 && i === level + 1));
          return `<tr class="${active ? 'active' : ''}"><th>${k}</th><td>${typeof v === 'number' ? money(v) : v}</td></tr>`;
        }).join('')}</table>` : ''}
        ${here.length ? `<h4>Đang đứng tại đây</h4><div class="here">${here.map((p) => `<span style="--pc:${p.color}"><img src="${this.thumbs[p.characterId] || ''}" alt="">${esc(p.name)}</span>`).join('')}</div>` : ''}
        ${actions.length ? `<div class="tp-actions">${actions.join('')}</div>` : ''}
        ${ownable && !human && canAct && owner && owner.id !== cur.id ? '<p class="hint">Ô này thuộc người chơi khác.</p>' : ''}
      </div>`;
    this.el.tilePanel.querySelector('[data-close]').onclick = () => this.closeTilePanel();
    this.el.tilePanel.querySelectorAll('[data-tile-act]').forEach((b) => {
      b.onclick = () => {
        const ctl = this.controller;
        if (!ctl) return;
        const act = b.dataset.tileAct;
        if (act === 'buy') ctl.buy();
        else if (act === 'build') ctl.build(t.id);
        else if (act === 'sell') ctl.sell(t.id);
        else if (act === 'mortgage') ctl.mortgage(t.id);
        else if (act === 'unmortgage') ctl.unmortgage(t.id);
      };
    });
  }

  _actionBtn(act, label, enabled, reason = '', cls = '') {
    return `<button class="btn btn-small ${cls}" data-tile-act="${act}" ${enabled ? '' : 'disabled'} title="${esc(enabled ? '' : reason || 'Chưa thể thực hiện lúc này')}">${label}</button>`;
  }

  // ------------------------------------------------------------ modals
  openModal({ title, className = '', render, dismissible = true, onClose }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const box = document.createElement('div');
    box.className = `modal ${className}`;
    box.innerHTML = `<div class="modal-header"><h2>${title}</h2>${dismissible ? '<button class="icon-btn small" data-close title="Đóng">✕</button>' : ''}</div><div class="modal-body"></div>`;
    backdrop.appendChild(box);
    this.el.modalRoot.appendChild(backdrop);
    const body = box.querySelector('.modal-body');
    const modal = {
      el: box,
      body,
      render: () => render?.(body, modal),
      close: () => {
        backdrop.remove();
        onClose?.();
      },
    };
    if (dismissible) {
      box.querySelector('[data-close]').onclick = () => modal.close();
      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) modal.close();
      });
    }
    modal.render();
    return modal;
  }

  openBuildMenu() {
    const g = this.game;
    if (!g || !this._canAct()) return;
    if (this.buildMenu) return;
    this.buildMenu = this.openModal({
      title: '🔨 Xây nhà & khách sạn',
      className: 'build-modal',
      onClose: () => {
        this.buildMenu = null;
      },
      render: (body) => {
        const game = this.game;
        if (!game) return;
        const p = game.currentPlayer;
        const tiles = game.property.buildableTiles(p).concat(
          game.property.ownedBy(p.id).filter((t) => t.type === T.PROPERTY && game.property.level(t) === 5),
        );
        if (!tiles.length || p.isAI || !this._canAct()) {
          body.innerHTML = '<p class="empty">Bạn cần sở hữu <b>toàn bộ một nhóm màu</b> (không có ô nào thế chấp) để xây nhà.</p>';
          return;
        }
        body.innerHTML = `<p class="hint">Phải xây đều các ô trong cùng nhóm. 4 nhà nâng cấp thành khách sạn. Tiền hiện có: <b>${money(p.money)}</b></p>
          <div class="build-list">${tiles.map((t) => {
            const c = game.property.canBuild(p, t);
            const lvl = game.property.level(t);
            return `<div class="build-item" style="--tc:${tileColor(t)}">
              <i class="swatch"></i>
              <div class="bi-name"><b>${esc(t.name)}</b><small>${lvl === 5 ? '🏨 Khách sạn' : lvl ? '🏠'.repeat(lvl) : 'Chưa có nhà'} · thuê ${money(game.property.calculateRent(t))}</small></div>
              <button class="btn btn-small btn-build" data-build="${t.id}" ${c.ok && game.canManage() ? '' : 'disabled'} title="${esc(c.ok ? '' : c.reason)}">
                ${c.ok ? `${c.kind === 'hotel' ? 'Khách sạn' : 'Xây nhà'} ${money(c.cost)}` : lvl === 5 ? 'Tối đa' : 'Chưa thể'}
              </button>
              <button class="btn btn-small btn-ghost" data-view="${t.id}">Xem</button>
            </div>`;
          }).join('')}</div>`;
        body.querySelectorAll('[data-build]').forEach((b) => {
          b.onclick = () => this.controller?.build(Number(b.dataset.build));
        });
        body.querySelectorAll('[data-view]').forEach((b) => {
          b.onclick = () => this.controller?.selectTile(Number(b.dataset.view));
        });
      },
    });
  }

  openLeaderboard() {
    if (!this.game || this.leaderboard) return;
    this.leaderboard = this.openModal({
      title: '🏆 Bảng xếp hạng',
      className: 'leaderboard-modal',
      onClose: () => {
        this.leaderboard = null;
      },
      render: (body) => {
        const g = this.game;
        if (!g) return;
        body.innerHTML = this._rankingTable(g, g.getRanking());
      },
    });
  }

  _rankingTable(g, ranking) {
    return `<table class="ranking"><thead><tr><th>#</th><th>Người chơi</th><th>Tiền mặt</th><th>Đất</th><th>Nhà/KS</th><th>Tổng tài sản</th></tr></thead><tbody>
      ${ranking.map((p, i) => {
        const b = g.property.countBuildings(p.id);
        return `<tr class="${p.bankrupt ? 'bankrupt' : ''}" style="--pc:${p.color}">
          <td class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</td>
          <td class="who"><img src="${this.thumbs[p.characterId] || ''}" alt=""><span>${esc(p.name)}${p.bankrupt ? ' <span class="badge bad">Phá sản</span>' : ''}</span></td>
          <td>${money(p.money)}</td>
          <td>${g.property.ownedBy(p.id).length}</td>
          <td>${b.houses}/${b.hotels}</td>
          <td><b>${money(g.property.netWorth(p))}</b></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  showPlayerInfo(playerId) {
    this.playerInfo?.close();
    this.playerInfo = this.openModal({
      title: '👤 Thông tin người chơi',
      className: 'player-modal',
      onClose: () => {
        this.playerInfo = null;
        this.controller?.onPlayerInfoClosed();
      },
      render: (body) => {
        const g = this.game;
        if (!g) return;
        const p = g.players.get(playerId);
        const ch = this.characters.find((c) => c.id === p.characterId);
        const owned = g.property.ownedBy(p.id);
        const b = g.property.countBuildings(p.id);
        body.innerHTML = `
          <div class="pi-head" style="--pc:${p.color}">
            <img src="${this.thumbs[p.characterId] || ''}" alt="">
            <div><h3>${esc(p.name)} ${p.isAI ? '<span class="tag">MÁY</span>' : ''}</h3><small>${esc(ch?.title || '')} — ${esc(ch?.description || '')}</small></div>
          </div>
          <table class="kv">
            <tr><th>Tiền mặt</th><td><b>${money(p.money)}</b></td></tr>
            <tr><th>Tổng tài sản</th><td>${money(g.property.netWorth(p))}</td></tr>
            <tr><th>Vị trí</th><td>${esc(g.board.getTile(p.position).name)} (ô ${p.position})</td></tr>
            <tr><th>Trạng thái</th><td>${p.bankrupt ? '<b class="bad">Phá sản</b>' : p.inJail ? `Trong tù (${p.jailTurns}/${MAX_JAIL_TURNS})` : 'Đang chơi'}</td></tr>
            <tr><th>Công trình</th><td>${b.houses} nhà, ${b.hotels} khách sạn</td></tr>
            <tr><th>Thẻ ra tù</th><td>${p.jailCards.length}</td></tr>
            <tr><th>Mô hình 3D</th><td>${this.controller?.characterSource(p.id) === 'glb' ? '3D GLB' : this.controller?.characterSource(p.id) === 'toon' ? '3D Hoạt hình' : '<b class="bad">Mô hình tạm (chưa có GLB)</b>'}</td></tr>
          </table>
          <h4>Tài sản (${owned.length})</h4>
          <div class="owned-list">${owned.length ? owned.map((t) => `<button class="owned" data-tile="${t.id}" style="--tc:${tileColor(t)}"><i></i>${esc(t.name)}${t.mortgaged ? ' <small class="bad">(thế chấp)</small>' : ''}${t.hotel ? ' 🏨' : t.houses ? ` ${'🏠'.repeat(t.houses)}` : ''}</button>`).join('') : '<p class="empty">Chưa sở hữu ô nào.</p>'}</div>`;
        body.querySelectorAll('[data-tile]').forEach((el) => {
          el.onclick = () => this.controller?.selectTile(Number(el.dataset.tile));
        });
      },
    });
  }

  showCard(card, kind, ms = 2800) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop card-backdrop';
      backdrop.innerHTML = `<div class="game-card ${kind}">
          <div class="gc-title">${DECK_TITLES[kind]}</div>
          <div class="gc-icon">${kind === 'chance' ? '?' : '★'}</div>
          <p>${esc(card.text)}</p>
          <div class="gc-timer"><i style="animation-duration:${ms}ms"></i></div>
          <small>Nhấn để tiếp tục</small>
        </div>`;
      this.el.modalRoot.appendChild(backdrop);
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        backdrop.classList.add('closing');
        setTimeout(() => backdrop.remove(), 200);
        resolve();
      };
      backdrop.addEventListener('click', close);
      setTimeout(close, ms);
    });
  }

  showGameOver({ winner, ranking }) {
    const g = this.game;
    if (!g) return;
    this.el.modalRoot.querySelectorAll('.gameover-modal').forEach((m) => m.parentElement.remove());
    const modal = this.openModal({
      title: '🏁 Kết thúc ván đấu',
      className: 'gameover-modal',
      render: (body) => {
        body.innerHTML = `
          ${winner ? `<div class="winner" style="--pc:${winner.color}"><img src="${this.thumbs[winner.characterId] || ''}" alt=""><div><small>Người chiến thắng</small><h3>${esc(winner.name)}</h3><span>Tổng tài sản ${money(g.property.netWorth(winner))}</span></div></div>` : ''}
          ${this._rankingTable(g, ranking)}
          <div class="modal-actions">
            <button class="btn" data-a="view">Xem bàn cờ</button>
            <button class="btn btn-primary" data-a="new">${this.controller?.isMyTurn ? 'Về phòng (xem phần thưởng)' : 'Ván mới'}</button>
          </div>`;
        body.querySelector('[data-a="view"]').onclick = () => modal.close();
        body.querySelector('[data-a="new"]').onclick = () => {
          modal.close();
          this.controller?.newGame();
        };
      },
    });
  }

  confirmNewGame() {
    if (!this.controller) return;
    const online = !!this.controller.isMyTurn;
    const over = this.game?.over;
    const modal = this.openModal({
      title: online ? (over ? 'Về phòng chơi?' : 'Rời ván đấu?') : 'Bắt đầu ván mới?',
      className: 'confirm-modal',
      render: (body) => {
        body.innerHTML = `<p>${online
          ? (over ? 'Xem kết quả và phần thưởng trong phòng chơi.' : 'Nhân vật của bạn vẫn ở lại bàn cờ và <b>máy sẽ chơi thay</b>. Bạn có thể quay lại ván từ sảnh chờ.')
          : 'Ván đấu hiện tại sẽ kết thúc và không được lưu.'}</p>
          <div class="modal-actions"><button class="btn" data-a="no">Tiếp tục chơi</button><button class="btn btn-primary" data-a="yes">${online ? (over ? 'Về phòng' : 'Rời ván') : 'Về menu'}</button></div>`;
        body.querySelector('[data-a="no"]').onclick = () => modal.close();
        body.querySelector('[data-a="yes"]').onclick = () => {
          modal.close();
          this.controller?.newGame();
        };
      },
    });
  }

  // Thẻ thông tin ô vừa đến: hiện cho mọi người chơi, tự ẩn, không chặn thao tác.
  showLandingInfo(player, tile) {
    const g = this.game;
    if (!g) return;
    const prop = g.property;
    const owner = tile.owner !== null ? g.players.get(tile.owner) : null;
    let line = '';
    let kind = 'info';
    if (prop.isOwnable(tile)) {
      if (!owner) {
        line = player.money >= tile.price ? `Chưa có chủ · Giá <b>${money(tile.price)}</b>` : `Chưa có chủ · Giá ${money(tile.price)} (không đủ tiền)`;
        kind = 'buy';
      } else if (owner.id === player.id) {
        line = 'Đất của chính mình';
      } else if (tile.mortgaged) {
        line = `Của ${esc(owner.name)} · đang thế chấp, miễn tiền thuê`;
      } else {
        const dice = g.lastDice ? g.lastDice[0] + g.lastDice[1] : 7;
        line = `Của <b style="color:${owner.color}">${esc(owner.name)}</b> · Tiền thuê <b>${money(prop.calculateRent(tile, { diceTotal: dice }))}</b>`;
        kind = 'rent';
      }
    } else if (tile.type === T.TAX) {
      line = `Nộp <b>${money(tile.amount)}</b> cho ngân hàng`;
      kind = 'rent';
    } else {
      line = esc(tile.description || TILE_TYPE_LABELS[tile.type]);
    }
    this.el.landing?.remove();
    const el = document.createElement('div');
    el.className = `landing-card ${kind}`;
    el.style.setProperty('--tc', tileColor(tile));
    el.style.setProperty('--pc', player.color);
    el.innerHTML = `<i class="band"></i><img src="${this.thumbs[player.characterId] || ''}" alt="">
      <div><small>${esc(player.name)} đến ô</small><b>${esc(tile.name)}</b><span>${line}</span></div>`;
    el.onclick = () => this.controller?.selectTile(tile.id);
    this.el.hud.appendChild(el);
    this.el.landing = el;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  // ------------------------------------------------------------ feedback
  toast(message, type = 'info', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    this.el.toastRoot.appendChild(el);
    while (this.el.toastRoot.children.length > 4) this.el.toastRoot.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  announce(text, kind = '') {
    const b = this.el.banner;
    b.className = `banner show ${kind}`;
    b.innerHTML = esc(text);
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.remove('show'), 1700);
  }

  announceTurn(player) {
    const b = this.el.banner;
    b.className = 'banner show';
    b.style.setProperty('--pc', player.color);
    b.innerHTML = `<img src="${this.thumbs[player.characterId] || ''}" alt=""> Lượt của <b>${esc(player.name)}</b>`;
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.remove('show'), 1500);
  }

  floatText(worldPos, text, kind = '') {
    if (!this.projector) return;
    const s = this.projector(worldPos);
    if (!s.visible) return;
    const el = document.createElement('div');
    el.className = `float-text ${kind}`;
    el.textContent = text;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    this.el.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  appendLog(entry) {
    const li = document.createElement('li');
    li.className = `log-${entry.kind}`;
    li.innerHTML = `<span class="lt">V${entry.round}</span>${esc(entry.text)}`;
    this.el.logList.prepend(li);
    while (this.el.logList.children.length > 150) this.el.logList.lastChild.remove();
  }

  appendTx(tx) {
    const g = this.game;
    if (!g) return;
    const name = (id) => (id === null ? 'Ngân hàng' : esc(g.players.get(id)?.name || '?'));
    const li = document.createElement('li');
    li.innerHTML = `<span class="tx-flow">${name(tx.from)} → ${name(tx.to)}</span><b>${money(tx.amount)}</b><small>${esc(tx.reason)}</small>`;
    this.el.txList.prepend(li);
    while (this.el.txList.children.length > 150) this.el.txList.lastChild.remove();
  }
}
