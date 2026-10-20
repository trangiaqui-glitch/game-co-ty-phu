import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Camera góc nhìn 3/4, xoay/zoom bằng OrbitControls, bay mượt tới mục tiêu
// và theo dõi nhân vật bằng cách chỉ tịnh tiến (không xoay) để tránh chóng mặt.
export class CameraManager {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 3.5; // đủ gần để xem rõ nhân vật khi bấm vào
    c.maxDistance = 62;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI * 0.43;
    c.screenSpacePanning = false;
    c.zoomSpeed = 0.9;
    c.rotateSpeed = 0.7;

    this.defaultTarget = new THREE.Vector3(0, 0, 1);
    this._basePosition = new THREE.Vector3(0, 23.5, 24.5);
    this.followEnabled = true;
    this.followObject = null;
    this.tween = null;
    this.userInteracting = false;
    this.autoRotate = false;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();

    c.addEventListener('start', () => {
      this.userInteracting = true;
      this._cancelTween();
    });
    c.addEventListener('end', () => {
      this.userInteracting = false;
    });

    camera.position.copy(this.defaultPosition);
    c.target.copy(this.defaultTarget);
    c.update();
  }

  // Góc nhìn mặc định vừa khít bàn cờ theo tỉ lệ màn hình: màn hình dọc (điện thoại) nhìn cao hơn
  // và lùi xa hơn để thấy trọn chiều ngang bàn cờ.
  get defaultPosition() {
    const aspect = this.camera.aspect || 1.6;
    if (aspect >= 1.3) return this._basePosition.clone();
    const fit = Math.min(3.2, 1.45 / aspect);
    const pos = new THREE.Vector3(0, 27, 16).multiplyScalar(fit * 0.82);
    this.controls.maxDistance = Math.max(62, pos.length() * 1.3);
    return pos.add(this.defaultTarget);
  }

  _cancelTween() {
    if (this.tween) {
      const { resolve } = this.tween;
      this.tween = null;
      resolve();
    }
  }

  setAutoRotate(on) {
    this.autoRotate = on;
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.45;
  }

  flyTo(target, position, duration = 1.1) {
    this._cancelTween();
    return new Promise((resolve) => {
      this.tween = {
        t: 0,
        duration,
        fromTarget: this.controls.target.clone(),
        fromPos: this.camera.position.clone(),
        toTarget: target.clone(),
        toPos: position.clone(),
        resolve,
      };
    });
  }

  reset(duration = 1.1) {
    return this.flyTo(this.defaultTarget, this.defaultPosition, duration);
  }

  // Bay tới ô đất: nhìn từ phía ngoài bàn cờ vào.
  focusPoint(x, z, { distance = 11, height = 9 } = {}) {
    const target = new THREE.Vector3(x, 0.4, z);
    const out = new THREE.Vector3(x, 0, z);
    if (out.lengthSq() < 0.01) out.set(0, 0, 1);
    out.normalize();
    const position = target.clone().addScaledVector(out, distance).add(new THREE.Vector3(0, height, 0));
    return this.flyTo(target, position, 1.0);
  }

  // Tịnh tiến camera để mục tiêu nằm ở giữa, giữ nguyên góc nhìn hiện tại.
  panTo(point, duration = 0.9) {
    const offset = this._tmp.copy(this.camera.position).sub(this.controls.target);
    const target = new THREE.Vector3(point.x, 0, point.z);
    target.lerp(this.defaultTarget, 0.35);
    return this.flyTo(target, target.clone().add(offset), duration);
  }

  follow(object) {
    this.followObject = object;
  }

  stopFollow() {
    this.followObject = null;
  }

  update(dt) {
    const c = this.controls;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = easeInOutCubic(tw.t);
      c.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      if (tw.t >= 1) {
        this.tween = null;
        tw.resolve();
      }
    } else if (this.followObject && this.followEnabled && !this.userInteracting) {
      const p = this.followObject.getWorldPosition(this._tmp);
      p.y = 0;
      p.lerp(this.defaultTarget, 0.35); // giữ phần lớn bàn cờ trong khung hình
      const delta = this._tmp2.copy(p).sub(c.target).multiplyScalar(1 - Math.exp(-dt * 2.2));
      c.target.add(delta);
      this.camera.position.add(delta);
    }
    c.update();
  }
}
