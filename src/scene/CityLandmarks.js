import * as THREE from 'three';
import { mat, GEO, part, glass, gold } from './ModelFactory.js';
import { facadeMaterial, stoneMaterial, roofMaterial } from './Materials.js';

// ---------------------------------------------------------------------------
// Công trình nổi tiếng + toà nhà màu sắc rực rỡ cho thành phố ở giữa bàn cờ
// (phong cách thành phố hoạt hình): Big Ben, tháp Eiffel, tượng Nữ thần Tự do,
// đu quay, hải đăng, tháp kính cong, tháp tròn nhiều tầng, nhà thờ lớn, biệt thự...
// Mỗi builder trả về Group có chân nằm trên y = 0, mặt tiền hướng -z, kích thước
// ~1 đơn vị (trừ công trình cao/rộng hơn). Mọi mesh tĩnh sẽ được gộp bởi batchStatic.
// ---------------------------------------------------------------------------

const box = (g, m, x, y, z, w, h, d) => g.add(part(GEO.box(), m, [x, y + h / 2, z], [w, h, d]));
const rbox = (g, m, x, y, z, w, h, d) => g.add(part(GEO.rbox(), m, [x, y + h / 2, z], [w, h, d]));
const cyl = (g, m, x, y, z, r, h, seg = 24) => g.add(part(GEO.cyl(seg), m, [x, y + h / 2, z], [r, h, r]));
const sphere = (g, m, x, y, z, r) => g.add(part(GEO.sphere(), m, [x, y, z], [r, r, r]));
const hemi = (g, m, x, y, z, r, k = 1) => g.add(part(GEO.hemi(), m, [x, y, z], [r, r * k, r]));
// Hình nón cụt: bán kính đáy rb, đỉnh rt.
const frustumCache = new Map();
function frustum(g, m, x, y, z, rb, rt, h, seg = 24) {
  const key = `${(rt / rb).toFixed(3)}|${seg}`;
  if (!frustumCache.has(key)) frustumCache.set(key, new THREE.CylinderGeometry(rt / rb, 1, 1, seg));
  g.add(part(frustumCache.get(key), m, [x, y + h / 2, z], [rb, h, rb]));
}
// Kim tự tháp vuông: w = cạnh đáy.
const pyr = (g, m, x, y, z, w, h, d = w) => g.add(part(GEO.pyramid(), m, [x, y + h / 2, z], [w * 0.707, h, d * 0.707]));

// Thanh dầm nối hai điểm (dùng cho giàn tháp Eiffel, nan hoa đu quay...).
const UP = new THREE.Vector3(0, 1, 0);
function beam(g, m, a, b, t = 0.03) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const o = part(GEO.box(), m, [0, 0, 0], [t, A.distanceTo(B), t]);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, B.sub(A).normalize());
  g.add(o);
}

const paint = (c, o = {}) => mat(c, { roughness: 0.42, ...o });

// --------------------------------------------------------------- đồng hồ Big Ben
let clockMat = null;
function clockMaterial() {
  if (clockMat) return clockMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF8E1';
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#D9A21B'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = '#2B2B2B'; g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64 + Math.sin(a) * 47, 64 - Math.cos(a) * 47);
    g.lineTo(64 + Math.sin(a) * 55, 64 - Math.cos(a) * 55);
    g.stroke();
  }
  g.lineCap = 'round';
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 20, 64 + 12); g.stroke(); // kim giờ
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 8, 64 - 40); g.stroke(); // kim phút
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  clockMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
  return clockMat;
}
const clockGeo = new THREE.CircleGeometry(1, 28);

// ============================================================== công trình nổi tiếng
export function buildBigBen() {
  const g = new THREE.Group();
  const stone = facadeMaterial('#E9C46A', { cols: 2, rows: 9, window: '#6b4a1e', frame: '#b98a30' });
  const stoneFlat = stoneMaterial('#E7C26A', { repeat: 1 });
  const dark = roofMaterial('#2F8F9D');
  // toà nghị viện thấp phía sau
  const hall = facadeMaterial('#EBCB7E', { cols: 7, rows: 2, window: '#7a5524', frame: '#f6e3aa' });
  box(g, hall, -0.78, 0, 0.05, 1.15, 0.42, 0.5);
  box(g, paint('#3C7C8F'), -0.78, 0.42, 0.05, 1.22, 0.05, 0.56);
  for (const x of [-1.2, -0.78, -0.36]) {
    box(g, hall, x, 0.47, 0.05, 0.18, 0.3, 0.2);
    pyr(g, dark, x, 0.77, 0.05, 0.22, 0.26);
  }
  // tháp đồng hồ
  box(g, stone, 0, 0, 0, 0.4, 1.35, 0.4);
  box(g, stoneFlat, 0, 0, 0, 0.5, 0.18, 0.5);
  box(g, stoneFlat, 0, 1.35, 0, 0.5, 0.07, 0.5);
  box(g, stoneFlat, 0, 1.42, 0, 0.46, 0.46, 0.46);
  for (const [ry, dx, dz] of [[Math.PI, 0, -0.232], [0, 0, 0.232], [-Math.PI / 2, 0.232, 0], [Math.PI / 2, -0.232, 0]]) {
    const f = part(clockGeo, clockMaterial(), [dx, 1.65, dz], [0.17, 0.17, 1], [0, ry, 0]);
    f.userData.dynamic = false;
    g.add(f);
  }
  box(g, gold(), 0, 1.88, 0, 0.52, 0.05, 0.52);
  box(g, stone, 0, 1.93, 0, 0.36, 0.26, 0.36);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    box(g, stoneFlat, x, 1.88, z, 0.07, 0.34, 0.07);
    g.add(part(GEO.cone(6), gold(), [x, 2.3, z], [0.05, 0.14, 0.05]));
  }
  pyr(g, dark, 0, 2.19, 0, 0.44, 0.62);
  g.add(part(GEO.cone(8), gold(), [0, 2.95, 0], [0.025, 0.28, 0.025]));
  sphere(g, gold(), 0, 2.8, 0, 0.035);
  return g;
}

