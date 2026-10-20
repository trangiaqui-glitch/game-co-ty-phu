import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Nhân vật chibi 3D placeholder (đầu to, thân nhỏ) dựng từ khối hình học.
// Cấu trúc khung xương bằng Group có tên (rig, body, head, armL...) để
// AnimationMixer điều khiển bằng AnimationClip giống như mô hình GLB có rig.
// ---------------------------------------------------------------------------

const G = {
  sphere: new THREE.SphereGeometry(1, 28, 20),
  hemi: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cylOpen: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
  cone: new THREE.CylinderGeometry(0.62, 1, 1, 24),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.18),
  torus: new THREE.TorusGeometry(1, 0.22, 10, 24),
  arc: new THREE.TorusGeometry(1, 0.24, 8, 18, Math.PI),
};

function mesh(geo, material, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], name) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  m.castShadow = true;
  if (name) m.name = name;
  return m;
}

function group(name, p = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...p);
  return g;
}

export function buildProceduralCharacter(def) {
  const L = def.look;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.02, ...o });
  const M = {
    skin: std(L.skin, { roughness: 0.62 }),
    hair: std(L.hair, { roughness: 0.42 }),
    top: std(L.top, { roughness: 0.48 }),
    bottom: std(L.bottom, { roughness: 0.55 }),
    shoes: std(L.shoes, { roughness: 0.32 }),
    white: std('#ffffff', { roughness: 0.15 }),
    black: std('#1a1a22', { roughness: 0.12 }),
    mouth: std('#7a2630', { roughness: 0.5 }),
    blush: std('#ff8f8f', { roughness: 1, transparent: true, opacity: 0.5 }),
    accent: std(def.color, { roughness: 0.4 }),
    gold: std('#FFC83D', { roughness: 0.25, metalness: 0.7 }),
  };

  const root = new THREE.Group();
  root.name = `character-${def.id}`;
  const rig = group('rig');
  root.add(rig);

  // Chân
  const hips = group('hips', [0, 0.3, 0]);
  rig.add(hips);
  for (const side of [-1, 1]) {
    const leg = group(side < 0 ? 'legL' : 'legR', [0.085 * side, 0, 0]);
    leg.add(mesh(G.cyl, M.bottom, [0, -0.1, 0], [0.068, 0.2, 0.068]));
    leg.add(mesh(G.sphere, M.shoes, [0, -0.22, 0.03], [0.085, 0.06, 0.12]));
    hips.add(leg);
  }

  // Thân
  const body = group('body', [0, 0.3, 0]);
  rig.add(body);
  body.add(mesh(G.sphere, M.top, [0, 0.17, 0], [0.2, 0.22, 0.17]));
  if (L.skirt) {
    body.add(mesh(G.cone, M.bottom, [0, 0.0, 0], [0.24, 0.2, 0.22]));
  } else {
    body.add(mesh(G.sphere, M.bottom, [0, 0.04, 0], [0.185, 0.1, 0.16]));
  }

  // Tay
  for (const side of [-1, 1]) {
    const arm = group(side < 0 ? 'armL' : 'armR', [0.19 * side, 0.3, 0]);
    arm.add(mesh(G.cyl, M.top, [0.015 * side, -0.09, 0], [0.055, 0.18, 0.055], [0, 0, 0.1 * side]));
    arm.add(mesh(G.sphere, M.skin, [0.03 * side, -0.2, 0], [0.058, 0.058, 0.058]));
    const hand = group(side < 0 ? 'handL' : 'handR', [0.03 * side, -0.22, 0]);
    arm.add(hand);
    body.add(arm);
  }

  // Đầu
  const head = group('head', [0, 0.4, 0]);
  body.add(head);
  head.add(mesh(G.sphere, M.skin, [0, 0.27, 0], [0.3, 0.28, 0.28]));
  for (const side of [-1, 1]) head.add(mesh(G.sphere, M.skin, [0.29 * side, 0.26, 0], [0.055, 0.07, 0.04]));

  const eyes = group('eyes', [0, 0.29, 0.25]);
  head.add(eyes);
  for (const side of [-1, 1]) {
    eyes.add(mesh(G.sphere, M.white, [0.105 * side, 0, 0], [0.072, 0.082, 0.04]));
    eyes.add(mesh(G.sphere, M.black, [0.105 * side, -0.005, 0.03], [0.045, 0.054, 0.025]));
    eyes.add(mesh(G.sphere, M.white, [0.105 * side + 0.016, 0.02, 0.052], [0.014, 0.014, 0.008]));
  }
  for (const side of [-1, 1]) {
    head.add(mesh(G.rbox, M.hair, [0.105 * side, 0.405, 0.255], [0.08, 0.02, 0.02], [0, 0, -0.18 * side]));
    head.add(mesh(G.sphere, M.blush, [0.18 * side, 0.2, 0.225], [0.05, 0.028, 0.02]));
  }
  head.add(mesh(G.sphere, M.skin, [0, 0.235, 0.285], [0.03, 0.025, 0.02]));
  const mouthMat = L.lipColor ? std(L.lipColor, { roughness: 0.4 }) : M.mouth;
  head.add(mesh(G.arc, mouthMat, [0, 0.175, 0.262], [0.055, 0.055, 0.055], [0, 0, Math.PI], 'mouthSmile'));
  head.add(mesh(G.arc, mouthMat, [0, 0.13, 0.262], [0.0001, 0.0001, 0.0001], [0, 0, 0], 'mouthFrown'));

  buildHair(head, L, M);
  buildHat(head, L, M, std);
  buildExtras(body, head, L, M, std);
  buildAccessory(rig, body, L, M, std);

  // Mỗi nhân vật có vật liệu riêng (kể cả mũ, phụ kiện) để có thể làm xám khi phá sản.
  const materials = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      materials.add(o.material);
    }
  });
  return { root, materials: [...materials] };
}

