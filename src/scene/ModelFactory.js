import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeMaterial, roofMaterial, stoneMaterial, woodMaterial, foliageGeometry, leafMaterial } from './Materials.js';

// ---------------------------------------------------------------------------
// Bộ dựng mô hình 3D placeholder (nhà, khách sạn, ngân hàng, nhà ga, xe cộ...).
// Vật liệu và hình học được cache để tái sử dụng; phần trang trí tĩnh được gộp
// (static batching) theo vật liệu để giảm draw call.
// ---------------------------------------------------------------------------

const materials = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...opts }));
  }
  return materials.get(key);
}

export const glass = (color = '#8fd3ff') => mat(color, { roughness: 0.12, metalness: 0.35 });
export const gold = () => mat('#FFC83D', { roughness: 0.25, metalness: 0.75 });

const geometries = new Map();
function cached(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}

export const GEO = {
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  rbox: () => cached('rbox', () => new RoundedBoxGeometry(1, 1, 1, 3, 0.1)),
  cyl: (seg = 20) => cached(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg)),
  cone: (seg = 20) => cached(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  pyramid: () => cached('pyramid', () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4)),
  // Lăng trụ tam giác: mặt tam giác nằm trong mặt phẳng xy (đỉnh hướng lên), trục dọc theo z.
  prism: () => cached('prism', () => new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2)),
  sphere: () => cached('sphere', () => new THREE.SphereGeometry(1, 24, 16)),
  hemi: () => cached('hemi', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
  // Nửa trụ nằm dọc trục x, phần cong hướng lên trên (mái vòm).
  halfCyl: () => cached('halfCyl', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)),
  torus: () => cached('torus', () => new THREE.TorusGeometry(1, 0.25, 10, 28)),
  ico: () => cached('ico', () => new THREE.IcosahedronGeometry(1, 1)),
  octa: () => cached('octa', () => new THREE.OctahedronGeometry(1, 0)),
};

