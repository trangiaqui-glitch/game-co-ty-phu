// Kiểm thử hệ thống nhân vật GLB trên trình duyệt thật.
//   node tests/character-glb-test.mjs [thư-mục-ảnh]
// A) Asset GLB thật của project (Quaternius, CC0): tải, skeleton, clip, Idle/Walk/Wave, hướng mặt,
//    vị trí chân, trạng thái animation độc lập, phá sản với clip Sad tự tạo (GLB không có sẵn).
// B) Dùng mô hình kiểm thử CC0 có rig (tests/fixtures/robot-expressive) qua tham số ?model.<id>=...
//    để kiểm tra clone skeleton, ánh xạ clip, chuyển trạng thái, vị trí chân, cache và camera.
// C) Thiếu GLB (mô phỏng bằng đường dẫn không tồn tại): báo lỗi rõ ràng, không âm thầm thay thế.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './lib/cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] || join(tmpdir(), 'co-ty-phu-character-test'));
mkdirSync(OUT, { recursive: true });
const FIXTURE = 'tests/fixtures/robot-expressive/RobotExpressive.glb';
const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok, label });
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// Lỗi/cảnh báo được phép: GLB nhân vật chưa có trong project và clip thiếu của mô hình kiểm thử.
const expected = (m) => /assets\/models\/characters\/\w+\.glb/.test(m.text) || /\[Animation\] Nhân vật .* thiếu clip/.test(m.text);
const reportConsole = (b, label) => {
  const bad = b.console.filter((m) => ['error', 'warning', 'assert', 'exception', 'log-error'].includes(m.level) && !expected(m));
  check(bad.length === 0, `${label}: không có lỗi console ngoài các lỗi thiếu GLB đã biết`, bad.map((m) => m.text.slice(0, 160)).join(' | '));
  return b.console.filter((m) => expected(m) && m.level !== 'log-error').map((m) => m.text);
};

const controllerInfo = (i) => `(() => { const c = __coTyPhu.characters.get(${i}); if (!c) return null;
  const act = c.anim.playing ? c.anim.actions[c.anim.playing] : null;
  return { source: c.source, state: c.anim.state, playing: c.anim.playing, clip: c.anim.currentClipName,
    timeScale: act ? +act.getEffectiveTimeScale().toFixed(3) : null, moving: !!c.motion,
    pos: c.root.position.toArray(), heading: c.heading }; })()`;
// Đáy hộp bao chính xác (theo tư thế skinning hiện tại) so với mặt ô cờ (y = 0.2).
const footOffset = (i) => `(() => { const c = __coTyPhu.characters.get(${i});
  const box = new __coTyPhu.debug._box.constructor().setFromObject(c.asset.root, true);
  return +(box.min.y - 0.2).toFixed(4) + 0; })()`; // + 0: tránh -0 (CDP không trả -0 qua returnByValue)
// Số lần thực sự tải file GLB (bỏ qua URL trang có chứa tên file trong query).
const glbFetches = (b) => b.requests.filter((u) => new URL(u).pathname.endsWith('RobotExpressive.glb')).length;