function buildHair(head, L, M) {
  if (L.hat === 'helmet' || L.hairStyle === 'none') {
    head.add(mesh(G.hemi, M.hair, [0, 0.3, -0.02], [0.305, 0.27, 0.29], [-0.3, 0, 0]));
    return;
  }
  head.add(mesh(G.hemi, M.hair, [0, 0.29, -0.015], [0.315, 0.3, 0.3], [-0.28, 0, 0]));
  switch (L.hairStyle) {
    case 'slick':
      head.add(mesh(G.sphere, M.hair, [0.07, 0.5, 0.15], [0.17, 0.07, 0.11], [0.3, 0, -0.2]));
      break;
    case 'long':
      head.add(mesh(G.sphere, M.hair, [0, 0.16, -0.12], [0.3, 0.33, 0.2]));
      head.add(mesh(G.sphere, M.hair, [-0.1, 0.46, 0.17], [0.15, 0.07, 0.1], [0.4, 0, 0.3]));
      head.add(mesh(G.sphere, M.hair, [0.12, 0.47, 0.16], [0.12, 0.06, 0.1], [0.4, 0, -0.3]));
      head.add(mesh(G.sphere, M.hair, [0, 0.58, -0.12], [0.11, 0.11, 0.11]));
      break;
    case 'bun':
      head.add(mesh(G.sphere, M.hair, [0, 0.52, -0.18], [0.1, 0.1, 0.1]));
      break;
    default:
      head.add(mesh(G.sphere, M.hair, [0, 0.47, 0.16], [0.2, 0.06, 0.1], [0.4, 0, 0]));
      break;
  }
}

