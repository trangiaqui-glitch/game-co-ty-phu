// Kiểm thử khói trên trình duyệt thật (Chrome/Edge headless qua DevTools Protocol).
// Cách chạy: node tests/browser-smoke.mjs [thư-mục-ảnh-chụp]
// Biến môi trường CHROME_PATH để chỉ định trình duyệt nếu không tự tìm thấy.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] || join(tmpdir(), 'co-ty-phu-smoke'));
mkdirSync(OUT, { recursive: true });
const PORT = 5199;
const DEBUG_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) {
  console.error('Không tìm thấy Chrome/Edge. Đặt biến CHROME_PATH.');
  process.exit(2);
}

const server = spawn(process.execPath, [join(ROOT, 'server.js'), String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'ctp-profile-'));
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,900', '--ignore-gpu-blocklist', '--enable-gpu',
  ...(process.env.SOFTWARE_GL ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : ['--use-angle=d3d11']),
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

const problems = [];
let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expr, timeout = 60000, label = expr) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expr)) return true;
    } catch { /* trang chưa sẵn sàng */ }
    await sleep(250);
  }
  throw new Error(`Hết thời gian chờ: ${label}`);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`  📸 ${file}`);
}

const state = () => evaluate(`(() => { const g = __coTyPhu.game; if (!g) return null; const p = g.currentPlayer;
  return { phase: g.phase, busy: g.busy, over: g.over, cur: p.name, ai: p.isAI, round: g.turn.round,
    money: g.players.list.map(x => x.money), pos: g.players.list.map(x => x.position),
    owned: g.board.tiles.filter(t => t.owner !== null).length, tweens: __coTyPhu.fx ? __coTyPhu.fx.tweens.size : 0,
    charPos: [...__coTyPhu.characters.values()].map(v => v.root.position.toArray().map(n => +n.toFixed(2))) }; })()`);

