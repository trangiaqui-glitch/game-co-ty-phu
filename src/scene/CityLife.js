import * as THREE from 'three';
import { mat, GEO, part, glass, gold } from './ModelFactory.js';
import { facadeMaterial, stoneMaterial, roofMaterial, woodMaterial } from './Materials.js';
import { LANDMARKS } from './CityLandmarks.js';

// ---------------------------------------------------------------------------
// Thành phố sống động ở giữa bàn cờ: các khối nhà nhiều tầng đủ màu (ban công,
// tháp kính, toà tròn, mái pin mặt trời...), vỉa hè lát đá, dân cư đi bộ,
// xe buýt và xe ô tô chạy hai chiều trên vòng đường. Phong cách thành phố mô phỏng.
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function box(g, material, x, y, z, w, h, d) {
  g.add(part(GEO.box(), material, [x, y + h / 2, z], [w, h, d]));
}

// Dải ban công: mỗi tầng một tấm sàn nhô ra + lan can màu tương phản ở mặt tiền (hướng -z).
function balconies(g, x, z, w, y0, floors, floorH, slabColor, railColor) {
  const slab = mat(slabColor, { roughness: 0.6 });
  const rail = mat(railColor, { roughness: 0.4, metalness: 0.2 });
  for (let i = 0; i < floors; i++) {
    const y = y0 + i * floorH;
    box(g, slab, x, y, z - 0.07, w * 0.92, 0.018, 0.12);
    box(g, rail, x, y + 0.018, z - 0.125, w * 0.92, 0.04, 0.008);
  }
}

// Thiết bị trên mái: máy lạnh, bồn nước, ăng-ten.
function rooftop(g, y, w, d, rand, { solar = false } = {}) {
  const metal = mat('#B8BEC6', { metalness: 0.6, roughness: 0.35 });
  const dark = mat('#4B5563', { roughness: 0.5 });
  if (solar) {
    const panel = new THREE.MeshStandardMaterial({ color: '#1F4E8C', roughness: 0.2, metalness: 0.6 });
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        g.add(part(GEO.box(), panel, [-w * 0.22 + i * w * 0.3, y + 0.04, -d * 0.18 + j * d * 0.3], [w * 0.26, 0.012, d * 0.26], [-0.45, 0, 0]));
      }
    }
  }
  for (let i = 0; i < 2; i++) {
    box(g, metal, (rand() - 0.5) * w * 0.6, y, (rand() - 0.5) * d * 0.5, 0.1, 0.05, 0.08);
    g.add(part(GEO.cyl(10), dark, [(rand() - 0.5) * w * 0.6, y + 0.05, (rand() - 0.5) * d * 0.5], [0.03, 0.02, 0.03]));
  }
  g.add(part(GEO.cyl(8), metal, [w * 0.3, y + 0.14, d * 0.2], [0.008, 0.28, 0.008]));
  g.add(part(GEO.cyl(8), metal, [w * 0.3, y + 0.2, d * 0.2], [0.04, 0.004, 0.004], [0, 0, 0]));
}

const PALETTES = [
  { wall: '#FFC76B', trim: '#D8402E', win: '#9ad8ff', balc: '#FF7A1A' },
  { wall: '#FF8FA3', trim: '#8E2DB5', win: '#bfe6ff', balc: '#FFD21F' },
  { wall: '#8FE0A0', trim: '#12823F', win: '#a9e0ff', balc: '#2ECC71' },
  { wall: '#8FB8FF', trim: '#1747B8', win: '#9fd0ff', balc: '#FF9F1C' },
  { wall: '#FFA970', trim: '#B3420B', win: '#ffe2a8', balc: '#E74C3C' },
];

