// Kiểm thử máy chủ multiplayer (không cần trình duyệt):
//   node tests/online-server-test.mjs
// Hai "thiết bị" kết nối qua SSE + HTTP như trình duyệt thật. Mỗi thiết bị giữ một GameManager riêng
// và chỉ áp dụng chuỗi hành động máy chủ phát xuống. Kiểm tra:
// - tạo / tham gia phòng bằng mã, thêm máy, sẵn sàng, bắt đầu;
// - máy chủ từ chối hành động sai lượt, sai trạng thái (seq cũ), hành động không hợp lệ;
// - sau MỖI hành động, trạng thái game của hai thiết bị và của máy chủ trùng khớp tuyệt đối;
// - máy chơi thay khi người chơi hết giờ; ván kết thúc, có thưởng hồ sơ.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameManager } from '../src/game/GameManager.js';
import { applyAction, nextAIAction } from '../src/game/OnlineProtocol.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 5231;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [join(ROOT, 'server.js'), String(PORT)], {
  stdio: 'ignore',
  env: { ...process.env, DATA_FILE: join(mkdtempSync(join(tmpdir(), 'ctp-data-')), 'profiles.json'), AI_DELAY_MS: '30', TURN_TIMEOUT_MS: '1500' },
});

async function post(token, cmd, data = {}) {
  const r = await fetch(`${BASE}/api/cmd`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': token || '' }, body: JSON.stringify({ cmd, ...data }) });
  return r.json();
}

// Thiết bị giả lập: SSE + bản game cục bộ.
async function device(name) {
  const hello = await post(null, 'hello', { name });
  const d = { name, token: hello.token, profile: hello.profile, events: [], game: null, seat: null, applied: 0, queue: Promise.resolve(), errors: [] };
  const res = await fetch(`${BASE}/api/stream?token=${d.token}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (ev && data) d.onEvent(ev, JSON.parse(data));
      }
    }
  })().catch(() => {});
  d.reader = reader;
  d.onEvent = (ev, data) => {
    d.events.push({ ev, data });
    if (ev === 'room') d.room = data;
    if (ev === 'gameStart') {
      d.game = new GameManager({ players: data.players, startMoney: data.settings.startMoney, maxRounds: data.settings.maxRounds, seed: data.seed, autoAI: false });
      d.seat = d.room.seats.findIndex((s) => s.id === d.profile.id);
      d.queue = d.game.start();
    }
    if (ev === 'action') {
      d.queue = d.queue.then(async () => {
        if (data.seq !== d.applied + 1) d.errors.push(`nhận seq ${data.seq}, chờ ${d.applied + 1}`);
        const r = await applyAction(d.game, data.action);
        if (!r.ok) d.errors.push(`seq ${data.seq} ${data.action.type}: ${r.reason}`);
        d.applied = data.seq;
        await post(d.token, 'ack', { seq: data.seq });
      });
    }
  };
  await sleep(150);
  return d;
}

const snapshot = (g) => JSON.stringify({
  players: g.players.list.map((p) => [p.money, p.position, p.inJail, p.bankrupt, p.jailCards.length]),
  tiles: g.board.tiles.map((t) => [t.owner, t.houses, t.hotel, t.mortgaged]),
  turn: [g.turn.index, g.turn.round, g.phase, g.over, g.winner?.id ?? null],
});

try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { await sleep(150); }
  }
  const forbidden = await fetch(`${BASE}/server/Hub.js`);
  const forbiddenData = await fetch(`${BASE}/data/profiles.json`);
  check(forbidden.status === 403 && forbiddenData.status === 403, 'Mã máy chủ và dữ liệu hồ sơ không bị phục vụ công khai', `${forbidden.status}/${forbiddenData.status}`);

  const A = await device('An');
  const B = await device('Bình');
  check(!!A.token && !!B.token && A.profile.id !== B.profile.id, 'Tạo 2 tài khoản khách');
  const lobby = A.events.find((e) => e.ev === 'welcome')?.data.lobby;
  check(lobby && lobby.online.length >= 1, 'Nhận danh sách người chơi online qua SSE', `${lobby?.online.length} người`);

  const created = await post(A.token, 'createRoom', { isPublic: false });
  const code = created.room.code;
  check(/^[A-Z2-9]{5}$/.test(code), 'Tạo phòng, có mã phòng', code);
  const inv = await post(A.token, 'invite', { to: B.profile.id });
  await sleep(200);
  check(inv.ok && B.events.some((e) => e.ev === 'invite' && e.data.code === code), 'Mời bạn: người được mời nhận lời mời có mã phòng');
  const bad = await post(B.token, 'joinRoom', { code: 'ZZZZZ' });
  check(!bad.ok && /Không tìm thấy/.test(bad.error), 'Mã phòng sai bị báo lỗi', bad.error);
  const joined = await post(B.token, 'joinRoom', { code });
  check(joined.ok && joined.room.seats.length === 2, 'Người thứ hai tham gia bằng mã phòng');
  const dup = await post(B.token, 'setSeat', { characterId: joined.room.seats[0].characterId });
  check(!dup.ok, 'Không thể chọn nhân vật đã có người chọn', dup.error);
  await post(A.token, 'addBot');
  const early = await post(A.token, 'startGame');
  check(!early.ok && /sẵn sàng/.test(early.error), 'Chủ phòng không bắt đầu được khi còn người chưa sẵn sàng', early.error);
  const notHost = await post(B.token, 'startGame');
  check(!notHost.ok, 'Người không phải chủ phòng không bắt đầu được');
  await post(B.token, 'setSeat', { ready: true });
  await post(A.token, 'setSettings', { maxRounds: 50 });
  const started = await post(A.token, 'startGame');
  check(started.ok, 'Bắt đầu ván 3 người (2 người thật + 1 máy)');
  await sleep(300);
  check(A.game && B.game && A.seat === 0 && B.seat === 1, 'Cả hai thiết bị nhận lệnh bắt đầu với cùng seed');

  // Thiết bị B thử đi khi chưa đến lượt.
  const wrong = await post(B.token, 'action', { action: { type: 'roll' }, seq: 0 });
  check(!wrong.ok && /lượt/.test(wrong.error), 'Máy chủ từ chối hành động sai lượt', wrong.error);
  const stale = await post(A.token, 'action', { action: { type: 'roll' }, seq: 5 });
  check(!stale.ok && stale.error.includes('thay đổi'), 'Máy chủ từ chối hành động dựa trên trạng thái cũ (seq)', stale.error);
  const invalid = await post(A.token, 'action', { action: { type: 'cheat' }, seq: 0 });
  check(!invalid.ok, 'Máy chủ từ chối hành động không hợp lệ', invalid.error);

  // Chơi: mỗi thiết bị tự quyết định (dùng chiến lược máy) khi đến lượt mình trên bản game cục bộ.
  let mismatches = 0;
  let compared = 0;
  let timeoutTested = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    await Promise.all([A.queue, B.queue]);
    if (A.applied !== B.applied) { await sleep(20); continue; }
    if (A.game.over) break;
    const sa = snapshot(A.game);
    compared++;
    if (sa !== snapshot(B.game)) mismatches++;
    const cur = A.game.currentPlayer.id;
    const dev = [A, B].find((d) => d.seat === cur);
    if (dev && !A.game.busy) {
      if (!timeoutTested && dev === B && A.applied > 6) {
        // Bỏ lượt để máy chủ tự chơi thay sau TURN_TIMEOUT_MS.
        timeoutTested = true;
        const before = B.applied;
        await sleep(2200);
        check(B.applied > before && B.events.some((e) => e.ev === 'action' && e.data.auto === 'timeout'), 'Hết giờ: máy chủ tự chơi thay người chơi', `seq ${before} → ${B.applied}`);
        continue;
      }
      const action = nextAIAction(dev.game);
      if (action) {
        const r = await post(dev.token, 'action', { action, seq: dev.applied });
        if (!r.ok && !/thay đổi/.test(r.error || r.reason)) dev.errors.push(`${action.type}: ${r.error || r.reason}`);
      }
    }
    await sleep(15);
  }
  await Promise.all([A.queue, B.queue]);
  check(A.game.over && B.game.over, 'Ván đấu kết thúc trên cả hai thiết bị', `${A.applied} hành động, ${A.game.turn.round - 1} vòng`);
  check(compared > 50 && mismatches === 0, 'Trạng thái hai thiết bị trùng khớp sau mọi hành động', `${compared} lần so sánh, ${mismatches} sai khác`);
  const sync = await post(A.token, 'sync');
  const mirror = new GameManager({ players: sync.game.players, startMoney: sync.game.settings.startMoney, maxRounds: sync.game.settings.maxRounds, seed: sync.game.seed, autoAI: false });
  await mirror.start();
  for (const e of sync.game.actions) await applyAction(mirror, e.action);
  check(snapshot(mirror) === snapshot(A.game), 'Người vào lại phát lại toàn bộ hành động (sync) ra đúng trạng thái');
  const types = {};
  for (const e of sync.game.actions) types[e.action.type] = (types[e.action.type] || 0) + 1;
  const rents = A.game.bank.transactions.filter((t) => /^Thuê /.test(t.reason)).length;
  const rentsB = B.game.bank.transactions.filter((t) => /^Thuê /.test(t.reason)).length;
  console.log(`   Hành động: ${JSON.stringify(types)}, trả thuê: ${rents}`);
  check(types.roll > 0 && types.buy > 0 && types.end > 0, 'Online: tung xúc xắc, mua đất, kết thúc lượt qua máy chủ');
  check(rents > 0 && rents === rentsB, 'Online: trả tiền thuê giữa người chơi, giống nhau trên hai thiết bị', `${rents} lần`);
  // Xây nhà cần một người gom đủ nhóm màu — phụ thuộc xúc xắc ngẫu nhiên, nên không bắt buộc (tránh CI lỗi ngẫu nhiên).
  if (types.build) check(true, 'Online: xây nhà qua máy chủ', `${types.build} lần`);
  else console.log('ℹ Ván này không ai đủ nhóm màu nên không có lượt xây nhà (luật xây nhà được kiểm tra trong npm test).');
  check(A.errors.length === 0 && B.errors.length === 0, 'Không có lỗi áp dụng hành động / sai thứ tự', [...A.errors, ...B.errors].slice(0, 3).join(' | '));
  await sleep(300);
  const over = A.events.find((e) => e.ev === 'gameOver')?.data;
  const prof = A.events.filter((e) => e.ev === 'profile').pop()?.data;
  check(!!over && over.ranking.length === 3 && over.ranking.find((r) => r.seat === 0).reward?.xp > 0, 'Kết quả ván + thưởng XP/xu cho người chơi thật', over && `người thắng: ${over.ranking[0].name}`);
  check(prof && prof.games === 1 && prof.achievements.includes('firstGame'), 'Hồ sơ được cập nhật (số ván, thành tích)', prof && `cấp ${prof.level}, ${prof.coins} xu`);
  const back = await post(A.token, 'backToRoom');
  check(back.ok && back.room.state === 'waiting', 'Chủ phòng đưa phòng về trạng thái chờ để chơi tiếp');
  A.reader.cancel();
  B.reader.cancel();
} catch (err) {
  check(false, `Lỗi: ${err.stack || err.message}`);
} finally {
  server.kill();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${failed ? '✘' : '✔'} ${results.length - failed}/${results.length} kiểm tra đạt.`);
process.exit(failed ? 1 : 0);