async function main() {
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
    } catch { await sleep(250); }
  }
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`EXCEPTION: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) {
      problems.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      problems.push(`log: ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log(`▶ Mở http://localhost:${PORT} bằng ${chromePath}`);
  const t0 = Date.now();
  await send('Page.navigate', { url: `http://localhost:${PORT}/?mode=offline` });
  await waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 90000, 'menu bắt đầu');
  console.log(`✔ Tải xong và hiện menu sau ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const info = await evaluate(`({ thumbs: Object.keys(__coTyPhu.thumbs).length, batch: __coTyPhu.board.batchInfo,
    calls: __coTyPhu.scene.renderer.info.render.calls, tris: __coTyPhu.scene.renderer.info.render.triangles })`);
  console.log(`  Ảnh nhân vật: ${info.thumbs}, gộp ${info.batch.removed} mesh tĩnh → ${info.batch.meshes} mesh, draw calls: ${info.calls}, tam giác: ${info.tris}`);
  const fps = await evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
    requestAnimationFrame(f); })`);
  console.log(`  FPS trong trình duyệt kiểm thử: ${fps.toFixed(1)}`);
  await sleep(800);
  await shot('01-menu');

  // Ván 4 người: người chơi 1 là người thật, 3 máy.
  await evaluate(`document.querySelector('#opt-speed').value = '2.2'; document.getElementById('btn-start').click(); true`);
  await waitFor(`!!__coTyPhu.game && __coTyPhu.game.started`, 30000, 'ván đấu bắt đầu');
  console.log('✔ Ván đấu bắt đầu, 4 nhân vật:', await evaluate('__coTyPhu.characters.size'));
  await waitFor(`!__coTyPhu.game.busy && __coTyPhu.game.phase === 'roll'`, 20000);
  await sleep(1200);
  await shot('02-game-start');
  await evaluate(`__coTyPhu.camera.focusPoint(10.6, 10.6, { distance: 4.2, height: 2.2 }); true`);
  await sleep(1500);
  await shot('02b-characters-closeup');
  await evaluate(`__coTyPhu.camera.reset(0.6); true`);
  await sleep(900);

  // Lượt của người chơi: tung bằng nút UI thật.
  const before = await state();
  await evaluate(`document.getElementById('btn-roll').click(); true`);
  await sleep(700);
  await shot('03-rolling');
  await waitFor(`!__coTyPhu.game.busy && ['buy','end','roll'].includes(__coTyPhu.game.phase) && __coTyPhu.game.lastDice`, 40000, 'kết thúc di chuyển');
  let s = await state();
  const dice = await evaluate('__coTyPhu.game.lastDice');
  console.log(`✔ Tung ${dice.join('+')}: vị trí ${before.pos[0]} → ${s.pos[0]}, pha "${s.phase}"`);
  await shot('04-after-move');

  if (s.phase === 'buy') {
    await evaluate(`document.getElementById('btn-buy').click(); true`);
    await waitFor(`!__coTyPhu.game.busy && __coTyPhu.game.phase !== 'buy'`, 20000, 'mua đất');
    await sleep(300);
    s = await state();
    console.log(`✔ Đã mua đất. Tiền: ${before.money[0]} → ${s.money[0]}; số ô có chủ: ${s.owned}`);
    await shot('05-bought');
  }

  // Xem thông tin ô bằng click trên canvas vào ô vừa đứng.
  const screen = await evaluate(`(() => { const g = __coTyPhu.game; const t = g.board.getTile(g.players.list[0].position);
    const THREEVec = __coTyPhu.scene.camera.position.clone(); THREEVec.set(t.position.x, 0.3, t.position.z);
    return __coTyPhu.scene.project(THREEVec); })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: screen.x, y: screen.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: screen.x, y: screen.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  const panelOpen = await evaluate(`!document.getElementById('tile-panel').classList.contains('hidden')`);
  console.log(`${panelOpen ? '✔' : '✘'} Click vào ô trên bàn cờ mở bảng thông tin: ${panelOpen}`);
  if (!panelOpen) problems.push('Click ô không mở bảng thông tin');
  await shot('06-tile-panel');
  await evaluate(`__coTyPhu.game && document.querySelector('#tile-panel [data-close]')?.click(); true`);

  // Kết thúc lượt (tung tiếp nếu được đôi).
  for (let i = 0; i < 4; i++) {
    s = await state();
    if (s.phase === 'roll' && !s.ai) {
      await evaluate(`document.getElementById('btn-roll').click(); true`);
      await waitFor(`!__coTyPhu.game.busy && __coTyPhu.game.phase !== 'moving'`, 40000);
      if ((await state()).phase === 'buy') await evaluate(`__coTyPhu.game.declinePurchase(); true`);
    } else break;
  }
  await evaluate(`document.getElementById('btn-end').click(); true`);
  await waitFor(`__coTyPhu.game.currentPlayer.isAI`, 20000, 'chuyển sang AI');
  console.log('✔ Kết thúc lượt, máy bắt đầu chơi');

  // Để máy chơi đến khi quay lại người chơi.
  await waitFor(`!__coTyPhu.game.currentPlayer.isAI || __coTyPhu.game.over`, 240000, 'AI chơi xong 3 lượt');
  await sleep(500);
  s = await state();
  console.log(`✔ 3 máy đã chơi xong. Vòng ${s.round}, tiền: ${s.money.join(', ')}, ô có chủ: ${s.owned}`);
  await shot('07-after-ai');

  // Rút thẻ Cơ hội (hiện thẻ trên màn hình) và phá sản một người chơi máy.
  const cardDone = evaluate(`__coTyPhu.game._lock(() => __coTyPhu.game._drawCard(__coTyPhu.game.players.list[0], 'chance', { diceTotal: 7 })).then(r => r.ok)`);
  await sleep(1300);
  await shot('07b-card');
  console.log(`${await cardDone ? '✔' : '✘'} Rút thẻ Cơ hội và áp dụng hiệu ứng`);
  await waitFor(`!__coTyPhu.game.busy`, 30000);
  await evaluate(`(() => { const v = __coTyPhu.characters.get(3).root.position; __coTyPhu.camera.focusPoint(v.x, v.z, { distance: 5, height: 3 }); return true; })()`);
  const bk = await evaluate(`(() => { const g = __coTyPhu.game; return g._lock(() => g._pay(g.players.list[3], 0, 99999, 'kiểm thử')).then(() => g.players.list[3].bankrupt); })()`);
  console.log(`${bk ? '✔' : '✘'} Người chơi 4 phá sản, tài sản chuyển cho người chơi 1`);
  await sleep(400);
  await shot('07c-bankrupt');
  await evaluate(`__coTyPhu.camera.reset(0.6); true`);
  await sleep(800);

  // Thử xây nhà: cho người chơi 1 sở hữu nhóm nâu để kiểm tra luồng xây có hoạt ảnh.
  await evaluate(`(() => { const g = __coTyPhu.game; const p = g.players.list[0];
    for (const id of [1, 3]) { const t = g.board.getTile(id); t.owner = p.id; t.mortgaged = false; }
    __coTyPhu.fx.syncBoard(); g.emit('update'); return true; })()`);
  await waitFor(`!__coTyPhu.game.busy`, 20000);
  const build1 = await evaluate(`__coTyPhu.game.buildOn(1).then(r => r.ok)`);
  const bad = await evaluate(`__coTyPhu.game.buildOn(1).then(r => r.ok)`);
  const build3 = await evaluate(`__coTyPhu.game.buildOn(3).then(r => r.ok)`);
  console.log(`${build1 && build3 && !bad ? '✔' : '✘'} Xây nhà: ô 1 ${build1}, ô 3 ${build3}, xây lệch bị chặn ${!bad}`);
  await evaluate(`__coTyPhu.controller.selectTile(2); true`);
  await sleep(1800);
  await shot('08-houses');

  // Phím tắt / bảng xếp hạng
  await evaluate(`document.getElementById('btn-leaderboard').click(); true`);
  await sleep(600);
  await shot('09-leaderboard');
  await evaluate(`document.querySelector('.leaderboard-modal [data-close]').click(); document.getElementById('btn-cam-reset').click(); true`);
  await sleep(1300);
  await shot('10-overview');

  // Đổi người chơi 1 thành máy để chạy thêm vài vòng hoàn toàn tự động.
  await evaluate(`(() => { const g = __coTyPhu.game; g.players.list[0].isAI = true; if (g.phase === 'roll' || g.phase === 'end' || g.phase === 'buy') g._scheduleAI(); return true; })()`);
  await waitFor(`__coTyPhu.game.turn.round >= ${s.round + 3} || __coTyPhu.game.over`, 400000, 'chạy thêm 3 vòng tự động');
  s = await state();
  console.log(`✔ Tự động thêm 3 vòng: vòng ${s.round}, tiền: ${s.money.join(', ')}, ô có chủ: ${s.owned}`);
  await shot('11-later');

  // Về menu giữa chừng (huỷ ván đang chạy), bắt đầu ván 2 người thật, rồi kết thúc ván.
  await evaluate(`__coTyPhu.controller.newGame(); true`);
  await waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 10000, 'menu sau khi huỷ ván');
  await evaluate(`document.querySelector('#player-count [data-count="2"]').click();
    document.querySelectorAll('.setup-row')[1].querySelector('[data-ai="0"]').click();
    document.getElementById('btn-start').click(); true`);
  await waitFor(`__coTyPhu.game && __coTyPhu.game.started && !__coTyPhu.game.busy && __coTyPhu.characters.size === 2`, 20000, 'ván 2 người');
  console.log('✔ Huỷ ván và bắt đầu ván mới 2 người thật:', await evaluate(`__coTyPhu.game.players.list.map(p => p.name + (p.isAI ? '(máy)' : '')).join(' vs ')`));
  await evaluate(`document.getElementById('btn-roll').click(); true`);
  await waitFor(`!__coTyPhu.game.busy && __coTyPhu.game.lastDice`, 40000);
  await evaluate(`(() => { const g = __coTyPhu.game; return g._lock(() => g._pay(g.players.list[1], 0, 99999, 'kiểm thử')); })()`);
  await waitFor(`!!document.querySelector('.gameover-modal')`, 20000, 'bảng kết thúc ván');
  console.log('✔ Ván kết thúc, người thắng:', await evaluate('__coTyPhu.game.winner.name'));
  await sleep(600);
  await shot('12-game-over');

  // Màn hình tablet
  await evaluate(`document.querySelector('.gameover-modal [data-a="view"]').click(); true`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await evaluate(`window.dispatchEvent(new Event('resize')); __coTyPhu.controller.selectTile(39); true`);
  await sleep(1500);
  await shot('13-tablet');
}

try {
  await main();
} catch (err) {
  problems.push(`TEST FAILED: ${err.message}`);
  try {
    console.log('  Trạng thái lúc lỗi:', JSON.stringify(await state()));
    await shot('zz-failure');
  } catch { /* bỏ qua */ }
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
}

// Đã biết và được báo rõ (xem tests/character-glb-test.mjs, ASSET_LICENSES.md):
// - thiếu GLB nhân vật (hiện là chef.glb);
// - bộ GLB Quaternius không có clip jump/sad -> cảnh báo [Animation] ... thiếu clip.
// Mọi lỗi/cảnh báo khác vẫn làm test thất bại.
const knownMissingGlb = (p) => /assets\/models\/characters\/\w+\.glb/.test(p);
const knownMissingClip = (p) => /^console\.warning: \[Animation\] Nhân vật .* thiếu clip cho: (jump|sad)(, (jump|sad))?\. /.test(p);
const knownMissing = (p) => knownMissingGlb(p) || knownMissingClip(p);
const skippedGlb = new Set(problems.filter(knownMissingGlb)).size;
const skippedClip = new Set(problems.filter(knownMissingClip)).size;
if (skippedGlb) console.log(`\nℹ Bỏ qua ${skippedGlb} lỗi đã biết do thiếu file GLB nhân vật.`);
if (skippedClip) console.log(`ℹ Bỏ qua ${skippedClip} cảnh báo đã biết: GLB thiếu clip jump/sad.`);
const uniq = [...new Set(problems.filter((p) => !knownMissing(p)))];
if (uniq.length) {
  console.log(`\n✘ ${uniq.length} vấn đề:`);
  uniq.forEach((p) => console.log('  -', p));
  process.exit(1);
}
console.log('\n✔ Không có lỗi JavaScript hay cảnh báo trong console.');
process.exit(0);