export function part(geometry, material, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Thêm nhanh khối hộp bo góc có đáy đặt tại y.
function block(g, material, x, y, z, w, h, d, rounded = true) {
  const m = part(rounded ? GEO.rbox() : GEO.box(), material, [x, y + h / 2, z], [w, h, d]);
  g.add(m);
  return m;
}

// --------------------------------------------------------------- facade
// Mặt tiền PBR (xem Materials.js): tường vữa/gạch, cửa sổ lõm, kính phản chiếu.
export function facade(wall, opts = {}) {
  return facadeMaterial(wall, opts);
}

// --------------------------------------------------------------- shared pieces
function door(g, x, z, h = 0.24, color = '#6B3E26') {
  const w = 0.16;
  const wood = woodMaterial(color);
  const trim = mat('#F4EDE0', { roughness: 0.55 });
  const dz = z - 0.005;
  g.add(part(GEO.box(), trim, [x, h / 2 + 0.01, dz + 0.012], [w + 0.045, h + 0.025, 0.02])); // khung cửa
  g.add(part(GEO.rbox(), wood, [x, h / 2, dz], [w, h, 0.04])); // cánh cửa
  g.add(part(GEO.box(), mat('#111e2b', { roughness: 0.1, metalness: 0.4 }), [x, h * 0.74, dz - 0.022], [w * 0.55, h * 0.2, 0.004]));
  g.add(part(GEO.sphere(), gold(), [x + w * 0.32, h * 0.45, dz - 0.026], [0.012, 0.012, 0.012])); // tay nắm
  g.add(part(GEO.box(), stoneMaterial('#CFC9BF', { repeat: 1 }), [x, 0.012, dz - 0.07], [w + 0.1, 0.024, 0.12])); // bậc thềm
}

function roofPyramid(g, x, y, z, w, d, h, color) {
  // Mái ngói + đường viền mái nhô ra (eaves) để có chiều sâu thật.
  g.add(part(GEO.pyramid(), roofMaterial(color), [x, y + h / 2, z], [w * 0.75, h, d * 0.75]));
  g.add(part(GEO.box(), mat(color, { roughness: 0.6 }), [x, y + 0.012, z], [w * 1.08, 0.025, d * 1.08]));
}

export function buildTree(scale = 1, foliageColor = '#3DBE5C') {
  const g = new THREE.Group();
  const k = scale;
  const bark = woodMaterial('#6B4A2E');
  g.add(part(new THREE.CylinderGeometry(0.035, 0.055, 0.42, 9), bark, [0, 0.21 * k, 0], [k, k, k]));
  g.add(part(new THREE.CylinderGeometry(0.06, 0.085, 0.06, 9), bark, [0, 0.03 * k, 0], [k, k, k]));
  const mats = new Map();
  const leaf = (tint) => {
    if (!mats.has(tint)) {
      const m = leafMaterial().clone();
      m.color.set(foliageColor).multiplyScalar(tint);
      mats.set(tint, m);
    }
    return mats.get(tint);
  };
  const blobs = [
    [0, 0.52, 0, 0.27, 0.24, 1.0],
    [0.14, 0.46, 0.08, 0.17, 0.15, 0.88],
    [-0.13, 0.48, -0.06, 0.18, 0.16, 0.94],
    [0.02, 0.7, 0.02, 0.19, 0.17, 1.12],
    [-0.06, 0.62, 0.13, 0.14, 0.13, 1.05],
  ];
  for (const [x, y, z, rx, ry, t] of blobs) {
    g.add(part(foliageGeometry(), leaf(t), [x * k, y * k, z * k], [rx * k, ry * k, rx * k], [0, x * 9, 0]));
  }
  return g;
}

const carBodyGeo = cached('carBody', () => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.36, 0.06);
  sh.lineTo(0.36, 0.06);
  sh.quadraticCurveTo(0.385, 0.075, 0.385, 0.13); // mũi xe
  sh.quadraticCurveTo(0.385, 0.17, 0.34, 0.185);
  sh.lineTo(0.12, 0.21); // nắp capo
  sh.lineTo(-0.2, 0.21);
  sh.lineTo(-0.34, 0.2); // cốp
  sh.quadraticCurveTo(-0.38, 0.19, -0.385, 0.13);
  sh.quadraticCurveTo(-0.385, 0.075, -0.36, 0.06);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.022, bevelSegments: 3, curveSegments: 8 });
  geo.translate(0, 0, -0.15);
  return geo;
});
const carCabinGeo = cached('carCabin', () => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.27, 0.205);
  sh.quadraticCurveTo(-0.2, 0.32, -0.15, 0.335);
  sh.lineTo(0.0, 0.335);
  sh.quadraticCurveTo(0.07, 0.3, 0.14, 0.205);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.27, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
  geo.translate(0, 0, -0.135);
  return geo;
});
const carTireGeo = cached('carTire', () => new THREE.TorusGeometry(0.052, 0.026, 10, 18));