export function buildEiffel() {
  const g = new THREE.Group();
  const iron = paint('#8A5A33', { roughness: 0.55, metalness: 0.35 });
  const ironDark = paint('#6B4423', { roughness: 0.55, metalness: 0.35 });
  const a = 0.5;
  const b = 0.25;
  const c = 0.12;
  const sx = [-1, 1];
  // chân tháp: 4 cột xiên + giằng chéo
  for (const x of sx) {
    for (const z of sx) {
      beam(g, iron, [x * a, 0, z * a], [x * b, 0.62, z * b], 0.07);
      beam(g, iron, [x * b, 0.62, z * b], [x * c, 1.28, z * c], 0.055);
    }
  }
  for (const s of sx) {
    // giằng chữ X ở các mặt (mô phỏng giàn thép)
    beam(g, ironDark, [-a, 0, s * a], [b, 0.62, s * b], 0.02);
    beam(g, ironDark, [a, 0, s * a], [-b, 0.62, s * b], 0.02);
    beam(g, ironDark, [s * a, 0, -a], [s * b, 0.62, b], 0.02);
    beam(g, ironDark, [s * a, 0, a], [s * b, 0.62, -b], 0.02);
    beam(g, ironDark, [-b, 0.62, s * b], [c, 1.28, s * c], 0.018);
    beam(g, ironDark, [b, 0.62, s * b], [-c, 1.28, s * c], 0.018);
    beam(g, ironDark, [s * b, 0.62, -b], [s * c, 1.28, c], 0.018);
    beam(g, ironDark, [s * b, 0.62, b], [s * c, 1.28, -c], 0.018);
    // vòm chân tháp
    beam(g, iron, [-0.36, 0.14, s * 0.4], [0.36, 0.14, s * 0.4], 0.04);
    beam(g, iron, [s * 0.4, 0.14, -0.36], [s * 0.4, 0.14, 0.36], 0.04);
  }
  box(g, iron, 0, 0.6, 0, 0.6, 0.05, 0.6);
  box(g, ironDark, 0, 0.65, 0, 0.5, 0.025, 0.5);
  box(g, iron, 0, 1.26, 0, 0.32, 0.05, 0.32);
  // đoạn trên thon dần + ăng-ten
  frustum(g, iron, 0, 1.31, 0, 0.1, 0.035, 0.7, 4);
  box(g, iron, 0, 1.55, 0, 0.14, 0.03, 0.14);
  cyl(g, iron, 0, 2.0, 0, 0.012, 0.3, 6);
  sphere(g, paint('#ff3030', { emissive: '#ff0000', emissiveIntensity: 1.2 }), 0, 2.31, 0, 0.022);
  return g;
}

export function buildLiberty() {
  const g = new THREE.Group();
  const stone = stoneMaterial('#D9D2C2', { repeat: 1 });
  const copper = paint('#58BFA7', { roughness: 0.55, metalness: 0.25 });
  const copperDark = paint('#3C9C86', { roughness: 0.55, metalness: 0.25 });
  // đảo tròn có cỏ + bệ đá hình sao
  cyl(g, paint('#4FA84A', { roughness: 0.9 }), 0, 0, 0, 0.78, 0.07, 28);
  cyl(g, stone, 0, 0.07, 0, 0.5, 0.12, 8);
  box(g, stone, 0, 0.19, 0, 0.5, 0.18, 0.5);
  box(g, facadeMaterial('#E4DCCB', { cols: 3, rows: 3, window: '#8fa3a8', frame: '#f4efe4' }), 0, 0.37, 0, 0.36, 0.5, 0.36);
  box(g, stone, 0, 0.87, 0, 0.44, 0.06, 0.44);
  // tượng
  frustum(g, copper, 0, 0.93, 0, 0.17, 0.1, 0.62, 16);
  sphere(g, copper, 0, 1.6, 0, 0.085);
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2; // vương miện: 7 tia toả ra quanh đầu
    g.add(part(GEO.cone(6), copperDark, [Math.sin(ang) * 0.07, 1.7, Math.cos(ang) * 0.07], [0.016, 0.1, 0.016], [Math.cos(ang) * 0.8, 0, -Math.sin(ang) * 0.8]));
  }
  // tay giơ đuốc
  g.add(part(GEO.cyl(8), copper, [0.09, 1.78, -0.02], [0.03, 0.34, 0.03], [0, 0, -0.35]));
  g.add(part(GEO.cyl(10), gold(), [0.17, 1.98, -0.02], [0.045, 0.05, 0.045]));
  g.add(part(GEO.cone(10), paint('#FFB300', { emissive: '#FF9800', emissiveIntensity: 1.1 }), [0.17, 2.08, -0.02], [0.04, 0.16, 0.04]));
  // tay cầm bảng luật
  g.add(part(GEO.cyl(8), copper, [-0.12, 1.3, -0.07], [0.028, 0.22, 0.028], [0.9, 0, 0.3]));
  box(g, copperDark, -0.14, 1.28, -0.16, 0.12, 0.16, 0.03);
  return g;
}

