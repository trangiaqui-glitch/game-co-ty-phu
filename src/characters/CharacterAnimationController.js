import * as THREE from 'three';

export const ANIM_STATES = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  JUMP: 'jump',
  CELEBRATE: 'celebrate',
  SAD: 'sad',
  INTERACT: 'interact', // tung xúc xắc / thao tác
});

const ONE_SHOT = new Set([ANIM_STATES.JUMP, ANIM_STATES.CELEBRATE, ANIM_STATES.INTERACT]);
// Trạng thái lặp thiếu clip -> dùng trạng thái thay thế có thật (không phát clip không tồn tại).
const LOOP_FALLBACK = { run: 'walk', walk: 'idle', sad: 'idle' };

// Ánh xạ trạng thái -> clip theo bảng alias: khớp chính xác, rồi không phân biệt hoa thường,
// rồi tên clip chứa alias (ví dụ "Armature|Walk"). Mỗi clip chỉ gán cho một trạng thái.
export function resolveClips(clips, aliases) {
  const result = {};
  const used = new Set();
  const norm = (s) => s.toLowerCase();
  const strip = (s) => norm(s.split('|').pop());
  for (const state of Object.values(ANIM_STATES)) {
    const list = aliases?.[state] || [state];
    let found = null;
    for (const matcher of [
      (c, a) => c.name === a,
      (c, a) => strip(c.name) === norm(a),
      (c, a) => norm(c.name).includes(norm(a)),
    ]) {
      for (const a of list) {
        found = clips.find((c) => !used.has(c) && matcher(c, a));
        if (found) break;
      }
      if (found) break;
    }
    if (found) {
      result[state] = found;
      used.add(found);
    }
  }
  return result;
}

/**
 * Điều khiển animation của một nhân vật bằng một AnimationMixer duy nhất.
 * - Chỉ đổi action khi trạng thái thực sự thay đổi (không gọi play() mỗi frame).
 * - Crossfade giữa hai clip; clip cũ tự tắt khi trọng số về 0, nên không có
 *   hai clip toàn thân cùng chạy lâu dài.
 * - JUMP / CELEBRATE / INTERACT: LoopOnce, phát đúng một lần, xong thì về trạng thái nền.
 * - Clip thiếu: cảnh báo một lần (tên nhân vật + trạng thái) và bỏ qua an toàn.
 */
export class CharacterAnimationController {
  constructor({ root, clips, aliases, name, warnMissing = true }) {
    this.name = name;
    this.mixer = new THREE.AnimationMixer(root);
    this.root = root;
    this.clips = resolveClips(clips, aliases);
    this.availableClips = clips.map((c) => c.name);
    this.missing = Object.values(ANIM_STATES).filter((s) => !this.clips[s]);
    if (warnMissing && this.missing.length) {
      console.warn(`[Animation] Nhân vật "${name}" thiếu clip cho: ${this.missing.join(', ')}. Clip có sẵn: ${this.availableClips.join(', ') || '(không có)'}`);
    }
    this.actions = {};
    for (const [state, clip] of Object.entries(this.clips)) {
      const action = this.mixer.clipAction(clip);
      if (ONE_SHOT.has(state)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions[state] = action;
    }
    this.state = null; // trạng thái được yêu cầu
    this.playing = null; // trạng thái có clip đang phát
    this.baseState = ANIM_STATES.IDLE;
    this._oneShot = null;
    this._onFinished = (e) => {
      const os = this._oneShot;
      if (!os || e.action !== os.action) return;
      this._oneShot = null;
      this.set(os.then ?? this.baseState);
      os.resolve(true);
    };
    this.mixer.addEventListener('finished', this._onFinished);
    this.set(ANIM_STATES.IDLE, { fade: 0 });
  }

  has(state) {
    return !!this.actions[state];
  }

  // Trạng thái thực sự sẽ phát cho một trạng thái lặp (theo chuỗi thay thế).
  _resolveLoop(state) {
    let s = state;
    while (s && !this.actions[s]) s = LOOP_FALLBACK[s];
    return s || null;
  }

  setBase(state) {
    this.baseState = state;
  }

  /** Chuyển sang trạng thái lặp (idle/walk/run/sad). Không làm gì nếu trạng thái không đổi. */
  set(state, { fade = 0.25, timeScale = 1 } = {}) {
    if (ONE_SHOT.has(state)) return this.playOnce(state);
    if (this._oneShot) {
      // Một trạng thái lặp mới thay thế hoạt ảnh một lần đang chạy.
      const os = this._oneShot;
      this._oneShot = null;
      os.resolve(false);
    }
    this.state = state;
    const target = this._resolveLoop(state);
    if (!target) return Promise.resolve(false);
    const action = this.actions[target];
    if (this.playing === target) {
      action.setEffectiveTimeScale(timeScale);
      return Promise.resolve(true);
    }
    this._crossTo(action, fade, timeScale);
    this.playing = target;
    return Promise.resolve(true);
  }

  /** Phát một lần (jump/celebrate) rồi về `then` (mặc định trạng thái nền). Thiếu clip -> bỏ qua. */
  playOnce(state, then = null) {
    const action = this.actions[state];
    if (!action) return Promise.resolve(false);
    if (this._oneShot) {
      const os = this._oneShot;
      this._oneShot = null;
      os.resolve(false);
    }
    return new Promise((resolve) => {
      this._oneShot = { action, then, resolve };
      this.state = state;
      this._crossTo(action, 0.15, 1);
      this.playing = state;
    });
  }

  _crossTo(action, fade, timeScale) {
    const prev = this.playing ? this.actions[this.playing] : null;
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.play();
    if (prev && prev !== action && fade > 0) {
      action.crossFadeFrom(prev, fade, false);
    } else if (prev && prev !== action) {
      prev.stop();
    }
  }

  setTimeScale(timeScale) {
    if (this.playing && !ONE_SHOT.has(this.playing)) this.actions[this.playing].setEffectiveTimeScale(timeScale);
  }

  clipDuration(state) {
    const s = ONE_SHOT.has(state) ? state : this._resolveLoop(state);
    return s ? this.clips[s].duration : 0;
  }

  // Trạng thái lặp nào sẽ thực sự phát cho yêu cầu này (dùng để đồng bộ bước chân).
  effectiveLoopState(state) {
    return this._resolveLoop(state);
  }

  get currentClipName() {
    return this.playing ? this.clips[this.playing].name : null;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.removeEventListener('finished', this._onFinished);
    this._oneShot = null; // không resolve: luồng game đã huỷ không được chạy tiếp
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
