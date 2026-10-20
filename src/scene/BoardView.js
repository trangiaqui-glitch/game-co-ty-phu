import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILE_TYPES as T, COLOR_GROUPS, BOARD_LAYOUT } from '../data/boardData.js';
import { BOARD_SIZE } from '../game/BoardManager.js';
import {
  mat, GEO, part, batchStatic, buildLandmark, buildStation, buildUtility, buildBank, buildQuestionMark,
  buildChest, buildMoneyBag, buildDiamondRing, buildStartGate, buildJail, buildPark, buildGoToJail,
  buildHotel, buildCar, gold,
} from './ModelFactory.js';

const TOP_Y = BOARD_LAYOUT.tileHeight;
const HOUSE_X = [-0.66, -0.22, 0.22, 0.66];
const BAND_Z = -1.22;
const FONT = '"Baloo 2", "Segoe UI", Arial, sans-serif';
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const easeOutBounce = (t) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

// --------------------------------------------------------------- instanced houses
class HouseInstancer {
  constructor(parent, capacity = 160) {
    const parts = [
      { geo: new RoundedBoxGeometry(1, 1, 1, 2, 0.12), material: mat('#4CD07D', { roughness: 0.4 }), p: [0, 0.11, 0], s: [0.3, 0.22, 0.3] },
      { geo: GEO.pyramid(), material: mat('#1E8E4E', { roughness: 0.45 }), p: [0, 0.31, 0], s: [0.25, 0.19, 0.25] },
      { geo: GEO.box(), material: mat('#FFF7E0'), p: [0, 0.08, -0.151], s: [0.08, 0.13, 0.01] },
    ];
    this.capacity = capacity;
    this.parts = parts.map((pt) => {
      const mesh = new THREE.InstancedMesh(pt.geo, pt.material, capacity);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(...pt.p), new THREE.Quaternion(), new THREE.Vector3(...pt.s));
      parent.add(mesh);
      return { mesh, local };
    });
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.tmp = new THREE.Matrix4();
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i);
      this._write(i, this.zero, true);
    }
    this._flush();
  }

  _write(i, matrix, raw = false) {
    for (const pt of this.parts) {
      pt.mesh.setMatrixAt(i, raw ? matrix : this.tmp.multiplyMatrices(matrix, pt.local));
    }
  }

  _flush() {
    for (const pt of this.parts) pt.mesh.instanceMatrix.needsUpdate = true;
  }

  alloc() {
    return this.free.pop() ?? -1;
  }

  set(i, matrix) {
    if (i < 0) return;
    this._write(i, matrix);
    this._flush();
  }

  release(i) {
    if (i < 0) return;
    this._write(i, this.zero, true);
    this._flush();
    this.free.push(i);
  }
}