export function buildLighthouse() {
  const g = new THREE.Group();
  const red = paint('#E53935');
  const white = paint('#FAFAFA');
  cyl(g, paint('#8D6E63', { roughness: 0.9 }), 0, 0, 0, 0.62, 0.1, 10);
  let y = 0.1;
  const radii = [0.3, 0.27, 0.24, 0.215, 0.19];
  radii.forEach((r, i) => {
    frustum(g, i % 2 ? white : red, 0, y, 0, r, r * 0.9, 0.3, 20);
    y += 0.3;
  });
  cyl(g, paint('#37474F'), 0, y, 0, 0.26, 0.05, 20);
  y += 0.05;
  g.add(part(GEO.cyl(20), paint('#FFF59D', { emissive: '#FFEE58', emissiveIntensity: 1.0, roughness: 0.15 }), [0, y + 0.1, 0], [0.13, 0.2, 0.13]));
  for (let i = 0; i < 4; i++) beam(g, paint('#37474F'), [Math.cos(i * 1.571) * 0.14, y, Math.sin(i * 1.571) * 0.14], [Math.cos(i * 1.571) * 0.14, y + 0.2, Math.sin(i * 1.571) * 0.14], 0.015);
  g.add(part(GEO.cone(20), red, [0, y + 0.31, 0], [0.19, 0.2, 0.19]));
  sphere(g, gold(), 0, y + 0.43, 0, 0.03);
  // nhà trông đèn
  box(g, facadeMaterial('#FFFFFF', { cols: 2, rows: 1, window: '#9ad8ff' }), 0.5, 0, -0.1, 0.4, 0.26, 0.34);
  g.add(part(GEO.prism(), red, [0.5, 0.36, -0.1], [0.24, 0.12, 0.4]));
  return g;
}

export function buildFerrisWheel() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  const R = 0.95;
  const hubY = 1.12;
  const steel = paint('#F5F5F5', { roughness: 0.35, metalness: 0.4 });
  const frame = paint('#E53935', { roughness: 0.4, metalness: 0.2 });
  box(g, paint('#B0BEC5'), 0, 0, 0, 1.9, 0.05, 0.8);
  for (const z of [-0.2, 0.2]) {
    beam(g, frame, [-0.6, 0.05, z], [0, hubY, z], 0.045);
    beam(g, frame, [0.6, 0.05, z], [0, hubY, z], 0.045);
  }
  const rotor = new THREE.Group();
  rotor.position.set(0, hubY, 0);
  const ringGeo = new THREE.TorusGeometry(R, 0.022, 8, 56);
  const innerGeo = new THREE.TorusGeometry(R * 0.55, 0.014, 8, 40);
  for (const z of [-0.2, 0.2]) {
    rotor.add(part(ringGeo, steel, [0, 0, z]));
    rotor.add(part(innerGeo, steel, [0, 0, z]));
  }
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const z of [-0.2, 0.2]) beam(rotor, steel, [0, 0, z], [Math.cos(a) * R, Math.sin(a) * R, z], 0.012);
    beam(rotor, steel, [Math.cos(a) * R, Math.sin(a) * R, -0.2], [Math.cos(a) * R, Math.sin(a) * R, 0.2], 0.012);
  }
  const colors = ['#FFC107', '#EF5350', '#42A5F5', '#66BB6A', '#AB47BC', '#FF7043'];
  const cabins = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const cab = new THREE.Group();
    cab.add(part(GEO.rbox(), paint(colors[i % colors.length], { roughness: 0.3 }), [0, -0.09, 0], [0.15, 0.1, 0.34]));
    cab.add(part(GEO.box(), glass('#cfeeff'), [0, -0.075, 0], [0.152, 0.05, 0.3]));
    cab.add(part(GEO.rbox(), paint('#ffffff'), [0, -0.04, 0], [0.17, 0.02, 0.36]));
    cab.add(part(GEO.cyl(6), steel, [0, -0.015, 0], [0.008, 0.05, 0.008]));
    pivot.add(cab);
    rotor.add(pivot);
    cabins.push(pivot);
  }
  g.add(rotor);
  g.userData.update = (t) => {
    rotor.rotation.z = -t * 0.18;
    for (const p of cabins) p.rotation.z = t * 0.18;
  };
  return g;
}

// ============================================================== toà nhà màu sắc & điểm nhấn Việt Nam
// Tháp kính cong Bitexco có sân đỗ trực thăng nhô ra bên hông (như ảnh tham chiếu).
export function buildCurvedTower() {
  const g = new THREE.Group();
  const skyGlass = facadeMaterial('#5FB8F2', { cols: 14, rows: 14, window: '#1B6DC1', frame: '#d8f3ff', glassy: true });
  const band = paint('#E8F6FF', { roughness: 0.25, metalness: 0.3 });
  cyl(g, stoneMaterial('#EAE2D3', { repeat: 1 }), 0, 0, 0, 0.58, 0.08, 28);
  frustum(g, skyGlass, 0, 0.08, 0, 0.44, 0.38, 1.05, 32);
  frustum(g, skyGlass, 0, 1.13, 0, 0.38, 0.3, 0.85, 32);
  frustum(g, skyGlass, 0, 1.98, 0, 0.3, 0.19, 0.68, 32);
  for (const [y, r] of [[0.55, 0.42], [1.13, 0.39], [1.68, 0.34], [1.98, 0.31], [2.42, 0.23]]) {
    cyl(g, band, 0, y, 0, r, 0.035, 32);
  }
  // Sân đỗ trực thăng (helipad) vươn ra bên hông tầng cao
  const heliY = 1.88;
  cyl(g, paint('#DCE6F2', { metalness: 0.45, roughness: 0.25 }), -0.42, heliY, 0.05, 0.24, 0.04, 28);
  cyl(g, paint('#2B6CB0', { roughness: 0.3 }), -0.42, heliY + 0.041, 0.05, 0.19, 0.01, 24);
  cyl(g, paint('#FFD54F'), -0.42, heliY + 0.045, 0.05, 0.14, 0.008, 24);
  beam(g, band, [-0.18, heliY - 0.18, 0.05], [-0.46, heliY, 0.05], 0.03);
  beam(g, band, [-0.18, heliY - 0.14, 0.12], [-0.4, heliY, 0.14], 0.022);
  beam(g, band, [-0.18, heliY - 0.14, -0.02], [-0.4, heliY, -0.04], 0.022);

  // Đỉnh tháp vát chéo + đèn báo
  hemi(g, glass('#63C5FA'), 0, 2.66, 0, 0.19, 0.95);
  cyl(g, paint('#d0d4da', { metalness: 0.8 }), 0, 2.8, 0, 0.012, 0.38, 6);
  sphere(g, paint('#ff3030', { emissive: '#ff0000', emissiveIntensity: 1.2 }), 0, 3.2, 0, 0.024);
  // Khối đế thương mại ở chân
  box(g, facadeMaterial('#F8FAFC', { cols: 4, rows: 2, window: '#58b4f5', glassy: true }), 0, 0.08, -0.46, 0.84, 0.28, 0.32);
  box(g, gold(), 0, 0.36, -0.46, 0.88, 0.03, 0.35);
  return g;
}