const BUILDERS = {
  // Chung cư nhiều tầng có ban công màu.
  apartment(rand) {
    const g = new THREE.Group();
    const p = PALETTES[Math.floor(rand() * PALETTES.length)];
    const floors = 5 + Math.floor(rand() * 3);
    const h = floors * 0.2;
    const wall = facadeMaterial(p.wall, { cols: 4, rows: floors, window: p.win, brick: rand() < 0.4 });
    box(g, wall, 0, 0.0, 0, 0.95, h, 0.7);
    box(g, mat(p.trim, { roughness: 0.5 }), 0, h, 0, 1.02, 0.07, 0.77);
    balconies(g, 0, -0.35, 0.95, 0.12, floors - 1, 0.2, '#f5efe6', p.balc);
    // khối bậc thang phía trên
    box(g, facadeMaterial(p.wall, { cols: 3, rows: 2, window: p.win }), 0.12, h + 0.07, 0.05, 0.58, 0.36, 0.45);
    box(g, mat(p.trim, { roughness: 0.5 }), 0.12, h + 0.43, 0.05, 0.64, 0.05, 0.5);
    // tầng trệt cửa hàng có mái hiên sọc
    box(g, mat(p.trim, { roughness: 0.55 }), 0, 0.16, -0.4, 0.95, 0.03, 0.12);
    box(g, mat('#ffffff'), -0.2, 0.17, -0.4, 0.2, 0.025, 0.121);
    box(g, mat('#ffffff'), 0.2, 0.17, -0.4, 0.2, 0.025, 0.121);
    rooftop(g, h + 0.46, 0.5, 0.4, rand);
    return g;
  },
  // Tháp kính bậc thang, có sân bay trực thăng và ăng-ten.
  tower(rand) {
    const g = new THREE.Group();
    const glassMat = facadeMaterial('#B9D4F0', { cols: 4, rows: 8, window: '#5b9cff', frame: '#e9f2ff', glassy: true });
    let y = 0;
    for (const [w, d, h] of [[0.8, 0.7, 0.9], [0.62, 0.55, 0.7], [0.44, 0.4, 0.55]]) {
      box(g, glassMat, 0, y, 0, w, h, d);
      y += h;
      box(g, mat('#E8EDF3', { metalness: 0.4, roughness: 0.3 }), 0, y, 0, w + 0.05, 0.04, d + 0.05);
      y += 0.04;
    }
    g.add(part(GEO.cyl(10), mat('#d0d4da', { metalness: 0.8, roughness: 0.2 }), [0, y + 0.3, 0], [0.012, 0.6, 0.012]));
    g.add(part(GEO.sphere(), mat('#ff3030', { emissive: '#ff0000', emissiveIntensity: 1.2 }), [0, y + 0.62, 0], [0.025, 0.025, 0.025]));
    box(g, mat('#2f3640'), 0.0, 0, -0.38, 0.5, 0.12, 0.08);
    return g;
  },
  // Toà nhà tròn có mái vòm kính (xanh dương) và dải viền màu.
  rotunda(rand) {
    const g = new THREE.Group();
    const wall = facadeMaterial('#F2C98F', { cols: 10, rows: 4, window: '#9fd8ff' });
    g.add(part(GEO.cyl(32), wall, [0, 0.4, 0], [0.5, 0.8, 0.5]));
    g.add(part(GEO.cyl(32), mat('#D35400', { roughness: 0.45 }), [0, 0.82, 0], [0.54, 0.05, 0.54]));
    g.add(part(GEO.hemi(), new THREE.MeshPhysicalMaterial({ color: '#4FA3E0', roughness: 0.08, metalness: 0.3, transmission: 0.0, clearcoat: 1 }), [0, 0.84, 0], [0.46, 0.34, 0.46]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g.add(part(GEO.torus(), mat('#E8EDF3', { metalness: 0.7, roughness: 0.2 }), [0, 0.84, 0], [0.46, 0.46, 0.01], [0, a, 0]));
    }
    g.add(part(GEO.cyl(10), gold(), [0, 1.25, 0], [0.01, 0.12, 0.01]));
    return g;
  },
  // Trung tâm thương mại thấp, mái răng cưa, biển hiệu và bãi xe.
  mall(rand) {
    const g = new THREE.Group();
    const p = PALETTES[Math.floor(rand() * PALETTES.length)];
    box(g, facadeMaterial('#F1F1EC', { cols: 6, rows: 2, window: '#a9dcff', frame: '#dfe6ee' }), 0, 0, 0.05, 1.3, 0.42, 0.7);
    for (let i = 0; i < 4; i++) {
      g.add(part(GEO.prism(), roofMaterial('#9AA3AD'), [-0.48 + i * 0.32, 0.5, 0.05], [0.16, 0.14, 0.7]));
    }
    box(g, mat(p.trim, { roughness: 0.45 }), 0, 0.34, -0.31, 1.3, 0.08, 0.04);
    box(g, mat('#ffffff', { emissive: '#fff6d6', emissiveIntensity: 0.4 }), -0.35, 0.34, -0.335, 0.4, 0.05, 0.01);
    // bãi xe
    box(g, stoneMaterial('#5c626b', { repeat: 2, roughness: 0.9 }), 0, -0.0, -0.78, 1.5, 0.012, 0.42);
    return g;
  },
  // Toà nhà pin mặt trời (xanh sinh thái) có vườn trên mái.
  eco(rand) {
    const g = new THREE.Group();
    const wall = facadeMaterial('#CBE8C8', { cols: 3, rows: 6, window: '#7fd6a0', frame: '#f0fff4' });
    box(g, wall, 0, 0, 0, 0.8, 1.2, 0.62);
    balconies(g, 0, -0.31, 0.8, 0.1, 5, 0.2, '#ffffff', '#27AE60');
    box(g, mat('#2E7D32', { roughness: 0.9 }), 0, 1.2, 0, 0.84, 0.05, 0.66);
    rooftop(g, 1.25, 0.8, 0.6, rand, { solar: true });
    return g;
  },
  // Trụ sở cứu hoả / cảnh sát màu đỏ trắng.
  station(rand) {
    const g = new THREE.Group();
    box(g, facadeMaterial('#E9E4DA', { cols: 4, rows: 2, window: '#ffd9a0', brick: true }), 0, 0, 0, 1.1, 0.55, 0.6);
    box(g, mat('#C0392B', { roughness: 0.4 }), 0, 0.55, 0, 1.16, 0.06, 0.66);
    for (const x of [-0.3, 0.1]) box(g, mat('#B03A2E', { roughness: 0.5 }), x, 0.02, -0.31, 0.3, 0.3, 0.02);
    box(g, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), 0.4, 0.4, -0.31, 0.2, 0.08, 0.01);
    g.add(part(GEO.cyl(8), mat('#d0d4da', { metalness: 0.8 }), [-0.4, 0.95, 0.1], [0.012, 0.8, 0.012]));
    return g;
  },
};

