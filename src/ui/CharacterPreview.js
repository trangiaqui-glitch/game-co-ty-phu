import * as THREE from 'three';
import { CharacterAnimationController, ANIM_STATES } from '../characters/CharacterAnimationController.js';

/**
 * Nhân vật 3D động trong sảnh chờ (renderer riêng, chỉ chạy khi đang hiển thị).
 * Dùng chính GLB + skeleton + clip của nhân vật trong game; thiếu GLB thì dùng mô hình tạm (có nhãn).
 */
export class CharacterPreview {
  constructor(canvas, charAssets) {
    this.canvas = canvas;
    this.charAssets = charAssets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#fffdf6', '#ffe0b5', 2.15));
    const key = new THREE.DirectionalLight('#fff8eb', 2.45);
    key.position.set(2.2, 4.2, 3.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#5ce1e6', 1.35);
    rim.position.set(-3, 2.2, -2);
    this.scene.add(rim);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.64, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: '#fff8e7', roughness: 0.35, metalness: 0.05 }),
    );
    pedestal.position.y = -0.06;
    this.scene.add(pedestal);
    const goldBase = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.022, 12, 64).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#F5B82E', metalness: 0.78, roughness: 0.25 }),
    );
    goldBase.position.y = -0.01;
    this.scene.add(goldBase);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.026, 12, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7a5cff' }));
    this.ring.position.y = 0.006;
    this.scene.add(this.ring);
    this.camera = new THREE.PerspectiveCamera(29, 1, 0.1, 20);
    this.camera.position.set(0, 0.98, 3.22);
    this.camera.lookAt(0, 0.62, 0);
    this.clock = new THREE.Clock();
    this.model = null;
    this.anim = null;
    this.characterId = null;
    this.running = false;
    this._loop = this._loop.bind(this);
    this.dragYaw = 0.3;
    this._bindDrag();
  }

  _bindDrag() {
    let last = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      last = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (last === null) return;
      this.dragYaw += (e.clientX - last) * 0.012;
      last = e.clientX;
    });
    const end = () => {
      last = null;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('click', () => this.anim?.playOnce(ANIM_STATES.CELEBRATE));
  }

  setCharacter(id, color, { celebrate = true } = {}) {
    if (this.characterId === id) {
      if (celebrate) this.anim?.playOnce(ANIM_STATES.CELEBRATE);
      return;
    }
    this._clear();
    this.characterId = id;
    const asset = this.charAssets.cloneCharacter(id) || this.charAssets.createPlaceholder(id);
    this.asset = asset;
    this.model = asset.root;
    this.scene.add(this.model);
    this.anim = new CharacterAnimationController({
      root: asset.animationRoot, clips: asset.clips, aliases: asset.config?.animationAliases, name: `preview:${id}`, warnMissing: false,
    });
    this.ring.material.color.set(color || '#7a5cff');
    if (celebrate) this.anim.playOnce(ANIM_STATES.CELEBRATE);
  }

  _clear() {
    if (!this.model) return;
    this.anim?.dispose();
    this.scene.remove(this.model);
    if (this.asset?.ownsMaterials) {
      this.model.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose?.();
        }
      });
    }
    this.model = null;
    this.anim = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    const dt = Math.min(0.1, this.clock.getDelta());
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.model) {
      this.anim.update(dt);
      this.model.rotation.y = this.dragYaw;
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