// Nhà thờ Đức Bà: tường gạch cam đất ấm, cửa sổ hoa hồng, hai tháp chuông chóp nhọn.
export function buildNotreDame() {
  const g = new THREE.Group();
  const brick = facadeMaterial('#E87A52', { cols: 3, rows: 3, window: '#FFF3D1', frame: '#FDE8D0', brick: true });
  const trim = paint('#FFF3E0', { roughness: 0.5 });
  const roof = roofMaterial('#D64527');
  const spireMat = paint('#8CA0B8', { roughness: 0.35, metalness: 0.35 });

  // Thân chính nhà thờ + mái ngói đỏ
  box(g, stoneMaterial('#E6DCC8', { repeat: 2 }), 0, 0, 0, 1.24, 0.07, 1.35);
  box(g, brick, 0, 0.07, 0.12, 0.96, 0.72, 0.95);
  g.add(part(GEO.prism(), roof, [0, 0.79 + 0.22, 0.12], [0.52, 0.22, 1.0]));

  // Hai tháp chuông phía trước
  for (const side of [-1, 1]) {
    const x = side * 0.34;
    box(g, brick, x, 0.07, -0.35, 0.34, 1.12, 0.34);
    box(g, trim, x, 0.62, -0.35, 0.37, 0.04, 0.37);
    box(g, trim, x, 0.92, -0.35, 0.37, 0.04, 0.37);
    box(g, trim, x, 1.19, -0.35, 0.38, 0.05, 0.38);
    // Chóp nhọn tháp chuông
    pyr(g, spireMat, x, 1.24, -0.35, 0.34, 0.68);
    cyl(g, gold(), x, 1.92, -0.35, 0.01, 0.14, 6);
  }
  // Cửa sổ hoa hồng tròn ở giữa mặt tiền + cổng vòm
  cyl(g, trim, 0, 0.56, -0.37, 0.12, 0.03, 20);
  g.add(part(GEO.cyl(20), trim, [0, 0.56, -0.365], [0.12, 0.02, 0.12], [Math.PI / 2, 0, 0]));
  g.add(part(GEO.cyl(20), glass('#FFE082'), [0, 0.56, -0.372], [0.09, 0.02, 0.09], [Math.PI / 2, 0, 0]));
  box(g, paint('#6D3B24'), 0, 0.07, -0.37, 0.2, 0.28, 0.04);
  for (const side of [-1, 1]) box(g, paint('#6D3B24'), side * 0.34, 0.07, -0.525, 0.12, 0.22, 0.03);
  return g;
}

// Chùa tháp Việt Nam nhiều tầng mái cong đỏ vàng (Chùa Trấn Quốc / Thiên Mụ).
export function buildVietnamesePagoda() {
  const g = new THREE.Group();
  const redWall = paint('#B82920', { roughness: 0.45 });
  const roof = roofMaterial('#D83A26');
  const goldMat = gold();
  const stone = stoneMaterial('#EBE1CE', { repeat: 1 });

  // Bệ đá + bậc tam cấp
  box(g, stone, 0, 0, 0, 1.15, 0.1, 1.15);
  box(g, goldMat, 0, 0.1, 0, 1.02, 0.03, 1.02);
  for (let i = 0; i < 3; i++) {
    box(g, stone, 0, i * 0.03, -0.6 - i * 0.06, 0.36, 0.03, 0.08);
  }

  // 4 tầng tháp với mái đao cong nhô rộng
  let y = 0.13;
  const tiers = [
    [0.72, 0.38, 1.08],
    [0.58, 0.32, 0.9],
    [0.45, 0.28, 0.74],
    [0.34, 0.24, 0.58],
  ];
  tiers.forEach(([w, h, rw]) => {
    box(g, redWall, 0, y, 0, w, h, w);
    box(g, goldMat, 0, y + h * 0.5, -w * 0.505, w * 0.45, h * 0.45, 0.015);
    // Mái ngói + riềm vàng kim
    box(g, goldMat, 0, y + h - 0.01, 0, rw * 0.96, 0.028, rw * 0.96);
    pyr(g, roof, 0, y + h + 0.015, 0, rw, 0.18);
    // Đầu đao uốn cong ở 4 góc mái
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(part(GEO.cone(8), goldMat, [sx * rw * 0.46, y + h + 0.07, sz * rw * 0.46], [0.035, 0.09, 0.035], [-sz * 0.4, 0, sx * 0.4]));
      }
    }
    y += h + 0.16;
  });
  // Hồ lô / Búp sen vàng trên đỉnh
  cyl(g, goldMat, 0, y, 0, 0.035, 0.26, 12);
  sphere(g, goldMat, 0, y + 0.14, 0, 0.06);
  sphere(g, goldMat, 0, y + 0.26, 0, 0.04);
  return g;
}