export function buildCar(color = '#E53935', { police = false } = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 });
  const dark = mat('#1b1b1f', { roughness: 0.7 });
  const chrome = mat('#E8EAED', { metalness: 1, roughness: 0.12 });
  g.add(part(carBodyGeo, paint, [0, 0, 0]));
  g.add(part(carCabinGeo, glass('#243447'), [0, 0, 0]));
  g.add(part(GEO.rbox(), police ? mat('#ffffff', { roughness: 0.3 }) : paint, [-0.065, 0.338, 0], [0.2, 0.018, 0.275])); // nóc xe
  if (police) g.add(part(GEO.box(), mat('#ffffff', { roughness: 0.3 }), [0.0, 0.14, 0], [0.5, 0.05, 0.325])); // sọc xe cảnh sát
  g.add(part(GEO.rbox(), dark, [0.385, 0.095, 0], [0.03, 0.04, 0.31])); // cản trước
  g.add(part(GEO.rbox(), dark, [-0.39, 0.095, 0], [0.03, 0.04, 0.31])); // cản sau
  g.add(part(GEO.box(), chrome, [0.397, 0.13, 0], [0.008, 0.03, 0.12])); // lưới tản nhiệt
  g.add(part(GEO.box(), mat('#ffffff', { roughness: 0.5 }), [-0.405, 0.115, 0], [0.006, 0.035, 0.09])); // biển số
  const rim = mat('#cfd3d8', { metalness: 0.9, roughness: 0.25 });
  for (const [x, z] of [[0.24, 0.158], [-0.23, 0.158], [0.24, -0.158], [-0.23, -0.158]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.075, z);
    w.add(part(carTireGeo, dark, [0, 0, 0], [1, 1, 1.15]));
    w.add(part(GEO.cyl(14), rim, [0, 0, Math.sign(z) * 0.004], [0.05, 0.03, 0.05], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 5; i++) {
      w.add(part(GEO.box(), chrome, [0, 0, Math.sign(z) * 0.02], [0.008, 0.088, 0.004], [0, 0, (i * Math.PI * 2) / 5]));
    }
    g.add(w);
  }
  const head = mat('#FFF6C2', { emissive: '#FFE58A', emissiveIntensity: 0.8 });
  const tail = mat('#ff3030', { emissive: '#ff0000', emissiveIntensity: 0.9 });
  for (const z of [0.105, -0.105]) {
    g.add(part(GEO.sphere(), head, [0.385, 0.15, z], [0.026, 0.022, 0.03]));
    g.add(part(GEO.rbox(), tail, [-0.388, 0.15, z], [0.016, 0.026, 0.07]));
  }
  for (const z of [0.17, -0.17]) g.add(part(GEO.rbox(), paint, [0.1, 0.225, z], [0.03, 0.025, 0.03])); // gương chiếu hậu
  if (police) {
    const lights = new THREE.Group();
    lights.userData.dynamic = true;
    lights.name = 'policeLights';
    const red = new THREE.MeshStandardMaterial({ color: '#ff3040', emissive: '#ff0020', emissiveIntensity: 1.5 });
    const blue = new THREE.MeshStandardMaterial({ color: '#3070ff', emissive: '#0040ff', emissiveIntensity: 1.5 });
    lights.add(part(GEO.rbox(), red, [-0.065, 0.36, 0.06], [0.06, 0.03, 0.09]));
    lights.add(part(GEO.rbox(), blue, [-0.065, 0.36, -0.06], [0.06, 0.03, 0.09]));
    lights.userData.materials = [red, blue];
    g.add(lights);
  }
  return g;
}

export function buildTrain(color = '#E53935') {
  const g = new THREE.Group();
  const body = mat(color, { roughness: 0.35, metalness: 0.15 });
  const dark = mat('#2b2b2b', { roughness: 0.6 });
  g.add(part(GEO.cyl(18), body, [0.1, 0.24, 0], [0.15, 0.5, 0.15], [0, 0, Math.PI / 2]));
  g.add(part(GEO.rbox(), body, [-0.24, 0.3, 0], [0.26, 0.34, 0.3]));
  g.add(part(GEO.rbox(), dark, [-0.24, 0.49, 0], [0.32, 0.05, 0.36]));
  g.add(part(GEO.box(), glass('#9fe0ff'), [-0.24, 0.36, 0], [0.27, 0.1, 0.31]));
  g.add(part(GEO.cyl(12), dark, [0.24, 0.47, 0], [0.045, 0.16, 0.045]));
  g.add(part(GEO.cone(12), dark, [0.24, 0.57, 0], [0.07, 0.06, 0.07], [Math.PI, 0, 0]));
  g.add(part(GEO.rbox(), dark, [0, 0.07, 0], [0.7, 0.06, 0.26]));
  const wheel = mat('#ffcc33', { metalness: 0.5, roughness: 0.35 });
  for (const x of [0.22, 0.02, -0.2]) {
    for (const z of [0.14, -0.14]) g.add(part(GEO.cyl(14), wheel, [x, 0.08, z], [0.075, 0.04, 0.075], [Math.PI / 2, 0, 0]));
  }
  g.add(part(GEO.cone(4), mat('#9e9e9e', { metalness: 0.4 }), [0.38, 0.1, 0], [0.12, 0.1, 0.16], [0, 0, -Math.PI / 2]));
  return g;
}