// --------------------------------------------------------------- canvas helpers
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTile(tile) {
  const corner = tile.position.corner;
  const W = corner ? 384 : 256;
  const H = 384;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF8E8';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#EADBB8';
  g.lineWidth = 6;
  roundRect(g, 6, 6, W - 12, H - 12, 18);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const ink = '#2B2340';

  const title = (text, y, size = 30, color = ink, maxW = W - 30) => {
    g.font = `800 ${size}px ${FONT}`;
    g.fillStyle = color;
    const lines = wrapText(g, text, maxW);
    lines.forEach((l, i) => g.fillText(l, W / 2, y + (i - (lines.length - 1) / 2) * size * 1.02));
  };
  const label = (text, y, size = 20, color = '#7a6f8f') => {
    g.font = `700 ${size}px ${FONT}`;
    g.fillStyle = color;
    g.fillText(text, W / 2, y);
  };
  const pill = (text, y, bg) => {
    g.font = `800 28px ${FONT}`;
    const w = g.measureText(text).width + 30;
    g.fillStyle = bg;
    roundRect(g, W / 2 - w / 2, y - 20, w, 40, 20);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText(text, W / 2, y + 1);
  };

  switch (tile.type) {
    case T.PROPERTY: {
      const color = COLOR_GROUPS[tile.group].color;
      g.fillStyle = color;
      roundRect(g, 10, 10, W - 20, 62, 14);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(14, 14, W - 28, 12);
      title(tile.name, 110, tile.name.length > 10 ? 26 : 30);
      pill(`$${tile.price}`, 165, '#3d3456');
      break;
    }
    case T.STATION:
      label('NHÀ GA', 40, 22, '#C0392B');
      title(tile.name, 100, 28);
      pill(`$${tile.price}`, 165, '#3d3456');
      break;
    case T.UTILITY:
      label('DỊCH VỤ', 40, 22, '#0277BD');
      title(tile.name, 100, 26);
      pill(`$${tile.price}`, 165, '#3d3456');
      break;
    case T.CHANCE:
      title('CƠ HỘI', 60, 34, '#FF7A00');
      break;
    case T.COMMUNITY:
      title('KHÍ VẬN', 60, 34, '#2E86DE');
      break;
    case T.TAX:
      title(tile.name, 70, 28);
      pill(`Nộp $${tile.amount}`, 140, '#E53935');
      break;
    case T.BANK:
      title('NGÂN HÀNG', 60, 30, '#B8860B');
      label('Nhận lãi 5%', 112, 22);
      break;
    case T.START:
      title('BẮT ĐẦU', 300, 52, '#E74C3C');
      label('Nhận $200', 350, 28, '#2E9E4F');
      break;
    case T.JAIL:
      label('THĂM TÙ', 345, 34, '#FF7043');
      break;
    case T.REST:
      title('CÔNG VIÊN', 300, 44, '#2E9E4F');
      label('Nghỉ ngơi', 345, 26);
      break;
    case T.GO_TO_JAIL:
      title('VÀO TÙ', 300, 52, '#1E3A8A');
      label('Không nhận $200', 348, 24, '#E53935');
      break;
    default:
      title(tile.name, 100);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function frameGeometry(w, d, thickness) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
  const hole = new THREE.Path();
  const iw = w / 2 - thickness;
  const id = d / 2 - thickness;
  hole.moveTo(-iw, -id); hole.lineTo(-iw, id); hole.lineTo(iw, id); hole.lineTo(iw, -id); hole.lineTo(-iw, -id);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

// --------------------------------------------------------------- BoardView
export class BoardView {
  constructor(sceneManager, assets, board) {
    this.sm = sceneManager;
    this.assets = assets;
    this.board = board;
    this.root = new THREE.Group();
    this.root.name = 'board';
    this.staticRoot = new THREE.Group();
    this.dynamicRoot = new THREE.Group();
    this.pickRoot = new THREE.Group();
    this.root.add(this.staticRoot, this.dynamicRoot, this.pickRoot);
    this.sm.scene.add(this.root);
    this.tiles = [];
    this.pickables = [];
    this.spinners = [];
    this.policeLights = [];
    this.clouds = [];
    this.effects = new Set();
    this.speed = 1;
    this.bankPosition = new THREE.Vector3(0, 2.6, -3.0);
    this.decks = {};
    this._tmpM = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._tmpV = new THREE.Vector3();
    this._tmpS = new THREE.Vector3();
  }

  async build(onProgress) {
    this._buildIsland();
    onProgress?.(0.2);
    this._buildTiles();
    onProgress?.(0.45);
    await this._buildTileModels();
    onProgress?.(0.7);
    this._buildCenter();
    this._buildTreeRing();
    this._buildClouds();
    this.batchInfo = batchStatic(this.staticRoot);
    this.houses = new HouseInstancer(this.dynamicRoot);
    this._buildHighlight();
    onProgress?.(1);
  }

  // ------------------------------------------------------------ island
  _buildIsland() {
    const half = BOARD_SIZE / 2;
    const s = this.staticRoot;
    s.add(part(new RoundedBoxGeometry(BOARD_SIZE + 0.6, 0.5, BOARD_SIZE + 0.6, 4, 0.2), mat('#FFF1D2', { roughness: 0.7 }), [0, -0.25, 0]));
    s.add(part(new RoundedBoxGeometry(BOARD_SIZE + 3.4, 0.7, BOARD_SIZE + 3.4, 4, 0.3), mat('#79D45E', { roughness: 0.85 }), [0, -0.72, 0]));

    const rockGeo = new THREE.CylinderGeometry((half + 1.7) * Math.SQRT2, 3.5, 10, 4, 5).rotateY(Math.PI / 4);
    const posAttr = rockGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      if (y < 4.9) {
        const k = 0.9 + 0.2 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);
        posAttr.setX(i, posAttr.getX(i) * k);
        posAttr.setZ(i, posAttr.getZ(i) * k);
        posAttr.setY(i, y + Math.sin(i * 7.7) * 0.4);
      }
    }
    rockGeo.computeVertexNormals();
    s.add(part(rockGeo, mat('#B07A4F', { roughness: 0.95, flatShading: true }), [0, -6.07, 0]));
    s.add(part(new THREE.CylinderGeometry((half + 1.75) * Math.SQRT2, (half + 1.2) * Math.SQRT2, 0.8, 4).rotateY(Math.PI / 4), mat('#8A5A3B', { roughness: 0.95 }), [0, -1.45, 0]));

    // Đá trôi nổi xung quanh
    const rock = mat('#A9744C', { roughness: 0.95, flatShading: true });
    const grass = mat('#79D45E', { roughness: 0.85 });
    const isles = [[-19, -3, 8, 1.4], [20, -4, -6, 1.1], [-8, -6, -20, 1.6], [12, -2.5, 19, 0.9]];
    for (const [x, y, z, k] of isles) {
      s.add(part(GEO.cone(6), rock, [x, y - 0.9 * k, z], [1.3 * k, 1.8 * k, 1.3 * k], [Math.PI, 0, 0]));
      s.add(part(GEO.cyl(6), grass, [x, y + 0.05 * k, z], [1.32 * k, 0.2 * k, 1.32 * k]));
    }
  }

  // ------------------------------------------------------------ tiles
  _buildTiles() {
    const baseMat = mat('#FFFFFF', { roughness: 0.6 });
    const baseGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
    for (const tile of this.board.tiles) {
      const p = tile.position;
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.rotY;
      this.staticRoot.add(group);

      group.add(part(baseGeo, baseMat, [0, TOP_Y / 2, 0], [p.width - 0.08, TOP_Y, p.depth - 0.08]));

      const topMat = new THREE.MeshStandardMaterial({ map: drawTile(tile), roughness: 0.75 });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(p.width - 0.16, p.depth - 0.16).rotateX(-Math.PI / 2), topMat);
      top.position.y = TOP_Y + 0.003;
      top.receiveShadow = true;
      top.userData.dynamic = true;
      group.add(top);

      const anchor = new THREE.Group();
      anchor.position.copy(group.position);
      anchor.rotation.y = p.rotY;
      this.dynamicRoot.add(anchor);

      const pick = new THREE.Mesh(new THREE.BoxGeometry(p.width, 1.8, p.depth), new THREE.MeshBasicMaterial());
      pick.position.set(p.x, 0.9, p.z);
      pick.rotation.y = p.rotY;
      pick.layers.set(1);
      pick.userData.tileId = tile.id;
      this.pickRoot.add(pick);
      this.pickables.push(pick);

      this.tiles[tile.id] = {
        tile, group, anchor, top, topMat, houses: [], hotel: null, flag: null, frame: null, stamp: null, owner: null,
      };
    }
    this.pickRoot.updateMatrixWorld(true);
  }

  async _placeModel(view, key, fallback, { pos = [0, 0, 0], scale = 1, size = 1.2, dynamic = false, rotY = 0 } = {}) {
    let obj = await this.assets.getStaticModel('buildings', key, size);
    if (obj) {
      obj.userData.dynamic = true; // mô hình GLB không được gộp
    } else {
      obj = fallback();
      if (dynamic) obj.userData.dynamic = true;
    }
    obj.position.set(pos[0], TOP_Y + pos[1], pos[2]);
    obj.scale.multiplyScalar(scale);
    obj.rotation.y = rotY;
    (dynamic ? view.anchor : view.group).add(obj);
    return obj;
  }

  async _buildTileModels() {
    const jobs = this.tiles.map(async (view) => {
      const { tile } = view;
      switch (tile.type) {
        case T.PROPERTY: {
          const color = COLOR_GROUPS[tile.group].color;
          await this._placeModel(view, `landmark_${tile.group}`, () => buildLandmark(tile.group, color, tile.id % 2), { pos: [-0.12, 0, 0.92], scale: 0.85 });
          break;
        }
        case T.STATION:
          await this._placeModel(view, 'station', buildStation, { pos: [-0.12, 0, 0.92], scale: 0.82 });
          break;
        case T.UTILITY:
          await this._placeModel(view, `utility_${tile.utility}`, () => buildUtility(tile.utility), { pos: [-0.1, 0, 0.92], scale: 0.85 });
          break;
        case T.CHANCE: {
          const q = await this._placeModel(view, 'chance', () => buildQuestionMark('#FF8A00'), { pos: [0, 0.75, 0.75], scale: 1.4, dynamic: true });
          this.spinners.push({ obj: q, baseY: q.position.y, phase: tile.id });
          break;
        }
        case T.COMMUNITY:
          await this._placeModel(view, 'community', buildChest, { pos: [0, 0, 0.95], scale: 1.0, rotY: Math.PI });
          break;
        case T.TAX:
          if (tile.amount >= 200) await this._placeModel(view, 'tax_income', buildMoneyBag, { pos: [-0.1, 0, 0.95], scale: 1.0 });
          else {
            const r = await this._placeModel(view, 'tax_luxury', buildDiamondRing, { pos: [0, 0.2, 0.95], scale: 1.1, dynamic: true });
            this.spinners.push({ obj: r, baseY: r.position.y, phase: tile.id, spinOnly: true });
          }
          break;
        case T.BANK:
          await this._placeModel(view, 'bank', () => buildBank(1), { pos: [0, 0, 0.9], scale: 0.95, rotY: 0 });
          break;
        case T.START:
          await this._placeModel(view, 'start', buildStartGate, { size: 2.4 });
          break;
        case T.JAIL:
          await this._placeModel(view, 'jail', buildJail, { size: 2.4 });
          break;
        case T.REST:
          await this._placeModel(view, 'park', buildPark, { size: 2.6 });
          break;
        case T.GO_TO_JAIL: {
          const obj = await this._placeModel(view, 'gotojail', buildGoToJail, { size: 2.4, dynamic: true });
          obj.traverse((o) => {
            if (o.name === 'policeLights') this.policeLights.push(o);
          });
          break;
        }
        default:
          break;
      }
    });
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------ center city
  _buildCenter() {
    const s = this.staticRoot;
    const inner = BOARD_SIZE - 2 * BOARD_LAYOUT.cornerSize - 0.4;
    s.add(part(new RoundedBoxGeometry(inner, 0.08, inner, 3, 0.04), mat('#A6E58F', { roughness: 0.9 }), [0, 0.04, 0]));

    // Đường vòng quanh trung tâm
    const roadShape = (size, r) => {
      const sh = new THREE.Shape();
      const h = size / 2;
      sh.moveTo(-h + r, -h);
      sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r);
      sh.lineTo(h, h - r); sh.quadraticCurveTo(h, h, h - r, h);
      sh.lineTo(-h + r, h); sh.quadraticCurveTo(-h, h, -h, h - r);
      sh.lineTo(-h, -h + r); sh.quadraticCurveTo(-h, -h, -h + r, -h);
      return sh;
    };
    const outer = roadShape(15.2, 3);
    outer.holes.push(roadShape(13.4, 2.1));
    const road = new THREE.Mesh(new THREE.ShapeGeometry(outer, 12).rotateX(-Math.PI / 2), mat('#5E6A7D', { roughness: 0.85 }));
    road.position.y = 0.085;
    road.receiveShadow = true;
    s.add(road);
    const pts = roadShape(14.3, 2.55).getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, 0.1, -p.y));
    this.roadCurve = new THREE.CatmullRomCurve3(pts.slice(0, -1), true);
    const dash = mat('#FFF8E1');
    for (let i = 0; i < 48; i++) {
      const u = i / 48;
      const p = this.roadCurve.getPointAt(u);
      const t = this.roadCurve.getTangentAt(u);
      s.add(part(GEO.box(), dash, [p.x, 0.092, p.z], [0.06, 0.01, 0.3], [0, Math.atan2(t.x, t.z), 0]));
    }

    // Ngân hàng trung ương (nguồn tiền của mọi giao dịch)
    const bank = buildBank(2.6);
    bank.position.set(0, 0.08, -3.0);
    bank.rotation.y = Math.PI;
    s.add(bank);
    this.bankPosition.set(0, 2.4, -3.0);

    // Biển hiệu
    const logoTex = this.assets.canvasTexture('logo', 1024, 300, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 150px ${FONT}`;
      g.lineWidth = 22;
      g.strokeStyle = '#3d2b7a';
      g.strokeText('CỜ TỶ PHÚ', w / 2, h / 2 - 10);
      const grad = g.createLinearGradient(0, 40, 0, 240);
      grad.addColorStop(0, '#FFE259');
      grad.addColorStop(1, '#FF8A00');
      g.fillStyle = grad;
      g.fillText('CỜ TỶ PHÚ', w / 2, h / 2 - 10);
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.46).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.5 }));
    logo.position.set(0, 0.1, 4.3);
    logo.userData.dynamic = true;
    s.add(logo);

    // Bộ thẻ Cơ hội / Khí vận
    this._buildDeck('chance', -4.3, 0.9, 0.35, '#FF8A00', 'CƠ HỘI');
    this._buildDeck('community', 4.3, 0.9, -0.35, '#2E86DE', 'KHÍ VẬN');

    // Cây xanh và đèn đường (instanced)
    const treePts = [];
    for (const [x, z] of [[-5.0, -5.0], [5.0, -5.0], [-5.1, 5.1], [5.1, 5.1]]) {
      for (let i = 0; i < 4; i++) treePts.push({ x: x + Math.cos(i * 1.7) * 0.6, z: z + Math.sin(i * 1.7) * 0.6, s: 0.85 + (i % 3) * 0.15 });
    }
    for (const v of [-4, 0, 4]) {
      treePts.push({ x: 8.15, z: v, s: 0.8 }, { x: -8.15, z: v, s: 0.8 }, { x: v, z: 8.15, s: 0.8 }, { x: v, z: -8.15, s: 0.8 });
    }
    for (const x of [-3.2, -2.2, 2.2, 3.2]) treePts.push({ x, z: -5.2, s: 0.85 });
    this.staticRoot.add(this._treeInstances(treePts));

    const lampPole = mat('#37474F', { metalness: 0.5, roughness: 0.4 });
    const lampHead = mat('#FFF59D', { emissive: '#FFEB3B', emissiveIntensity: 0.7 });
    for (let i = 0; i < 12; i++) {
      const p = this.roadCurve.getPointAt(i / 12);
      const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
      const x = p.x + dir.x * 1.05;
      const z = p.z + dir.z * 1.05;
      s.add(part(GEO.cyl(8), lampPole, [x, 0.5, z], [0.035, 0.9, 0.035]));
      s.add(part(GEO.sphere(), lampHead, [x, 0.98, z], [0.09, 0.09, 0.09]));
    }

    // Xe chạy vòng quanh
    this.cars = [];
    for (const [color, offset] of [['#E53935', 0], ['#FFB300', 0.5]]) {
      const car = buildCar(color);
      car.scale.setScalar(1.25);
      this.dynamicRoot.add(car);
      this.cars.push({ obj: car, offset });
    }
  }

  _buildDeck(kind, x, z, rotY, color, text) {
    const g = new THREE.Group();
    g.position.set(x, 0.08, z);
    g.rotation.y = rotY;
    const tex = this.assets.canvasTexture(`deck-${kind}`, 256, 360, (c, w, h) => {
      c.fillStyle = color;
      roundRect(c, 0, 0, w, h, 26);
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 10;
      roundRect(c, 14, 14, w - 28, h - 28, 18);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `800 120px ${FONT}`;
      c.fillText('?', w / 2, h / 2 - 30);
      c.font = `800 40px ${FONT}`;
      c.fillText(text, w / 2, h - 70);
    });
    const side = mat('#ffffff', { roughness: 0.6 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
    const cardGeo = new RoundedBoxGeometry(1.0, 0.03, 1.4, 2, 0.012);
    for (let i = 0; i < 7; i++) {
      g.add(part(cardGeo, side, [Math.sin(i * 3.1) * 0.02, 0.015 + i * 0.032, Math.cos(i * 2.3) * 0.02]));
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.36).rotateX(-Math.PI / 2), face);
    top.position.y = 0.015 + 7 * 0.032 + 0.002;
    top.userData.dynamic = true;
    g.add(top);
    this.staticRoot.add(g);
    const flyCard = new THREE.Group();
    flyCard.add(new THREE.Mesh(cardGeo, side));
    const flyFace = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.36).rotateX(-Math.PI / 2), face);
    flyFace.position.y = 0.017;
    flyCard.add(flyFace);
    flyCard.visible = false;
    this.dynamicRoot.add(flyCard);
    this.decks[kind] = { position: new THREE.Vector3(x, 0.08 + 0.26, z), rotY, card: flyCard };
  }

  _treeInstances(points) {
    const g = new THREE.Group();
    const trunk = new THREE.InstancedMesh(GEO.cyl(8), mat('#8B5A2B'), points.length);
    const crown = new THREE.InstancedMesh(GEO.ico(), new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), points.length);
    const top = new THREE.InstancedMesh(GEO.ico(), new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), points.length);
    const colors = ['#3DBE5C', '#2FA84F', '#5ACF6B', '#7BD36A', '#F48FB1'];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    points.forEach((p, i) => {
      const s = p.s || 1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3);
      m.compose(new THREE.Vector3(p.x, 0.25 * s, p.z), q, new THREE.Vector3(0.07 * s, 0.5 * s, 0.07 * s));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, 0.68 * s, p.z), q, new THREE.Vector3(0.36 * s, 0.4 * s, 0.36 * s));
      crown.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, 0.98 * s, p.z), q, new THREE.Vector3(0.24 * s, 0.26 * s, 0.24 * s));
      top.setMatrixAt(i, m);
      c.set(colors[i % colors.length]);
      crown.setColorAt(i, c);
      top.setColorAt(i, c.multiplyScalar(1.1));
    });
    for (const im of [trunk, crown, top]) {
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
    }
    return g;
  }

  _buildTreeRing() {
    const h = BOARD_SIZE / 2 + 1.05;
    const pts = [];
    for (let i = -6; i <= 6; i++) {
      const t = i * 2.05;
      const s = 0.75 + ((i + 6) % 3) * 0.12;
      pts.push({ x: t, z: h, s }, { x: t, z: -h, s }, { x: h, z: t, s }, { x: -h, z: t, s });
    }
    this.staticRoot.add(this._treeInstances(pts));
  }

  _buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const n = 4 + (i % 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(GEO.sphere(), cloudMat);
        const s = 1.2 + ((j * 7 + i) % 5) * 0.35;
        m.position.set((j - n / 2) * 1.3, Math.sin(j * 2.1) * 0.4, Math.cos(j * 1.7) * 0.6);
        m.scale.set(s, s * 0.75, s);
        g.add(m);
      }
      const a = (i / 9) * Math.PI * 2;
      const r = 30 + (i % 3) * 6;
      g.position.set(Math.cos(a) * r, -5 + (i % 4) * 3, Math.sin(a) * r);
      this.root.add(g);
      this.clouds.push({ obj: g, angle: a, r, speed: 0.01 + (i % 3) * 0.006 });
    }
  }

  _buildHighlight() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshBasicMaterial({ color: '#FFE066', transparent: true, opacity: 0.95 });
    this.highlightFrameMat = frameMat;
    this.highlightFrames = {
      normal: new THREE.Mesh(frameGeometry(BOARD_LAYOUT.tileWidth - 0.02, BOARD_LAYOUT.cornerSize - 0.02, 0.1), frameMat),
      corner: new THREE.Mesh(frameGeometry(BOARD_LAYOUT.cornerSize - 0.02, BOARD_LAYOUT.cornerSize - 0.02, 0.1), frameMat),
    };
    for (const f of Object.values(this.highlightFrames)) {
      f.position.y = TOP_Y + 0.02;
      g.add(f);
    }
    const arrow = new THREE.Mesh(GEO.cone(16), mat('#FFC300', { emissive: '#FFB000', emissiveIntensity: 0.5 }));
    arrow.scale.set(0.25, 0.4, 0.25);
    arrow.rotation.x = Math.PI;
    g.add(arrow);
    this.highlightArrow = arrow;
    g.visible = false;
    this.highlight = g;
    this.dynamicRoot.add(g);
  }

  // ------------------------------------------------------------ queries
  tileView(id) {
    return this.tiles[id];
  }

  tileWorldPosition(id, y = TOP_Y) {
    const p = this.board.getTile(id).position;
    return new THREE.Vector3(p.x, y, p.z);
  }

  // ------------------------------------------------------------ tile state visuals
  setHighlight(tileId) {
    if (tileId === null || tileId === undefined) {
      this.highlight.visible = false;
      this.highlightedTile = null;
      return;
    }
    const p = this.board.getTile(tileId).position;
    this.highlight.position.set(p.x, 0, p.z);
    this.highlight.rotation.y = p.rotY;
    this.highlightFrames.normal.visible = !p.corner;
    this.highlightFrames.corner.visible = p.corner;
    this.highlight.visible = true;
    this.highlightedTile = tileId;
  }

  _frameFor(view) {
    const p = view.tile.position;
    const key = p.corner ? 'corner' : 'normal';
    if (!this._frameGeos) this._frameGeos = {};
    if (!this._frameGeos[key]) this._frameGeos[key] = frameGeometry(p.width - 0.1, p.depth - 0.1, 0.09);
    return this._frameGeos[key];
  }

  setOwner(tile, color, animate = false) {
    const view = this.tiles[tile.id];
    if (view.flag) {
      view.anchor.remove(view.flag);
      view.flag = null;
    }
    if (view.frame) {
      view.anchor.remove(view.frame);
      view.frame = null;
    }
    view.owner = color;
    if (!color) return Promise.resolve();
    const frame = new THREE.Mesh(this._frameFor(view), mat(color, { emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    frame.position.y = TOP_Y + 0.005;
    view.anchor.add(frame);
    view.frame = frame;

    const flag = new THREE.Group();
    flag.add(part(GEO.cyl(8), mat('#ECEFF1', { metalness: 0.4, roughness: 0.3 }), [0, 0.42, 0], [0.025, 0.84, 0.025]));
    flag.add(part(GEO.sphere(), gold(), [0, 0.86, 0], [0.045, 0.045, 0.045]));
    flag.add(part(GEO.rbox(), mat(color, { roughness: 0.45 }), [0.17, 0.7, 0], [0.32, 0.22, 0.03]));
    flag.add(part(GEO.cyl(16), mat('#ffffff'), [0.17, 0.7, -0.018], [0.06, 0.01, 0.06], [Math.PI / 2, 0, 0]));
    flag.add(part(GEO.cyl(12), mat('#9E9E9E'), [0, 0.02, 0], [0.08, 0.04, 0.08]));
    const pos = tile.position.corner ? [1.15, TOP_Y, 1.15] : [0.8, TOP_Y, 0.55];
    flag.position.set(...pos);
    view.anchor.add(flag);
    view.flag = flag;
    if (!animate) return Promise.resolve();
    flag.scale.setScalar(0.001);
    return this.animate(0.6, (t) => flag.scale.setScalar(Math.max(0.001, easeOutBack(t))));
  }

  setMortgaged(tile, on) {
    const view = this.tiles[tile.id];
    view.topMat.color.set(on ? '#8f8f8f' : '#ffffff');
    if (on && !view.stamp) {
      const tex = this.assets.canvasTexture('stamp', 256, 96, (g, w, h) => {
        g.strokeStyle = '#D32F2F';
        g.lineWidth = 8;
        roundRect(g, 6, 6, w - 12, h - 12, 14);
        g.stroke();
        g.fillStyle = '#D32F2F';
        g.font = `800 46px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('THẾ CHẤP', w / 2, h / 2 + 2);
      });
      const stamp = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.56).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      stamp.position.set(0, TOP_Y + 0.03, -0.15);
      stamp.rotation.y = 0.35;
      view.anchor.add(stamp);
      view.stamp = stamp;
    } else if (!on && view.stamp) {
      view.anchor.remove(view.stamp);
      view.stamp = null;
    }
  }

  _houseMatrix(view, index, yOffset = 0, scale = 1) {
    view.anchor.updateMatrixWorld(true);
    this._tmpV.set(HOUSE_X[index], TOP_Y + yOffset, BAND_Z);
    this._tmpS.set(scale, scale, scale);
    this._tmpQ.identity();
    const local = this._tmpM.compose(this._tmpV, this._tmpQ, this._tmpS);
    return new THREE.Matrix4().multiplyMatrices(view.anchor.matrixWorld, local);
  }

  // Đồng bộ nhà/khách sạn theo trạng thái ô (animate = thả nhà xuống có nảy).
  syncBuildings(tile, animate = false) {
    const view = this.tiles[tile.id];
    const promises = [];
    const wantHotel = tile.hotel > 0;
    const wantHouses = wantHotel ? 0 : tile.houses;
    while (view.houses.length > wantHouses) {
      const idx = view.houses.length - 1;
      const id = view.houses.pop();
      if (animate) {
        promises.push(this.animate(0.35, (t) => this.houses.set(id, this._houseMatrix(view, idx, 0, Math.max(0.001, 1 - t))))
          .then(() => this.houses.release(id)));
      } else this.houses.release(id);
    }
    while (view.houses.length < wantHouses) {
      const idx = view.houses.length;
      const id = this.houses.alloc();
      view.houses.push(id);
      if (animate) {
        this.houses.set(id, this._houseMatrix(view, idx, 3, 1));
        promises.push(this.animate(0.7, (t) => this.houses.set(id, this._houseMatrix(view, idx, 3 * (1 - easeOutBounce(t)), 1))));
      } else this.houses.set(id, this._houseMatrix(view, idx));
    }
    if (wantHotel && !view.hotel) {
      const hotel = buildHotel();
      hotel.position.set(0, TOP_Y, BAND_Z);
      hotel.scale.setScalar(0.72);
      view.anchor.add(hotel);
      view.hotel = hotel;
      if (animate) {
        hotel.scale.setScalar(0.001);
        promises.push(this.animate(0.7, (t) => hotel.scale.setScalar(Math.max(0.001, 0.72 * easeOutBack(t)))));
      }
    } else if (!wantHotel && view.hotel) {
      const hotel = view.hotel;
      view.hotel = null;
      if (animate) {
        promises.push(this.animate(0.35, (t) => hotel.scale.setScalar(Math.max(0.001, 0.72 * (1 - t)))).then(() => view.anchor.remove(hotel)));
      } else view.anchor.remove(hotel);
    }
    return Promise.all(promises);
  }

  syncTile(tile, ownerColor) {
    const view = this.tiles[tile.id];
    if (view.owner !== ownerColor) this.setOwner(tile, ownerColor, false);
    this.setMortgaged(tile, tile.mortgaged);
    this.syncBuildings(tile, false);
  }

  resetAll() {
    for (const view of this.tiles) {
      this.setOwner(view.tile, null);
      this.setMortgaged(view.tile, false);
      this.syncBuildings({ id: view.tile.id, houses: 0, hotel: 0 }, false);
    }
    this.setHighlight(null);
  }

  // ------------------------------------------------------------ effects
  animate(duration, onUpdate) {
    return new Promise((resolve) => {
      this.effects.add({ t: 0, duration: Math.max(0.01, duration / this.speed), onUpdate, resolve });
    });
  }

  glow(tileId, color) {
    const p = this.board.getTile(tileId).position;
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.depth).rotateX(-Math.PI / 2), m);
    plane.position.set(p.x, TOP_Y + 0.04, p.z);
    plane.rotation.y = p.rotY;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 40).rotateX(-Math.PI / 2), m.clone());
    ring.position.set(p.x, TOP_Y + 0.05, p.z);
    this.dynamicRoot.add(plane, ring);
    const view = this.tiles[tileId];
    return this.animate(1.4, (t) => {
      const pulse = Math.sin(t * Math.PI * 3) * 0.5 + 0.5;
      m.opacity = (1 - t) * 0.75 * pulse + 0.1 * (1 - t);
      ring.scale.setScalar(1 + t * 2.4);
      ring.material.opacity = (1 - t) * 0.9;
      view.topMat.emissive.set(color);
      view.topMat.emissiveIntensity = (1 - t) * 0.5 * pulse;
    }).then(() => {
      view.topMat.emissiveIntensity = 0;
      this.dynamicRoot.remove(plane, ring);
      plane.geometry.dispose();
      ring.geometry.dispose();
      m.dispose();
      ring.material.dispose();
    });
  }

  bumpTile(tileId) {
    const view = this.tiles[tileId];
    this.animate(0.25, (t) => {
      view.top.position.y = TOP_Y + 0.003 - Math.sin(t * Math.PI) * 0.03;
    });
  }

  update(dt, elapsed) {
    for (const fx of [...this.effects]) {
      fx.t = Math.min(1, fx.t + dt / fx.duration);
      fx.onUpdate(fx.t);
      if (fx.t >= 1) {
        this.effects.delete(fx);
        fx.resolve();
      }
    }
    for (const s of this.spinners) {
      s.obj.rotation.y = elapsed * 1.2 + s.phase;
      if (!s.spinOnly) s.obj.position.y = s.baseY + Math.sin(elapsed * 2 + s.phase) * 0.1;
    }
    const blink = Math.sin(elapsed * 10) > 0;
    for (const l of this.policeLights) {
      const [red, blue] = l.userData.materials || [];
      if (red) red.emissiveIntensity = blink ? 2 : 0.2;
      if (blue) blue.emissiveIntensity = blink ? 0.2 : 2;
    }
    if (this.roadCurve) {
      for (const car of this.cars) {
        const u = (elapsed * 0.025 + car.offset) % 1;
        const p = this.roadCurve.getPointAt(u);
        const t = this.roadCurve.getTangentAt(u);
        const side = new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(0.22);
        car.obj.position.set(p.x + side.x, 0.09, p.z + side.z);
        car.obj.rotation.y = Math.atan2(t.x, t.z) - Math.PI / 2;
      }
    }
    for (const c of this.clouds) {
      c.angle += c.speed * dt;
      c.obj.position.x = Math.cos(c.angle) * c.r;
      c.obj.position.z = Math.sin(c.angle) * c.r;
    }
    if (this.highlight.visible) {
      this.highlightFrameMat.opacity = 0.55 + Math.sin(elapsed * 5) * 0.4;
      this.highlightArrow.position.y = 2.3 + Math.sin(elapsed * 3) * 0.15;
      this.highlightArrow.rotation.y = elapsed * 2;
    }
  }
}