// Đền cổ / Cổng Tam Quan mái ngói cong bên bờ nước, có bậc đá xuống bến.
export function buildTempleGate() {
  const g = new THREE.Group();
  const stone = stoneMaterial('#E8DEC8', { repeat: 1 });
  const pillar = paint('#B7281E', { roughness: 0.4 });
  const roof = roofMaterial('#D63A24');
  const goldMat = gold();

  // Bệ đá và bậc thềm xuống nước
  box(g, stone, 0, 0, 0, 1.32, 0.12, 0.86);
  for (let i = 0; i < 4; i++) {
    box(g, stone, 0, i * 0.03, -0.46 - (3 - i) * 0.07, 0.52, 0.035, 0.08);
  }
  // Hàng cột đỏ sơn son thếp vàng
  for (const x of [-0.48, -0.18, 0.18, 0.48]) {
    for (const z of [-0.24, 0.24]) {
      cyl(g, pillar, x, 0.12, z, 0.045, 0.44, 14);
      cyl(g, goldMat, x, 0.12, z, 0.055, 0.04, 14);
    }
  }
  // Tường hậu cung và hoành phi vàng
  box(g, paint('#FFF2D6'), 0, 0.12, 0.06, 0.88, 0.42, 0.34);
  box(g, pillar, 0, 0.12, -0.12, 0.24, 0.3, 0.03);
  box(g, goldMat, 0, 0.46, -0.25, 0.48, 0.09, 0.03);
  // Mái ngói hai tầng cổ diêm
  box(g, goldMat, 0, 0.55, 0, 1.38, 0.03, 0.88);
  pyr(g, roof, 0, 0.58, 0, 1.46, 0.2, 0.94);
  box(g, paint('#B7281E'), 0, 0.72, 0, 0.84, 0.14, 0.52);
  box(g, goldMat, 0, 0.85, 0, 0.98, 0.025, 0.64);
  pyr(g, roof, 0, 0.87, 0, 1.06, 0.22, 0.7);
  sphere(g, goldMat, 0, 1.1, 0, 0.045);
  return g;
}

// Đài phun nước Hoa Sen Vàng ở chính giữa quảng trường trung tâm (biểu tượng chủ đạo của bàn cờ).
export function buildGoldenLotusFountain() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  const stone = stoneMaterial('#F4EBDC', { repeat: 2, roughness: 0.6 });
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: '#FFCA28',
    metalness: 0.82,
    roughness: 0.2,
    emissive: '#8A5600',
    emissiveIntensity: 0.22,
    clearcoat: 0.8,
  });
  const water = new THREE.MeshPhysicalMaterial({
    color: '#18C9D4',
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1,
    emissive: '#086972',
    emissiveIntensity: 0.2,
  });

  // Bậc thềm tròn lát đá + thành hồ chạm vàng
  cyl(g, stone, 0, 0, 0, 1.85, 0.06, 48);
  cyl(g, goldMat, 0, 0.06, 0, 1.66, 0.04, 48);
  cyl(g, stone, 0, 0.08, 0, 1.62, 0.14, 48);
  // Mặt nước xanh ngọc trong hồ + 8 tia nước nhỏ quanh thành
  cyl(g, water, 0, 0.19, 0, 1.48, 0.04, 48);
  cyl(g, goldMat, 0, 0.21, 0, 1.54, 0.03, 48);

  // Đài đá tầng 2 ở giữa hồ
  cyl(g, stone, 0, 0.2, 0, 0.78, 0.14, 36);
  cyl(g, goldMat, 0, 0.33, 0, 0.82, 0.035, 36);
  cyl(g, water, 0, 0.35, 0, 0.72, 0.03, 36);

  // Bông Hoa Sen Vàng 3 tầng cánh nở rộ
  const lotus = new THREE.Group();
  lotus.position.set(0, 0.38, 0);
  // Tầng cánh ngoài (10 cánh lớn xoè rộng)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const petal = new THREE.Group();
    petal.rotation.y = a;
    petal.add(part(GEO.sphere(), goldMat, [0, 0.16, 0.36], [0.16, 0.34, 0.065], [0.68, 0, 0]));
    lotus.add(petal);
  }
  // Tầng cánh giữa (8 cánh ôm lên)
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const petal = new THREE.Group();
    petal.rotation.y = a;
    petal.add(part(GEO.sphere(), goldMat, [0, 0.28, 0.22], [0.14, 0.34, 0.06], [0.42, 0, 0]));
    lotus.add(petal);
  }
  // Tầng cánh trong (6 cánh chụm quanh gương sen)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.Group();
    petal.rotation.y = a;
    petal.add(part(GEO.sphere(), goldMat, [0, 0.38, 0.11], [0.11, 0.28, 0.05], [0.22, 0, 0]));
    lotus.add(petal);
  }
  // Gương sen vàng phát sáng ở tâm
  lotus.add(part(GEO.sphere(), paint('#FFE57F', { emissive: '#FFB300', emissiveIntensity: 0.65 }), [0, 0.42, 0], [0.13, 0.16, 0.13]));
  g.add(lotus);

  // Vòi phun nước lung linh quanh hoa sen
  const jetMat = mat('#A7F3FF', { roughness: 0.08, transparent: true, opacity: 0.78, emissive: '#38BDF8', emissiveIntensity: 0.35 });
  const jets = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const j = part(GEO.cone(10), jetMat, [Math.cos(a) * 1.08, 0.36, Math.sin(a) * 1.08], [0.06, 0.32, 0.06], [Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25]);
    g.add(j);
    jets.push({ mesh: j, phase: i * 0.8 });
  }
  g.userData.update = (t) => {
    lotus.rotation.y = t * 0.15;
    for (const j of jets) {
      j.mesh.scale.y = 0.28 + Math.sin(t * 4.5 + j.phase) * 0.06;
    }
  };
  return g;
}