// --------------------------------------------------------------- landmarks per color group
// Mọi landmark nằm trong vùng ~1.5 x 1.0, mặt tiền hướng -z (về phía đường đi).
const LANDMARK_BUILDERS = {
  brown(g, color, v) {
    const wall = v ? '#F6E0B8' : '#EED3A8';
    block(g, facade(wall, { cols: 2, rows: 1, window: '#9ad8ff', brick: true }), 0, 0, 0, 0.9, 0.5, 0.7);
    roofPyramid(g, 0, 0.5, 0, 1.05, 0.85, 0.42, color);
    door(g, v ? 0.2 : -0.2, -0.36);
    block(g, mat('#B5651D'), 0.28, 0.6, 0.12, 0.12, 0.28, 0.12);
    g.add(buildTree(0.8).translateX(-0.62).translateZ(0.2));
  },
  lightblue(g, color, v) {
    block(g, facade('#FFFFFF', { cols: 3, rows: 2, window: '#7fd0ff' }), 0, 0, 0.05, 1.15, 0.62, 0.68);
    block(g, mat(color), 0, 0.62, 0.05, 1.2, 0.07, 0.72);
    g.add(part(GEO.box(), mat(color, { roughness: 0.6 }), [0, 0.46, -0.42], [1.16, 0.04, 0.32], [-0.35, 0, 0]));
    g.add(part(GEO.box(), mat('#ffffff'), [0, 0.465, -0.42], [1.16, 0.041, 0.1], [-0.35, 0, 0]));
    block(g, mat(color), 0, 0.69, 0.05, 0.62, 0.2, 0.06);
    door(g, v ? -0.3 : 0.3, -0.29, 0.3, '#2E5E8C');
  },
  pink(g, color, v) {
    block(g, facade('#FFF2F7', { cols: 3, rows: 1, window: '#ffd2ea' }), 0, 0, 0, 1.1, 0.48, 0.74);
    block(g, facade('#FFF2F7', { cols: 2, rows: 1, window: '#ffd2ea' }), v ? 0.15 : -0.15, 0.48, 0.05, 0.72, 0.42, 0.6);
    roofPyramid(g, v ? 0.15 : -0.15, 0.9, 0.05, 0.86, 0.72, 0.36, color);
    block(g, mat('#ffffff'), v ? 0.15 : -0.15, 0.46, -0.32, 0.74, 0.05, 0.16);
    door(g, v ? -0.3 : 0.3, -0.38, 0.26, '#B0306F');
    g.add(buildTree(0.6, '#F48FB1').translateX(v ? -0.6 : 0.6).translateZ(0.3));
  },
  orange(g, color, v) {
    block(g, facade('#FFE7CC', { cols: 3, rows: 4, window: '#ffcf99' }), 0, 0, 0.05, 1.0, 1.05, 0.72);
    block(g, mat(color), 0, 1.05, 0.05, 1.08, 0.08, 0.8);
    g.add(part(GEO.cyl(14), mat('#7FB3D5'), [v ? 0.25 : -0.25, 1.25, 0.15], [0.12, 0.2, 0.12]));
    door(g, 0, -0.32, 0.26, '#8a4b1d');
    block(g, mat(color, { roughness: 0.6 }), 0, 0.3, -0.36, 0.46, 0.04, 0.14);
  },
  red(g, color, v) {
    block(g, facade('#F7D4CC', { cols: 3, rows: 5, window: '#a9dcff' }), 0, 0, 0.05, 0.92, 1.35, 0.72);
    block(g, mat(color), 0, 1.35, 0.05, 0.98, 0.1, 0.78);
    block(g, mat(color), 0, 0, -0.33, 0.98, 0.16, 0.08);
    g.add(part(GEO.cyl(8), mat('#cccccc', { metalness: 0.6 }), [v ? 0.25 : -0.25, 1.65, 0.1], [0.02, 0.45, 0.02]));
    g.add(part(GEO.sphere(), mat('#ff4444', { emissive: '#ff0000', emissiveIntensity: 0.8 }), [v ? 0.25 : -0.25, 1.88, 0.1], [0.04, 0.04, 0.04]));
  },
  yellow(g, color, v) {
    g.add(part(GEO.cyl(24), facade('#FFF7D6', { cols: 8, rows: 6, window: '#9fd8ff' }), [0, 0.8, 0.05], [0.42, 1.6, 0.42]));
    g.add(part(GEO.cyl(24), mat(color, { metalness: 0.4, roughness: 0.3 }), [0, 1.64, 0.05], [0.46, 0.08, 0.46]));
    g.add(part(GEO.hemi(), glass('#FFE58A'), [0, 1.68, 0.05], [0.32, 0.28, 0.32]));
    block(g, mat(color), 0, 0, -0.32, 0.6, 0.22, 0.2);
    if (v) g.add(buildTree(0.7).translateX(0.6).translateZ(0.25));
  },
  green(g, color, v) {
    const glassMat = facade('#CDEBD6', { cols: 3, rows: 7, window: '#64c98a', frame: '#e8fff0', glassy: true });
    block(g, glassMat, -0.3, 0, 0.05, 0.48, v ? 1.75 : 1.55, 0.6, false);
    block(g, glassMat, 0.32, 0, 0.05, 0.48, v ? 1.45 : 1.8, 0.6, false);
    block(g, mat(color), 0.01, 1.0, 0.05, 0.2, 0.1, 0.3);
    block(g, mat(color), -0.3, v ? 1.75 : 1.55, 0.05, 0.5, 0.06, 0.62);
    block(g, mat(color), 0.32, v ? 1.45 : 1.8, 0.05, 0.5, 0.06, 0.62);
  },
  darkblue(g, color, v) {
    const glassMat = facade('#CFE0FF', { cols: 3, rows: 6, window: '#5b8cff', frame: '#eef4ff', glassy: true });
    const tiers = v ? [[0.86, 0.75], [0.66, 0.65], [0.46, 0.5]] : [[0.8, 0.9], [0.6, 0.7], [0.4, 0.55]];
    let y = 0;
    for (const [w, h] of tiers) {
      block(g, glassMat, 0, y, 0.05, w, h, w * 0.85, false);
      y += h;
      block(g, gold(), 0, y, 0.05, w + 0.04, 0.04, w * 0.85 + 0.04, false);
      y += 0.04;
    }
    g.add(part(GEO.cone(12), gold(), [0, y + 0.35, 0.05], [0.07, 0.7, 0.07]));
    if (v) g.add(part(GEO.cyl(24), mat('#ffffff'), [0, y - 0.25, -0.18], [0.22, 0.03, 0.22]));
  },
};

