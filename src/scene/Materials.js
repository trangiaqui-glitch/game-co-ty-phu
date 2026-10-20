import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Chất liệu PBR tạo bằng code (không cần file ảnh): mỗi bề mặt gồm map (màu),
// bumpMap (độ gồ ghề) và roughnessMap (chỗ bóng / chỗ nhám) để ánh sáng phản
// xạ như vật thật: gạch có mạch vữa, ngói chồng lớp, kính phản chiếu bầu trời,
// nhựa đường có hạt, cỏ có từng ngọn.
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

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = false, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};
const gray = (v) => {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${n},${n},${n})`;
};

// Vẽ một nét và các bản sao quanh mép để texture lặp (tile) liền mạch.
function wrapped(g, w, h, x, y, r, draw) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
      draw(x + dx, y + dy);
    }
  }
}

function speckle(g, w, h, rand, count, size, colors) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const s = size * (0.4 + rand() * 0.9);
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    wrapped(g, w, h, x, y, s, (px, py) => g.fillRect(px, py, s, s));
  }
}

// --------------------------------------------------------------- mặt tiền (tường + cửa sổ)
const facadeCache = new Map();

/**
 * Mặt tiền: tường trát vữa (hoặc gạch), cửa sổ lõm có khung, thanh chia ô, bệ cửa,
 * kính phản chiếu bầu trời. Trả về { map, bumpMap, roughnessMap }.
 */
export function facadeMaps(wall, { window: windowColor = '#BFE6FF', cols = 3, rows = 4, frame = '#ffffff', brick = false, glassy = false } = {}) {
  const key = `${wall}|${windowColor}|${cols}|${rows}|${frame}|${brick}|${glassy}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const S = 256;
  const rand = rng(hashSeed(key));
  const map = canvas(S);
  const bump = canvas(S);
  const rough = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  const gr = rough.getContext('2d');

  // --- nền tường
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(150);
  gb.fillRect(0, 0, S, S);
  gr.fillStyle = gray(glassy ? 70 : 225);
  gr.fillRect(0, 0, S, S);

  if (brick) {
    const bh = 10;
    const bw = 26;
    for (let row = 0; row * bh < S; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < S; x += bw) {
        const k = 0.88 + rand() * 0.24;
        g.fillStyle = shade(wall, k);
        g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
        gb.fillStyle = gray(165 + rand() * 20);
        gb.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
      }
      gb.fillStyle = gray(60);
      for (let x = -off; x < S; x += bw) gb.fillRect(x, row * bh, 1.2, bh);
      gb.fillRect(0, row * bh, S, 1.2);
    }
  } else if (!glassy) {
    speckle(g, S, S, rand, 2600, 2, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.06)', 'rgba(120,90,60,0.05)']);
    speckle(gb, S, S, rand, 1800, 2, [gray(135), gray(168), gray(150)]);
  }
  // Ố bẩn dần về phía chân tường để trông cũ như thật.
  const dirt = g.createLinearGradient(0, 0, 0, S);
  dirt.addColorStop(0, 'rgba(255,255,255,0.05)');
  dirt.addColorStop(0.75, 'rgba(0,0,0,0)');
  dirt.addColorStop(1, 'rgba(40,30,20,0.14)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, S, S);

  // --- cửa sổ
  const pw = S / cols;
  const ph = S / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const w = pw * 0.6;
      const h = ph * 0.56;
      const x = i * pw + pw * 0.2;
      const y = j * ph + ph * 0.2;
      const fr = Math.max(2.5, w * 0.07);
      // bóng đổ phía trong ô lõm
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x - fr - 1, y - fr - 1, w + fr * 2 + 2, h + fr * 2 + 3);
      gb.fillStyle = gray(70);
      gb.fillRect(x - fr - 1, y - fr - 1, w + fr * 2 + 2, h + fr * 2 + 3);
      // khung
      g.fillStyle = frame;
      g.fillRect(x - fr, y - fr, w + fr * 2, h + fr * 2);
      gb.fillStyle = gray(205);
      gb.fillRect(x - fr, y - fr, w + fr * 2, h + fr * 2);
      gr.fillStyle = gray(120);
      gr.fillRect(x - fr, y - fr, w + fr * 2, h + fr * 2);
      // kính: trời phản chiếu + vệt sáng chéo
      const sky = g.createLinearGradient(x, y, x + w * 0.4, y + h);
      sky.addColorStop(0, '#E9F7FF');
      sky.addColorStop(0.35, windowColor);
      sky.addColorStop(1, shade(windowColor, 0.45));
      g.fillStyle = sky;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(x + w * 0.1, y + h);
      g.lineTo(x + w * 0.45, y);
      g.lineTo(x + w * 0.7, y);
      g.lineTo(x + w * 0.35, y + h);
      g.closePath();
      g.fill();
      gb.fillStyle = gray(120);
      gb.fillRect(x, y, w, h);
      gr.fillStyle = gray(22);
      gr.fillRect(x, y, w, h);
      // thanh chia ô
      g.fillStyle = frame;
      gb.fillStyle = gray(210);
      const mx = x + w / 2 - fr * 0.3;
      const my = y + h * 0.45;
      g.fillRect(mx, y, fr * 0.6, h);
      g.fillRect(x, my, w, fr * 0.6);
      gb.fillRect(mx, y, fr * 0.6, h);
      gb.fillRect(x, my, w, fr * 0.6);
      // bệ cửa nhô ra + bóng đổ bên dưới
      if (!glassy) {
        g.fillStyle = shade(wall, 1.12);
        g.fillRect(x - fr - 3, y + h + fr, w + fr * 2 + 6, 3.5);
        gb.fillStyle = gray(225);
        gb.fillRect(x - fr - 3, y + h + fr, w + fr * 2 + 6, 3.5);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x - fr - 2, y + h + fr + 3.5, w + fr * 2 + 4, 3);
      }
    }
  }
  const result = {
    map: toTexture(map, { srgb: true }),
    bumpMap: toTexture(bump),
    roughnessMap: toTexture(rough),
  };
  facadeCache.set(key, result);
  return result;
}