// Cầu đá vòm nhỏ bắc qua kênh nước xanh ngọc, có lan can đá và đèn lồng ấm.
export function buildArchedBridge() {
  const g = new THREE.Group();
  const stone = stoneMaterial('#F3EAD8', { repeat: 1, roughness: 0.65 });
  const trim = paint('#DFD2B8', { roughness: 0.6 });
  const lamp = paint('#FFF3B0', { emissive: '#FFCA28', emissiveIntensity: 0.85 });
  const postMat = paint('#3E2723', { roughness: 0.5 });

  // Nhịp cầu cong gồm 5 đoạn ghép tạo vòm mềm
  const segs = [
    [-0.56, 0.06, 0.26, 0.28],
    [-0.28, 0.14, 0.14, 0.3],
    [0, 0.18, 0, 0.34],
    [0.28, 0.14, -0.14, 0.3],
    [0.56, 0.06, -0.26, 0.28],
  ];
  for (const [x, y, rz, len] of segs) {
    g.add(part(GEO.rbox(), stone, [x, y, 0], [len, 0.07, 0.68], [0, 0, rz]));
    for (const sz of [-0.31, 0.31]) {
      g.add(part(GEO.rbox(), trim, [x, y + 0.08, sz], [len, 0.09, 0.05], [0, 0, rz]));
    }
  }
  // 4 trụ đầu cầu có đèn cầu vàng ấm
  for (const sx of [-0.66, 0.66]) {
    for (const sz of [-0.31, 0.31]) {
      box(g, stone, sx, 0, sz, 0.11, 0.22, 0.11);
      cyl(g, postMat, sx, 0.22, sz, 0.018, 0.18, 8);
      sphere(g, lamp, sx, 0.42, sz, 0.048);
    }
  }
  return g;
}

// Thuyền buồm đỏ truyền thống (vịnh Hạ Long / kênh thành phố).
export function buildRedSailBoat(scale = 1) {
  const g = new THREE.Group();
  const wood = paint('#8B4E24', { roughness: 0.55 });
  const deck = paint('#BA7A44', { roughness: 0.6 });
  const sailMat = paint('#E53935', { roughness: 0.45, emissive: '#5c0c0c', emissiveIntensity: 0.12 });
  const rib = gold();

  // Thân thuyền gỗ
  g.add(part(GEO.rbox(), wood, [0, 0.04, 0], [0.58, 0.09, 0.22]));
  g.add(part(GEO.cone(4), wood, [0.32, 0.055, 0], [0.14, 0.14, 0.15], [0, Math.PI / 4, -Math.PI / 2]));
  g.add(part(GEO.cone(4), wood, [-0.31, 0.055, 0], [0.13, 0.12, 0.14], [0, Math.PI / 4, Math.PI / 2]));
  box(g, deck, -0.06, 0.085, 0, 0.24, 0.06, 0.16);

  // Hai cánh buồm đỏ hình quạt
  for (const [mx, mh, sw, sh] of [[0.06, 0.46, 0.24, 0.34], [-0.16, 0.36, 0.18, 0.26]]) {
    cyl(g, wood, mx, 0.08, 0, 0.012, mh, 8);
    g.add(part(GEO.rbox(), sailMat, [mx - sw * 0.35, 0.14 + sh * 0.5, 0], [sw, sh, 0.016], [0, 0.12, 0.08]));
    for (let k = 0; k < 3; k++) {
      g.add(part(GEO.box(), rib, [mx - sw * 0.35, 0.18 + k * (sh * 0.32), 0], [sw * 1.02, 0.01, 0.02], [0, 0.12, 0.08]));
    }
  }
  g.scale.setScalar(scale);
  return g;
}

// Tháp tròn nhiều tầng có ban công vòng (màu cam).
export function buildRingTower(color = '#F39C34', accent = '#FFF3E0') {
  const g = new THREE.Group();
  const drum = facadeMaterial(color, { cols: 12, rows: 3, window: '#bfe9ff', frame: accent });
  const ring = paint(accent, { roughness: 0.4 });
  let y = 0;
  const radii = [0.42, 0.4, 0.37, 0.34, 0.3, 0.26];
  radii.forEach((r) => {
    cyl(g, drum, 0, y, 0, r, 0.3, 28);
    cyl(g, ring, 0, y + 0.3, 0, r + 0.05, 0.035, 28);
    y += 0.335;
  });
  cyl(g, paint('#C0392B'), 0, y, 0, 0.22, 0.06, 20);
  g.add(part(GEO.hemi(), glass('#FFE082'), [0, y + 0.06, 0], [0.2, 0.2, 0.2]));
  cyl(g, paint('#d0d4da', { metalness: 0.8 }), 0, y + 0.2, 0, 0.012, 0.35, 6);
  box(g, facadeMaterial('#FFFFFF', { cols: 3, rows: 1, window: '#9ad8ff' }), 0, 0, -0.5, 0.7, 0.26, 0.22);
  return g;
}

