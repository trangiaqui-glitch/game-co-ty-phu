// Cấu hình mô hình GLB của nhân vật. Đây là nguồn duy nhất về đường dẫn model,
// tỷ lệ, hướng và bảng ánh xạ tên animation clip.
//
// - modelPath:       đường dẫn GLB (tương đối với index.html). File phải tồn tại thật;
//                    nếu thiếu, game báo lỗi rõ ràng (không âm thầm thay thế).
// - scale:           hệ số nhân thêm sau khi chuẩn hoá chiều cao (1 = cao CHARACTER_TARGET_HEIGHT).
// - rotationOffset:  xoay quanh trục Y (radian) để mặt nhân vật hướng +Z.
// - footOffset:      dịch theo trục Y (đơn vị thế giới) nếu chân model bị lún/nổi.
// - walkStride / runStride: quãng đường đi được trong MỘT chu kỳ clip walk/run (đơn vị thế giới),
//                    dùng để đồng bộ tốc độ clip với tốc độ di chuyển (không trượt chân).
// - animationAliases: tên clip có thể có trong GLB cho từng trạng thái (thử theo thứ tự).

// Kiểu nhân vật: 'toon' = nhân vật 3D hoạt hình dựng bằng code (mặc định, giống phim hoạt hình 3D);
// 'glb' = các model Quaternius trong assets/models/characters. Đổi nhanh bằng URL: ?style=glb
export const CHARACTER_STYLE = (() => {
  try {
    return new URLSearchParams(location.search).get('style') === 'glb' ? 'glb' : 'toon';
  } catch {
    return 'toon';
  }
})();

export const CHARACTER_TARGET_HEIGHT = 1.2; // ô cờ rộng 2 đơn vị
export const CHARACTER_MAX_FOOTPRINT = 0.9; // chiều ngang tối đa để không lấn sang vị trí người khác
export const WALK_SPEED = 4.2; // đơn vị thế giới / giây (nhân với tốc độ hoạt ảnh của game)
export const RUN_SPEED = 7.0;
export const RUN_MIN_STEPS = 7; // đi từ 7 ô trở lên thì chạy (nếu có clip run)

export const DEFAULT_ANIMATION_ALIASES = {
  idle: ['Idle', 'idle', 'Standing', 'Idle_Neutral', 'Breathing Idle', 'Stand'],
  walk: ['Walk', 'Walking', 'walk', 'Walk_Forward'],
  run: ['Run', 'Running', 'run', 'Run_Forward', 'Jog'],
  jump: ['Jump', 'jump', 'Jumping', 'Jump_Start'],
  celebrate: ['Celebrate', 'Victory', 'Win', 'Cheer', 'Cheering', 'Dance', 'ThumbsUp', 'Wave'],
  sad: ['Sad', 'Defeat', 'Lose', 'Defeated', 'Crying', 'Disappointed'],
  interact: ['Interact', 'Throw', 'Use', 'Yes'],
};

// Clip do project tự tạo bằng code trên chính skeleton của GLB khi file không có sẵn
// (luôn được ghi rõ "procedural" trong bảng debug và báo cáo; không thay thế clip có thật).
export const PROCEDURAL_CLIPS = { sad: true };

const base = (id, displayName, overrides = {}) => ({
  id,
  name: displayName,
  displayName,
  modelPath: `assets/models/characters/${id}.glb`,
  scale: 1,
  rotationOffset: 0,
  footOffset: 0,
  walkStride: 1.1,
  runStride: 2.0,
  animationAliases: DEFAULT_ANIMATION_ALIASES,
  licenseSource: null, // chưa có asset
  licenseType: null,
  ...overrides,
});

// Bộ nhân vật Quaternius (cùng rig "CharacterArmature" 62 xương, cùng 24 clip, không texture —
// màu nằm trong material). Nguồn và giấy phép chi tiết: ASSET_LICENSES.md.
// Sải chân đo từ chuyển động xương bàn chân trong clip Walk/Run sau khi chuẩn hoá cao 1.2.
const QUATERNIUS = (polyPizzaId, originalName) => ({
  licenseSource: `https://poly.pizza/m/${polyPizzaId}`,
  licenseType: 'CC0 1.0 (Public Domain)',
  author: 'Quaternius',
  originalName,
  // Đo được: Walk ≈ 1.17–1.19, Run ≈ 1.57–1.64 đơn vị / chu kỳ; hướng mặt +Z khi đi (rotationOffset 0).
  walkStride: 1.19,
  runStride: 1.6,
});

export const CHARACTER_CONFIG = {
  businessman: base('businessman', 'Anh Minh — Doanh nhân', QUATERNIUS('JFrLIKqvCH', 'Business Man')),
  businesswoman: base('businesswoman', 'Chị Lan — Nữ doanh nhân', QUATERNIUS('sOUciDsoVV', 'Suit')),
  explorer: base('explorer', 'Tuấn — Nhà thám hiểm', QUATERNIUS('5EGWBMpuXq', 'Adventurer')),
  engineer: base('engineer', 'Kỹ sư Hùng — Kỹ sư xây dựng', QUATERNIUS('Yg2bQZO6Hj', 'Worker')),
  // Chưa có model đầu bếp có rig cùng bộ → file chef.glb chưa tồn tại, dùng mô hình tạm có nhãn.
  chef: base('chef', 'Bếp trưởng Mai — Đầu bếp'),
  astronaut: base('astronaut', 'Phi hành gia Nam', QUATERNIUS('3hC2i0CTuO', 'Astronaut')),
};

// Chính sách khi thiếu GLB: dùng mô hình tạm (khối hình học) nhưng LUÔN hiển thị rõ ràng
// (thông báo, nhãn "TẠM" trên thẻ người chơi, bảng debug). Người chơi có thể tắt trong menu.
export const PLACEHOLDER_POLICY = { allowByDefault: true };

// Thông số của nhân vật tạm (clip thủ tục), dùng chung cơ chế đồng bộ bước chân.
export const PLACEHOLDER_MOTION = { walkStride: 1.0, runStride: 1.4 };

export function getCharacterConfig(id) {
  return CHARACTER_CONFIG[id] || null;
}

// Cho phép thử nhanh một GLB khác qua URL, ví dụ:
//   ?model.businessman=tests/fixtures/robot-expressive/RobotExpressive.glb
// Chỉ chấp nhận đường dẫn tương đối trong project (không tải từ domain khác).
export function applyModelOverrides(search = globalThis.location?.search || '') {
  const applied = [];
  const params = new URLSearchParams(search);
  for (const [key, value] of params) {
    if (!key.startsWith('model.')) continue;
    const id = key.slice(6);
    const cfg = CHARACTER_CONFIG[id];
    if (!cfg || !/^[\w\-./]+\.(glb|gltf)$/i.test(value) || value.includes('..') || value.startsWith('/')) {
      console.warn(`[characterConfig] Bỏ qua tham số không hợp lệ ${key}=${value}`);
      continue;
    }
    CHARACTER_CONFIG[id] = { ...cfg, modelPath: value, overridden: true };
    applied.push({ id, path: value });
  }
  return applied;
}