const facadeMats = new Map();
export function facadeMaterial(wall, opts = {}) {
  const key = JSON.stringify([wall, opts]);
  if (!facadeMats.has(key)) {
    const m = facadeMaps(wall, opts);
    facadeMats.set(key, new THREE.MeshStandardMaterial({
      map: m.map,
      bumpMap: m.bumpMap,
      bumpScale: 2.0,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      metalness: opts.metalness ?? (opts.glassy ? 0.35 : 0.04),
    }));
  }
  return facadeMats.get(key);
}

// --------------------------------------------------------------- ngói mái
const roofCache = new Map();
export function roofMaterial(color) {
  if (roofCache.has(color)) return roofCache.get(color);
  const S = 128;
  const rand = rng(hashSeed(color));
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = shade(color, 0.7);
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(60);
  gb.fillRect(0, 0, S, S);
  const th = 16;
  const tw = 16;
  for (let row = 0; row * th < S + th; row++) {
    const off = row % 2 ? tw / 2 : 0;
    for (let x = -off; x < S; x += tw) {
      const k = 0.88 + rand() * 0.24;
      const y = row * th;
      const grad = g.createLinearGradient(0, y, 0, y + th);
      grad.addColorStop(0, shade(color, 1.18 * k));
      grad.addColorStop(0.75, shade(color, 0.98 * k));
      grad.addColorStop(1, shade(color, 0.6));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x + 0.5, y);
      g.lineTo(x + tw - 0.5, y);
      g.lineTo(x + tw - 0.5, y + th - tw / 2);
      g.arc(x + tw / 2, y + th - tw / 2, tw / 2 - 0.5, 0, Math.PI);
      g.closePath();
      g.fill();
      const bg = gb.createLinearGradient(0, y, 0, y + th);
      bg.addColorStop(0, gray(215));
      bg.addColorStop(1, gray(130));
      gb.fillStyle = bg;
      gb.fillRect(x + 0.5, y, tw - 1, th - 2);
    }
  }
  const m = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 2.2,
    roughness: 0.62,
    metalness: 0.02,
  });
  m.map.repeat.set(2, 2);
  m.bumpMap.repeat.set(2, 2);
  roofCache.set(color, m);
  return m;
}

// --------------------------------------------------------------- cỏ
let grassMat = null;
export function grassMaterial(repeat = 6) {
  if (grassMat) return grassMat;
  const S = 256;
  const rand = rng(7);
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = '#6FBF4F';
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(128);
  gb.fillRect(0, 0, S, S);
  // mảng sáng/tối lớn
  for (let i = 0; i < 40; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 18 + rand() * 40;
    const dark = rand() < 0.5;
    wrapped(g, S, S, x, y, r, (px, py) => {
      const rg = g.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, dark ? 'rgba(30,90,30,0.22)' : 'rgba(190,235,110,0.2)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  const greens = ['#4E9F3C', '#5FB046', '#7FCB57', '#8BD65F', '#3E8A33', '#A3DB6A'];
  g.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const len = 3 + rand() * 6;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.3;
    const c = greens[Math.floor(rand() * greens.length)];
    wrapped(g, S, S, x, y, len, (px, py) => {
      g.strokeStyle = c;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      g.stroke();
      gb.strokeStyle = gray(140 + rand() * 90);
      gb.lineWidth = 0.9;
      gb.beginPath();
      gb.moveTo(px, py);
      gb.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      gb.stroke();
    });
  }
  // vài bông hoa dại nhỏ
  for (const c of ['#FFFFFF', '#FFE066', '#FF9ECF']) {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = c;
      g.fillRect(rand() * S, rand() * S, 1.6, 1.6);
    }
  }
  grassMat = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 1.6,
    roughness: 0.95,
    metalness: 0,
  });
  grassMat.map.repeat.set(repeat, repeat);
  grassMat.bumpMap.repeat.set(repeat, repeat);
  return grassMat;
}