export function buildLandmark(group, color, variant = 0) {
  const g = new THREE.Group();
  (LANDMARK_BUILDERS[group] || LANDMARK_BUILDERS.brown)(g, color, variant);
  return g;
}

export function buildStation() {
  const g = new THREE.Group();
  block(g, mat('#B9C2CC'), 0, 0, 0.35, 1.8, 0.06, 0.4, false);
  for (const z of [0.27, 0.43]) g.add(part(GEO.box(), mat('#6d6d6d', { metalness: 0.5 }), [0, 0.07, z], [1.8, 0.03, 0.03]));
  const train = buildTrain('#E53935');
  train.position.set(0.25, 0.06, 0.35);
  train.scale.setScalar(0.85);
  g.add(train);
  block(g, facade('#D9A27A', { cols: 3, rows: 1, window: '#ffe2a8', brick: true }), 0, 0, -0.18, 1.3, 0.48, 0.5);
  g.add(part(GEO.halfCyl(), mat('#C0392B', { roughness: 0.5 }), [0, 0.48, -0.18], [1.36, 0.28, 0.3]));
  g.add(part(GEO.cyl(24), mat('#ffffff'), [0, 0.62, -0.45], [0.11, 0.03, 0.11], [Math.PI / 2, 0, 0]));
  g.add(part(GEO.box(), mat('#333333'), [0.025, 0.63, -0.47], [0.05, 0.012, 0.01]));
  g.add(part(GEO.box(), mat('#333333'), [0, 0.65, -0.47], [0.012, 0.07, 0.01]));
  door(g, 0, -0.44, 0.3, '#5D4037');
  return g;
}