function buildHat(head, L, M, std) {
  switch (L.hat) {
    case 'safari': {
      const hat = std('#D8B878', { roughness: 0.7 });
      head.add(mesh(G.cyl, hat, [0, 0.47, 0], [0.43, 0.025, 0.43]));
      head.add(mesh(G.hemi, hat, [0, 0.47, 0], [0.27, 0.2, 0.27]));
      head.add(mesh(G.cyl, std('#6D4C2F'), [0, 0.5, 0], [0.274, 0.045, 0.274]));
      break;
    }
    case 'hardhat': {
      const y = std('#FFD21F', { roughness: 0.25, metalness: 0.05 });
      head.add(mesh(G.hemi, y, [0, 0.42, 0], [0.33, 0.27, 0.33]));
      head.add(mesh(G.cyl, y, [0, 0.43, 0.03], [0.36, 0.02, 0.38]));
      head.add(mesh(G.rbox, y, [0, 0.6, 0], [0.07, 0.07, 0.5]));
      head.add(mesh(G.rbox, std('#ffffff'), [0, 0.55, 0.3], [0.1, 0.06, 0.02]));
      break;
    }
    case 'chef': {
      const w = std('#FFFFFF', { roughness: 0.6 });
      head.add(mesh(G.cyl, w, [0, 0.52, 0], [0.26, 0.14, 0.26]));
      for (const [x, z] of [[0, 0], [0.12, 0.05], [-0.12, 0.05], [0, -0.12], [0.08, -0.08], [-0.08, -0.08]]) {
        head.add(mesh(G.sphere, w, [x, 0.7, z], [0.16, 0.13, 0.16]));
      }
      break;
    }
    case 'helmet': {
      const glass = new THREE.MeshPhysicalMaterial({
        color: '#cfe8ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false,
      });
      const helmet = mesh(G.sphere, glass, [0, 0.27, 0.01], [0.4, 0.39, 0.39]);
      helmet.castShadow = false;
      helmet.renderOrder = 2;
      head.add(helmet);
      head.add(mesh(G.torus, std('#B0BEC5', { metalness: 0.5, roughness: 0.3 }), [0, -0.06, 0], [0.24, 0.24, 0.3], [Math.PI / 2, 0, 0]));
      head.add(mesh(G.sphere, std('#ff5252', { emissive: '#ff1744', emissiveIntensity: 0.8 }), [0.32, 0.4, 0], [0.03, 0.03, 0.03]));
      break;
    }
    default:
      break;
  }
}

function buildExtras(body, head, L, M, std) {
  const extras = L.extras || [];
  if (extras.includes('collar')) {
    body.add(mesh(G.rbox, M.white, [0, 0.3, 0.13], [0.12, 0.08, 0.04]));
  }
  if (extras.includes('tie')) {
    const tie = std(L.tieColor || '#E53935', { roughness: 0.35 });
    body.add(mesh(G.sphere, tie, [0, 0.28, 0.165], [0.025, 0.022, 0.015]));
    body.add(mesh(G.rbox, tie, [0, 0.19, 0.17], [0.045, 0.16, 0.02]));
  }
  if (extras.includes('necklace')) {
    const pearl = std('#FFFFFF', { roughness: 0.1, metalness: 0.2 });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.15 + (i / 8) * 0.7);
      body.add(mesh(G.sphere, pearl, [Math.cos(a) * 0.11, 0.33 - Math.sin(a) * 0.06, 0.1 + Math.sin(a) * 0.04], [0.016, 0.016, 0.016]));
    }
  }
  if (extras.includes('scarf')) {
    const s = std(L.scarfColor || '#E74C3C', { roughness: 0.7 });
    body.add(mesh(G.torus, s, [0, 0.36, 0], [0.13, 0.13, 0.2], [Math.PI / 2, 0, 0]));
  }
  if (extras.includes('vest')) {
    const stripe = std('#E8F5E9', { roughness: 0.2, metalness: 0.3, emissive: '#c8ffc8', emissiveIntensity: 0.25 });
    body.add(mesh(G.cylOpen, stripe, [0, 0.12, 0], [0.198, 0.03, 0.17]));
    body.add(mesh(G.cylOpen, stripe, [0, 0.22, 0], [0.19, 0.03, 0.163]));
  }
  if (extras.includes('apron')) {
    body.add(mesh(G.rbox, std('#FAFAFA', { roughness: 0.7 }), [0, 0.08, 0.16], [0.24, 0.26, 0.03]));
  }
  if (extras.includes('suitBadge')) {
    body.add(mesh(G.cyl, std('#1565C0'), [0.08, 0.22, 0.16], [0.04, 0.01, 0.04], [Math.PI / 2, 0, 0]));
    body.add(mesh(G.rbox, std('#E53935'), [-0.07, 0.24, 0.16], [0.06, 0.04, 0.01]));
  }
}

