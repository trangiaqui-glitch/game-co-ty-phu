// Kiểm thử logic game không cần trình duyệt: node tests/simulate.mjs [số ván]
// Chạy các ván AI-vs-AI với hạt giống cố định và kiểm tra bất biến luật chơi.
import { GameManager } from '../src/game/GameManager.js';
import { TILE_TYPES as T, JAIL_POSITION } from '../src/data/boardData.js';

const GAMES = Number(process.argv[2] || 60);
let failures = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(`Bất biến bị vi phạm: ${msg}`);
}

function checkInvariants(game, startTotal) {
  const { board, property, players, bank } = game;
  for (const p of players.list) {
    if (!p.bankrupt) assert(p.money >= 0, `${p.name} có tiền âm (${p.money})`);
    else {
      assert(p.money === 0, `${p.name} phá sản nhưng còn tiền`);
      assert(board.ownedBy(p.id).length === 0, `${p.name} phá sản nhưng còn đất`);
    }
    if (p.inJail) assert(p.position === JAIL_POSITION, `${p.name} trong tù nhưng ở ô ${p.position}`);
    assert(p.position >= 0 && p.position < 40, 'vị trí ngoài bàn cờ');
  }
  for (const t of board.tiles) {
    assert(t.houses >= 0 && t.houses <= 4, `${t.name} có ${t.houses} nhà`);
    assert(t.hotel === 0 || t.hotel === 1, `${t.name} hotel=${t.hotel}`);
    if (t.hotel) assert(t.houses === 0, `${t.name} vừa có khách sạn vừa có nhà`);
    const lvl = property.level(t);
    if (lvl > 0) {
      assert(t.type === T.PROPERTY, `${t.name} không phải đất nhưng có nhà`);
      assert(property.hasMonopoly(t.owner, t.group), `${t.name} có nhà nhưng chủ không đủ bộ`);
      assert(!t.mortgaged, `${t.name} có nhà khi đang thế chấp`);
      const levels = board.groupTiles(t.group).map((g) => property.level(g));
      assert(Math.max(...levels) - Math.min(...levels) <= 1, `nhóm ${t.group} xây không đều: ${levels}`);
      assert(!board.groupTiles(t.group).some((g) => g.mortgaged), `nhóm ${t.group} có nhà và có ô thế chấp`);
    }
    if (t.owner !== null) {
      assert(property.isOwnable(t), `${t.name} không thể sở hữu nhưng có chủ`);
      assert(!players.get(t.owner).bankrupt, `${t.name} thuộc người đã phá sản`);
    } else {
      assert(!t.mortgaged && lvl === 0, `${t.name} vô chủ nhưng còn trạng thái`);
    }
  }
  // Bảo toàn tiền: tổng tiền = vốn ban đầu + tiền ngân hàng chi - tiền ngân hàng thu.
  let fromBank = 0;
  let toBank = 0;
  for (const tx of bank.transactions) {
    if (tx.from === null) fromBank += tx.amount;
    if (tx.to === null) toBank += tx.amount;
  }
  if (bank.transactions.length < 500) {
    const total = players.list.reduce((s, p) => s + p.money, 0);
    assert(total === startTotal + fromBank - toBank, `tổng tiền lệch: ${total} vs ${startTotal + fromBank - toBank}`);
  }
}

async function runGame(seed, nPlayers) {
  const configs = Array.from({ length: nPlayers }, (_, i) => ({ name: `AI ${i + 1}`, characterId: `c${i}`, isAI: true }));
  const game = new GameManager({ players: configs, seed, autoAI: false, maxRounds: 150 });
  const startTotal = 1500 * nPlayers;
  let checks = 0;
  game.on('update', () => {
    checkInvariants(game, startTotal);
    checks++;
  });
  await game.start();
  let turns = 0;
  while (!game.over && turns < 5000) {
    await game.playAITurn();
    turns++;
  }
  assert(game.over, 'ván không kết thúc');
  return {
    seed, nPlayers, turns, rounds: game.turn.round, checks,
    winner: game.winner?.name,
    bankrupt: game.players.list.filter((p) => p.bankrupt).length,
    built: game.bank.transactions.filter((t) => t.reason.startsWith('Xây')).length,
  };
}

async function scriptedScenario() {
  // Kịch bản thủ công: mua đất, trả tiền thuê, xây nhà bằng API công khai.
  const game = new GameManager({
    players: [{ name: 'A', characterId: 'x' }, { name: 'B', characterId: 'y' }], seed: 1, autoAI: false,
  });
  await game.start();
  const [a, b] = game.players.list;
  const brown1 = game.board.getTile(1);
  const brown3 = game.board.getTile(3);

  // Giả lập A đứng ở ô 1 và mua.
  game.pendingPurchase = 1;
  game.turn.phase = 'buy';
  let r = await game.buyProperty();
  assert(r.ok && brown1.owner === a.id && a.money === 1440, 'mua ô 1');
  game.pendingPurchase = 3;
  game.turn.phase = 'buy';
  r = await game.buyProperty();
  assert(r.ok && brown3.owner === a.id, 'mua ô 3');
  assert(game.property.calculateRent(brown1) === 4, 'thuê gấp đôi khi đủ bộ');

  // Xây nhà phải đều.
  game.turn.phase = 'end';
  r = await game.buildOn(1);
  assert(r.ok && brown1.houses === 1, 'xây nhà 1');
  r = await game.buildOn(1);
  assert(!r.ok, 'không được xây lệch');
  r = await game.buildOn(3);
  assert(r.ok && brown3.houses === 1, 'xây nhà 3');
  assert(game.property.calculateRent(brown1) === 10, 'tiền thuê 1 nhà');

  // Không được thế chấp khi nhóm còn nhà.
  r = await game.mortgageTile(1);
  assert(!r.ok, 'không thế chấp khi còn nhà');

  // B trả tiền thuê cho A.
  const before = [a.money, b.money];
  await game._pay(b, a.id, 10, 'test');
  assert(a.money === before[0] + 10 && b.money === before[1] - 10, 'chuyển tiền thuê');

  // B phá sản khi nợ quá lớn -> tài sản về A, game kết thúc.
  await game._pay(b, a.id, 99999, 'test');
  assert(b.bankrupt && game.over && game.winner === a, 'phá sản và kết thúc ván');
  console.log('✔ Kịch bản thủ công: mua / thuê / xây / thế chấp / phá sản OK');
}

const results = [];
try {
  await scriptedScenario();
} catch (err) {
  failures++;
  console.error('✘ Kịch bản thủ công:', err.message);
}

for (let i = 0; i < GAMES; i++) {
  const seed = 1000 + i;
  const n = 2 + (i % 3);
  try {
    results.push(await runGame(seed, n));
  } catch (err) {
    failures++;
    console.error(`✘ Ván seed=${seed} (${n} người):`, err.stack);
  }
}

const ended = results.filter((r) => r.bankrupt >= r.nPlayers - 1).length;
const avgRounds = results.reduce((s, r) => s + r.rounds, 0) / Math.max(1, results.length);
const totalChecks = results.reduce((s, r) => s + r.checks, 0);
console.log(`✔ ${results.length}/${GAMES} ván AI chạy xong, ${totalChecks} lần kiểm tra bất biến.`);
console.log(`  ${ended} ván kết thúc do phá sản, còn lại kết thúc theo giới hạn vòng. Trung bình ${avgRounds.toFixed(1)} vòng.`);
console.log(`  Tổng số lần xây nhà: ${results.reduce((s, r) => s + r.built, 0)}`);
if (failures) {
  console.error(`✘ ${failures} lỗi`);
  process.exit(1);
}