export function buildUtility(kind) {
  const g = new THREE.Group();
  if (kind === 'water') {
    const leg = mat('#8D6E63');
    for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.25], [0.25, 0.25]]) {
      g.add(part(GEO.cyl(8), leg, [x, 0.4, z], [0.035, 0.8, 0.035]));
    }
    g.add(part(GEO.cyl(24), mat('#4FC3F7', { roughness: 0.3, metalness: 0.2 }), [0, 1.0, 0.02], [0.42, 0.45, 0.42]));
    g.add(part(GEO.cone(24), mat('#0277BD'), [0, 1.36, 0.02], [0.46, 0.28, 0.46]));
    g.add(part(GEO.sphere(), mat('#E1F5FE', { roughness: 0.1 }), [0, 1.02, -0.4], [0.12, 0.12, 0.04]));
    g.add(part(GEO.cyl(10), mat('#90A4AE', { metalness: 0.6 }), [0.48, 0.45, 0.02], [0.05, 0.9, 0.05]));
  } else {
    block(g, facade('#ECEFF1', { cols: 3, rows: 2, window: '#fff59d' }), -0.15, 0, 0.05, 0.9, 0.5, 0.6);
    const lathe = cached('cooling', () => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(0.24 - 0.09 * Math.sin(t * Math.PI) + 0.02 * t, t * 0.9));
      }
      return new THREE.LatheGeometry(pts, 20);
    });
    g.add(part(lathe, mat('#CFD8DC', { side: THREE.DoubleSide }), [0.45, 0, 0.2], [1, 1, 1]));
    const bolt = cached('bolt', () => {
      const s = new THREE.Shape();
      s.moveTo(0.05, 0.3); s.lineTo(-0.1, 0); s.lineTo(0.01, 0); s.lineTo(-0.06, -0.3); s.lineTo(0.12, 0.06); s.lineTo(0.01, 0.06); s.lineTo(0.1, 0.3);
      s.lineTo(0.05, 0.3);
      return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
    });
    g.add(part(bolt, mat('#FFD600', { emissive: '#FFB300', emissiveIntensity: 0.5 }), [-0.15, 0.85, -0.05], [1.3, 1.3, 1.3]));
  }
  return g;
}

export function buildBank(scale = 1) {
  const g = new THREE.Group();
  const stone = stoneMaterial('#F5F0E6', { repeat: 2, roughness: 0.55, veins: true });
  block(g, mat('#D7CCC8'), 0, 0, 0, 1.4, 0.06, 1.0, false);
  block(g, mat('#E0D7CF'), 0, 0.06, 0.05, 1.3, 0.06, 0.9, false);
  block(g, facade('#F5F0E6', { cols: 3, rows: 1, window: '#ffe9a8' }), 0, 0.12, 0.2, 1.1, 0.58, 0.5, false);
  for (let i = 0; i < 5; i++) {
    g.add(part(GEO.cyl(14), stone, [-0.48 + i * 0.24, 0.41, -0.18], [0.05, 0.58, 0.05]));
  }
  block(g, stone, 0, 0.7, 0.05, 1.24, 0.08, 0.82, false);
  g.add(part(GEO.prism(), stone, [0, 0.87, 0.05], [0.72, 0.18, 0.82]));
  g.add(part(GEO.cyl(24), gold(), [0, 0.86, -0.36], [0.11, 0.03, 0.11], [Math.PI / 2, 0, 0]));
  g.scale.setScalar(scale);
  return g;
}

export function buildQuestionMark(color = '#FF8A00') {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.15 });
  const arc = cached('qarc', () => new THREE.TorusGeometry(0.2, 0.07, 12, 24, Math.PI * 1.5));
  g.add(part(arc, m, [0, 0.38, 0], [1, 1, 1], [0, 0, -Math.PI / 2]));
  g.add(part(GEO.cyl(12), m, [0, 0.1, 0], [0.07, 0.18, 0.07]));
  g.add(part(GEO.sphere(), m, [0, -0.12, 0], [0.08, 0.08, 0.08]));
  return g;
}

export function buildChest() {
  const g = new THREE.Group();
  const wood = mat('#A0522D', { roughness: 0.6 });
  block(g, wood, 0, 0, 0, 0.7, 0.36, 0.46);
  g.add(part(GEO.halfCyl(), wood, [0, 0.36, 0], [0.72, 0.2, 0.23]));
  for (const x of [-0.25, 0.25]) g.add(part(GEO.box(), gold(), [x, 0.3, 0], [0.06, 0.62, 0.48]));
  g.add(part(GEO.rbox(), gold(), [0, 0.36, -0.24], [0.12, 0.12, 0.04]));
  const coin = mat('#FFD54F', { metalness: 0.7, roughness: 0.25 });
  for (let i = 0; i < 4; i++) g.add(part(GEO.cyl(16), coin, [0.38 + (i % 2) * 0.08, 0.02 + i * 0.035, -0.2], [0.08, 0.03, 0.08]));
  g.add(part(GEO.octa(), mat('#E040FB', { roughness: 0.1, metalness: 0.3 }), [0, 0.52, 0], [0.08, 0.1, 0.08]));
  return g;
}