function buildAccessory(rig, body, L, M, std) {
  const handR = body.getObjectByName('handR');
  const handL = body.getObjectByName('handL');
  switch (L.accessory) {
    case 'briefcase': {
      const leather = std('#6D3F1F', { roughness: 0.45 });
      handR.add(mesh(G.rbox, leather, [0.02, -0.09, 0], [0.06, 0.15, 0.2]));
      handR.add(mesh(G.torus, M.gold, [0.02, -0.005, 0], [0.035, 0.035, 0.035], [0, Math.PI / 2, 0]));
      break;
    }
    case 'handbag': {
      const bag = std('#FFD1E8', { roughness: 0.35 });
      handL.add(mesh(G.rbox, bag, [-0.02, -0.08, 0.02], [0.06, 0.11, 0.15]));
      handL.add(mesh(G.torus, M.gold, [-0.02, -0.01, 0.02], [0.045, 0.045, 0.045], [0, Math.PI / 2, 0]));
      break;
    }
    case 'backpack': {
      const pack = std('#8D5A2B', { roughness: 0.65 });
      body.add(mesh(G.rbox, pack, [0, 0.17, -0.2], [0.27, 0.3, 0.15]));
      body.add(mesh(G.rbox, std('#6D4321'), [0, 0.1, -0.29], [0.18, 0.12, 0.05]));
      body.add(mesh(G.cyl, std('#2E7D32', { roughness: 0.8 }), [0, 0.35, -0.2], [0.07, 0.3, 0.07], [0, 0, Math.PI / 2]));
      for (const side of [-1, 1]) body.add(mesh(G.rbox, std('#5D3A1A'), [0.1 * side, 0.22, 0.13], [0.035, 0.22, 0.02]));
      break;
    }
    case 'wrench': {
      const steel = std('#B0BEC5', { roughness: 0.25, metalness: 0.8 });
      handR.add(mesh(G.cyl, steel, [0.01, -0.06, 0.05], [0.018, 0.2, 0.018], [0.6, 0, 0]));
      handR.add(mesh(G.torus, steel, [0.01, -0.13, 0.15], [0.035, 0.035, 0.035], [0.6, 0, 0]));
      break;
    }
    case 'spoon': {
      const wood = std('#C68642', { roughness: 0.6 });
      handR.add(mesh(G.cyl, wood, [0.01, 0.02, 0.03], [0.015, 0.22, 0.015], [0.3, 0, 0]));
      handR.add(mesh(G.sphere, wood, [0.01, 0.14, 0.07], [0.045, 0.06, 0.025], [0.3, 0, 0]));
      break;
    }
    case 'jetpack': {
      const pack = std('#CFD8DC', { roughness: 0.3, metalness: 0.4 });
      for (const side of [-1, 1]) {
        body.add(mesh(G.cyl, pack, [0.08 * side, 0.18, -0.2], [0.07, 0.28, 0.07]));
        body.add(mesh(G.cyl, std('#FF7043', { emissive: '#FF3D00', emissiveIntensity: 0.6 }), [0.08 * side, 0.02, -0.2], [0.05, 0.05, 0.05]));
      }
      break;
    }
    default:
      break;
  }
}