const KINDS = Object.keys(BUILDERS);

// Nền lát vỉa hè dưới mỗi công trình: [rộng, sâu] theo đơn vị gốc của công trình (nhân với tỉ lệ).
const LOT_PAD = {
  bigBen: [2.5, 1.2], eiffel: [1.5, 1.5], liberty: [1.7, 1.7], lighthouse: [1.7, 0.9], curved: [1.35, 1.4],
  notreDame: [1.35, 1.45], pagoda: [1.25, 1.25], templeGate: [1.4, 1.0],
  ringOrange: [1.2, 1.3], ringPink: [1.2, 1.3], skyBlue: [0.95, 0.85], skyViolet: [0.95, 0.85],
  skyGreen: [0.95, 0.85], redHotel: [1.4, 1.0], villa: [1.3, 1.1], villaBlue: [1.3, 1.1],
  cityHall: [1.7, 1.1], shops: [1.7, 1.0], towerOrange: [1.1, 0.9], towerYellow: [1.1, 0.9],
  towerPink: [1.1, 0.9], towerMint: [1.1, 0.9], fountain: [1.4, 1.4],
};

const lotBuilder = (kind) => LANDMARKS[kind] || BUILDERS[kind];

/** Ba loại lô nền: vỉa hè lát đá (công trình), bãi cỏ nhỏ (công trình nổi tiếng), không nền. */
function lotPad(kind, k) {
  const [w, d] = LOT_PAD[kind] || [1.6, 1.4];
  return [w * k + 0.2, d * k + 0.2];
}

