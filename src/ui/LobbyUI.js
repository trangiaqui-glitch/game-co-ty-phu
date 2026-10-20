const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const num = (n) => Math.round(n).toLocaleString('vi-VN');

export const ACHIEVEMENT_INFO = {
  firstGame: { icon: '🎲', name: 'Ván đầu tiên', desc: 'Hoàn thành một ván online' },
  firstWin: { icon: '🏆', name: 'Chiến thắng đầu tiên', desc: 'Thắng một ván online' },
  tycoon: { icon: '💰', name: 'Tỷ phú', desc: 'Kết thúc ván với tổng tài sản từ $5,000' },
  landlord: { icon: '🏘️', name: 'Đại địa chủ', desc: 'Sở hữu từ 8 ô đất khi kết thúc ván' },
  veteran: { icon: '⭐', name: 'Lão làng', desc: 'Chơi 10 ván online' },
};
const STATUS_TEXT = { lobby: 'Ở sảnh', room: 'Trong phòng', playing: 'Đang chơi' };

/**
 * Màn hình sảnh chờ, phòng chơi và chọn nhân vật. Mọi nút đều gọi lệnh thật lên máy chủ;
 * giao diện được vẽ lại từ trạng thái máy chủ gửi về (không tự giả lập).
 */
export class LobbyUI {
  constructor({ ui, net, characters, modelStatus, preview }) {
    this.ui = ui;
    this.net = net;
    this.characters = characters;
    this.modelStatus = modelStatus;
    this.preview = preview;
    this.lobby = { online: [], rooms: [] };
    this.room = null;
    this.available = true;
    this.on = {}; // onOffline, onRejoin
    this.el = {
      lobby: $('#lobby'),
      room: $('#room-screen'),
    };
    this._bind();
  }

  get me() {
    return this.net.profile;
  }

  thumb(id) {
    return this.ui.thumbs[id] || '';
  }

  character(id) {
    return this.characters.find((c) => c.id === id) || this.characters[0];
  }

  async _run(promise, okText) {
    const r = await promise;
    if (!r.ok) this.ui.toast(r.error || r.reason || 'Không thực hiện được', 'warn', 3500);
    else if (okText) this.ui.toast(okText, 'good', 2200);
    return r;
  }

