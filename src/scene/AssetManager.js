import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Nhân vật được quản lý bởi src/characters/CharacterAssetManager.js (cấu hình trong characterConfig.js).
const EMPTY_MANIFEST = { buildings: {}, props: {} };

/**
 * Tải và cache tài nguyên. Chỉ những mô hình GLB được khai báo trong
 * assets/models/manifest.json mới được tải, mỗi URL tải đúng một lần
 * (cache theo Promise). Lỗi tải không làm crash game: trả về null để
 * nơi gọi dùng mô hình placeholder, đồng thời báo lỗi qua onError.
 */
export class AssetManager {
  constructor({ onError } = {}) {
    this.onError = onError;
    this.loadingManager = new THREE.LoadingManager();
    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.cache = new Map();
    this.textures = new Map();
    this.manifest = structuredClone(EMPTY_MANIFEST);
    this.failed = [];
    this.errors = new Map();
  }

  evict(url) {
    this.cache.delete(url);
    this.errors.delete(url);
  }

  async loadManifest(url = 'assets/models/manifest.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const key of Object.keys(EMPTY_MANIFEST)) {
        const section = data[key] && typeof data[key] === 'object' ? data[key] : {};
        this.manifest[key] = Object.fromEntries(
          Object.entries(section).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v),
        );
      }
    } catch (err) {
      console.warn('[AssetManager] Không đọc được manifest, dùng mô hình placeholder.', err);
    }
    return this.manifest;
  }

  getUrl(category, key) {
    return this.manifest[category]?.[key] || null;
  }

  // `quiet`: nơi gọi tự báo lỗi (ví dụ CharacterAssetManager), không gọi onError chung.
  loadGLTF(url, { quiet = false } = {}) {
    if (!this.cache.has(url)) {
      const promise = new Promise((resolve) => {
        this.gltfLoader.load(
          url,
          (gltf) => {
            gltf.scene.traverse((o) => {
              if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
              }
            });
            resolve(gltf);
          },
          undefined,
          (err) => {
            this.failed.push(url);
            this.errors.set(url, err?.message || String(err));
            if (!quiet) {
              console.error(`[AssetManager] Không tải được ${url}`, err);
              this.onError?.(url, err);
            }
            resolve(null);
          },
        );
      });
      this.cache.set(url, promise);
    }
    return this.cache.get(url);
  }

  async preload(onProgress) {
    const urls = [];
    for (const section of Object.values(this.manifest)) urls.push(...Object.values(section));
    const unique = [...new Set(urls)];
    if (!unique.length) {
      onProgress?.(1);
      return;
    }
    let done = 0;
    await Promise.all(unique.map((u) => this.loadGLTF(u).then(() => onProgress?.(++done / unique.length))));
  }

  async getModel(category, key) {
    const url = this.getUrl(category, key);
    if (!url) return null;
    return this.loadGLTF(url);
  }

  // Bản sao an toàn cho mô hình có skeleton.
  cloneScene(gltf) {
    return SkeletonUtils.clone(gltf.scene);
  }

  // Bản sao một mô hình tĩnh đã được chuẩn hoá về kích thước mong muốn.
  async getStaticModel(category, key, targetSize) {
    const gltf = await this.getModel(category, key);
    if (!gltf) return null;
    const obj = gltf.scene.clone(true);
    const wrapper = new THREE.Group();
    wrapper.add(obj);
    if (targetSize) normalizeObject(obj, targetSize);
    return wrapper;
  }

  canvasTexture(key, width, height, draw) {
    if (this.textures.has(key)) return this.textures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.set(key, tex);
    return tex;
  }
}

// Co giãn đối tượng để chiều lớn nhất (hoặc chiều cao) bằng `size`, đặt đáy ở y = 0.
export function normalizeObject(obj, size, { byHeight = false } = {}) {
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const ref = byHeight ? dims.y : Math.max(dims.x, dims.y, dims.z);
  if (ref > 0) obj.scale.multiplyScalar(size / ref);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box2.min.y;
  return obj;
}