/** Dựng các lô nhà trong thành phố đảo Việt Nam. Trả về Group (gộp tĩnh được). */
export function buildCityBlocks() {
  const root = new THREE.Group();
  const lots = [
    // [x, z, rotY, kind, scale] — mặt tiền (-z cục bộ) quay ra đường gần nhất
    // Hàng Bắc (Toà thị chính Đông Dương, Tháp Bitexco, Cao ốc kính, Khách sạn mái ngói)
    [-5.0, -5.25, 0, 'skyGreen', 0.92],
    [-2.1, -5.35, 0, 'cityHall', 0.98],
    [1.1, -5.25, 0, 'curved', 1.05],
    [3.35, -5.25, 0, 'skyBlue', 0.96],
    [5.2, -5.2, 0, 'villa', 0.86],
    // Cột Tây (Nhà thờ Đức Bà, Biệt thự mái ngói, Phố thương mại)
    [-5.35, -2.7, Math.PI / 2, 'towerMint', 0.84],
    [-5.25, 0.15, Math.PI / 2, 'notreDame', 0.98],
    [-5.35, 2.95, Math.PI / 2, 'shops', 0.82],
    // Cột Đông (Tháp Chùa Đỏ nhiều tầng, Khách sạn mái đỏ, Đu quay)
    [5.25, -2.55, -Math.PI / 2, 'pagoda', 0.98],
    [5.35, 2.0, -Math.PI / 2, 'redHotel', 0.82],
    [5.1, 4.4, -Math.PI / 4, 'pagoda', 0.78],
    // Hàng Nam bên bờ kênh (Cổng Tam Quan / Đền cổ, Cao ốc hiện đại, Hải đăng)
    [-5.1, 5.1, Math.PI, 'villa', 0.88],
    [0.0, 5.25, Math.PI, 'templeGate', 0.96],
    [2.65, 5.1, Math.PI, 'skyViolet', 0.86],
    // Vòng trong quanh quảng trường Hoa Sen
    [-3.45, -3.2, 0, 'villa', 0.76],
    [3.45, -3.2, 0, 'towerYellow', 0.78],
    [-3.45, -1.2, Math.PI / 2, 'villaBlue', 0.66],
    [3.45, -1.2, -Math.PI / 2, 'ringOrange', 0.74],
    [2.65, 2.25, Math.PI, 'towerOrange', 0.72],
    [-2.65, 2.25, Math.PI, 'fountain', 0.72],
  ];
  const rand = rng(2024);
  const paving = stoneMaterial('#EFE3C8', { repeat: 2, roughness: 0.75 });
  for (const [x, z, rotY, kind, s] of lots) {
    const lot = new THREE.Group();
    lot.position.set(x, 0.08, z);
    lot.rotation.y = rotY;
    const [pw, pd] = lotPad(kind, s);
    box(lot, paving, 0, 0, 0, pw, 0.025, pd); // nền lát đá/vỉa hè
    box(lot, mat('#D8C8A8', { roughness: 0.75 }), 0, 0, 0, pw + 0.07, 0.012, pd + 0.07); // viền bó vỉa
    const b = lotBuilder(kind)(rand);
    b.scale.setScalar(s);
    b.position.y = 0.025;
    lot.add(b);
    root.add(lot);
  }
  return root;
}

