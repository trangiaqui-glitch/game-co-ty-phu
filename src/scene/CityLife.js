import * as THREE from 'three';
import { mat, GEO, part, glass, gold } from './ModelFactory.js';
import { facadeMaterial, stoneMaterial, roofMaterial, woodMaterial } from './Materials.js';

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
  { wall: '#F4D9A8', trim: '#C0392B', win: '#9ad8ff', balc: '#E67E22' },
  { wall: '#E8A9A0', trim: '#7D3C98', win: '#bfe6ff', balc: '#F1C40F' },
  { wall: '#BFD8A8', trim: '#1E8449', win: '#a9e0ff', balc: '#2ECC71' },
  { wall: '#C9D6F2', trim: '#1F618D', win: '#9fd0ff', balc: '#3498DB' },
  { wall: '#F6C28B', trim: '#A04000', win: '#ffe2a8', balc: '#E74C3C' },
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

/** Dựng các lô nhà trong thành phố. Trả về Group (gộp tĩnh được). */
export function buildCityBlocks() {
  const root = new THREE.Group();
  const lots = [
    // [x, z, rotY, kind, scale]
    [-5.5, -5.5, 0, 'tower', 1.0], [-5.5, -4.0, 0, 'apartment', 0.78],
    [5.5, -5.5, 0, 'rotunda', 1.0], [5.5, -4.0, 0, 'mall', 0.7],
    [-5.5, 5.6, Math.PI, 'eco', 0.95], [-4.3, 5.9, Math.PI, 'apartment', 0.7],
    [5.5, 5.6, Math.PI, 'station', 0.9], [4.2, 5.9, Math.PI, 'apartment', 0.7],
    [-2.8, -5.7, 0, 'apartment', 0.72], [2.8, -5.7, 0, 'eco', 0.62],
    [-5.9, -1.4, Math.PI / 2, 'mall', 0.62], [5.9, -1.4, -Math.PI / 2, 'apartment', 0.66],
    [-5.9, 2.6, Math.PI / 2, 'apartment', 0.66], [5.9, 2.6, -Math.PI / 2, 'tower', 0.72],
    [-3.3, -1.7, 0, 'rotunda', 0.78], [3.3, -1.7, 0, 'tower', 0.8],
    [-3.2, 2.3, Math.PI, 'station', 0.62], [3.2, 2.3, Math.PI, 'eco', 0.66],
    [-4.3, -3.0, 0, 'apartment', 0.62], [4.3, -2.9, 0, 'mall', 0.55],
  ];
  const rand = rng(2024);
  const paving = stoneMaterial('#D9CDB4', { repeat: 2, roughness: 0.8 });
  for (const [x, z, rotY, kind, s] of lots) {
    const lot = new THREE.Group();
    lot.position.set(x, 0.08, z);
    lot.rotation.y = rotY;
    const k = s * 1.12;
    box(lot, paving, 0, 0, 0, 1.6 * k + 0.35, 0.02, 1.4 * k + 0.35); // nền lát đá/vỉa hè
    const b = BUILDERS[kind](rand);
    b.scale.setScalar(k);
    b.position.y = 0.02;
    lot.add(b);
    root.add(lot);
  }
  return root;
}

// --------------------------------------------------------------- người đi bộ
const SKIN = ['#F1C9A5', '#E0A981', '#C68A62', '#8D5A3B', '#FFDCC0'];
const SHIRT = ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6', '#ECF0F1', '#E67E22', '#1ABC9C', '#FF6FA5'];
const PANTS = ['#2C3E50', '#34495E', '#5D4037', '#455A64', '#1B2631'];

/**
 * Dân cư đi bộ: mỗi người gồm chân, thân, đầu (InstancedMesh) đi qua lại trên một đoạn vỉa hè,
 * đung đưa như bước chân thật.
 */