  // ------------------------------------------------------------ bindings
  _bind() {
    $('#btn-quick').onclick = async () => {
      if (!this._requireOnline()) return;
      const r = await this._run(this.net.cmd('quickPlay'));
      if (r.ok) this.ui.toast(r.room.seats.length > 1 ? `Đã ghép vào phòng ${r.room.code}` : `Đã tạo phòng công khai ${r.room.code}, đang chờ người chơi khác...`, 'info', 3500);
    };
    $('#btn-create').onclick = () => this._requireOnline() && this._run(this.net.cmd('createRoom', { isPublic: false }));
    $('#btn-join').onclick = () => {
      if (!this._requireOnline()) return;
      $('#join-form').classList.toggle('hidden');
      $('#join-code').focus();
    };
    $('#join-form').onsubmit = (e) => {
      e.preventDefault();
      const code = $('#join-code').value.trim().toUpperCase();
      if (code.length < 4) {
        this.ui.toast('Nhập mã phòng gồm 5 ký tự', 'warn');
        return;
      }
      this.joinRoom(code);
    };
    $('#btn-offline').onclick = () => this.on.onOffline?.();
    $('#btn-choose-char').onclick = () => this.openCharacterPicker({
      current: this.me?.characterId,
      onPick: (id) => this._run(this.net.cmd('profile', { characterId: id })).then((r) => r.ok && this.renderProfile()),
    });
    const name = $('#lp-name');
    name.onchange = async () => {
      const r = await this._run(this.net.cmd('profile', { name: name.value }), 'Đã đổi tên');
      if (!r.ok) name.value = this.me?.name || '';
    };
    $('#lobby-online-list').onclick = (e) => {
      const b = e.target.closest('[data-join]');
      if (b) this.joinRoom(b.dataset.join);
    };
    $('#lobby-room-list').onclick = (e) => {
      const b = e.target.closest('[data-join]');
      if (b) this.joinRoom(b.dataset.join);
    };

    // Phòng chơi
    $('#btn-room-leave').onclick = () => this._run(this.net.cmd('leaveRoom'));
    $('#btn-copy-link').onclick = () => this.copyInvite();
    $('#btn-ready').onclick = () => {
      const seat = this.mySeat();
      if (seat) this._run(this.net.cmd('setSeat', { ready: !seat.ready }));
    };
    $('#btn-room-start').onclick = () => this._run(this.net.cmd('startGame'));
    $('#room-money').onchange = (e) => this._run(this.net.cmd('setSettings', { startMoney: Number(e.target.value) }));
    $('#room-rounds').onchange = (e) => this._run(this.net.cmd('setSettings', { maxRounds: Number(e.target.value) }));
    $('#room-public').onchange = (e) => this._run(this.net.cmd('setSettings', { isPublic: e.target.checked }));
    $('#room-seats').onclick = (e) => {
      const add = e.target.closest('[data-add-bot]');
      const rm = e.target.closest('[data-remove-bot]');
      const pick = e.target.closest('[data-pick-char]');
      if (add) this._run(this.net.cmd('addBot'));
      else if (rm) this._run(this.net.cmd('removeBot', { index: Number(rm.dataset.removeBot) }));
      else if (pick) {
        const taken = new Set(this.room.seats.filter((s) => s.id !== this.me.id).map((s) => s.characterId));
        this.openCharacterPicker({
          current: this.mySeat()?.characterId,
          taken,
          onPick: (id) => this._run(this.net.cmd('setSeat', { characterId: id })),
        });
      }
    };
    $('#invite-list').onclick = (e) => {
      const b = e.target.closest('[data-invite]');
      if (b) this._run(this.net.cmd('invite', { to: b.dataset.invite }), `Đã gửi lời mời tới ${b.dataset.name}`);
    };
    $('#room-result').onclick = (e) => {
      const a = e.target.closest('[data-result]')?.dataset.result;
      if (a === 'again') this._run(this.net.cmd('backToRoom'));
      else if (a === 'lobby') this._run(this.net.cmd('leaveRoom'));
    };
  }

  _requireOnline() {
    if (this.available && this.net.status !== 'offline') return true;
    this.ui.toast('Máy chủ online chưa sẵn sàng. Bạn vẫn có thể chơi với máy.', 'warn', 3500);
    return false;
  }

  async joinRoom(code) {
    const r = await this._run(this.net.cmd('joinRoom', { code }));
    if (r.ok) $('#join-form').classList.add('hidden');
    return r;
  }