// --------------------------------------------------------------- người đi bộ
const SKIN = ['#F1C9A5', '#E0A981', '#C68A62', '#8D5A3B', '#FFDCC0'];
const SHIRT = ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6', '#ECF0F1', '#E67E22', '#1ABC9C', '#FF6FA5', '#FF4D4D', '#2979FF'];
const PANTS = ['#2C3E50', '#34495E', '#5D4037', '#455A64', '#1B2631', '#1565C0', '#6D4C41'];
const HAIR = ['#1B1B1B', '#3E2723', '#6D4C41', '#E0B04A', '#B5502B', '#9E9E9E'];
const HAT = ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#FF7043'];

/**
 * Dân cư đi bộ: mỗi người gồm chân, thân, hai tay, đầu và tóc/mũ (InstancedMesh) đi qua lại
 * trên một đoạn vỉa hè; chân và tay đung đưa ngược nhau như bước chân thật.
 */
export class Pedestrians {
  constructor(parent, paths, count = 120, seed = 5) {
    this.rand = rng(seed);
    this.people = [];
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const path = paths[Math.floor(r() * paths.length)];
      this.people.push({
        a: new THREE.Vector3(...path[0]),
        b: new THREE.Vector3(...path[1]),
        t: r(),
        speed: 0.035 + r() * 0.05,
        dir: r() < 0.5 ? 1 : -1,
        phase: r() * 10,
        scale: 1.45 + r() * 0.4,
        len: new THREE.Vector3(...path[0]).distanceTo(new THREE.Vector3(...path[1])) || 1,
      });
    }
    const n = count;
    const white = (rough) => mat('#ffffff', { roughness: rough });
    this.legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.012, 0.08, 6).translate(0, -0.04, 0), white(0.8), n * 2);
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.03, 0.06, 3, 8).translate(0, 0.07, 0), white(0.7), n);
    this.arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.011, 0.05, 2, 6).translate(0, -0.03, 0), white(0.7), n * 2);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.027, 12, 10).translate(0, 0.165, 0), white(0.6), n);
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0305, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.168, 0.002), white(0.7), n);
    const c = new THREE.Color();
    this.people.forEach((p, i) => {
      const shirt = c.set(SHIRT[Math.floor(r() * SHIRT.length)]).clone();
      this.body.setColorAt(i, shirt);
      this.arms.setColorAt(i * 2, shirt);
      this.arms.setColorAt(i * 2 + 1, shirt);
      this.head.setColorAt(i, c.set(SKIN[Math.floor(r() * SKIN.length)]));
      this.hair.setColorAt(i, c.set(r() < 0.25 ? HAT[Math.floor(r() * HAT.length)] : HAIR[Math.floor(r() * HAIR.length)]));
      const pants = c.set(PANTS[Math.floor(r() * PANTS.length)]).clone();
      this.legs.setColorAt(i * 2, pants);
      this.legs.setColorAt(i * 2 + 1, pants);
    });
    this.parts = [this.legs, this.body, this.arms, this.head, this.hair];
    for (const im of this.parts) {
      im.castShadow = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.up = new THREE.Vector3(0, 1, 0);
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.o = new THREE.Vector3();
    this.off = new THREE.Vector3();
  }

  update(dt, elapsed) {
    const { m, q, q2, euler, v, s, o, off } = this;
    this.people.forEach((p, i) => {
      p.t += (p.dir * p.speed * dt) / p.len;
      if (p.t > 1) { p.t = 1; p.dir = -1; }
      if (p.t < 0) { p.t = 0; p.dir = 1; }
      v.lerpVectors(p.a, p.b, p.t);
      const heading = Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z) + (p.dir < 0 ? Math.PI : 0);
      q.setFromAxisAngle(this.up, heading);
      const w = elapsed * 9 * (p.speed / 0.05) + p.phase;
      const bob = Math.abs(Math.sin(w)) * 0.008 * p.scale;
      s.setScalar(p.scale);
      o.set(v.x, v.y + 0.08 * p.scale + bob, v.z);
      m.compose(o, q, s);
      this.body.setMatrixAt(i, m);
      this.head.setMatrixAt(i, m);
      this.hair.setMatrixAt(i, m);
      for (const side of [-1, 1]) {
        const swing = Math.sin(w) * 0.55 * side;
        const k = i * 2 + (side > 0 ? 1 : 0);
        // chân: xoay quanh hông
        euler.set(swing, heading, 0);
        q2.setFromEuler(euler);
        off.set(side * 0.015 * p.scale, 0, 0).applyQuaternion(q);
        m.compose(v.set(o.x + off.x, o.y, o.z + off.z), q2, s);
        this.legs.setMatrixAt(k, m);
        // tay: xoay quanh vai, ngược pha với chân cùng bên
        euler.set(-swing * 1.1, heading, 0);
        q2.setFromEuler(euler);
        off.set(side * 0.043 * p.scale, 0.12 * p.scale, 0).applyQuaternion(q);
        m.compose(v.set(o.x + off.x, o.y + off.y, o.z + off.z), q2, s);
        this.arms.setMatrixAt(k, m);
      }
    });
    for (const im of this.parts) im.instanceMatrix.needsUpdate = true;
  }
}

