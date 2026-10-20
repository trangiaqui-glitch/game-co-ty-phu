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
const SIZE = 1.0;
const REST = [new THREE.Vector3(-0.85, SIZE / 2 + 0.08, 0.7), new THREE.Vector3(0.95, SIZE / 2 + 0.08, 1.3)];
const TEX = 256;

/** Vẽ một mặt xúc xắc: màu ngà ấm, viền vàng kim mảnh, chấm lõm bóng đẹp. `bump` = bản đồ độ cao cho chấm lõm. */
function faceCanvas(value, bump) {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext('2d');
  if (bump) {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, TEX, TEX);
  } else {
    const bg = g.createRadialGradient(TEX * 0.38, TEX * 0.32, TEX * 0.08, TEX / 2, TEX / 2, TEX * 0.78);
    bg.addColorStop(0, '#FFFFFF');
    bg.addColorStop(0.6, '#FFF9EB');
    bg.addColorStop(1, '#ECD7B0');
    g.fillStyle = bg;
    g.fillRect(0, 0, TEX, TEX);
    // Viền vàng kim mảnh tạo cảm giác xúc xắc cao cấp
    g.strokeStyle = 'rgba(218, 165, 32, 0.38)';
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(14, 14, TEX - 28, TEX - 28, 28);
    g.stroke();
  }
  const r = value === 1 ? TEX * 0.155 : TEX * 0.106;
  for (const [x, y] of PIPS[value]) {
    const cx = x * TEX;
    const cy = y * TEX;
    if (bump) {
      const d = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      d.addColorStop(0, '#000');
      d.addColorStop(0.8, '#444');
      d.addColorStop(1, '#fff');
      g.fillStyle = d;
    } else {
      const red = value === 1 || value === 4;
      const d = g.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.08, cx, cy, r);
      d.addColorStop(0, red ? '#FF5E62' : '#2E4077');
      d.addColorStop(0.75, red ? '#D62828' : '#1B254B');
      d.addColorStop(1, red ? '#9B111E' : '#0F1630');
      g.fillStyle = d;
    }
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function faceMaterial(value) {
  const map = new THREE.CanvasTexture(faceCanvas(value, false));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(faceCanvas(value, true));
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 2.3, roughness: 0.2, metalness: 0.05 });
}

export class DiceView {
  constructor(scene) {
    const geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 6, 0.16);
    const mats = FACE_VALUES.map(faceMaterial);
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
        const end = REST[i].clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.3));
        const start = new THREE.Vector3(end.x + 3.5 + i * 0.8, 5.2, end.z + 6);
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