  inviteLink(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  async copyInvite() {
    if (!this.room) return;
    const link = this.inviteLink(this.room.code);
    try {
      await navigator.clipboard.writeText(link);
      this.ui.toast('Đã sao chép link mời. Gửi cho bạn bè để vào thẳng phòng!', 'good', 3000);
    } catch {
      // Trình duyệt chặn clipboard (http không bảo mật): hiển thị để sao chép thủ công.
      const m = this.ui.openModal({
        title: '🔗 Link mời vào phòng',
        className: 'confirm-modal',
        render: (body) => {
          body.innerHTML = `<p>Gửi link hoặc mã phòng <b class="code-big">${esc(this.room.code)}</b> cho bạn bè:</p><input class="link-input" readonly value="${esc(link)}">
            <div class="modal-actions"><button class="btn btn-primary" data-ok>Đóng</button></div>`;
          const input = body.querySelector('input');
          input.focus();
          input.select();
          body.querySelector('[data-ok]').onclick = () => m.close();
        },
      });
    }
  }

  // ------------------------------------------------------------ lobby
  showLobby() {
    this.el.room.classList.add('hidden');
    this.el.lobby.classList.remove('hidden');
    this.renderProfile();
    this.renderLobby();
    this.preview?.start();
  }

  hideAll() {
    this.el.lobby.classList.add('hidden');
    this.el.room.classList.add('hidden');
    this.preview?.stop();
  }

  setAvailable(ok) {
    this.available = ok;
    $('#lobby-offline-note').classList.toggle('hidden', ok);
    for (const id of ['#btn-quick', '#btn-create', '#btn-join']) $(id).classList.toggle('disabled', !ok);
  }

  setNetStatus(status) {
    const el = $('#net-status');
    el.className = `net-pill ${status}`;
    el.textContent = { online: '● Online', connecting: '● Đang kết nối...', offline: '● Offline' }[status] || status;
  }

  renderProfile() {
    const p = this.me;
    if (!p) {
      $('#lp-name').value = '';
      return;
    }
    const ch = this.character(p.characterId);
    if (document.activeElement !== $('#lp-name')) $('#lp-name').value = p.name;
    $('#lp-level').textContent = p.level;
    $('#lp-coins').textContent = num(p.coins);
    const span = Math.max(1, p.nextLevelXp - p.levelXp);
    $('#lp-xp').style.width = `${Math.min(100, ((p.xp - p.levelXp) / span) * 100)}%`;
    $('#lp-xp-text').textContent = `Cấp ${p.level} · ${num(p.xp - p.levelXp)}/${num(span)} XP`;
    $('#lp-games').textContent = p.games;
    $('#lp-wins').textContent = p.wins;
    $('#lp-rate').textContent = p.games ? `${Math.round((p.wins / p.games) * 100)}%` : '–';
    $('#lp-char').textContent = `${ch.title} · ${ch.name}`;
    $('#lp-achievements').innerHTML = Object.entries(ACHIEVEMENT_INFO).map(([k, a]) => {
      const has = p.achievements.includes(k);
      return `<span class="ach ${has ? 'has' : ''}" title="${esc(a.name)}: ${esc(a.desc)}${has ? ' (đã đạt)' : ' (chưa đạt)'}">${a.icon}</span>`;
    }).join('');
    this.preview?.setCharacter(ch.id, ch.color, { celebrate: false });
  }

  renderLobby(view = this.lobby) {
    this.lobby = view;
    const others = view.online.filter((o) => o.id !== this.me?.id);
    $('#online-count').textContent = `(${view.online.length})`;
    $('#lobby-online-list').innerHTML = others.length ? others.map((o) => `
      <li><img src="${this.thumb(o.characterId)}" alt=""><span class="who"><b>${esc(o.name)}</b><small>Cấp ${o.level} · ${STATUS_TEXT[o.status]}</small></span>
        ${o.roomCode ? `<button class="btn btn-small" data-join="${o.roomCode}">Vào cùng</button>` : `<i class="dot ${o.status}"></i>`}</li>`).join('')
      : '<li class="empty">Chưa có ai khác online. Gửi link cho bạn bè hoặc mở thêm thiết bị!</li>';
    $('#lobby-room-list').innerHTML = view.rooms.length ? view.rooms.map((r) => `
      <li><span class="room-tag">${esc(r.code)}</span><span class="who"><b>Phòng của ${esc(r.host)}</b><small>${r.count}/${r.max} người</small></span>
        <button class="btn btn-small btn-primary" data-join="${r.code}">Vào</button></li>`).join('')
      : '<li class="empty">Chưa có phòng công khai. Nhấn <b>Chơi ngay</b> để tạo!</li>';
    if (this.room) this._renderInvites();
  }

  showRejoin(room) {
    const box = $('#rejoin');
    if (!room || room.state !== 'playing') {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `<span>⚡ Bạn đang có ván dở ở phòng <b>${esc(room.code)}</b></span><button class="btn btn-small btn-primary" data-rejoin>Quay lại ván</button>`;
    box.querySelector('[data-rejoin]').onclick = () => this.on.onRejoin?.(room.code);
  }

  // ------------------------------------------------------------ room
  mySeat() {
    return this.room?.seats.find((s) => s.id === this.me?.id) || null;
  }

  showRoom(room) {
    this.room = room;
    this.el.lobby.classList.add('hidden');
    this.el.room.classList.remove('hidden');
    this.preview?.stop();
    this.renderRoom();
  }

  leaveRoomView() {
    this.room = null;
  }

  renderRoom() {
    const room = this.room;
    if (!room) return;
    const me = this.mySeat();
    const host = room.hostId === this.me?.id;
    $('#room-code').textContent = room.code;
    $('#room-visibility').textContent = room.isPublic ? '🌐 Công khai' : '🔒 Riêng tư';
    const seats = [];
    for (let i = 0; i < 4; i++) {
      const s = room.seats[i];
      if (!s) {
        seats.push(`<div class="seat empty"><div class="seat-avatar">＋</div><b>Ghế trống</b>
          ${host && room.state === 'waiting' ? '<button class="btn btn-small" data-add-bot>🤖 Thêm máy</button>' : '<small>Đang chờ người chơi...</small>'}</div>`);
        continue;
      }
      const ch = this.character(s.characterId);
      const glb = this.modelStatus?.(ch.id)?.status === 'loaded';
      const mine = s.id && s.id === this.me?.id;
      const badges = [
        s.id === room.hostId ? '<span class="tag host">👑 Chủ phòng</span>' : '',
        s.bot ? '<span class="tag">🤖 Máy</span>' : '',
        mine ? '<span class="tag you">Bạn</span>' : '',
        !s.bot && !s.online ? '<span class="tag off">Mất kết nối</span>' : '',
        glb ? '' : '<span class="tag tmp" title="Chưa có file GLB, dùng mô hình tạm">TẠM</span>',
      ].join('');
      seats.push(`<div class="seat ${mine ? 'mine' : ''} ${s.ready ? 'ready' : ''}" style="--pc:${ch.color}">
        <div class="seat-avatar"><img src="${this.thumb(ch.id)}" alt=""></div>
        <b class="seat-name">${esc(s.name)}</b><small>${esc(ch.title)}${s.level ? ` · Cấp ${s.level}` : ''}</small>
        <div class="seat-tags">${badges}</div>
        <div class="seat-state">${s.ready ? '✅ Sẵn sàng' : '⏳ Chưa sẵn sàng'}</div>
        ${mine && room.state === 'waiting' ? '<button class="btn btn-small" data-pick-char>👕 Đổi nhân vật</button>' : ''}
        ${s.bot && host && room.state === 'waiting' ? `<button class="btn btn-small btn-ghost" data-remove-bot="${i}">Bỏ máy</button>` : ''}
      </div>`);
    }
    $('#room-seats').innerHTML = seats.join('');

    const waiting = room.state === 'waiting';
    for (const id of ['#room-money', '#room-rounds', '#room-public']) $(id).disabled = !host || !waiting;
    $('#room-money').value = String(room.settings.startMoney);
    $('#room-rounds').value = String(room.settings.maxRounds);
    $('#room-public').checked = room.isPublic;

    const ready = $('#btn-ready');
    ready.classList.toggle('hidden', host || !waiting);
    ready.textContent = me?.ready ? '↩ Huỷ sẵn sàng' : '✋ Sẵn sàng';
    ready.classList.toggle('btn-primary', !me?.ready);
    const start = $('#btn-room-start');
    start.classList.toggle('hidden', !host || !waiting);
    const notReady = room.seats.filter((s) => !s.ready);
    const canStart = room.seats.length >= 2 && !notReady.length && room.seats.every((s) => s.online);
    start.disabled = !canStart;
    $('#room-hint').textContent = !waiting ? ''
      : room.seats.length < 2 ? 'Cần ít nhất 2 người chơi. Mời bạn bè, chờ ghép trận hoặc thêm máy.'
        : notReady.length ? `Đang chờ sẵn sàng: ${notReady.map((s) => s.name).join(', ')}`
          : host ? 'Mọi người đã sẵn sàng — nhấn Bắt đầu!' : 'Đang chờ chủ phòng bắt đầu...';
    $('#room-playing').classList.toggle('hidden', room.state !== 'playing');
    this._renderInvites();
    this._renderResult();
  }

  _renderInvites() {
    const room = this.room;
    const inRoom = new Set(room.seats.map((s) => s.id));
    const list = this.lobby.online.filter((o) => o.id !== this.me?.id && !inRoom.has(o.id));
    $('#invite-list').innerHTML = list.length ? list.map((o) => `
      <li><img src="${this.thumb(o.characterId)}" alt=""><span class="who"><b>${esc(o.name)}</b><small>${STATUS_TEXT[o.status]}</small></span>
        <button class="btn btn-small" data-invite="${o.id}" data-name="${esc(o.name)}" ${o.status === 'playing' || room.state !== 'waiting' ? 'disabled' : ''}>Mời</button></li>`).join('')
      : '<li class="empty">Không có ai khác online. Dùng nút “Sao chép link mời”.</li>';
  }

  _renderResult() {
    const box = $('#room-result');
    const r = this.room.result;
    if (this.room.state !== 'finished' || !r) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<h3>🏁 Kết quả ván đấu</h3>
      <table class="ranking"><thead><tr><th>#</th><th>Người chơi</th><th>Tài sản</th><th>Đất</th><th>Thưởng</th></tr></thead><tbody>
      ${r.ranking.map((p, i) => `<tr class="${p.bankrupt ? 'bankrupt' : ''}"><td class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</td>
        <td class="who"><img src="${this.thumb(p.characterId)}" alt=""><span>${esc(p.name)}${p.bot ? ' 🤖' : ''}</span></td>
        <td>${money(p.netWorth)}</td><td>${p.tiles}</td>
        <td>${p.reward ? `+${p.reward.xp} XP · +${num(p.reward.coins)} 🪙${p.reward.levelUp ? ` · <b>Lên cấp ${p.reward.level}!</b>` : ''}${p.reward.unlocked.map((k) => ` ${ACHIEVEMENT_INFO[k]?.icon || ''}`).join('')}` : '–'}</td></tr>`).join('')}
      </tbody></table>
      <div class="modal-actions"><button class="btn" data-result="lobby">🏠 Về sảnh</button><button class="btn btn-primary" data-result="again">🔁 Chơi lại phòng này</button></div>`;
  }

  // ------------------------------------------------------------ character picker
  openCharacterPicker({ current, taken = new Set(), onPick }) {
    const modal = this.ui.openModal({
      title: '👕 Chọn nhân vật đại diện',
      className: 'char-modal',
      render: (body) => {
        body.innerHTML = `<div class="char-grid">${this.characters.map((c) => {
          const glb = this.modelStatus?.(c.id)?.status === 'loaded';
          const isTaken = taken.has(c.id);
          return `<button class="char-option ${c.id === current ? 'active' : ''}" data-char="${c.id}" style="--pc:${c.color}" ${isTaken ? 'disabled' : ''}>
            <div class="char-thumb-wrap"><img src="${this.thumb(c.id)}" alt=""></div>
            <b>${esc(c.name)}</b><small>${esc(c.title)}</small>
            <span class="char-desc">${esc(c.description || '')}</span>
            <div class="char-badges">${glb ? '<span class="tag glb">3D</span>' : '<span class="tag tmp">TẠM</span>'}${isTaken ? '<span class="tag off">Đã có người chọn</span>' : ''}</div>
          </button>`;
        }).join('')}</div>`;
        body.querySelectorAll('[data-char]').forEach((b) => {
          b.onclick = () => {
            modal.close();
            const ch = this.character(b.dataset.char);
            this.preview?.setCharacter(ch.id, ch.color);
            onPick(ch.id);
          };
        });
      },
    });
  }

  // ------------------------------------------------------------ invites
  showInvite({ from, code }) {
    const el = document.createElement('div');
    el.className = 'toast invite';
    el.innerHTML = `<span>📨 <b>${esc(from)}</b> mời bạn vào phòng <b>${esc(code)}</b></span>
      <button class="btn btn-small btn-primary" data-a="join">Vào phòng</button><button class="btn btn-small btn-ghost" data-a="no">Để sau</button>`;
    $('#toast-root').appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-a="join"]').onclick = () => {
      close();
      this.joinRoom(code);
    };
    el.querySelector('[data-a="no"]').onclick = close;
    setTimeout(close, 20000);
  }
}
