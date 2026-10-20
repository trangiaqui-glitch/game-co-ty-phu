import * as THREE from 'three';
import { lotusCoinMaterials } from './Materials.js';

const CONFETTI_COLORS = ['#FF6B6B', '#FFD147', '#00D2B8', '#38BDF8', '#A855F7', '#FF9F43'];

// Hiệu ứng hạt: tiền xu hoa sen vàng bay, mưa tiền, pháo giấy, bụi xây dựng.
export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.quality = 1;
    this.speed = 1;
    this.particles = [];
    this.coinGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.038, 22);
    this.coinMat = lotusCoinMaterials();
    this.coinPool = [];

    const cap = 500;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), cap);
    this.confetti.frustumCulled = false;
    this.confettiFree = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color();
    for (let i = cap - 1; i >= 0; i--) {
      this.confetti.setMatrixAt(i, zero);
      this.confetti.setColorAt(i, c.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
      this.confettiFree.push(i);
    }
    scene.add(this.confetti);
    this.dustMat = new THREE.MeshStandardMaterial({ color: '#E8DCC8', roughness: 1, transparent: true, opacity: 0.8 });
    this.dustGeo = new THREE.SphereGeometry(1, 10, 8);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
  }

  _coin() {
    const coin = this.coinPool.pop() || new THREE.Mesh(this.coinGeo, this.coinMat);
    coin.castShadow = true;
    coin.visible = true;
    this.scene.add(coin);
    return coin;
  }

  _releaseCoin(coin) {
    coin.visible = false;
    this.scene.remove(coin);
    this.coinPool.push(coin);
  }

  // Tiền xu bay theo đường cong từ `from` tới `to`.
  flyCoins(from, to, count = 6, duration = 0.9) {
    const n = Math.max(2, Math.round(count * (0.5 + this.quality * 0.5)));
    const promises = [];
    for (let i = 0; i < n; i++) {
      const coin = this._coin();
      coin.position.copy(from);
      const ctrl = from.clone().lerp(to, 0.5);
      ctrl.y += 2.2 + Math.random() * 0.8;
      ctrl.x += (Math.random() - 0.5) * 1.2;
      ctrl.z += (Math.random() - 0.5) * 1.2;
      promises.push(new Promise((resolve) => {
        this.particles.push({
          kind: 'bezier', obj: coin, from: from.clone(), ctrl, to: to.clone(), t: -i * 0.07, duration, spin: 8 + Math.random() * 6, resolve,
        });
      }));
    }
    return Promise.all(promises);
  }

  // Tiền xu bắn lên rồi rơi quanh một điểm (nhận thưởng).
  coinFountain(at, count = 14) {
    const n = Math.max(4, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const coin = this._coin();
      coin.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 1.5;
      this.particles.push({
        kind: 'physics', obj: coin, vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 2.5, Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), life: 1.3 + Math.random() * 0.4, floor: at.y - 0.6,
      });
    }
  }

  confettiBurst(at, count = 80) {
    const n = Math.round(count * this.quality);
    for (let i = 0; i < n && this.confettiFree.length; i++) {
      const idx = this.confettiFree.pop();
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.particles.push({
        kind: 'confetti', idx, pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 4, Math.sin(a) * sp),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 2 + Math.random(),
      });
    }
  }

  dust(at, count = 8) {
    const n = Math.max(3, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      const a = (i / n) * Math.PI * 2;
      m.position.set(at.x + Math.cos(a) * 0.15, at.y + 0.05, at.z + Math.sin(a) * 0.15);
      m.scale.setScalar(0.06);
      this.scene.add(m);
      this.particles.push({ kind: 'dust', obj: m, vel: new THREE.Vector3(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9), life: 0.7, maxLife: 0.7 });
    }
  }

  update(dt) {
    const d = dt * this.speed;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      let alive = true;
      if (p.kind === 'bezier') {
        p.t += d / p.duration;
        const t = Math.max(0, Math.min(1, p.t));
        const u = 1 - t;
        p.obj.position.set(
          u * u * p.from.x + 2 * u * t * p.ctrl.x + t * t * p.to.x,
          u * u * p.from.y + 2 * u * t * p.ctrl.y + t * t * p.to.y,
          u * u * p.from.z + 2 * u * t * p.ctrl.z + t * t * p.to.z,
        );
        p.obj.visible = p.t >= 0;
        p.obj.rotation.x += p.spin * d;
        p.obj.rotation.z += p.spin * 0.5 * d;
        if (p.t >= 1) {
          alive = false;
          this._releaseCoin(p.obj);
          p.resolve();
        }
      } else if (p.kind === 'physics') {
        p.life -= d;
        p.vel.y -= 12 * d;
        p.obj.position.addScaledVector(p.vel, d);
        if (p.obj.position.y < p.floor) {
          p.obj.position.y = p.floor;
          p.vel.y *= -0.35;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        }
        p.obj.rotation.x += p.spin.x * d;
        p.obj.rotation.y += p.spin.y * d;
        if (p.life <= 0) {
          alive = false;
          this._releaseCoin(p.obj);
        }
      } else if (p.kind === 'confetti') {
        p.life -= d;
        p.vel.y -= 6 * d;
        p.vel.multiplyScalar(1 - 1.6 * d);
        p.pos.addScaledVector(p.vel, d);
        p.rot.addScaledVector(p.spin, d);
        const s = p.life < 0.4 ? Math.max(0, p.life / 0.4) : 1;
        this._q.setFromEuler(this._e.set(p.rot.x, p.rot.y, p.rot.z));
        this.confetti.setMatrixAt(p.idx, this._m.compose(p.pos, this._q, this._s.set(s, s, s)));
        if (p.life <= 0) {
          alive = false;
          this.confetti.setMatrixAt(p.idx, this._m.makeScale(0, 0, 0));
          this.confettiFree.push(p.idx);
        }
      } else if (p.kind === 'dust') {
        p.life -= d;
        p.obj.position.addScaledVector(p.vel, d);
        const k = 1 - p.life / p.maxLife;
        p.obj.scale.setScalar(0.06 + k * 0.2);
        p.obj.material.opacity = 0.8 * (1 - k);
        if (p.life <= 0) {
          alive = false;
          this.scene.remove(p.obj);
          p.obj.material.dispose();
        }
      }
      if (!alive) this.particles.splice(i, 1);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const p of this.particles) {
      if (p.kind === 'bezier') {
        this._releaseCoin(p.obj);
        p.resolve();
      } else if (p.kind === 'physics') this._releaseCoin(p.obj);
      else if (p.kind === 'confetti') {
        this.confetti.setMatrixAt(p.idx, this._m.makeScale(0, 0, 0));
        this.confettiFree.push(p.idx);
      } else if (p.kind === 'dust') this.scene.remove(p.obj);
    }
    this.particles = [];
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}