// --------------------------------------------------------------- animation clips
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function rot(node, times, eulers) {
  const values = [];
  for (const [x, y, z] of eulers) {
    _q.setFromEuler(_e.set(x, y, z));
    values.push(_q.x, _q.y, _q.z, _q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}
const vec = (prop) => (node, times, vecs) => new THREE.VectorKeyframeTrack(`${node}.${prop}`, times, vecs.flat());
const pos = vec('position');
const scl = vec('scale');
const uni = (s) => [s, s, s];

const SMILE = uni(0.055);
const BIG_SMILE = [0.07, 0.075, 0.07];
const NONE = uni(0.0001);

export function createProceduralClips() {
  const clips = {};

  {
    const t = [0, 1.2, 2.4];
    clips.idle = new THREE.AnimationClip('idle', 2.4, [
      pos('rig', [0], [[0, 0, 0]]),
      rot('rig', [0], [[0, 0, 0]]),
      pos('body', t, [[0, 0.3, 0], [0, 0.312, 0], [0, 0.3, 0]]),
      scl('body', t, [[1, 1, 1], [1.02, 0.985, 1.02], [1, 1, 1]]),
      rot('body', [0], [[0, 0, 0]]),
      rot('head', t, [[0, 0, 0.04], [0.04, 0.05, -0.04], [0, 0, 0.04]]),
      rot('armL', t, [[0, 0, -0.08], [0.05, 0, -0.15], [0, 0, -0.08]]),
      rot('armR', t, [[0, 0, 0.08], [0.05, 0, 0.15], [0, 0, 0.08]]),
      rot('legL', [0], [[0, 0, 0]]),
      rot('legR', [0], [[0, 0, 0]]),
      scl('eyes', [0, 1.9, 1.96, 2.02, 2.4], [[1, 1, 1], [1, 1, 1], [1, 0.1, 1], [1, 1, 1], [1, 1, 1]]),
      scl('mouthSmile', [0], [SMILE]),
      scl('mouthFrown', [0], [NONE]),
    ]);
  }

  {
    const t = [0, 0.3, 0.6];
    clips.walk = new THREE.AnimationClip('walk', 0.6, [
      pos('rig', [0], [[0, 0, 0]]),
      rot('rig', [0], [[0, 0, 0]]),
      pos('body', [0, 0.15, 0.3, 0.45, 0.6], [[0, 0.3, 0], [0, 0.335, 0], [0, 0.3, 0], [0, 0.335, 0], [0, 0.3, 0]]),
      scl('body', [0], [[1, 1, 1]]),
      rot('body', t, [[0.08, 0.06, 0], [0.08, -0.06, 0], [0.08, 0.06, 0]]),
      rot('head', t, [[-0.05, -0.05, 0.03], [-0.05, 0.05, -0.03], [-0.05, -0.05, 0.03]]),
      rot('armL', t, [[-0.6, 0, -0.1], [0.6, 0, -0.1], [-0.6, 0, -0.1]]),
      rot('armR', t, [[0.6, 0, 0.1], [-0.6, 0, 0.1], [0.6, 0, 0.1]]),
      rot('legL', t, [[0.6, 0, 0], [-0.6, 0, 0], [0.6, 0, 0]]),
      rot('legR', t, [[-0.6, 0, 0], [0.6, 0, 0], [-0.6, 0, 0]]),
      scl('eyes', [0], [[1, 1, 1]]),
      scl('mouthSmile', [0], [SMILE]),
      scl('mouthFrown', [0], [NONE]),
    ]);
  }

  {
    const t = [0, 0.22, 0.44];
    clips.run = new THREE.AnimationClip('run', 0.44, [
      pos('rig', [0], [[0, 0, 0]]),
      rot('rig', [0], [[0, 0, 0]]),
      pos('body', [0, 0.11, 0.22, 0.33, 0.44], [[0, 0.3, 0], [0, 0.36, 0], [0, 0.3, 0], [0, 0.36, 0], [0, 0.3, 0]]),
      scl('body', [0], [[1, 1, 1]]),
      rot('body', t, [[0.22, 0.1, 0], [0.22, -0.1, 0], [0.22, 0.1, 0]]),
      rot('head', [0], [[-0.15, 0, 0]]),
      rot('armL', t, [[-1.0, 0, -0.2], [0.9, 0, -0.2], [-1.0, 0, -0.2]]),
      rot('armR', t, [[0.9, 0, 0.2], [-1.0, 0, 0.2], [0.9, 0, 0.2]]),
      rot('legL', t, [[0.9, 0, 0], [-0.8, 0, 0], [0.9, 0, 0]]),
      rot('legR', t, [[-0.8, 0, 0], [0.9, 0, 0], [-0.8, 0, 0]]),
      scl('eyes', [0], [[1, 1, 1]]),
      scl('mouthSmile', [0], [BIG_SMILE]),
      scl('mouthFrown', [0], [NONE]),
    ]);
  }

  {
    const t = [0, 0.15, 0.32, 0.55, 0.64, 0.75];
    clips.jump = new THREE.AnimationClip('jump', 0.75, [
      pos('rig', t, [[0, 0, 0], [0, -0.03, 0], [0, 0.42, 0], [0, 0.05, 0], [0, 0, 0], [0, 0, 0]]),
      rot('rig', [0], [[0, 0, 0]]),
      pos('body', [0], [[0, 0.3, 0]]),
      scl('body', t, [[1, 1, 1], [1.15, 0.8, 1.15], [0.9, 1.15, 0.9], [1, 1, 1], [1.12, 0.88, 1.12], [1, 1, 1]]),
      rot('body', [0], [[0, 0, 0]]),
      rot('head', t, [[0, 0, 0], [0.15, 0, 0], [-0.2, 0, 0], [0, 0, 0], [0.1, 0, 0], [0, 0, 0]]),
      rot('armL', t, [[0, 0, -0.1], [0.3, 0, -0.3], [0, 0, -2.6], [0, 0, -1.2], [0, 0, -0.3], [0, 0, -0.1]]),
      rot('armR', t, [[0, 0, 0.1], [0.3, 0, 0.3], [0, 0, 2.6], [0, 0, 1.2], [0, 0, 0.3], [0, 0, 0.1]]),
      rot('legL', t, [[0, 0, 0], [0.3, 0, 0], [-0.5, 0, -0.1], [0, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
      rot('legR', t, [[0, 0, 0], [0.3, 0, 0], [-0.5, 0, 0.1], [0, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
      scl('eyes', [0], [[1, 1, 1]]),
      scl('mouthSmile', [0, 0.32, 0.75], [SMILE, BIG_SMILE, SMILE]),
      scl('mouthFrown', [0], [NONE]),
    ]);
  }

  {
    const t = [0, 0.3, 0.6, 0.9, 1.2];
    clips.celebrate = new THREE.AnimationClip('celebrate', 1.2, [
      pos('rig', t, [[0, 0, 0], [0, 0.26, 0], [0, 0, 0], [0, 0.26, 0], [0, 0, 0]]),
      rot('rig', t, [[0, 0, 0], [0, 0.35, 0], [0, 0, 0], [0, -0.35, 0], [0, 0, 0]]),
      pos('body', [0], [[0, 0.3, 0]]),
      scl('body', t, [[1.08, 0.92, 1.08], [0.96, 1.06, 0.96], [1.08, 0.92, 1.08], [0.96, 1.06, 0.96], [1.08, 0.92, 1.08]]),
      rot('body', [0], [[0, 0, 0]]),
      rot('head', t, [[-0.15, 0, 0.12], [-0.2, 0, -0.12], [-0.15, 0, 0.12], [-0.2, 0, -0.12], [-0.15, 0, 0.12]]),
      rot('armL', t, [[0, 0, -2.5], [0, 0, -2.95], [0, 0, -2.5], [0, 0, -2.95], [0, 0, -2.5]]),
      rot('armR', t, [[0, 0, 2.95], [0, 0, 2.5], [0, 0, 2.95], [0, 0, 2.5], [0, 0, 2.95]]),
      rot('legL', t, [[0, 0, -0.15], [0.3, 0, 0], [0, 0, -0.15], [0.3, 0, 0], [0, 0, -0.15]]),
      rot('legR', t, [[0, 0, 0.15], [0.3, 0, 0], [0, 0, 0.15], [0.3, 0, 0], [0, 0, 0.15]]),
      scl('eyes', [0, 0.6, 1.2], [[1.05, 0.55, 1], [1.05, 0.7, 1], [1.05, 0.55, 1]]),
      scl('mouthSmile', [0], [BIG_SMILE]),
      scl('mouthFrown', [0], [NONE]),
    ]);
  }

  {
    const t = [0, 1.2, 2.4];
    clips.sad = new THREE.AnimationClip('sad', 2.4, [
      pos('rig', [0], [[0, 0, 0]]),
      rot('rig', t, [[0, 0.06, 0], [0, -0.06, 0], [0, 0.06, 0]]),
      pos('body', t, [[0, 0.28, 0], [0, 0.275, 0], [0, 0.28, 0]]),
      scl('body', [0], [[1.03, 0.95, 1.03]]),
      rot('body', [0], [[0.18, 0, 0]]),
      rot('head', t, [[0.42, 0, 0.08], [0.45, 0, -0.08], [0.42, 0, 0.08]]),
      rot('armL', t, [[0.25, 0, 0.05], [0.3, 0, 0.08], [0.25, 0, 0.05]]),
      rot('armR', t, [[0.25, 0, -0.05], [0.3, 0, -0.08], [0.25, 0, -0.05]]),
      rot('legL', [0], [[0, 0, 0.04]]),
      rot('legR', [0], [[0, 0, -0.04]]),
      scl('eyes', [0], [[1, 0.65, 1]]),
      scl('mouthSmile', [0], [NONE]),
      scl('mouthFrown', [0], [uni(0.05)]),
    ]);
  }

  return clips;
}