// Asset thật trong assets/models/characters (bộ Quaternius CC0, xem ASSET_LICENSES.md).
const REAL_ASSETS = ['businessman', 'businesswoman', 'explorer', 'engineer', 'astronaut'];
const REAL_CLIPS = { idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk', run: 'CharacterArmature|Run', celebrate: 'CharacterArmature|Wave', interact: 'CharacterArmature|Interact' };
// Hướng mặt thật của model trong thế giới, đo từ xương (bàn chân -> pole target đầu gối nằm phía trước).
const modelForward = (i) => `(() => { const c = __coTyPhu.characters.get(${i}); const V = c.root.position.constructor;
  const p = (n) => { let x; c.asset.animationRoot.traverse(o => { if (o.isBone && o.name === n) x = o; }); return new V().setFromMatrixPosition(x.matrixWorld); };
  const f = p('PTL').sub(p('FootL')).add(p('PTR')).sub(p('FootR')); f.y = 0; f.normalize(); return [f.x, f.z]; })()`;

async function scenarioA() {
  console.log('\n=== A. Asset GLB thật trong project ===');
  const b = await launch({ root: ROOT, port: 5201, debugPort: 9341 });
  try {
    await b.send('Page.navigate', { url: 'http://localhost:5201/?style=glb&mode=offline' });
    await b.waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 90000, 'menu');
    const statuses = await b.evaluate(`['businessman','businesswoman','explorer','engineer','chef','astronaut'].map(id => { const e = __coTyPhu.charAssets.status(id);
      return { id, status: e.status, path: e.path, error: e.error, info: e.info && { bones: e.info.bones, sk: e.info.skinnedMeshes, mats: e.info.materials, tex: e.info.textures, clips: e.info.clips.map(c => c.name + '(' + c.duration + 's)') },
        size: e.norm && e.norm.worldSize }; })`);
    for (const s of statuses) {
      console.log(`   ${s.id}: ${s.status} ${s.path}${s.error ? ` (${s.error})` : ''}`);
      if (s.info) console.log(`      ${s.info.bones} xương, ${s.info.sk} skinned mesh, ${s.info.mats} material, ${s.info.tex} texture, kích thước ${s.size.join(' × ')}`);
    }
    const real = statuses.filter((s) => REAL_ASSETS.includes(s.id));
    check(real.every((s) => s.status === 'loaded'), `GLTFLoader đọc thành công ${real.length} GLB thật`, real.map((s) => s.id).join(', '));
    check(real.every((s) => s.info.bones === 62 && s.info.sk > 0), 'Mỗi GLB có skeleton (62 xương) và skinned mesh');
    check(real.every((s) => s.info.mats > 0), 'Mỗi GLB có material riêng của model');
    check(real.every((s) => Math.abs(s.size[1] - 1.2) < 0.01), 'Chuẩn hoá đồng đều về chiều cao 1.2');
    console.log(`   Clip (businessman): ${real[0].info.clips.join(', ')}`);
    const chef = statuses.find((s) => s.id === 'chef');
    check(chef.status === 'failed' && /404/.test(chef.error), 'chef.glb chưa có: báo lỗi 404 rõ ràng (không tự thay thế)');
    const badges = await b.evaluate(`[...document.querySelectorAll('.model-badge')].map(x => x.textContent)`);
    check(badges.length === 4 && badges.every((x) => x === 'GLB'), 'Menu: 4 người chơi mặc định đều gắn nhãn GLB', badges.join(','));
    check(await b.evaluate(`document.getElementById('model-warning').classList.contains('hidden')`), 'Menu không cảnh báo thiếu model cho 4 nhân vật đã chọn');
    await b.shot(OUT, 'A1-menu-real-glb');

    // Mua đất luôn được: tắt cửa sổ hỏi, chỉ xét người chơi 0 (người).
    await b.evaluate(`document.getElementById('btn-start').click(); true`);
    await b.waitFor(`__coTyPhu.game && __coTyPhu.game.started && !__coTyPhu.game.busy && __coTyPhu.game.phase === 'roll'`, 20000, 'ván bắt đầu');
    const setup = await b.evaluate(`(() => { const cs = [...__coTyPhu.characters.values()];
      return { sources: cs.map(c => c.source), mixers: new Set(cs.map(c => c.anim.mixer)).size,
        mapping: cs.map(c => Object.fromEntries(Object.entries(c.anim.clips).map(([k, v]) => [k, v.name]))) }; })()`);
    check(setup.sources.every((s) => s === 'glb'), 'Ván chạy với 4 nhân vật GLB thật (không dùng mô hình tạm)', setup.sources.join(','));
    check(setup.mixers === 4, 'Mỗi nhân vật có AnimationMixer riêng', `${setup.mixers} mixer`);
    console.log(`   Ánh xạ trạng thái -> clip: ${JSON.stringify(setup.mapping[0])}`);
    check(Object.entries(REAL_CLIPS).every(([k, v]) => setup.mapping.every((m) => m[k] === v)) && setup.mapping.every((m) => !m.jump),
      'Ánh xạ: idle/walk/run/celebrate(Wave)/interact(Interact) từ GLB; jump không có trong GLB nên không gán');
    check(setup.mapping.every((m) => m.sad === 'Sad (procedural)'), 'GLB không có Sad: dùng clip "Sad (procedural)" tạo trên skeleton của model (ghi rõ là clip tự tạo)');
    const idle = await b.evaluate(`[0,1,2,3].map(i => { const c = __coTyPhu.characters.get(i); return c.anim.state + '/' + c.anim.currentClipName; })`);
    check(idle.every((x) => x === `idle/${REAL_CLIPS.idle}`), 'Đầu ván cả 4 nhân vật phát Idle', idle.join(', '));
    const feet = [];
    for (let i = 0; i < 4; i++) feet.push(await b.evaluate(footOffset(i)));
    check(feet.every((f) => Math.abs(f) < 0.03), 'Chân chạm mặt bàn (không lún, không nổi)', `lệch ${feet.join(', ')}`);
    const minDist = await b.evaluate(`(() => { const ps = [...__coTyPhu.characters.values()].map(c => c.root.position); let m = 1e9;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.min(m, ps[i].distanceTo(ps[j])); return +m.toFixed(3); })()`);
    check(minDist > 0.5, '4 nhân vật cùng ô không chồng lên nhau', `khoảng cách nhỏ nhất ${minDist}`);
    await b.evaluate(`__coTyPhu.camera.focusPoint(10.6, 10.6, { distance: 4.2, height: 2.2 }); true`);
    await sleep(1600);
    await b.shot(OUT, 'A2-real-glb-on-start');

    // Tung xúc xắc, lấy mẫu: clip, hướng mặt thật (từ xương) so với hướng di chuyển, trạng thái người khác.
    // Cố định kết quả một lần [1, 2] để dừng ở ô đất số 3 (chỉ cố định RNG, luật chơi giữ nguyên).
    await b.evaluate(`(() => { const t = __coTyPhu.game.turn, orig = t.rollDice; t.rollDice = function () { t.rollDice = orig; return [1, 2]; }; return true; })()`);
    await b.evaluate(`__coTyPhu.camera.reset(0.5); document.getElementById('btn-roll').click(); true`);
    const samples = [];
    const t0 = Date.now();
    let shotTaken = false;
    while (Date.now() - t0 < 30000) {
      const st = await b.evaluate(controllerInfo(0));
      if (st.moving) {
        st.fwd = await b.evaluate(modelForward(0));
        st.others = await b.evaluate(`[1,2,3].map(i => __coTyPhu.characters.get(i).anim.state)`);
      }
      samples.push(st);
      if (st.moving && !shotTaken && samples.filter((x) => x.moving).length > 4) {
        shotTaken = true;
        await b.evaluate(`__coTyPhu.camera.focusPoint(__coTyPhu.characters.get(0).root.position.x, __coTyPhu.characters.get(0).root.position.z, { distance: 5, height: 2.6 }); true`);
        await b.shot(OUT, 'A3-walking');
      }
      if (await b.evaluate(`!__coTyPhu.game.busy && __coTyPhu.game.phase !== 'moving' && !!__coTyPhu.game.lastDice`)) break;
      await sleep(80);
    }
    const firstMove = samples.findIndex((x) => x.moving);
    const endFirst = samples.findIndex((x, i) => i > firstMove && !x.moving);
    const moving = samples.slice(firstMove, endFirst < 0 ? undefined : endFirst);
    const dice = await b.evaluate('__coTyPhu.game.lastDice');
    const steps = dice[0] + dice[1];
    const expState = steps >= 7 ? 'run' : 'walk';
    check(moving.length > 0 && moving.every((x) => x.state === expState && x.clip === REAL_CLIPS[expState]),
      `Di chuyển ${steps} ô: phát ${REAL_CLIPS[expState]} suốt quãng đường`, `${moving.length} mẫu, timeScale ${moving[0]?.timeScale}`);
    // So hướng mặt thật với hướng di chuyển giữa hai mẫu liên tiếp (bỏ qua lúc đang rẽ góc).
    const dots = [];
    for (let i = 1; i < moving.length; i++) {
      const dx = moving[i].pos[0] - moving[i - 1].pos[0], dz = moving[i].pos[2] - moving[i - 1].pos[2];
      const len = Math.hypot(dx, dz);
      if (len > 0.05) dots.push((dx * moving[i].fwd[0] + dz * moving[i].fwd[1]) / len);
    }
    dots.sort((p, q) => p - q);
    const med = dots[Math.floor(dots.length / 2)];
    check(dots.length > 0 && med > 0.95, 'Model nhìn đúng hướng đang đi (đo từ xương, không xoay ngược/lệch)', `cos trung vị ${med?.toFixed(3)}, ${dots.length} mẫu`);
    check(moving.every((x) => x.others.every((s) => s === 'idle')), 'Người khác vẫn Idle khi người 0 đi (không chia sẻ trạng thái animation)');
    await b.waitFor(`!__coTyPhu.characters.get(0).motion`, 5000);
    const s0 = await b.evaluate(controllerInfo(0));
    const target = await b.evaluate(`(() => { const g = __coTyPhu.game; const p = g.players.list[0]; return g.board.getStandPoint(p.position, p.slot, p.inJail); })()`);
    const err = Math.hypot(s0.pos[0] - target.x, s0.pos[2] - target.z);
    check(err < 0.01 || (await b.evaluate('__coTyPhu.game.players.list[0].inJail')), 'Dừng đúng vị trí trên ô cuối', `sai số ${err.toFixed(4)}`);
    check(['idle', 'celebrate'].includes(s0.state), 'Kết thúc di chuyển về Idle', `${s0.state}/${s0.clip}`);
    const footEnd = await b.evaluate(footOffset(0));
    check(Math.abs(footEnd) < 0.03, 'Sau khi đi, chân vẫn chạm mặt bàn', `lệch ${footEnd}`);

    check(await b.evaluate(`__coTyPhu.game.phase === 'buy'`), 'Dừng ở ô đất trống: game chuyển sang bước mua');
    if (await b.evaluate(`__coTyPhu.game.phase === 'buy'`)) {
      await b.waitFor(`!document.getElementById('btn-buy').disabled`, 5000, 'nút Mua đất được bật');
      const cash = await b.evaluate('__coTyPhu.game.players.list[0].money');
      await b.evaluate(`document.getElementById('btn-buy').click(); true`);
      const seen = new Set();
      const t1 = Date.now();
      let shot = false;
      while (Date.now() - t1 < 12000) {
        const st = await b.evaluate(controllerInfo(0));
        seen.add(`${st.state}/${st.clip}`);
        if (st.state === 'celebrate' && !shot) {
          shot = true;
          await b.evaluate(`__coTyPhu.camera.focusPoint(${st.pos[0]}, ${st.pos[2]}, { distance: 3.6, height: 1.8 }); true`);
          await sleep(500);
          await b.shot(OUT, 'A4-celebrate-wave');
        }
        if (seen.has(`celebrate/${REAL_CLIPS.celebrate}`) && st.state === 'idle') break;
        await sleep(100);
      }
      check(seen.has(`celebrate/${REAL_CLIPS.celebrate}`), 'Mua đất: phát CELEBRATE (clip Wave)', [...seen].join(' → '));
      const after = await b.evaluate(controllerInfo(0));
      check(after.state === 'idle' && after.clip === REAL_CLIPS.idle, 'Wave phát một lần rồi về Idle', `${after.state}/${after.clip}`);
      const owned = await b.evaluate(`({ money: __coTyPhu.game.players.list[0].money })`);
      check(owned.money < cash, 'Luật chơi: mua đất trừ tiền đúng người chơi', `$${cash} -> $${owned.money}`);
    }

    // Phá sản: phát SAD (clip tự tạo), không đổi material.
    await b.waitFor(`!__coTyPhu.game.busy`, 60000);
    const color = `(() => { let m; __coTyPhu.characters.get(2).asset.animationRoot.traverse(o => { if (!m && o.isMesh) m = o.material; }); return m.color.getHexString(); })()`;
    const before = await b.evaluate(color);
    await b.evaluate(`(() => { const g = __coTyPhu.game; g._aiToken++; return g._lock(() => g._pay(g.players.list[2], 0, 99999, 'kiểm thử')); })()`);
    await sleep(500);
    const bk = await b.evaluate(controllerInfo(2));
    check(bk.state === 'sad' && bk.clip === 'Sad (procedural)', 'Phá sản: phát SAD (clip Sad tự tạo trên skeleton GLB)', `${bk.state}/${bk.clip}`);
    check(before === (await b.evaluate(color)), 'Không ghi đè material GLB khi phá sản', `#${before}`);
    check(await b.evaluate(`__coTyPhu.game.players.list[2].bankrupt && !__coTyPhu.game.players.list[0].bankrupt`), 'Luật chơi: người 2 phá sản, người 0 vẫn chơi');
    reportConsole(b, 'Kịch bản A');
  } finally {
    b.close();
  }
}