// Gói chung: thân kính + nón mái, dùng cho các tháp văn phòng.
export function buildGlassSkyscraper(base = '#9DB8F5', win = '#2F5FE0', h = 2.2, accent = '#FFC83D') {
  const g = new THREE.Group();
  const glassMat = facadeMaterial(base, { cols: 5, rows: Math.round(h * 5), window: win, frame: '#eef3ff', glassy: true });
  const w = 0.62;
  box(g, glassMat, 0, 0, 0, w, h, 0.52);
  box(g, glassMat, 0.05, h, 0, w * 0.74, 0.36, 0.4);
  box(g, paint(accent, { metalness: 0.5, roughness: 0.3 }), 0, h - 0.02, 0, w + 0.05, 0.05, 0.57);
  box(g, paint(accent, { metalness: 0.5, roughness: 0.3 }), 0.05, h + 0.36, 0, w * 0.74 + 0.04, 0.04, 0.44);
  g.add(part(GEO.prism(), paint('#E8EDF3', { metalness: 0.5, roughness: 0.3 }), [0.05, h + 0.52, 0], [w * 0.37, 0.14, 0.4]));
  cyl(g, paint('#d0d4da', { metalness: 0.8 }), 0.05, h + 0.6, 0, 0.012, 0.5, 6);
  sphere(g, paint('#ff3030', { emissive: '#ff0000', emissiveIntensity: 1.2 }), 0.05, h + 1.12, 0, 0.022);
  // sảnh tầng trệt + sọc màu nhấn
  box(g, paint(accent), 0, 0, -0.27, w + 0.1, 0.16, 0.08);
  box(g, glass('#8fd3ff'), 0, 0.02, -0.31, w * 0.7, 0.12, 0.02);
  for (let y = 0.9; y < h; y += 0.7) box(g, paint(accent, { roughness: 0.5 }), 0, y, -0.265, w + 0.02, 0.035, 0.012);
  return g;
}

// Khách sạn mái đỏ nhiều cánh (như toà mái ngói đỏ ở bên phải ảnh mẫu).
export function buildRedRoofHotel() {
  const g = new THREE.Group();
  const wall = facadeMaterial('#FFF1DC', { cols: 6, rows: 4, window: '#8fd3ff', frame: '#ffffff' });
  const roof = roofMaterial('#D6382C');
  box(g, wall, 0, 0, 0, 1.1, 0.8, 0.62);
  g.add(part(GEO.prism(), roof, [0, 0.8 + 0.2, 0], [0.34, 0.2, 1.2]));
  box(g, wall, 0.3, 0.8, 0.02, 0.5, 0.5, 0.5);
  pyr(g, roof, 0.3, 1.3, 0.02, 0.62, 0.34);
  box(g, wall, -0.42, 0.8, 0.0, 0.3, 0.3, 0.45);
  pyr(g, roof, -0.42, 1.1, 0, 0.4, 0.22);
  // mái hiên sọc ở tầng trệt
  box(g, paint('#C62828'), 0, 0.2, -0.36, 1.1, 0.03, 0.16);
  for (let i = 0; i < 5; i++) box(g, paint('#FFFFFF'), -0.44 + i * 0.22, 0.2, -0.361, 0.1, 0.031, 0.161);
  box(g, paint('#3E2723'), 0, 0, -0.32, 0.2, 0.2, 0.03);
  box(g, paint('#FFD54F', { emissive: '#FFC107', emissiveIntensity: 0.5 }), 0, 0.55, -0.32, 0.5, 0.09, 0.02);
  return g;
}

// Biệt thự kiểu châu Âu: mái ngói đỏ, tháp nhỏ, ống khói, cây cảnh.
export function buildVilla(wallColor = '#FFE4B5', roofColor = '#C0392B') {
  const g = new THREE.Group();
  const wall = facadeMaterial(wallColor, { cols: 3, rows: 2, window: '#a9dcff', frame: '#ffffff' });
  const roof = roofMaterial(roofColor);
  box(g, wall, 0, 0, 0, 0.9, 0.55, 0.66);
  g.add(part(GEO.prism(), roof, [0, 0.55 + 0.17, 0], [0.38, 0.17, 0.98]));
  box(g, wall, -0.36, 0, -0.18, 0.34, 0.8, 0.34);
  pyr(g, roof, -0.36, 0.8, -0.18, 0.44, 0.36);
  box(g, paint('#B5651D'), 0.3, 0.55, 0.12, 0.1, 0.3, 0.1);
  box(g, paint('#5D4037'), 0.12, 0, -0.34, 0.2, 0.26, 0.03);
  box(g, paint('#ffffff'), 0.12, 0.26, -0.36, 0.3, 0.03, 0.1);
  return g;
}

// Toà thị chính Đông Dương (UBND / Bưu điện): tường kem vàng, mái ngói đỏ, tháp đồng hồ ở giữa như ảnh mẫu.
export function buildCityHall() {
  const g = new THREE.Group();
  const stone = stoneMaterial('#F7EFE0', { repeat: 2, veins: true });
  const wall = facadeMaterial('#FFE9B5', { cols: 7, rows: 2, window: '#5aa9e6', frame: '#ffffff' });
  const roof = roofMaterial('#D94326');
  box(g, stoneMaterial('#DFD4BE', { repeat: 2 }), 0, 0, 0, 1.62, 0.08, 0.96);
  box(g, wall, 0, 0.08, 0.08, 1.46, 0.58, 0.58);
  // Hàng cột trắng mặt tiền
  for (let i = 0; i < 6; i++) cyl(g, stone, -0.55 + i * 0.22, 0.08, -0.24, 0.042, 0.54, 14);
  box(g, stone, 0, 0.62, 0.04, 1.52, 0.06, 0.72);
  // Mái ngói đỏ chạy ngang + hai đầu hồi
  g.add(part(GEO.prism(), roof, [0, 0.68 + 0.18, 0.08], [0.36, 0.18, 1.5]));
  // Tháp đồng hồ trung tâm
  box(g, wall, 0, 0.66, -0.05, 0.44, 0.42, 0.44);
  const f = part(clockGeo, clockMaterial(), [0, 0.88, -0.275], [0.13, 0.13, 1], [0, Math.PI, 0]);
  f.userData.dynamic = false;
  g.add(f);
  pyr(g, roof, 0, 1.08, -0.05, 0.52, 0.28);
  cyl(g, gold(), 0, 1.36, -0.05, 0.014, 0.22, 8);
  sphere(g, paint('#E53935', { emissive: '#FF1744', emissiveIntensity: 0.7 }), 0, 1.59, -0.05, 0.032);
  return g;
}