// --------------------------------------------------------------- nhựa đường
let asphalt = null;
export function asphaltMaterial(repeat = 0.35) {
  if (asphalt) return asphalt;
  const S = 256;
  const rand = rng(31);
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = '#585E68';
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(128);
  gb.fillRect(0, 0, S, S);
  speckle(g, S, S, rand, 9000, 1.6, ['#6D737C', '#444A52', '#7B818A', '#3A3F46', '#50565F']);
  speckle(gb, S, S, rand, 7000, 1.6, [gray(90), gray(190), gray(150), gray(110)]);
  // vài vết nứt
  g.strokeStyle = 'rgba(25,28,32,0.7)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = rand() * S;
    let y = rand() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 24;
      y += (rand() - 0.2) * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  asphalt = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 1.4,
    roughness: 0.88,
    metalness: 0,
  });
  asphalt.map.repeat.set(repeat, repeat);
  asphalt.bumpMap.repeat.set(repeat, repeat);
  return asphalt;
}

// --------------------------------------------------------------- đá / bê tông
const stoneCache = new Map();
export function stoneMaterial(color, { repeat = 2, roughness = 0.75, veins = false } = {}) {
  const key = `${color}|${repeat}|${roughness}|${veins}`;
  if (stoneCache.has(key)) return stoneCache.get(key);
  const S = 256;
  const rand = rng(hashSeed(key));
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(128);
  gb.fillRect(0, 0, S, S);
  speckle(g, S, S, rand, 5000, 2, ['rgba(255,255,255,0.09)', 'rgba(0,0,0,0.08)', 'rgba(90,70,50,0.06)']);
  speckle(gb, S, S, rand, 4000, 2, [gray(105), gray(160), gray(135)]);
  if (veins) {
    g.strokeStyle = 'rgba(110,100,90,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      let x = rand() * S;
      let y = rand() * S;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (rand() - 0.3) * 30;
        y += (rand() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const m = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 1.2,
    roughness,
    metalness: 0,
  });
  m.map.repeat.set(repeat, repeat);
  m.bumpMap.repeat.set(repeat, repeat);
  stoneCache.set(key, m);
  return m;
}

// --------------------------------------------------------------- gỗ
const woodCache = new Map();
export function woodMaterial(color = '#8B5A2B', { repeat = 1 } = {}) {
  const key = `${color}|${repeat}`;
  if (woodCache.has(key)) return woodCache.get(key);
  const S = 256;
  const rand = rng(hashSeed(key));
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(130);
  gb.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = rand() * S;
    const w = 0.6 + rand() * 2.2;
    const dark = rand() < 0.6;
    g.strokeStyle = dark ? 'rgba(40,20,5,0.28)' : 'rgba(255,230,190,0.16)';
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.03 + i) * 3, y);
    g.stroke();
    gb.strokeStyle = dark ? gray(80) : gray(170);
    gb.lineWidth = w;
    gb.beginPath();
    gb.moveTo(x, 0);
    for (let y = 0; y <= S; y += 32) gb.lineTo(x + Math.sin(y * 0.03 + i) * 3, y);
    gb.stroke();
  }
  const m = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 1.5,
    roughness: 0.6,
    metalness: 0,
  });
  m.map.repeat.set(repeat, repeat);
  m.bumpMap.repeat.set(repeat, repeat);
  woodCache.set(key, m);
  return m;
}

// --------------------------------------------------------------- tán lá mềm (không còn dạng đa giác phẳng)
let foliage = null;
export function foliageGeometry() {
  if (foliage) return foliage;
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 5.3 + v.y * 3.1) * Math.cos(v.z * 4.7 - v.x * 2.3) + 0.5 * Math.sin(v.y * 9.1 + v.z * 7.7);
    v.multiplyScalar(1 + 0.11 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    uv[i * 2] = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = v.y * 0.5 + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  foliage = g;
  return g;
}

let leafMat = null;
export function leafMaterial() {
  if (leafMat) return leafMat;
  const S = 128;
  const rand = rng(99);
  const map = canvas(S);
  const bump = canvas(S);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  gb.fillStyle = gray(128);
  gb.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const s = 2 + rand() * 4;
    const k = rand();
    g.fillStyle = k < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.0)';
    wrapped(g, S, S, x, y, s, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, s, s * 0.55, rand() * 3, 0, Math.PI * 2);
      g.fill();
      gb.fillStyle = gray(90 + rand() * 120);
      gb.beginPath();
      gb.ellipse(px, py, s, s * 0.55, rand() * 3, 0, Math.PI * 2);
      gb.fill();
    });
  }
  leafMat = new THREE.MeshStandardMaterial({
    map: toTexture(map, { srgb: true, repeat: true }),
    bumpMap: toTexture(bump, { repeat: true }),
    bumpScale: 2.0,
    roughness: 0.8,
    metalness: 0,
  });
  leafMat.map.repeat.set(3, 3);
  leafMat.bumpMap.repeat.set(3, 3);
  return leafMat;
}
