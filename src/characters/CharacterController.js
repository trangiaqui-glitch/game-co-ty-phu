import * as THREE from 'three';
import { CharacterAnimationController, ANIM_STATES } from './CharacterAnimationController.js';
import { WALK_SPEED, RUN_SPEED } from '../data/characterConfig.js';

const GREY = new THREE.Color('#9e9e9e');

/**
 * Một nhân vật trên bàn cờ: vị trí/hướng, di chuyển theo đường đi bằng delta time,
 * điều khiển animation, vòng chỉ báo lượt và vòng chọn. Không ghi đè material của GLB.
 */
export class CharacterController {
  constructor({ asset, player, def }) {
    this.player = player;
    this.def = def;
    this.asset = asset;
    this.source = asset.source;
    this.root = new THREE.Group();
    this.root.name = `player-${player.id}`;
    this.root.add(asset.root);
    this.root.traverse((o) => {
      o.userData.playerId = player.id;
    });
    this.height = asset.norm?.worldSize?.[1] || 1.2;

    this.anim = new CharacterAnimationController({
      root: asset.animationRoot,
      clips: asset.clips,
      aliases: asset.config?.animationAliases,
      name: `${def.name} (${def.id})`,
      warnMissing: asset.source === 'glb',
    });
    this.motionCfg = asset.motion;

    this.heading = 0;
    this.targetHeading = 0;
    this.motion = null;
    this.baseY = 0;

    this._buildIndicators(player.color);
    if (asset.ownsMaterials) this._collectOwnMaterials();
  }

  // ------------------------------------------------------------ indicators
  _buildIndicators(color) {
    const ringGeo = new THREE.RingGeometry(0.34, 0.44, 40).rotateX(-Math.PI / 2);
    this.turnRingMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    this.turnRing = new THREE.Mesh(ringGeo, this.turnRingMat);
    this.turnRing.position.y = 0.015;
    this.turnRing.renderOrder = 1;
    this.turnRing.visible = false;
    this.root.add(this.turnRing);

    const selGeo = new THREE.RingGeometry(0.46, 0.52, 40).rotateX(-Math.PI / 2);
    this.selectRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    this.selectRing = new THREE.Mesh(selGeo, this.selectRingMat);
    this.selectRing.position.y = 0.02;
    this.selectRing.visible = false;
    this.root.add(this.selectRing);

    this.selectArrowMat = new THREE.MeshBasicMaterial({ color: '#FFD54F' });
    this.selectArrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 16).rotateX(Math.PI), this.selectArrowMat);
    this.selectArrow.visible = false;
    this.root.add(this.selectArrow);
  }

  setActiveTurn(on) {
    this.turnRing.visible = on;
  }

  setSelected(on) {
    this.selectRing.visible = on;
    this.selectArrow.visible = on;
  }

  // Chỉ nhân vật tạm có material riêng; GLB dùng chung material gốc nên không tô xám.
  _collectOwnMaterials() {
    const set = new Set();
    this.asset.root.traverse((o) => {
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) set.add(m);
    });
    this.ownMaterials = [...set];
    this.originalColors = this.ownMaterials.map((m) => m.color?.clone());
  }

  setBankrupt(on) {
    this.turnRingMat.color.set(on ? '#888888' : this.player.color);
    if (!this.ownMaterials) return;
    this.ownMaterials.forEach((m, i) => {
      if (!m.color || !this.originalColors[i]) return;
      m.color.copy(this.originalColors[i]);
      if (on) m.color.lerp(GREY, 0.75);
    });
  }

  // ------------------------------------------------------------ animation API
  get animState() {
    return this.anim.state;
  }

  play(state, opts) {
    return this.anim.set(state, opts);
  }

  playOnce(state, then = null) {
    return this.anim.playOnce(state, then);
  }

  setBase(state) {
    this.anim.setBase(state);
    if (!this.motion && !this.anim._oneShot) this.anim.set(state);
  }

  // ------------------------------------------------------------ orientation
  faceYaw(yaw, immediate = false) {
    this.targetHeading = yaw;
    if (immediate) {
      this.heading = yaw;
      this.root.rotation.y = yaw;
    }
  }

  faceTowards(x, z, immediate = false) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.faceYaw(Math.atan2(dx, dz), immediate);
  }

  placeAt(point) {
    this.root.position.set(point.x, point.y, point.z);
    this.baseY = point.y;
  }

  // ------------------------------------------------------------ movement
  /**
   * Đi lần lượt qua các điểm với tốc độ không đổi (delta time). Clip walk/run được
   * chỉnh timeScale theo tốc độ và độ dài sải chân để chân không trượt.
   * onPoint(i) được gọi khi đi tới điểm thứ i.
   */
  moveAlong(points, { run = false, onPoint } = {}) {
    if (!points.length) return Promise.resolve();
    const wanted = run ? ANIM_STATES.RUN : ANIM_STATES.WALK;
    const playing = this.anim.effectiveLoopState(wanted);
    const speed = playing === ANIM_STATES.RUN ? RUN_SPEED : WALK_SPEED;
    let timeScale = 1;
    if (playing === ANIM_STATES.RUN || playing === ANIM_STATES.WALK) {
      const stride = playing === ANIM_STATES.RUN ? this.motionCfg.runStride : this.motionCfg.walkStride;
      timeScale = (speed * this.anim.clipDuration(playing)) / stride;
    }
    this.anim.set(wanted, { fade: 0.15, timeScale });
    return new Promise((resolve) => {
      this.motion = { points: points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), index: 0, speed, onPoint, resolve };
    });
  }

  _updateMotion(dt) {
    const m = this.motion;
    let budget = m.speed * dt;
    const pos = this.root.position;
    while (budget > 0 && m.index < m.points.length) {
      const target = m.points[m.index];
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) this.targetHeading = Math.atan2(dx, dz);
      if (dist <= budget) {
        pos.set(target.x, target.y, target.z);
        budget -= dist;
        const i = m.index++;
        m.onPoint?.(i);
      } else {
        pos.x += (dx / dist) * budget;
        pos.z += (dz / dist) * budget;
        pos.y = target.y;
        budget = 0;
      }
    }
    if (m.index >= m.points.length) {
      this.motion = null;
      this.baseY = pos.y;
      this.anim.set(this.anim.baseState, { fade: 0.2 });
      m.resolve();
    }
  }

  update(dt, elapsed = 0) {
    if (this.motion) this._updateMotion(dt);
    this.anim.update(dt);
    let diff = this.targetHeading - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * (1 - Math.exp(-dt * 12));
    this.root.rotation.y = this.heading;
    if (this.turnRing.visible) {
      this.turnRingMat.opacity = 0.55 + Math.sin(elapsed * 4) * 0.3;
      this.turnRing.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.06);
    }
    if (this.selectArrow.visible) {
      this.selectArrow.position.y = this.height + 0.35 + Math.sin(elapsed * 3) * 0.08;
      this.selectArrow.rotation.y = elapsed * 2;
    }
  }

  dispose() {
    this.setBankrupt(false);
    this.anim.dispose();
    // Không resolve chuyển động dở dang: luồng game cũ đã huỷ phải dừng hẳn, không chạy tiếp.
    this.motion = null;
    this.root.parent?.remove(this.root);
    for (const o of [this.turnRing, this.selectRing, this.selectArrow]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    // Geometry/material của GLB thuộc về CharacterAssetManager (dùng chung giữa các bản clone).
    if (this.ownMaterials) this.ownMaterials.forEach((m) => m.dispose());
  }
}