// Dãy cửa hàng nhiều màu có mái hiên sọc (phố mua sắm).
export function buildShopRow() {
  const g = new THREE.Group();
  const shops = [
    ['#FF8A65', '#E64A19', 0.5], ['#FFD54F', '#F9A825', 0.7], ['#81D4FA', '#0288D1', 0.55], ['#A5D6A7', '#388E3C', 0.65],
  ];
  shops.forEach(([c, a, h], i) => {
    const x = -0.57 + i * 0.38;
    box(g, facadeMaterial(c, { cols: 2, rows: 2, window: '#fff3c4', frame: '#ffffff', brick: i % 2 === 0 }), x, 0, 0, 0.37, h, 0.6);
    box(g, paint(a), x, h, 0, 0.4, 0.05, 0.64);
    box(g, paint(a), x, 0.2, -0.33, 0.37, 0.03, 0.14);
    for (let k = 0; k < 3; k++) box(g, paint('#ffffff'), x - 0.12 + k * 0.12, 0.2, -0.331, 0.06, 0.031, 0.141);
    box(g, paint('#5D4037'), x, 0, -0.3, 0.12, 0.17, 0.03);
  });
  return g;
}

// Chung cư cao màu tươi có ban công và sọc ngang.
export function buildColorTower(wall = '#FF8A65', trim = '#BF360C', h = 1.7) {
  const g = new THREE.Group();
  const floors = Math.round(h / 0.2);
  box(g, facadeMaterial(wall, { cols: 4, rows: floors, window: '#c8ecff', frame: '#ffffff' }), 0, 0, 0, 0.8, h, 0.6);
  box(g, paint(trim), 0, h, 0, 0.88, 0.07, 0.68);
  box(g, facadeMaterial(wall, { cols: 3, rows: 2, window: '#c8ecff', frame: '#ffffff' }), 0.1, h + 0.07, 0.02, 0.5, 0.36, 0.4);
  box(g, paint(trim), 0.1, h + 0.43, 0.02, 0.56, 0.05, 0.46);
  const slab = paint('#fff6ea');
  const rail = paint(trim, { metalness: 0.2 });
  for (let i = 1; i < floors; i += 2) {
    box(g, slab, 0, i * 0.2, -0.36, 0.78, 0.018, 0.12);
    box(g, rail, 0, i * 0.2 + 0.018, -0.415, 0.78, 0.04, 0.008);
  }
  box(g, paint(trim), 0, 0, -0.32, 0.86, 0.17, 0.08);
  box(g, paint('#ffffff'), -0.18, 0.17, -0.33, 0.18, 0.025, 0.1);
  box(g, paint('#ffffff'), 0.18, 0.17, -0.33, 0.18, 0.025, 0.1);
  cyl(g, paint('#cfd8dc', { metalness: 0.7 }), -0.25, h + 0.07, 0.1, 0.07, 0.1, 12);
  return g;
}

// Đài phun nước nhỏ ở góc công viên.
export function buildFountain() {
  const g = new THREE.Group();
  cyl(g, stoneMaterial('#E6DDC8', { repeat: 1 }), 0, 0, 0, 0.62, 0.05, 32);
  cyl(g, stoneMaterial('#CFD8DC', { repeat: 1 }), 0, 0.05, 0, 0.42, 0.1, 28);
  g.add(part(GEO.cyl(28), mat('#18C9D4', { roughness: 0.08, metalness: 0.25 }), [0, 0.152, 0], [0.38, 0.012, 0.38]));
  cyl(g, gold(), 0, 0.15, 0, 0.06, 0.28, 12);
  cyl(g, gold(), 0, 0.4, 0, 0.18, 0.04, 20);
  g.add(part(GEO.cone(12), mat('#81D4FA', { roughness: 0.08, transparent: true, opacity: 0.8 }), [0, 0.6, 0], [0.07, 0.34, 0.07]));
  return g;
}

export const LANDMARKS = {
  bigBen: buildBigBen,
  eiffel: buildEiffel,
  liberty: buildLiberty,
  lighthouse: buildLighthouse,
  curved: buildCurvedTower,
  notreDame: buildNotreDame,
  pagoda: buildVietnamesePagoda,
  templeGate: buildTempleGate,
  ringOrange: () => buildRingTower('#F39C34', '#FFF3E0'),
  ringPink: () => buildRingTower('#EC7BB0', '#FFF0F6'),
  skyBlue: () => buildGlassSkyscraper('#68B5F5', '#1B6DC1', 2.35, '#FFC83D'),
  skyViolet: () => buildGlassSkyscraper('#C7B6F2', '#6A3FD1', 1.9, '#FF8A65'),
  skyGreen: () => buildGlassSkyscraper('#80DFC4', '#0F9D84', 2.1, '#FFE066'),
  redHotel: buildRedRoofHotel,
  villa: () => buildVilla('#FFE4B5', '#D6382C'),
  villaBlue: () => buildVilla('#DDEEFF', '#2E6FD0'),
  cityHall: buildCityHall,
  shops: buildShopRow,
  towerOrange: () => buildColorTower('#FF8A65', '#BF360C', 1.7),
  towerYellow: () => buildColorTower('#FFD54F', '#E65100', 1.4),
  towerPink: () => buildColorTower('#F48FB1', '#AD1457', 1.9),
  towerMint: () => buildColorTower('#64D8CB', '#00695C', 1.55),
  fountain: buildFountain,
};