export class Pedestrians {
  constructor(parent, paths, count = 70, seed = 5) {
    this.rand = rng(seed);
    this.people = [];
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const path = paths[Math.floor(r() * paths.length)];
      this.people.push({
        a: new THREE.Vector3(...path[0]),
        b: new THREE.Vector3(...path[1]),
        t: r(),
        speed: 0.03 + r() * 0.05,
        dir: r() < 0.5 ? 1 : -1,
        phase: r() * 10,
        scale: 0.85 + r() * 0.3,
      });
    }
    const n = count;
    this.legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.012, 0.08, 6).translate(0, -0.04, 0), mat('#ffffff'), n * 2);
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.03, 0.06, 3, 8).translate(0, 0.07, 0), mat('#ffffff', { roughness: 0.7 }), n);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.026, 10, 8).translate(0, 0.16, 0), mat('#ffffff', { roughness: 0.6 }), n);
    const c = new THREE.Color();
    this.people.forEach((p, i) => {
      this.body.setColorAt(i, c.set(SHIRT[Math.floor(r() * SHIRT.length)]));
      this.head.setColorAt(i, c.set(SKIN[Math.floor(r() * SKIN.length)]));
      const pants = c.set(PANTS[Math.floor(r() * PANTS.length)]).clone();
      this.legs.setColorAt(i * 2, pants);
      this.legs.setColorAt(i * 2 + 1, pants);
    });
    for (const im of [this.legs, this.body, this.head]) {
      im.castShadow = true;
      im.frustumCulled = false;
      parent.add(im);
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  update(dt, elapsed) {
    this.people.forEach((p, i) => {
      const len = p.a.distanceTo(p.b) || 1;
      p.t += (p.dir * p.speed * dt) / len;
      if (p.t > 1) { p.t = 1; p.dir = -1; }
      if (p.t < 0) { p.t = 0; p.dir = 1; }
      this.v.lerpVectors(p.a, p.b, p.t);
      const heading = Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z) + (p.dir < 0 ? Math.PI : 0);
      this.q.setFromAxisAngle(this.up, heading);
      const w = elapsed * 9 * (p.speed / 0.05) + p.phase;
      const bob = Math.abs(Math.sin(w)) * 0.008;
      this.s.setScalar(p.scale);
      this.m.compose(new THREE.Vector3(this.v.x, this.v.y + 0.08 * p.scale + bob, this.v.z), this.q, this.s);
      this.body.setMatrixAt(i, this.m);
      this.head.setMatrixAt(i, this.m);
      for (const side of [-1, 1]) {
        const swing = Math.sin(w) * 0.5 * side;
        const legQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(swing, heading, 0, 'YXZ'));
        const off = new THREE.Vector3(side * 0.015 * p.scale, 0, 0).applyQuaternion(this.q);
        this.m.compose(new THREE.Vector3(this.v.x + off.x, this.v.y + 0.08 * p.scale + bob, this.v.z + off.z), legQ, this.s);
        this.legs.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), this.m);
      }
    });
    for (const im of [this.legs, this.body, this.head]) im.instanceMatrix.needsUpdate = true;
  }
}

/** Các đoạn vỉa hè để dân cư đi lại: quanh các lô nhà và dọc mép trong vòng đường. */
export function pedestrianPaths() {
  const y = 0.105;
  const paths = [];
  const ring = 6.3;
  paths.push([[-ring, y, -ring], [ring, y, -ring]], [[-ring, y, ring], [ring, y, ring]], [[-ring, y, -ring], [-ring, y, ring]], [[ring, y, -ring], [ring, y, ring]]);
  for (const [x, z] of [[-5.5, -4.7], [5.5, -4.7], [-5.5, 4.8], [5.5, 4.8], [-2.8, -4.9], [2.8, -4.9]]) {
    paths.push([[x - 0.9, y, z], [x + 0.9, y, z]]);
  }
  for (const x of [-4.8, 4.8]) paths.push([[x, y, -2.6], [x, y, 3.6]]);
  paths.push([[-2.4, y, -1.2], [2.4, y, -1.2]]);
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