/** Các đoạn vỉa hè để dân cư đi lại: vòng vỉa hè sát đường, các lối đi quanh quảng trường và dọc mặt tiền nhà. */
export function pedestrianPaths() {
  const y = 0.09;
  const paths = [];
  const ring = 6.35;
  paths.push([[-ring, y, -ring], [ring, y, -ring]], [[-ring, y, ring], [ring, y, ring]], [[-ring, y, -ring], [-ring, y, ring]], [[ring, y, -ring], [ring, y, ring]]);
  // vòng đi bộ quanh quảng trường giữa (xúc xắc, logo, bộ bài)
  paths.push([[-2.7, y, -1.05], [2.7, y, -1.05]], [[-2.9, y, 3.0], [2.9, y, 3.0]], [[-2.95, y, -1.0], [-2.95, y, 3.0]], [[2.95, y, -1.0], [2.95, y, 3.0]]);
  // dọc mặt tiền các hàng nhà trong
  paths.push([[-4.5, y, -4.15], [-1.5, y, -4.15]], [[1.8, y, -4.15], [4.6, y, -4.15]]);
  for (const x of [-4.55, 4.55]) paths.push([[x, y, -4.0], [x, y, 3.8]]);
  return paths;
}

// --------------------------------------------------------------- xe buýt
export function buildBus(color = '#F2B134') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.3, clearcoat: 0.8 });
  const dark = mat('#1b1b1f', { roughness: 0.7 });
  g.add(part(GEO.rbox(), paint, [0, 0.19, 0], [0.95, 0.26, 0.36]));
  g.add(part(GEO.box(), glass('#243447'), [0, 0.24, 0], [0.9, 0.1, 0.37]));
  g.add(part(GEO.box(), glass('#243447'), [0.475, 0.22, 0], [0.01, 0.14, 0.3]));
  g.add(part(GEO.rbox(), mat('#ffffff', { roughness: 0.5 }), [0, 0.335, 0], [0.9, 0.025, 0.33]));
  const rim = mat('#cfd3d8', { metalness: 0.9, roughness: 0.25 });
  for (const x of [0.3, -0.3]) {
    for (const z of [0.18, -0.18]) {
      g.add(part(GEO.cyl(14), dark, [x, 0.07, z], [0.07, 0.05, 0.07], [Math.PI / 2, 0, 0]));
      g.add(part(GEO.cyl(10), rim, [x, 0.07, z + Math.sign(z) * 0.03], [0.035, 0.01, 0.035], [Math.PI / 2, 0, 0]));
    }
  }
  const head = mat('#FFF6C2', { emissive: '#FFE58A', emissiveIntensity: 0.8 });
  for (const z of [0.12, -0.12]) g.add(part(GEO.sphere(), head, [0.48, 0.12, z], [0.02, 0.02, 0.028]));
  return g;
}
