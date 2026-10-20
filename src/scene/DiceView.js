import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Giá trị mặt theo thứ tự nhóm vật liệu của BoxGeometry: +x, -x, +y, -y, +z, -z.
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
const FACE_ROT = {
  1: new THREE.Euler(0, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
  3: new THREE.Euler(0, 0, Math.PI / 2),
  4: new THREE.Euler(0, 0, -Math.PI / 2),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
};
const SIZE = 0.62;
const REST = [new THREE.Vector3(-0.55, SIZE / 2 + 0.08, 0.55), new THREE.Vector3(0.6, SIZE / 2 + 0.08, 0.95)];

function faceTexture(value) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFDF7';
  g.fillRect(0, 0, 128, 128);
  for (const [x, y] of PIPS[value]) {
    g.beginPath();
    g.arc(x * 128, y * 128, value === 1 ? 17 : 12, 0, Math.PI * 2);
    g.fillStyle = value === 1 ? '#E53935' : '#2B2340';
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DiceView {
  constructor(scene) {
    const geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.1);
    const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.3, metalness: 0.02 }));
    this.dice = [0, 1].map((i) => {
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.copy(REST[i]);
      m.quaternion.copy(this.orientation(i ? 5 : 3, i * 0.6));
      scene.add(m);
      return m;
    });
    this.anim = null;
  }

  orientation(value, yaw = 0) {
    const qFace = new THREE.Quaternion().setFromEuler(FACE_ROT[value]);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return qYaw.multiply(qFace);
  }

  roll(values, duration = 1.2) {
    if (this.anim) this.anim.resolve();
    return new Promise((resolve) => {
      const items = this.dice.map((die, i) => {
        const yaw = (Math.random() - 0.5) * 1.2;
        const end = REST[i].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.4));
        const start = new THREE.Vector3(end.x + 2.5 + i * 0.6, 3.6, end.z + 4.2);
        const spin = new THREE.Vector3(
          (4 + Math.floor(Math.random() * 3)) * Math.PI * (Math.random() < 0.5 ? -1 : 1),
          (2 + Math.floor(Math.random() * 3)) * Math.PI,
          (4 + Math.floor(Math.random() * 3)) * Math.PI * (Math.random() < 0.5 ? -1 : 1),
        );
        return { die, start, end, spin, target: this.orientation(values[i], yaw), delay: i * 0.08 };
      });
      this.anim = { t: 0, duration, items, resolve };
    });
  }

  update(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const tumble = new THREE.Quaternion();
    const euler = new THREE.Euler();
    let done = true;
    for (const it of a.items) {
      const t = Math.min(1, Math.max(0, (a.t - it.delay) / a.duration));
      if (t < 1) done = false;
      const e = 1 - Math.pow(1 - t, 3);
      it.die.position.x = THREE.MathUtils.lerp(it.start.x, it.end.x, e);
      it.die.position.z = THREE.MathUtils.lerp(it.start.z, it.end.z, e);
      it.die.position.y = it.end.y + (it.start.y - it.end.y) * Math.pow(1 - t, 2) * Math.abs(Math.cos(t * Math.PI * 2.5));
      const k = Math.pow(1 - t, 2);
      euler.set(it.spin.x * k, it.spin.y * k, it.spin.z * k);
      tumble.setFromEuler(euler);
      it.die.quaternion.copy(it.target).multiply(tumble);
    }
    if (done) {
      this.anim = null;
      a.resolve();
    }
  }
}
