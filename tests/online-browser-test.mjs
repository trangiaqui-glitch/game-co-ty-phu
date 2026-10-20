// Kiểm thử multiplayer trên 2 trình duyệt thật (máy tính + điện thoại) dùng chung một máy chủ:
//   node tests/online-browser-test.mjs [thư-mục-ảnh]
// Mọi thao tác đều qua giao diện: sảnh -> tạo phòng -> mời bạn -> vào phòng -> sẵn sàng -> thêm máy -> bắt đầu
// -> tung xúc xắc / mua đất / kết thúc lượt. Sau mỗi bước so sánh trạng thái game của hai thiết bị.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, startServer } from './lib/cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] || join(tmpdir(), 'co-ty-phu-online-test'));
mkdirSync(OUT, { recursive: true });
const PORT = 5251;
const URL_ = `http://localhost:${PORT}/`;
const results = [];
const check = (ok, label, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const expected = (m) => /assets\/models\/characters\/\w+\.glb/.test(m.text) || /\[Animation\] Nhân vật .* thiếu clip/.test(m.text)
  || /Đồng bộ lại ván đấu: kết nối lại/.test(m.text);
const badConsole = (b) => b.console.filter((m) => ['error', 'warning', 'assert', 'exception', 'log-error'].includes(m.level) && !expected(m));

const SNAP = `(() => { const g = __coTyPhu.game; if (!g) return null; return JSON.stringify({
  p: g.players.list.map((p) => [p.name, p.money, p.position, p.inJail, p.bankrupt]),
  t: g.board.tiles.map((t) => [t.owner, t.houses, t.hotel, t.mortgaged]),
  turn: [g.turn.index, g.turn.round, g.phase, g.over] }); })()`;
const STATE = `(() => { const s = __coTyPhu.session; const g = __coTyPhu.game; return s && g ? { applied: s.applied, received: s.received, idle: s.idle, my: s.isMyTurn(), seat: s.seat,
  phase: g.phase, canRoll: g.canRoll(), canBuy: g.canBuy(), canEnd: g.canEndTurn(), over: g.over, cur: g.currentPlayer.id,
  rollDisabled: document.getElementById('btn-roll').disabled, buyDisabled: document.getElementById('btn-buy').disabled, endDisabled: document.getElementById('btn-end').disabled } : null; })()`;

const server = startServer(ROOT, PORT, { AI_DELAY_MS: '400', TURN_TIMEOUT_MS: '90000' });
let A;
let B;
try {
  A = await launch({ root: ROOT, port: PORT, debugPort: 9371, serve: false });
  B = await launch({ root: ROOT, port: PORT, debugPort: 9372, serve: false, width: 390, height: 844, mobile: true });
  await Promise.all([A, B].map((b) => b.send('Page.navigate', { url: URL_ })));
  await Promise.all([A, B].map((b) => b.waitFor(`!!document.querySelector('#lobby:not(.hidden)') && __coTyPhu.net?.status === 'online'`, 120000, 'sảnh')));
  check(true, 'Hai thiết bị vào sảnh chờ và kết nối máy chủ (Online)');

  // Đặt tên qua ô nhập trong sảnh
  for (const [b, name] of [[A, 'An'], [B, 'Bình']]) {
    await b.evaluate(`(() => { const i = document.getElementById('lp-name'); i.value = '${name}'; i.dispatchEvent(new Event('change')); return true; })()`);
  }
  await A.waitFor(`[...document.querySelectorAll('#lobby-online-list b')].some((x) => x.textContent === 'Bình')`, 10000, 'thấy Bình online');
  check(true, 'Danh sách người chơi online cập nhật realtime (máy tính thấy “Bình”)');
  const lobbyInfo = await B.evaluate(`({ name: document.getElementById('lp-name').value, level: document.getElementById('lp-level').textContent,
    coins: document.getElementById('lp-coins').textContent, canvas: document.getElementById('avatar-canvas').width > 0, ach: document.querySelectorAll('#lp-achievements .ach').length })`);
  check(lobbyInfo.name === 'Bình' && lobbyInfo.level === '1' && lobbyInfo.canvas && lobbyInfo.ach === 5, 'Sảnh hiển thị avatar 3D, tên, cấp độ, xu, thành tích', JSON.stringify(lobbyInfo));
  const noOverflow = await B.evaluate(`document.getElementById('lobby').scrollWidth <= innerWidth + 1`);
  check(noOverflow, 'Sảnh trên điện thoại không tràn ngang');
  await A.shot(OUT, 'O1-lobby-desktop');
  await B.shot(OUT, 'O1-lobby-phone');

  // Máy tính tạo phòng, mời điện thoại
  await A.evaluate(`document.getElementById('btn-create').click(); true`);
  await A.waitFor(`!!document.querySelector('#room-screen:not(.hidden)') && document.getElementById('room-code').textContent.length === 5`, 10000, 'phòng');
  const code = await A.evaluate(`document.getElementById('room-code').textContent`);
  check(/^[A-Z2-9]{5}$/.test(code), 'Tạo phòng, hiển thị mã phòng', code);
  await A.waitFor(`!!document.querySelector('#invite-list [data-invite]')`, 10000, 'danh sách mời');
  await A.evaluate(`document.querySelector('#invite-list [data-invite]').click(); true`);
  await B.waitFor(`!!document.querySelector('.toast.invite [data-a="join"]')`, 10000, 'nhận lời mời');
  check(true, 'Điện thoại nhận lời mời vào phòng');
  await B.shot(OUT, 'O2-invite-phone');
  await B.evaluate(`document.querySelector('.toast.invite [data-a="join"]').click(); true`);
  await B.waitFor(`!!document.querySelector('#room-screen:not(.hidden)') && document.getElementById('room-code').textContent === '${code}'`, 10000, 'vào phòng');
  await A.waitFor(`document.querySelectorAll('#room-seats .seat:not(.empty)').length === 2`, 10000);
  check(true, 'Tham gia phòng bằng lời mời, cả hai thấy 2 ghế');

  // Đổi nhân vật trên điện thoại qua bộ chọn
  await B.evaluate(`document.querySelector('[data-pick-char]').click(); true`);
  await B.waitFor(`!!document.querySelector('.char-option')`, 5000);
  const takenDisabled = await B.evaluate(`[...document.querySelectorAll('.char-option')].filter((b) => b.disabled).map((b) => b.dataset.char)`);
  await B.evaluate(`document.querySelector('.char-option[data-char="explorer"]').click(); true`);
  await A.waitFor(`[...document.querySelectorAll('#room-seats .seat small')].some((s) => s.textContent.includes('Nhà thám hiểm'))`, 8000, 'đổi nhân vật');
  check(takenDisabled.length === 1, 'Chọn nhân vật: nhân vật đã có người chọn bị khoá; đổi sang Nhà thám hiểm', `khoá: ${takenDisabled}`);
  check(await A.evaluate(`document.getElementById('btn-room-start').disabled`), 'Chủ phòng chưa thể bắt đầu khi bạn chưa sẵn sàng');
  await B.evaluate(`document.getElementById('btn-ready').click(); true`);
  await A.evaluate(`document.querySelector('[data-add-bot]').click(); true`);
  await A.waitFor(`!document.getElementById('btn-room-start').disabled`, 8000, 'nút bắt đầu');
  await A.shot(OUT, 'O3-room-desktop');
  await B.shot(OUT, 'O3-room-phone');
  await A.evaluate(`document.getElementById('btn-room-start').click(); true`);
  await Promise.all([A, B].map((b) => b.waitFor(`__coTyPhu.mode === 'online-game' && !!__coTyPhu.session`, 60000, 'vào ván')));
  const seats = await Promise.all([A, B].map((b) => b.evaluate(`({ seat: __coTyPhu.session.seat, players: __coTyPhu.game.players.list.map((p) => p.name + '/' + p.characterId), glb: [...__coTyPhu.characters.values()].map((c) => c.source) })`)));
  check(seats[0].seat === 0 && seats[1].seat === 1 && seats[0].players.join() === seats[1].players.join(), 'Cả hai vào cùng một ván, đúng ghế', seats[0].players.join(', '));
  check(seats.every((s) => s.glb.every((x) => x === 'glb')), 'Nhân vật 3D GLB hiển thị trên bàn cờ ở cả hai thiết bị');

  // Chơi bằng nút giao diện
  let compared = 0;
  let mismatch = 0;
  let bought = 0;
  let rolledBy = new Set();
  let waitingSeen = false;
  let phoneGameShot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const [sa, sb] = await Promise.all([A.evaluate(STATE), B.evaluate(STATE)]);
    if (sa.over) break;
    if (sa.applied === sb.applied && sa.idle && sb.idle) {
      const [x, y] = await Promise.all([A.evaluate(SNAP), B.evaluate(SNAP)]);
      compared++;
      if (x !== y) {
        mismatch++;
        console.log('   khác nhau:', x, '\n            ', y);
      }
    }
    for (const [b, s, name] of [[A, sa, 'máy tính'], [B, sb, 'điện thoại']]) {
      if (!s.my) {
        if (s.cur !== s.seat && !s.rollDisabled) console.log(`   ⚠ ${name}: nút tung xúc xắc bật khi không phải lượt mình`);
        if (s.cur !== s.seat && s.idle) waitingSeen ||= await b.evaluate(`document.getElementById('prompt').textContent.includes('Đang chờ') || document.getElementById('prompt').textContent.includes('máy')`);
        continue;
      }
      if (!s.rollDisabled && s.canRoll && s.phase === 'roll') {
        await b.evaluate(`document.getElementById('btn-roll').click(); true`);
        rolledBy.add(name);
      } else if (s.phase === 'buy' && !s.buyDisabled) {
        await b.evaluate(`document.getElementById('btn-buy').click(); true`);
        bought++;
      } else if (!s.endDisabled) {
        await b.evaluate(`document.getElementById('btn-end').click(); true`);
      }
      if (b === B && !phoneGameShot && s.phase !== 'roll') {
        phoneGameShot = true;
        await B.shot(OUT, 'O4-game-phone');
        await A.shot(OUT, 'O4-game-desktop');
      }
    }
    const round = await A.evaluate('__coTyPhu.game.turn.round');
    if (round > 4 && bought >= 2) break;
    await sleep(250);
  }
  check(rolledBy.size === 2, 'Cả hai thiết bị tung xúc xắc bằng nút giao diện', [...rolledBy].join(', '));
  check(bought >= 1, 'Mua đất qua nút Mua đất', `${bought} lần`);
  check(waitingSeen, 'Thiết bị không đến lượt hiển thị trạng thái chờ người khác / máy');
  check(compared >= 10 && mismatch === 0, 'Hai thiết bị cùng xúc xắc, vị trí, tiền, chủ đất, lượt chơi', `${compared} lần so sánh, ${mismatch} sai khác`);
  const owners = await A.evaluate(`__coTyPhu.game.board.tiles.filter((t) => t.owner !== null).length`);
  const flags = await Promise.all([A, B].map((b) => b.evaluate(`__coTyPhu.game.board.tiles.filter((t) => t.owner !== null).map((t) => t.id).join()`)));
  check(owners > 0 && flags[0] === flags[1], 'Đất đã mua giống nhau trên hai thiết bị', `${owners} ô`);
  const phoneLayout = await B.evaluate(`(() => { const r = (id) => document.getElementById(id).getBoundingClientRect();
    const bar = r('action-bar'); const center = document.elementFromPoint(innerWidth / 2, innerHeight * 0.55);
    return { barVisible: bar.bottom <= innerHeight && bar.top > innerHeight * 0.5, noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      boardVisible: center === __coTyPhu.scene.renderer.domElement, logHidden: document.getElementById('log-panel').classList.contains('collapsed') }; })()`);
  check(Object.values(phoneLayout).every(Boolean), 'Giao diện điện thoại: nút thao tác ở dưới, bàn cờ không bị che, không tràn ngang', JSON.stringify(phoneLayout));

  // Tải lại trang trên điện thoại giữa ván -> tự quay lại ván, trạng thái khớp
  await sleep(500);
  await B.send('Page.reload');
  await B.waitFor(`__coTyPhu.mode === 'online-game' && !!__coTyPhu.session`, 120000, 'vào lại ván');
  await sleep(1500);
  let same = false;
  for (let i = 0; i < 80 && !same; i++) {
    const [sa, sb] = await Promise.all([A.evaluate(STATE), B.evaluate(STATE)]);
    if (sa.applied === sb.applied && sa.idle && sb.idle) same = (await A.evaluate(SNAP)) === (await B.evaluate(SNAP));
    else await sleep(300);
  }
  check(same, 'Tải lại trang giữa ván: tự vào lại đúng ván, trạng thái khớp với thiết bị kia');
  await B.shot(OUT, 'O5-phone-after-reload');

  // Rời ván trên điện thoại: máy chơi thay, máy tính thấy nhãn
  await B.evaluate(`__coTyPhu.controller.newGame ? true : true`);
  await B.evaluate(`document.getElementById('btn-menu').click(); true`);
  await B.waitFor(`!!document.querySelector('.confirm-modal [data-a="yes"]')`, 5000);
  await B.evaluate(`document.querySelector('.confirm-modal [data-a="yes"]').click(); true`);
  await B.waitFor(`!!document.querySelector('#lobby:not(.hidden)') && !document.getElementById('rejoin').classList.contains('hidden')`, 10000, 'về sảnh có nút quay lại');
  await A.waitFor(`document.getElementById('players-panel').textContent.includes('MÁY CHƠI THAY')`, 10000, 'nhãn máy chơi thay');
  check(true, 'Rời ván: về sảnh (có nút Quay lại ván), thiết bị kia thấy “MÁY CHƠI THAY”');
  await A.shot(OUT, 'O6-desktop-after-leave');

  for (const [b, name] of [[A, 'Máy tính'], [B, 'Điện thoại']]) {
    const bad = badConsole(b);
    check(bad.length === 0, `${name}: không có lỗi JavaScript / cảnh báo ngoài các mục đã biết`, bad.map((m) => m.text.slice(0, 160)).join(' | '));
  }
} catch (err) {
  check(false, `Lỗi khi chạy kiểm thử: ${err.message}`);
  for (const b of [A, B].filter(Boolean)) console.log(badConsole(b).map((m) => `   ${m.level}: ${m.text.slice(0, 200)}`).join('\n'));
} finally {
  A?.close();
  B?.close();
  server.kill();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${failed ? '✘' : '✔'} ${results.length - failed}/${results.length} kiểm tra đạt.`);
process.exit(failed ? 1 : 0);