export function buildMoneyBag() {
  const g = new THREE.Group();
  const cloth = mat('#7CB342', { roughness: 0.75 });
  g.add(part(GEO.sphere(), cloth, [0, 0.3, 0], [0.32, 0.3, 0.3]));
  g.add(part(GEO.cone(16), cloth, [0, 0.66, 0], [0.12, 0.16, 0.12], [Math.PI, 0, 0]));
  g.add(part(GEO.cyl(16), cloth, [0, 0.74, 0], [0.16, 0.05, 0.16]));
  g.add(part(GEO.torus(), gold(), [0, 0.6, 0], [0.11, 0.11, 0.11], [Math.PI / 2, 0, 0]));
  g.add(part(GEO.cyl(24), gold(), [0, 0.32, -0.3], [0.12, 0.02, 0.12], [Math.PI / 2, 0, 0]));
  const coin = mat('#FFD54F', { metalness: 0.7, roughness: 0.25 });
  for (let i = 0; i < 5; i++) g.add(part(GEO.cyl(16), coin, [0.45, 0.02 + i * 0.035, 0.1], [0.09, 0.03, 0.09]));
  return g;
}

export function buildDiamondRing() {
  const g = new THREE.Group();
  g.add(part(GEO.torus(), gold(), [0, 0.32, 0], [0.24, 0.24, 0.5]));
  g.add(part(GEO.octa(), mat('#80DEEA', { roughness: 0.05, metalness: 0.4, emissive: '#26C6DA', emissiveIntensity: 0.25 }), [0, 0.68, 0], [0.16, 0.2, 0.16]));
  return g;
}

export function buildStartGate() {
  const g = new THREE.Group();
  const arrow = cached('arrow', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.6, 0.18); s.lineTo(0.1, 0.18); s.lineTo(0.1, 0.4); s.lineTo(0.6, 0); s.lineTo(0.1, -0.4); s.lineTo(0.1, -0.18); s.lineTo(-0.6, -0.18);
    s.lineTo(-0.6, 0.18);
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  });
  // Mũi tên chỉ về ô số 1 (hướng -x cục bộ của góc Bắt đầu).
  g.add(part(arrow, mat('#2ECC71', { roughness: 0.35 }), [-0.15, 0.06, -0.55], [1.6, 1.6, 1], [-Math.PI / 2, 0, Math.PI]));
  // Cổng đặt sát mép ngoài để không chạm vào nhân vật đứng trên ô.
  const pillar = mat('#FF7043', { roughness: 0.4 });
  for (const x of [-1.2, 1.2]) g.add(part(GEO.cyl(16), pillar, [x, 0.6, 1.3], [0.09, 1.2, 0.09]));
  g.add(part(GEO.rbox(), mat('#FFCA28', { roughness: 0.35 }), [0, 1.25, 1.3], [2.65, 0.22, 0.14]));
  const coin = mat('#FFD54F', { metalness: 0.7, roughness: 0.25 });
  for (let i = 0; i < 6; i++) g.add(part(GEO.cyl(16), coin, [0.9, 0.02 + i * 0.04, -1.0], [0.13, 0.035, 0.13]));
  return g;
}

