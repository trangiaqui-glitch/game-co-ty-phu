import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import {
  CHARACTER_CONFIG, CHARACTER_TARGET_HEIGHT, CHARACTER_MAX_FOOTPRINT, PLACEHOLDER_MOTION, PROCEDURAL_CLIPS, getCharacterConfig,
} from '../data/characterConfig.js';
import { getCharacter } from '../data/characters.js';
import { buildProceduralCharacter, createProceduralClips } from '../scene/CharacterFactory.js';
import { resolveClips } from './CharacterAnimationController.js';
import { createSadClip } from './ProceduralClips.js';

export const LOAD_STATUS = Object.freeze({
  PENDING: 'pending',
  LOADING: 'loading',
  LOADED: 'loaded',
  FAILED: 'failed',
});

// Cập nhật ma trận xương trước khi đo bounding box (nếu không, SkinnedMesh
// chưa render lần nào sẽ có boneMatrices = 0 và hộp bao bị sai).
function measure(object) {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox?.();
    }
  });
  return new THREE.Box3().setFromObject(object, true);
}

function inspect(gltf) {
  let skinnedMeshes = 0;
  let meshes = 0;
  let bones = 0;
  let morphTargets = 0;
  const materials = new Set();
  const textures = new Set();
  gltf.scene.traverse((o) => {
    if (o.isBone) bones++;
    if (o.isMesh) {
      meshes++;
      if (o.isSkinnedMesh) skinnedMeshes++;
      if (o.morphTargetInfluences) morphTargets += o.morphTargetInfluences.length;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) textures.add(m[k]);
      }
    }
  });
  return {
    meshes,
    skinnedMeshes,
    bones,
    hasSkeleton: skinnedMeshes > 0 && bones > 0,
    morphTargets,
    materials: materials.size,
    textures: textures.size,
    clips: gltf.animations.map((c) => ({ name: c.name, duration: +c.duration.toFixed(2) })),
  };
}

/**
 * Tải, cache, chuẩn hoá và nhân bản mô hình GLB của nhân vật.
 * - Mỗi file GLB chỉ tải một lần (dùng chung cache của AssetManager).
 * - Nhân bản bằng SkeletonUtils.clone để mỗi người chơi có skeleton riêng,
 *   dùng chung geometry/material/texture gốc (không sửa material).
 * - Thiếu file: trạng thái FAILED kèm đường dẫn và lỗi; KHÔNG tự thay thế.
 *   Mô hình tạm chỉ được tạo khi nơi gọi yêu cầu rõ (allowPlaceholder).
 *
 * Sự kiện: 'status' (id, entry).
 */
export class CharacterAssetManager extends EventEmitter {
  constructor(assetManager) {
    super();
    this.assets = assetManager;
    this.entries = new Map();
    this._placeholderClips = null;
  }

  _entry(id) {
    if (!this.entries.has(id)) {
      const cfg = getCharacterConfig(id);
      this.entries.set(id, {
        id, path: cfg?.modelPath || null, status: LOAD_STATUS.PENDING, error: null, gltf: null, info: null, norm: null, promise: null,
      });
    }
    return this.entries.get(id);
  }

  _setStatus(entry, status, patch = {}) {
    Object.assign(entry, patch, { status });
    this.emit('status', entry.id, entry);
  }

  loadCharacter(id) {
    const cfg = getCharacterConfig(id);
    const entry = this._entry(id);
    if (!cfg) {
      this._setStatus(entry, LOAD_STATUS.FAILED, { error: `Không có cấu hình cho nhân vật "${id}"` });
      return Promise.resolve(entry);
    }
    if (entry.promise) return entry.promise;
    this._setStatus(entry, LOAD_STATUS.LOADING, { path: cfg.modelPath });
    entry.promise = this.assets.loadGLTF(cfg.modelPath, { quiet: true }).then((gltf) => {
      if (!gltf) {
        const raw = this.assets.errors.get(cfg.modelPath) || 'không rõ lỗi';
        const reason = /\b404\b/.test(raw) ? 'không tìm thấy file (HTTP 404)' : raw;
        console.error(`[CharacterAssetManager] Nhân vật "${id}": không tải được "${cfg.modelPath}" — ${raw}`);
        this._setStatus(entry, LOAD_STATUS.FAILED, { error: reason, rawError: raw });
        return entry;
      }
      try {
        const info = inspect(gltf);
        const norm = this._normalization(gltf.scene, cfg);
        if (!info.hasSkeleton) console.warn(`[CharacterAssetManager] "${id}" (${cfg.modelPath}) không có skeleton — animation xương sẽ không chạy.`);
        if (!info.clips.length) console.warn(`[CharacterAssetManager] "${id}" (${cfg.modelPath}) không có animation clip nào.`);
        const clips = [...gltf.animations];
        const found = resolveClips(clips, cfg.animationAliases);
        if (PROCEDURAL_CLIPS.sad && !found.sad && found.idle && info.hasSkeleton) {
          const sad = createSadClip(SkeletonUtils.clone(gltf.scene), found.idle);
          if (sad) clips.push(sad);
        }
        info.generatedClips = clips.filter((c) => c.userData?.procedural).map((c) => ({ name: c.name, duration: +c.duration.toFixed(2), basedOn: c.userData.basedOn }));
        this._setStatus(entry, LOAD_STATUS.LOADED, { gltf, info, norm, clips, error: null });
      } catch (err) {
        console.error(`[CharacterAssetManager] "${id}": GLB không hợp lệ (${cfg.modelPath})`, err);
        this._setStatus(entry, LOAD_STATUS.FAILED, { error: `GLB không hợp lệ: ${err.message}` });
      }
      return entry;
    });
    return entry.promise;
  }

