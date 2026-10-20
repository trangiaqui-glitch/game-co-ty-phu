import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TILE_TYPES as T, COLOR_GROUPS, BOARD_LAYOUT } from '../data/boardData.js';
import { BOARD_SIZE } from '../game/BoardManager.js';
import {
  mat, GEO, part, batchStatic, buildLandmark, buildStation, buildUtility, buildBank, buildQuestionMark,
  buildChest, buildMoneyBag, buildDiamondRing, buildStartGate, buildJail, buildPark, buildGoToJail,
  buildHotel, buildCar, buildPalmTree, gold,
} from './ModelFactory.js';
import { buildCityBlocks, Pedestrians, pedestrianPaths, buildBus } from './CityLife.js';
import {
  buildFerrisWheel, buildGoldenLotusFountain, buildArchedBridge, buildRedSailBoat,
} from './CityLandmarks.js';
import {
  grassMaterial, asphaltMaterial, stoneMaterial, foliageGeometry, leafMaterial, woodMaterial,
  waterMaterial, lotusCoinMaterials, roofMaterial,
} from './Materials.js';

const TOP_Y = BOARD_LAYOUT.tileHeight;
const HOUSE_X = [-0.66, -0.22, 0.22, 0.66];
const BAND_Z = -1.22;
const FONT = '"Baloo 2", "Be Vietnam Pro", "Segoe UI", Arial, sans-serif';
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
    // Nhà phố 3D sơn bóng kiểu đồ chơi cao cấp: tường kem ngọc, mái ngói đỏ cam, viền vàng kim, ống khói và cửa sổ sáng.
    const parts = [
      { geo: new RoundedBoxGeometry(1, 1, 1, 2, 0.14), material: mat('#FFFDF7', { roughness: 0.3 }), p: [0, 0.115, 0], s: [0.31, 0.23, 0.31] },
      { geo: GEO.box(), material: mat('#2EC4B6', { roughness: 0.35 }), p: [0, 0.02, 0], s: [0.33, 0.04, 0.33] },
      { geo: GEO.prism(), material: roofMaterial('#E54B2B', 2), p: [0, 0.285, 0], s: [0.215, 0.12, 0.38] },
      { geo: GEO.box(), material: mat('#D97724'), p: [0.09, 0.31, 0.06], s: [0.048, 0.11, 0.048] },
      { geo: GEO.box(), material: mat('#F5B82E', { metalness: 0.45, roughness: 0.28 }), p: [0, 0.075, -0.156], s: [0.088, 0.14, 0.012] },
      { geo: GEO.box(), material: mat('#7CE8FF', { roughness: 0.12, metalness: 0.25, emissive: '#38BDF8', emissiveIntensity: 0.2 }), p: [-0.092, 0.145, -0.156], s: [0.064, 0.064, 0.012] },
      { geo: GEO.box(), material: mat('#7CE8FF', { roughness: 0.12, metalness: 0.25, emissive: '#38BDF8', emissiveIntensity: 0.2 }), p: [0.092, 0.145, -0.156], s: [0.064, 0.064, 0.012] },
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

  // Nền kem ngà ấm có độ sâu nhẹ kiểu thẻ đồ chơi cao cấp
  const bgGrad = g.createRadialGradient(W * 0.5, H * 0.42, 20, W * 0.5, H * 0.5, H * 0.72);
  bgGrad.addColorStop(0, '#FFFDF7');
  bgGrad.addColorStop(0.7, '#FFF7E5');
  bgGrad.addColorStop(1, '#F3E3C2');
  g.fillStyle = bgGrad;
  g.fillRect(0, 0, W, H);

  // Viền ngoài vàng đồng ấm + viền sáng bên trong
  g.strokeStyle = '#DFC492';
  g.lineWidth = 8;
  roundRect(g, 5, 5, W - 10, H - 10, 20);
  g.stroke();

  g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  g.lineWidth = 3;
  roundRect(g, 11, 11, W - 22, H - 22, 16);
  g.stroke();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const ink = '#1F1938';

  const title = (text, y, size = 30, color = ink, maxW = W - 28) => {
    g.font = `800 ${size}px ${FONT}`;
    const lines = wrapText(g, text, maxW);
    lines.forEach((l, i) => {
      const ly = y + (i - (lines.length - 1) / 2) * size * 1.04;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(l, W / 2, ly + 1.5);
      g.fillStyle = color;
      g.fillText(l, W / 2, ly);
    });
  };
  const label = (text, y, size = 20, color = '#6E5D82') => {
    g.font = `700 ${size}px ${FONT}`;
    g.fillStyle = color;
    g.fillText(text, W / 2, y);
  };
  const pill = (text, y, bg = '#271E45', borderColor = '#F5B82E') => {
    g.font = `800 28px ${FONT}`;
    const w = g.measureText(text).width + 34;
    g.fillStyle = 'rgba(25, 18, 48, 0.16)';
    roundRect(g, W / 2 - w / 2, y - 18, w, 42, 21);
    g.fill();
    g.fillStyle = bg;
    roundRect(g, W / 2 - w / 2, y - 21, w, 42, 21);
    g.fill();
    g.strokeStyle = borderColor;
    g.lineWidth = 3;
    roundRect(g, W / 2 - w / 2, y - 21, w, 42, 21);
    g.stroke();
    g.fillStyle = '#FFE57F';
    g.fillText(text, W / 2, y + 1);
  };
  const headerBand = (color, badgeText = null) => {
    g.fillStyle = 'rgba(28, 19, 48, 0.15)';
    roundRect(g, 12, 14, W - 24, 66, 15);
    g.fill();
    g.fillStyle = color;
    roundRect(g, 12, 11, W - 24, 65, 15);
    g.fill();
    // Dải bóng sáng trên cùng kiểu sơn mài bóng
    g.fillStyle = 'rgba(255,255,255,0.36)';
    roundRect(g, 18, 15, W - 36, 16, 8);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2.5;
    roundRect(g, 12, 11, W - 24, 65, 15);
    g.stroke();
    if (badgeText) {
      g.font = `800 22px ${FONT}`;
      g.fillStyle = '#FFFFFF';
      g.fillText(badgeText, W / 2, 45);
    }
  };

  switch (tile.type) {
    case T.PROPERTY: {
      const color = COLOR_GROUPS[tile.group].color;
      headerBand(color);
      title(tile.name, 114, tile.name.length > 10 ? 26 : 30);
      pill(`$${tile.price}`, 170, '#271E45', '#F5B82E');
      break;
    }
    case T.STATION:
      headerBand('#0E9F9A', 'NHÀ GA');
      title(tile.name, 112, 27);
      pill(`$${tile.price}`, 170, '#1D3557', '#48CAE4');
      break;
    case T.UTILITY:
      headerBand('#1E88E5', 'DỊCH VỤ');
      title(tile.name, 112, 26);
      pill(`$${tile.price}`, 170, '#1D3557', '#64B5F6');
      break;
    case T.CHANCE:
      headerBand('#FF7A18', 'SỰ KIỆN');
      title('CƠ HỘI', 114, 34, '#D9530F');
      break;
    case T.COMMUNITY:
      headerBand('#1D8CF8', 'KHO BÁU');
      title('KHÍ VẬN', 114, 34, '#1565C0');
      break;
    case T.TAX:
      headerBand('#E53935', 'THUẾ');
      title(tile.name, 112, 27);
      pill(`Nộp $${tile.amount}`, 168, '#B71C1C', '#FFCDD2');
      break;
    case T.BANK:
      headerBand('#D99B16', 'TÀI CHÍNH');
      title('NGÂN HÀNG', 110, 28, '#9A6700');
      label('Nhận lãi 5%', 148, 22, '#1E824C');
      break;
    case T.START:
      headerBand('#E63946', 'KHỞI HÀNH');
      title('BẮT ĐẦU', 302, 50, '#D62828');
      pill('Nhận $200', 348, '#1B7F47', '#7AE582');
      break;
    case T.JAIL:
      title('NHÀ TÙ', 304, 42, '#374151');
      label('THĂM TÙ', 346, 30, '#E76F51');
      break;
    case T.REST:
      title('CÔNG VIÊN', 300, 44, '#0E9F6E');
      label('Nghỉ ngơi thư giãn', 345, 25, '#047857');
      break;
    case T.GO_TO_JAIL:
      title('VÀO TÙ', 300, 50, '#1E3A8A');
      label('Không nhận $200', 348, 24, '#D62828');
      break;
    default:
      title(tile.name, 100);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function frameGeometry(w, d, thickness, depth = 0.03) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2); s.lineTo(-w / 2, d / 2); s.lineTo(-w / 2, -d / 2);
  const hole = new THREE.Path();
  const iw = w / 2 - thickness;
  const id = d / 2 - thickness;
  hole.moveTo(-iw, -id); hole.lineTo(-iw, id); hole.lineTo(iw, id); hole.lineTo(iw, -id); hole.lineTo(-iw, -id);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
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
    this.animated = []; // công trình có chuyển động (đài phun nước hoa sen, thuyền buồm, đu quay...)
    this.effects = new Set();
    this.speed = 1;
    this.bankPosition = new THREE.Vector3(0, 2.6, -3.1);
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
    // Nền đá cẩm thạch kem đỡ bàn cờ + khung gỗ trầm viền vàng kim sang trọng như bàn cờ tham chiếu
    s.add(part(new RoundedBoxGeometry(BOARD_SIZE + 0.55, 0.5, BOARD_SIZE + 0.55, 4, 0.18), stoneMaterial('#F5E9CE', { repeat: 4, roughness: 0.55 }), [0, -0.25, 0]));
    const woodRim = new THREE.Mesh(frameGeometry(BOARD_SIZE + 0.92, BOARD_SIZE + 0.92, 0.42, 0.24), woodMaterial('#6E3B1E'));
    woodRim.position.y = -0.02;
    woodRim.castShadow = true;
    woodRim.receiveShadow = true;
    s.add(woodRim);
    const goldRim = new THREE.Mesh(frameGeometry(BOARD_SIZE + 0.26, BOARD_SIZE + 0.26, 0.12, 0.27), gold());
    goldRim.position.y = 0.0;
    s.add(goldRim);

    // Đảo cỏ nhiệt đới và bờ cát vàng bao quanh bàn cờ
    s.add(part(new RoundedBoxGeometry(BOARD_SIZE + 3.6, 0.7, BOARD_SIZE + 3.6, 4, 0.32), grassMaterial(5), [0, -0.72, 0]));
    s.add(part(new RoundedBoxGeometry(BOARD_SIZE + 4.5, 0.45, BOARD_SIZE + 4.5, 4, 0.4), stoneMaterial('#F2D8A7', { repeat: 3, roughness: 0.75 }), [0, -0.92, 0]));

    // Mặt nước biển xanh ngọc bao quanh đảo bàn cờ
    const lagoon = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.25, 48), waterMaterial(10));
    lagoon.position.set(0, -1.08, 0);
    lagoon.receiveShadow = true;
    s.add(lagoon);

    // Đồng xu hoa sen vàng cỡ lớn trang trí ở 4 góc viền bàn cờ
    const coinMats = lotusCoinMaterials();
    const coinGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.11, 24);
    for (const [cx, cz, ry] of [
      [-half - 0.85, half + 0.85, 0.4],
      [half + 0.85, half + 0.85, -0.3],
      [-half - 0.85, -half - 0.85, 0.8],
      [half + 0.85, -half - 0.85, -0.6],
    ]) {
      const coinStack = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const cm = new THREE.Mesh(coinGeo, coinMats);
        cm.position.set((k % 2) * 0.05, k * 0.115, (k === 2 ? -0.04 : 0));
        cm.rotation.y = ry + k * 0.5;
        cm.castShadow = true;
        cm.receiveShadow = true;
        cm.userData.dynamic = true;
        coinStack.add(cm);
      }
      coinStack.position.set(cx, -0.32, cz);
      s.add(coinStack);
    }

    const rockGeo = new THREE.CylinderGeometry((half + 1.85) * Math.SQRT2, 3.6, 10, 4, 5).rotateY(Math.PI / 4);
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
    s.add(part(rockGeo, stoneMaterial('#9C7350', { repeat: 3, roughness: 0.95, veins: true }), [0, -6.07, 0]));
    s.add(part(new THREE.CylinderGeometry((half + 1.85) * Math.SQRT2, (half + 1.25) * Math.SQRT2, 0.8, 4).rotateY(Math.PI / 4), stoneMaterial('#7E5638', { repeat: 4, roughness: 0.95 }), [0, -1.45, 0]));

    // Đảo nhỏ nhiệt đới có cây dừa xung quanh
    const rock = stoneMaterial('#9C7350', { repeat: 1, roughness: 0.95, veins: true });
    const grass = grassMaterial();
    const isles = [[-19, -3, 8, 1.4], [20, -4, -6, 1.1], [-8, -6, -20, 1.6], [12, -2.5, 19, 0.9]];
    for (const [x, y, z, k] of isles) {
      s.add(part(GEO.cone(6), rock, [x, y - 0.9 * k, z], [1.3 * k, 1.8 * k, 1.3 * k], [Math.PI, 0, 0]));
      s.add(part(GEO.cyl(6), grass, [x, y + 0.05 * k, z], [1.32 * k, 0.2 * k, 1.32 * k]));
      const palm = buildPalmTree(0.95 * k);
      palm.position.set(x, y + 0.14 * k, z);
      s.add(palm);
    }
  }

  // ------------------------------------------------------------ tiles
  _buildTiles() {
    const baseMat = mat('#FFF8E7', { roughness: 0.42 });
    const rimMat = mat('#E5C687', { roughness: 0.38, metalness: 0.18 });
    const baseGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
    for (const tile of this.board.tiles) {
      const p = tile.position;
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.rotY;
      this.staticRoot.add(group);

      // Đế ô cờ có gờ viền vàng kem nổi rõ chiều sâu
      group.add(part(baseGeo, rimMat, [0, TOP_Y * 0.46, 0], [p.width - 0.05, TOP_Y * 0.92, p.depth - 0.05]));
      group.add(part(baseGeo, baseMat, [0, TOP_Y / 2 + 0.01, 0], [p.width - 0.1, TOP_Y, p.depth - 0.1]));

      const topMat = new THREE.MeshStandardMaterial({ map: drawTile(tile), roughness: 0.55, metalness: 0.03 });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(p.width - 0.16, p.depth - 0.16).rotateX(-Math.PI / 2), topMat);
      top.position.y = TOP_Y + 0.013;
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
    const inner = BOARD_SIZE - 2 * BOARD_LAYOUT.cornerSize - 0.35;
    // Nền trung tâm là bãi cỏ xanh mướt
    const lawn = grassMaterial().clone();
    lawn.map = lawn.map.clone();
    lawn.bumpMap = lawn.bumpMap.clone();
    for (const t of [lawn.map, lawn.bumpMap]) {
      t.repeat.set(9, 9);
      t.needsUpdate = true;
    }
    s.add(part(new RoundedBoxGeometry(inner, 0.08, inner, 3, 0.04), lawn, [0, 0.04, 0]));

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

    // Đường nước xanh ngọc (Turquoise Canal) ôm quanh thành phố đảo + kè đá trắng kem
    const canalBankShape = roadShape(16.15, 2.75);
    canalBankShape.holes.push(roadShape(15.05, 2.35));
    const canalBank = new THREE.Mesh(
      new THREE.ShapeGeometry(canalBankShape, 16).rotateX(-Math.PI / 2),
      stoneMaterial('#F4E8CE', { repeat: 2, roughness: 0.65 }),
    );
    canalBank.position.y = 0.082;
    canalBank.receiveShadow = true;
    s.add(canalBank);

    const canalWaterShape = roadShape(16.02, 2.68);
    canalWaterShape.holes.push(roadShape(15.18, 2.42));
    const canalWater = new THREE.Mesh(
      new THREE.ShapeGeometry(canalWaterShape, 16).rotateX(-Math.PI / 2),
      waterMaterial(6),
    );
    canalWater.position.y = 0.086;
    canalWater.receiveShadow = true;
    s.add(canalWater);

    // 4 cây cầu đá vòm cong (Arched Bridges) bắc qua kênh nước xanh ngọc ở 4 hướng Đông - Tây - Nam - Bắc
    for (const [bx, bz, bry] of [
      [0, 7.6, Math.PI / 2],
      [0, -7.6, Math.PI / 2],
      [7.6, 0, 0],
      [-7.6, 0, 0],
    ]) {
      const bridge = buildArchedBridge(0.92);
      bridge.position.set(bx, 0.085, bz);
      bridge.rotation.y = bry;
      s.add(bridge);
    }

    // Thuyền buồm đỏ truyền thống trôi nhẹ trên dòng kênh xanh ngọc + lá sen nổi
    const lotusPadMat = mat('#2EAD6B', { roughness: 0.55 });
    const lotusPinkMat = mat('#FF7EB6', { roughness: 0.35 });
    for (const [lx, lz] of [[-5.6, 7.55], [5.4, 7.55], [-5.5, -7.55], [5.5, -7.55], [-7.55, -5.2], [7.55, 5.2]]) {
      s.add(part(GEO.cyl(12), lotusPadMat, [lx, 0.09, lz], [0.18, 0.012, 0.18]));
      s.add(part(GEO.cyl(12), lotusPadMat, [lx + 0.24, 0.09, lz + 0.12], [0.13, 0.012, 0.13]));
      s.add(part(GEO.sphere(), lotusPinkMat, [lx, 0.12, lz], [0.06, 0.05, 0.06]));
    }
    for (const [sx, sz, sry, phase] of [
      [-3.8, 7.6, 0.12, 0],
      [3.9, -7.6, Math.PI - 0.1, 1.7],
      [-7.6, 3.7, Math.PI / 2 + 0.1, 3.2],
      [7.6, -3.8, -Math.PI / 2 - 0.1, 4.8],
    ]) {
      const boat = buildRedSailBoat(0.76);
      boat.position.set(sx, 0.09, sz);
      boat.rotation.y = sry;
      boat.userData.update = (t) => {
        boat.position.y = 0.09 + Math.sin(t * 2.2 + phase) * 0.018;
        boat.rotation.z = Math.sin(t * 1.8 + phase) * 0.05;
      };
      this.dynamicRoot.add(boat);
      this.animated.push(boat);
    }

    // Đường vòng quanh trung tâm
    const outer = roadShape(15.05, 2.35);
    outer.holes.push(roadShape(13.4, 2.0));
    const road = new THREE.Mesh(new THREE.ShapeGeometry(outer, 12).rotateX(-Math.PI / 2), asphaltMaterial());
    road.position.y = 0.085;
    road.receiveShadow = true;
    s.add(road);
    // Vỉa hè lát đá chạy sát mép trong của đường (dân cư đi bộ ở đây)
    const walkShape = roadShape(13.4, 2.0);
    walkShape.holes.push(roadShape(11.9, 1.4));
    const walk = new THREE.Mesh(new THREE.ShapeGeometry(walkShape, 12).rotateX(-Math.PI / 2), stoneMaterial('#EFE4CA', { repeat: 0.5, roughness: 0.72 }));
    walk.position.y = 0.09;
    walk.receiveShadow = true;
    s.add(walk);
    const pts = roadShape(14.22, 2.2).getSpacedPoints(80).map((p) => new THREE.Vector3(p.x, 0.1, -p.y));
    this.roadCurve = new THREE.CatmullRomCurve3(pts.slice(0, -1), true);
    const dash = mat('#FFF8E1');
    for (let i = 0; i < 48; i++) {
      const u = i / 48;
      const p = this.roadCurve.getPointAt(u);
      const t = this.roadCurve.getTangentAt(u);
      s.add(part(GEO.box(), dash, [p.x, 0.092, p.z], [0.06, 0.01, 0.3], [0, Math.atan2(t.x, t.z), 0]));
    }

    // Quảng trường trung tâm lát đá kem viền vàng + Đài phun nước Hoa Sen Vàng (Golden Lotus Fountain)
    s.add(part(GEO.cyl(32), stoneMaterial('#F7EBD2', { repeat: 2, roughness: 0.65 }), [0, 0.088, 0.15], [2.15, 0.025, 2.15]));
    s.add(part(GEO.cyl(32), gold(), [0, 0.092, 0.15], [1.92, 0.028, 1.92]));
    s.add(part(GEO.cyl(32), stoneMaterial('#FFFDF7', { repeat: 1, roughness: 0.5 }), [0, 0.095, 0.15], [1.84, 0.03, 1.84]));
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      s.add(part(GEO.box(), stoneMaterial('#F4E6C8', { repeat: 1, roughness: 0.65 }), [Math.cos(ang) * 2.2, 0.089, 0.15 + Math.sin(ang) * 2.2], [0.7, 0.024, 0.7]));
    }
    const fountain = buildGoldenLotusFountain(1.05);
    fountain.position.set(0, 0.095, 0.15);
    this.dynamicRoot.add(fountain);
    this.animated.push(fountain);

    // Ngân hàng trung ương (nguồn tiền của mọi giao dịch)
    const bank = buildBank(2.45);
    bank.position.set(0, 0.08, -3.15);
    bank.rotation.y = Math.PI;
    s.add(bank);
    this.bankPosition.set(0, 2.4, -3.15);

    // Biển hiệu CỜ TỶ PHÚ nổi bật phía trước quảng trường hoa sen
    const logoTex = this.assets.canvasTexture('logo', 1024, 300, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 148px ${FONT}`;
      g.lineWidth = 26;
      g.strokeStyle = '#261758';
      g.strokeText('CỜ TỶ PHÚ', w / 2, h / 2 - 6);
      const grad = g.createLinearGradient(0, 35, 0, 245);
      grad.addColorStop(0, '#FFF380');
      grad.addColorStop(0.55, '#FFC82E');
      grad.addColorStop(1, '#FF7A00');
      g.fillStyle = grad;
      g.fillText('CỜ TỶ PHÚ', w / 2, h / 2 - 6);
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2.28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.42 }));
    logo.position.set(0, 0.105, 5.25);
    logo.userData.dynamic = true;
    s.add(logo);

    // Bộ thẻ Cơ hội / Khí vận
    this._buildDeck('chance', -5.15, 1.55, 0.35, '#FF7A18', 'CƠ HỘI');
    this._buildDeck('community', 5.15, 1.55, -0.35, '#1D8CF8', 'KHÍ VẬN');

    // Cây xanh, cây dừa nhiệt đới và đèn đường
    const treePts = [];
    for (const [x, z] of [[-2.0, -1.7], [2.0, -1.7], [-2.0, 1.85], [2.0, 1.85], [-1.7, -5.6], [1.7, -5.6], [-5.8, 0.7], [5.8, 0.7], [-2.4, 5.75], [2.4, 5.75]]) {
      treePts.push({ x, z, s: 0.72 + ((x * 7 + z * 3) % 3 + 3) % 3 * 0.09 });
    }
    for (const v of [-4.2, -1.8, 1.8, 4.2]) {
      treePts.push({ x: 8.18, z: v, s: 0.78 }, { x: -8.18, z: v, s: 0.78 }, { x: v, z: 8.18, s: 0.78 }, { x: v, z: -8.18, s: 0.78 });
    }
    this.staticRoot.add(this._treeInstances(treePts));

    // Hàng dừa nhiệt đới dọc bờ kênh xanh ngọc và quảng trường
    for (const [px, pz, ps, pry] of [
      [-6.8, -6.8, 0.88, 0.5], [6.8, -6.8, 0.9, -0.6],
      [-6.8, 6.8, 0.9, 1.2], [6.8, 6.8, 0.88, -1.1],
      [-2.15, 0.15, 0.78, 0.3], [2.15, 0.15, 0.78, -0.4],
    ]) {
      const palm = buildPalmTree(ps);
      palm.position.set(px, 0.08, pz);
      palm.rotation.y = pry;
      this.staticRoot.add(palm);
    }

    this.staticRoot.add(buildCityBlocks());
    this.people = new Pedestrians(this.dynamicRoot, pedestrianPaths(), 120);

    // Đu quay quay chậm bên phải thành phố
    const wheel = buildFerrisWheel();
    wheel.position.set(5.25, 0.08, -0.55);
    wheel.scale.setScalar(0.85);
    this.dynamicRoot.add(wheel);
    this.animated.push(wheel);

    const lampPole = mat('#37474F', { metalness: 0.5, roughness: 0.4 });
    const lampHead = mat('#FFF59D', { emissive: '#FFEB3B', emissiveIntensity: 0.75 });
    for (let i = 0; i < 12; i++) {
      const p = this.roadCurve.getPointAt(i / 12);
      const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
      const x = p.x - dir.x * 0.88;
      const z = p.z - dir.z * 0.88;
      s.add(part(GEO.cyl(8), lampPole, [x, 0.5, z], [0.035, 0.9, 0.035]));
      s.add(part(GEO.sphere(), lampHead, [x, 0.98, z], [0.09, 0.09, 0.09]));
    }

    // Xe chạy vòng quanh hai chiều: ô tô nhiều màu + xe buýt.
    this.cars = [];
    const traffic = [
      ['#FF5E5B', 0.0, 1], ['#FFD147', 0.5, 1], ['#00B4D8', 0.25, 1], ['#2EC4B6', 0.75, 1],
      ['#9B5DE5', 0.1, -1], ['#FFFDF7', 0.42, -1], ['#FF9F1C', 0.68, -1],
    ];
    for (const [color, offset, dir] of traffic) {
      const car = buildCar(color);
      car.scale.setScalar(1.2);
      this.dynamicRoot.add(car);
      this.cars.push({ obj: car, offset, dir });
    }
    for (const [offset, dir, color] of [[0.88, 1, '#F5B82E'], [0.3, -1, '#E63946']]) {
      const bus = buildBus(color);
      bus.scale.setScalar(1.15);
      this.dynamicRoot.add(bus);
      this.cars.push({ obj: bus, offset, dir });
    }
  }

  _buildDeck(kind, x, z, rotY, color, text) {
    const g = new THREE.Group();
    g.position.set(x, 0.08, z);
    g.rotation.y = rotY;
    const tex = this.assets.canvasTexture(`deck-${kind}`, 256, 360, (c, w, h) => {
      const grad = c.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, color);
      grad.addColorStop(1, kind === 'chance' ? '#D9480F' : '#155EEF');
      c.fillStyle = grad;
      roundRect(c, 0, 0, w, h, 26);
      c.fill();
      c.strokeStyle = '#FFE57F';
      c.lineWidth = 10;
      roundRect(c, 14, 14, w - 28, h - 28, 18);
      c.stroke();
      c.fillStyle = '#FFFFFF';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `800 120px ${FONT}`;
      c.fillText(kind === 'chance' ? '?' : '★', w / 2, h / 2 - 28);
      c.font = `800 38px ${FONT}`;
      c.fillStyle = '#FFF3B0';
      c.fillText(text, w / 2, h - 68);
    });
    const side = mat('#FFF8E7', { roughness: 0.45 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.08 });
    const cardGeo = new RoundedBoxGeometry(1.0, 0.03, 1.4, 2, 0.012);
    // Đế khay vàng kim giữ bộ bài
    g.add(part(GEO.rbox(), gold(), [0, 0.01, 0], [1.14, 0.025, 1.54]));
    for (let i = 0; i < 7; i++) {
      g.add(part(cardGeo, side, [Math.sin(i * 3.1) * 0.02, 0.025 + i * 0.032, Math.cos(i * 2.3) * 0.02]));
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.36).rotateX(-Math.PI / 2), face);
    top.position.y = 0.025 + 7 * 0.032 + 0.002;
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
    const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 9);
    const trunk = new THREE.InstancedMesh(trunkGeo, woodMaterial('#6B4A2E'), points.length);
    const leaf = leafMaterial().clone();
    leaf.color.set('#ffffff');
    // 3 cụm lá lệch nhau cho mỗi cây: trông như tán cây thật, không còn hình cầu trơn.
    const clusters = [0, 1, 2].map(() => new THREE.InstancedMesh(foliageGeometry(), leaf, points.length));
    const colors = ['#2DBE60', '#1E9E52', '#4BD670', '#70E068', '#FF85B3'];
    const offsets = [
      { x: 0, y: 0.66, z: 0, r: 0.36, h: 0.32 },
      { x: 0.17, y: 0.58, z: 0.1, r: 0.24, h: 0.22 },
      { x: -0.12, y: 0.9, z: -0.05, r: 0.24, h: 0.24 },
    ];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    points.forEach((p, i) => {
      const s = p.s || 1;
      q.setFromAxisAngle(up, i * 1.3);
      m.compose(new THREE.Vector3(p.x, 0.25 * s, p.z), q, new THREE.Vector3(0.05 * s, 0.5 * s, 0.05 * s));
      trunk.setMatrixAt(i, m);
      c.set(colors[i % colors.length]);
      clusters.forEach((cl, k) => {
        const o = offsets[k];
        const ox = (o.x * Math.cos(i * 1.3) - o.z * Math.sin(i * 1.3)) * s;
        const oz = (o.x * Math.sin(i * 1.3) + o.z * Math.cos(i * 1.3)) * s;
        m.compose(new THREE.Vector3(p.x + ox, o.y * s, p.z + oz), q, new THREE.Vector3(o.r * s, o.h * s, o.r * s));
        cl.setMatrixAt(i, m);
        cl.setColorAt(i, c.clone().multiplyScalar(0.9 + k * 0.1));
      });
    });
    for (const im of [trunk, ...clusters]) {
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
    }
    return g;
  }

  _buildTreeRing() {
    const h = BOARD_SIZE / 2 + 1.15;
    const pts = [];
    for (let i = -6; i <= 6; i++) {
      const t = i * 2.05;
      const s = 0.78 + ((i + 6) % 3) * 0.12;
      pts.push({ x: t, z: h, s }, { x: t, z: -h, s }, { x: h, z: t, s }, { x: -h, z: t, s });
    }
    this.staticRoot.add(this._treeInstances(pts));
    // Cây dừa nhiệt đới xen kẽ ở vành ngoài đảo
    for (const [px, pz, ps, pry] of [
      [-12.2, 12.2, 1.05, 0.4], [12.2, 12.2, 1.0, -0.5],
      [-12.2, -12.2, 1.0, 1.1], [12.2, -12.2, 1.08, -1.2],
      [0, 12.4, 0.92, 0.2], [0, -12.4, 0.92, -0.8],
      [12.4, 0, 0.92, 0.9], [-12.4, 0, 0.92, -0.3],
    ]) {
      const palm = buildPalmTree(ps);
      palm.position.set(px, -0.35, pz);
      palm.rotation.y = pry;
      this.staticRoot.add(palm);
    }
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
        const dir = car.dir || 1;
        const u = (((elapsed * 0.025 * dir + car.offset) % 1) + 1) % 1;
        const p = this.roadCurve.getPointAt(u);
        const t = this.roadCurve.getTangentAt(u).multiplyScalar(dir);
        const side = new THREE.Vector3(t.z, 0, -t.x).multiplyScalar(0.24);
        car.obj.position.set(p.x + side.x, 0.09, p.z + side.z);
        car.obj.rotation.y = Math.atan2(t.x, t.z) - Math.PI / 2;
      }
    }
    this.people?.update(dt, elapsed);
    for (const a of this.animated) a.userData.update?.(elapsed);
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