// C) Thiếu GLB: mô phỏng bằng cách trỏ businessman tới một file không tồn tại (chỉ trong kiểm thử).
async function scenarioC() {
  console.log('\n=== C. Thiếu file GLB (mô phỏng) ===');
  const b = await launch({ root: ROOT, port: 5203, debugPort: 9343 });
  try {
    await b.send('Page.navigate', { url: 'http://localhost:5203/?model.businessman=assets/models/characters/__missing__.glb&style=glb&mode=offline' });
    await b.waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 90000, 'menu');
    const e = await b.evaluate(`__coTyPhu.charAssets.status('businessman')`);
    check(e.status === 'failed' && /404/.test(e.error), 'File thiếu: báo lỗi 404 kèm đường dẫn', e.path);
    const toast = await b.evaluate(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`);
    check(/Không tải được 2\/6 mô hình nhân vật GLB/.test(toast), 'Thông báo lỗi hiển thị cho người chơi', toast.slice(0, 100));
    const badges = await b.evaluate(`[...document.querySelectorAll('.model-badge')].map(x => x.textContent)`);
    check(badges.join(',') === 'TẠM,GLB,GLB,GLB', 'Menu gắn nhãn TẠM đúng nhân vật thiếu GLB', badges.join(','));
    check(await b.evaluate(`(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return r.bottom <= innerHeight; })()`), 'Nút Bắt đầu vẫn hiển thị khi có cảnh báo');
    await b.evaluate(`document.getElementById('opt-placeholder').click(); document.getElementById('btn-start').click(); true`);
    await sleep(800);
    check(await b.evaluate('!__coTyPhu.game'), 'Tắt "cho phép mô hình tạm" thì không bắt đầu được (không âm thầm thay thế)');
    await b.evaluate(`document.getElementById('opt-placeholder').click(); document.getElementById('btn-start').click(); true`);
    await b.waitFor(`__coTyPhu.game && __coTyPhu.game.started`, 20000, 'ván bắt đầu');
    await sleep(1200);
    const sources = await b.evaluate(`[...__coTyPhu.characters.values()].map(c => c.source)`);
    const tags = await b.evaluate(`document.querySelectorAll('.player-card .tag.tmp').length`);
    check(sources.join(',') === 'placeholder,glb,glb,glb' && tags === 1, 'Chỉ nhân vật thiếu GLB dùng mô hình tạm, có nhãn TẠM', `${sources.join(',')}, ${tags} nhãn`);
    reportConsole(b, 'Kịch bản C');
  } finally {
    b.close();
  }
}

async function scenarioB() {
  console.log('\n=== B. Mô hình kiểm thử có rig (RobotExpressive, CC0) ===');
  const b = await launch({ root: ROOT, port: 5202, debugPort: 9342 });
  try {
    await b.send('Page.navigate', { url: `http://localhost:5202/?model.businessman=${FIXTURE}&model.engineer=${FIXTURE}&style=glb&mode=offline` });
    await b.waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 90000, 'menu');
    const e = await b.evaluate(`(() => { const e = __coTyPhu.charAssets.status('businessman'); return { status: e.status, info: e.info, norm: e.norm && { scale: e.norm.scale, worldSize: e.norm.worldSize } }; })()`);
    check(e.status === 'loaded', 'GLB tải thành công');
    check(e.info.hasSkeleton && e.info.bones > 0, 'Có skeleton', `${e.info.bones} xương, ${e.info.skinnedMeshes} skinned mesh`);
    check(e.info.materials > 0, 'Giữ nguyên material', `${e.info.materials} material, ${e.info.textures} texture`);
    console.log(`   Clip trong GLB: ${e.info.clips.map((c) => `${c.name}(${c.duration}s)`).join(', ')}`);
    console.log(`   Chuẩn hoá: scale ${e.norm.scale.toFixed(4)}, kích thước ${e.norm.worldSize.join(' × ')}`);
    check(Math.abs(e.norm.worldSize[1] - 1.2) < 0.01 || e.norm.worldSize[1] < 1.2, 'Scale đồng đều về chiều cao mục tiêu 1.2', `${e.norm.worldSize[1]}`);
    const loads = glbFetches(b);
    check(loads === 1, 'Cùng một GLB dùng cho 2 nhân vật chỉ tải 1 lần (cache)', `${loads} request`);

    await b.evaluate(`document.getElementById('btn-start').click(); true`);
    await b.waitFor(`__coTyPhu.game && __coTyPhu.game.started && !__coTyPhu.game.busy && __coTyPhu.game.phase === 'roll'`, 20000, 'ván bắt đầu');
    const clone = await b.evaluate(`(() => { const a = __coTyPhu.characters.get(0), d = __coTyPhu.characters.get(3);
      const bone = (c) => { let x = null; c.asset.animationRoot.traverse(o => { if (!x && o.isBone) x = o; }); return x; };
      const sk = (c) => { let x = null; c.asset.animationRoot.traverse(o => { if (!x && o.isSkinnedMesh) x = o; }); return x; };
      return { sources: [...__coTyPhu.characters.values()].map(c => c.source),
        distinctBones: bone(a).uuid !== bone(d).uuid, distinctSkeleton: sk(a).skeleton !== sk(d).skeleton,
        sharedGeometry: sk(a).geometry === sk(d).geometry, sharedMaterial: sk(a).material === sk(d).material,
        bonesBound: sk(a).skeleton.bones.every(bn => { let p = bn; while (p && p !== a.asset.animationRoot) p = p.parent; return !!p; }),
        mixers: [a.anim.mixer !== d.anim.mixer] }; })()`);
    check(clone.sources[0] === 'glb' && clone.sources[3] === 'glb', 'Nhân vật 1 và 4 dùng GLB', clone.sources.join(','));
    check(clone.distinctBones && clone.distinctSkeleton && clone.bonesBound, 'SkeletonUtils.clone: mỗi nhân vật có skeleton riêng, xương gắn đúng bản clone');
    check(clone.sharedGeometry && clone.sharedMaterial, 'Bản clone dùng chung geometry/material gốc (không sao chép, không ghi đè)');

    let s0 = await b.evaluate(controllerInfo(0));
    check(s0.state === 'idle' && s0.clip === 'Idle', 'Bắt đầu lượt: IDLE', `clip ${s0.clip}`);
    const foot0 = await b.evaluate(footOffset(0));
    check(Math.abs(foot0) < 0.03, 'Chân chạm mặt bàn (không lún, không nổi)', `lệch ${foot0}`);
    const minDist = await b.evaluate(`(() => { const ps = [...__coTyPhu.characters.values()].map(c => c.root.position); let m = 1e9;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) m = Math.min(m, ps[i].distanceTo(ps[j])); return +m.toFixed(3); })()`);
    check(minDist > 0.8, '4 nhân vật cùng đứng ô Bắt đầu không chồng lên nhau', `khoảng cách nhỏ nhất ${minDist}`);
    await b.evaluate(`__coTyPhu.camera.focusPoint(10.6, 10.6, { distance: 4.2, height: 2.2 }); true`);
    await sleep(1600);
    await b.shot(OUT, 'B1-glb-on-start');

    // Tung xúc xắc bằng nút UI, lấy mẫu trạng thái animation trong khi đi.
    await b.evaluate(`__coTyPhu.camera.reset(0.5); document.getElementById('btn-roll').click(); true`);
    const samples = [];
    const t0 = Date.now();
    let shotTaken = false;
    while (Date.now() - t0 < 30000) {
      const st = await b.evaluate(controllerInfo(0));
      samples.push(st);
      if (st.moving && !shotTaken && samples.filter((x) => x.moving).length > 4) {
        shotTaken = true;
        await b.shot(OUT, 'B2-walking');
      }
      if (await b.evaluate(`!__coTyPhu.game.busy && __coTyPhu.game.phase !== 'moving' && !!__coTyPhu.game.lastDice`)) break;
      await sleep(80);
    }
    // Chỉ xét lần di chuyển đầu (theo xúc xắc); thẻ Cơ hội/Khí vận có thể gây thêm một lần đi ngắn hơn.
    const firstMove = samples.findIndex((x) => x.moving);
    const endFirst = samples.findIndex((x, i) => i > firstMove && !x.moving);
    const moving = samples.slice(firstMove, endFirst < 0 ? undefined : endFirst);
    const clipOf = { walk: 'Walking', run: 'Running' };
    const allMoving = samples.filter((x) => x.moving);
    check(allMoving.every((x) => clipOf[x.state] === x.clip), 'Mọi mẫu khi di chuyển đều phát đúng clip của trạng thái');
    const dice = await b.evaluate('__coTyPhu.game.lastDice');
    const steps = dice[0] + dice[1];
    const expectedState = steps >= 7 ? 'run' : 'walk';
    const expectedClip = steps >= 7 ? 'Running' : 'Walking';
    check(moving.length > 0 && moving.every((x) => x.state === expectedState && x.clip === expectedClip),
      `Di chuyển ${steps} ô: ${expectedState.toUpperCase()} với clip ${expectedClip} trong suốt quãng đường`,
      `${moving.length} mẫu, timeScale ${moving[0]?.timeScale}, trạng thái gặp: ${[...new Set(moving.map((x) => `${x.state}/${x.clip}`))].join(', ')}`);
    const headings = new Set(moving.map((x) => Math.round(x.heading * 10)));
    check(headings.size >= 1, 'Nhân vật xoay theo hướng di chuyển', `${headings.size} hướng khác nhau`);
    await b.waitFor(`!__coTyPhu.characters.get(0).motion`, 5000);
    s0 = await b.evaluate(controllerInfo(0));
    const target = await b.evaluate(`(() => { const g = __coTyPhu.game; const p = g.players.list[0]; return g.board.getStandPoint(p.position, p.slot, p.inJail); })()`);
    const err = Math.hypot(s0.pos[0] - target.x, s0.pos[2] - target.z);
    const tile = await b.evaluate('__coTyPhu.game.players.list[0].position');
    check(err < 0.01 || (await b.evaluate('__coTyPhu.game.players.list[0].inJail')), 'Dừng đúng vị trí trên ô cuối cùng', `ô ${tile}, sai số ${err.toFixed(4)}`);
    check(['idle', 'celebrate'].includes(s0.state), 'Kết thúc di chuyển về IDLE', `${s0.state}/${s0.clip}`);

    // Mua đất -> CELEBRATE (clip Dance) một lần rồi về IDLE
    if (await b.evaluate(`__coTyPhu.game.phase === 'buy'`)) {
      await b.waitFor(`!document.getElementById('btn-buy').disabled`, 5000, 'nút Mua đất được bật');
      await b.evaluate(`document.getElementById('btn-buy').click(); true`);
      const seen = new Set();
      const t1 = Date.now();
      while (Date.now() - t1 < 12000) {
        const st = await b.evaluate(controllerInfo(0));
        seen.add(`${st.state}/${st.clip}`);
        if (st.state === 'celebrate' && seen.size && !seen.has('shot')) {
          seen.add('shot');
          await b.shot(OUT, 'B3-celebrate');
        }
        if (seen.has('celebrate/Dance') && st.state === 'idle') break;
        await sleep(100);
      }
      check(seen.has('celebrate/Dance'), 'Mua đất: phát CELEBRATE (clip Dance)', [...seen].filter((x) => x !== 'shot').join(' → '));
      const after = await b.evaluate(controllerInfo(0));
      check(after.state === 'idle' && after.clip === 'Idle', 'CELEBRATE (LoopOnce) kết thúc rồi tự về IDLE', `${after.state}/${after.clip}`);
    } else {
      console.log('   (ô dừng không mua được — bỏ qua bước mua đất)');
    }

    // Bấm vào nhân vật: camera zoom + bảng thông tin
    // Đưa nhân vật vào giữa màn hình để điểm bấm không bị giao diện che, rồi bấm thật lên canvas.
    await b.evaluate(`__coTyPhu.camera.reset(0.01).then(() => __coTyPhu.camera.panTo(__coTyPhu.characters.get(0).root.position, 0.01)).then(() => true)`);
    await sleep(500);
    const scr = await b.evaluate(`(() => { const c = __coTyPhu.characters.get(0); const v = c.root.position.clone(); v.y += c.height * 0.6;
      const s = __coTyPhu.scene.project(v); s.onCanvas = document.elementFromPoint(s.x, s.y) === __coTyPhu.scene.renderer.domElement; return s; })()`);
    check(scr.onCanvas, 'Điểm bấm vào nhân vật nằm trên canvas (không bị giao diện che)');
    await b.click(scr.x, scr.y);
    await sleep(1500);
    const zoom = await b.evaluate(`({ modal: !!document.querySelector('.player-modal'), dist: +__coTyPhu.camera.camera.position.distanceTo(__coTyPhu.camera.controls.target).toFixed(2), selected: __coTyPhu.characters.get(0).selectRing.visible })`);
    check(zoom.modal && zoom.dist < 7 && zoom.selected, 'Nhấn vào nhân vật: camera zoom tới, vòng chọn sáng, mở thông tin', `khoảng cách camera ${zoom.dist}`);
    await b.shot(OUT, 'B4-click-zoom');
    await b.evaluate(`document.querySelector('.player-modal [data-close]').click(); true`);

    // Debug panel
    await b.evaluate(`__coTyPhu.debug.toggle(true); __coTyPhu.debug.setHelpers(true); __coTyPhu.camera.reset(0.01); true`);
    await sleep(1200);
    await b.shot(OUT, 'B5-debug-panel');
    await b.evaluate(`__coTyPhu.debug.toggle(false); true`);

    // Phá sản nhân vật GLB thiếu clip "sad": phải bỏ qua an toàn (dùng Idle), không đổi material.
    await b.waitFor(`!__coTyPhu.game.busy`, 60000);
    const colorBefore = await b.evaluate(`(() => { let m; __coTyPhu.characters.get(3).asset.animationRoot.traverse(o => { if (!m && o.isMesh) m = o.material; }); return m.color.getHexString(); })()`);
    await b.evaluate(`(() => { const g = __coTyPhu.game; g._aiToken++; return g._lock(() => g._pay(g.players.list[3], 0, 99999, 'kiểm thử')); })()`);
    await sleep(500);
    const bk = await b.evaluate(controllerInfo(3));
    const colorAfter = await b.evaluate(`(() => { let m; __coTyPhu.characters.get(3).asset.animationRoot.traverse(o => { if (!m && o.isMesh) m = o.material; }); return m.color.getHexString(); })()`);
    check(bk.state === 'sad' && bk.clip === 'Sad (procedural)', 'Phá sản: GLB không có clip sad -> dùng clip Sad tự tạo từ Idle của model', `${bk.state}/${bk.clip}`);
    check(colorBefore === colorAfter, 'Không ghi đè material GLB khi phá sản', `#${colorBefore}`);

    // Huỷ ván & ván mới: không tải lại GLB
    await b.evaluate(`__coTyPhu.controller.newGame(); true`);
    await b.waitFor(`!!document.querySelector('#start-menu:not(.hidden)')`, 10000);
    await b.evaluate(`document.getElementById('btn-start').click(); true`);
    await b.waitFor(`__coTyPhu.game && __coTyPhu.game.started`, 20000);
    const loads2 = glbFetches(b);
    check(loads2 === 1, 'Ván mới không tải lại GLB (chỉ clone từ cache)', `${loads2} request`);
    const warnings = reportConsole(b, 'Kịch bản B');
    const animWarn = warnings.filter((w) => w.includes('[Animation]'));
    console.log(`   Cảnh báo clip thiếu: ${[...new Set(animWarn)].join(' | ')}`);
  } finally {
    b.close();
  }
}

try {
  await scenarioA();
  await scenarioB();
  await scenarioC();
} catch (err) {
  check(false, `Lỗi khi chạy kiểm thử: ${err.message}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? '✘' : '✔'} ${results.length - failed.length}/${results.length} kiểm tra đạt.`);
process.exit(failed.length ? 1 : 0);