export function buildJail() {
  const g = new THREE.Group();
  const cx = -0.72;
  const cz = -0.72;
  block(g, mat('#90A4AE'), cx, 0, cz, 1.42, 0.06, 1.42, false);
  const bar = mat('#37474F', { metalness: 0.6, roughness: 0.35 });
  const half = 0.68;
  for (let i = 0; i <= 6; i++) {
    const t = -half + (i * 2 * half) / 6;
    g.add(part(GEO.cyl(8), bar, [cx + t, 0.5, cz - half], [0.025, 0.9, 0.025]));
    g.add(part(GEO.cyl(8), bar, [cx - half, 0.5, cz + t], [0.025, 0.9, 0.025]));
    if (i % 2 === 0) {
      g.add(part(GEO.cyl(8), bar, [cx + t, 0.5, cz + half], [0.025, 0.9, 0.025]));
      g.add(part(GEO.cyl(8), bar, [cx + half, 0.5, cz + t], [0.025, 0.9, 0.025]));
    }
  }
  block(g, mat('#FF7043'), cx, 0.95, cz, 1.5, 0.1, 1.5, false);
  block(g, mat('#FFF3E0'), cx, 1.05, cz, 1.2, 0.06, 1.2, false);
  g.add(part(GEO.sphere(), mat('#FFEB3B', { emissive: '#FFC107', emissiveIntensity: 0.9 }), [cx, 1.16, cz], [0.07, 0.07, 0.07]));
  return g;
}

export function buildPark() {
  const g = new THREE.Group();
  g.add(part(GEO.cyl(28), mat('#B0BEC5'), [0, 0.06, 0.35], [0.36, 0.12, 0.36]));
  g.add(part(GEO.cyl(28), mat('#4FC3F7', { roughness: 0.1, metalness: 0.2 }), [0, 0.125, 0.35], [0.31, 0.02, 0.31]));
  g.add(part(GEO.cyl(12), mat('#CFD8DC'), [0, 0.25, 0.35], [0.05, 0.3, 0.05]));
  g.add(part(GEO.sphere(), mat('#81D4FA', { roughness: 0.1 }), [0, 0.42, 0.35], [0.08, 0.08, 0.08]));
  for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.2, 1.2], [1.2, 1.2]]) g.add(buildTree(1).translateX(x).translateZ(z));
  const bench = woodMaterial('#9A6B45');
  g.add(part(GEO.rbox(), bench, [-0.3, 0.14, -1.1], [0.55, 0.04, 0.16]));
  g.add(part(GEO.rbox(), bench, [-0.3, 0.24, -1.17], [0.55, 0.14, 0.03]));
  const car = buildCar('#29B6F6');
  car.position.set(0.55, 0, -0.95);
  car.rotation.y = 0.3;
  g.add(car);
  return g;
}

export function buildGoToJail() {
  const g = new THREE.Group();
  const car = buildCar('#1E3A8A', { police: true });
  car.position.set(-0.1, 0, -0.95);
  car.rotation.y = Math.PI / 8;
  car.scale.setScalar(1.1);
  g.add(car);
  g.add(part(GEO.cyl(8), mat('#9E9E9E', { metalness: 0.5 }), [1.1, 0.4, -1.1], [0.03, 0.8, 0.03]));
  g.add(part(GEO.cyl(8), mat('#E53935'), [1.1, 0.85, -1.1], [0.2, 0.04, 0.2], [Math.PI / 2, 0, 0]));
  g.add(part(GEO.cyl(8), mat('#ffffff'), [1.1, 0.85, -1.08], [0.15, 0.045, 0.15], [Math.PI / 2, 0, 0]));
  return g;
}

export function buildHotel() {
  const g = new THREE.Group();
  block(g, facade('#FF5A5A', { cols: 4, rows: 2, window: '#ffe0e0', frame: '#ffdede' }), 0, 0, 0, 1.05, 0.5, 0.42);
  block(g, mat('#B71C1C'), 0, 0.5, 0, 1.12, 0.07, 0.48);
  block(g, mat('#ffffff'), 0, 0.57, 0, 0.36, 0.16, 0.06);
  g.add(part(GEO.box(), mat('#C62828'), [0, 0.65, -0.035], [0.06, 0.1, 0.01]));
  return g;
}

// Gộp mọi mesh tĩnh dưới `root` theo vật liệu để giảm số draw call.
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  const keep = new Set(['position', 'normal', 'uv']);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.dynamic) return;
    const g = o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.morphAttributes = {};
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, o.matrixWorld));
    const key = `${o.material.uuid}|${g.index ? 'i' : 'n'}`;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [] });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  let meshes = 0;
  for (const { material, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes++;
  }
  return { removed: remove.length, meshes };
}