  async preloadCharacters(ids = Object.keys(CHARACTER_CONFIG), onProgress) {
    let done = 0;
    await Promise.all(ids.map((id) => this.loadCharacter(id).then(() => onProgress?.(++done / ids.length, id))));
    return ids.map((id) => this.entries.get(id));
  }

  getCharacter(id) {
    const e = this.entries.get(id);
    return e && e.status === LOAD_STATUS.LOADED ? e : null;
  }

  status(id) {
    return this._entry(id);
  }

  // Tỷ lệ đồng đều (không méo) để cao CHARACTER_TARGET_HEIGHT * cfg.scale, chân chạm y = 0.
  _normalization(scene, cfg) {
    const probe = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.rotation.y = cfg.rotationOffset || 0;
    probe.add(pivot);
    const clone = SkeletonUtils.clone(scene);
    pivot.add(clone);
    const box = measure(probe);
    const size = box.getSize(new THREE.Vector3());
    if (!(size.y > 0)) throw new Error('Bounding box rỗng');
    let scale = (CHARACTER_TARGET_HEIGHT / size.y) * (cfg.scale || 1);
    const footprint = Math.max(size.x, size.z) * scale;
    let clamped = false;
    if (footprint > CHARACTER_MAX_FOOTPRINT) {
      scale *= CHARACTER_MAX_FOOTPRINT / footprint;
      clamped = true;
    }
    const center = box.getCenter(new THREE.Vector3());
    return {
      scale,
      // Dịch trong hệ toạ độ sau khi xoay, trước khi scale
      offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
      rawSize: size.toArray().map((n) => +n.toFixed(3)),
      worldSize: size.clone().multiplyScalar(scale).toArray().map((n) => +n.toFixed(3)),
      footprintClamped: clamped,
    };
  }

  /**
   * Nhân bản nhân vật đã tải. Cấu trúc:
   *   pivot (scale đồng đều + footOffset) └ offset (căn tâm, chân về y=0) └ inner (rotationOffset) └ model (clone có skeleton riêng)
   */
  cloneCharacter(id) {
    const entry = this.getCharacter(id);
    if (!entry) return null;
    const cfg = getCharacterConfig(id);
    const model = SkeletonUtils.clone(entry.gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.isSkinnedMesh) o.frustumCulled = false; // hộp bao tư thế gốc không đúng khi đang animate
      }
    });
    // Hộp bao được đo SAU khi xoay, nên phép dịch nằm ngoài phép xoay.
    const inner = new THREE.Group();
    inner.rotation.y = cfg.rotationOffset || 0;
    inner.add(model);
    const offset = new THREE.Group();
    offset.position.copy(entry.norm.offset);
    offset.add(inner);
    const pivot = new THREE.Group();
    pivot.name = 'characterPivot';
    pivot.scale.setScalar(entry.norm.scale);
    pivot.position.y = cfg.footOffset || 0;
    pivot.add(offset);
    return {
      root: pivot,
      animationRoot: model,
      clips: entry.clips || entry.gltf.animations,
      source: 'glb',
      info: entry.info,
      norm: entry.norm,
      config: cfg,
      motion: { walkStride: cfg.walkStride, runStride: cfg.runStride },
      ownsMaterials: false,
    };
  }

  // Mô hình tạm dựng bằng khối hình học — chỉ dùng khi được yêu cầu rõ ràng.
  createPlaceholder(id) {
    const def = getCharacter(id);
    const cfg = getCharacterConfig(id);
    if (!this._placeholderClips) this._placeholderClips = createProceduralClips();
    const { root } = buildProceduralCharacter(def);
    const box = measure(root);
    return {
      root,
      animationRoot: root,
      clips: Object.values(this._placeholderClips),
      source: 'placeholder',
      info: {
        meshes: 0, skinnedMeshes: 0, bones: 0, hasSkeleton: false, materials: 0, textures: 0,
        clips: Object.values(this._placeholderClips).map((c) => ({ name: c.name, duration: +c.duration.toFixed(2) })),
      },
      norm: { scale: 1, worldSize: box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3)), footprintClamped: false },
      config: { ...cfg, animationAliases: null },
      motion: PLACEHOLDER_MOTION,
      ownsMaterials: true,
    };
  }

  // Giải phóng model gốc (geometry, material, texture) và xoá khỏi cache.
  disposeCharacter(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.gltf) {
      entry.gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          m.dispose();
        }
      });
    }
    if (entry.path) this.assets.evict(entry.path);
    this.entries.delete(id);
    this.emit('status', id, { id, status: LOAD_STATUS.PENDING, path: entry.path });
  }
}
