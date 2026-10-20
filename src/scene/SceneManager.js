import * as THREE from 'three';

export const QUALITY_PRESETS = {
  high: { label: 'Cao', shadows: true, shadowMapSize: 2048, pixelRatio: 2, particles: 1 },
  medium: { label: 'Trung bình', shadows: true, shadowMapSize: 1024, pixelRatio: 1.5, particles: 0.6 },
  low: { label: 'Thấp', shadows: false, shadowMapSize: 512, pixelRatio: 1, particles: 0.35 },
};

// Renderer, scene, ánh sáng, vòng lặp render và raycast.
export class SceneManager {
  constructor(container, qualityKey = 'high') {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dcebf5', 75, 170);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

    // Bầu trời có mặt trời thật: vừa là nền vừa là ánh sáng môi trường để kính, sơn xe, kim loại phản chiếu.
    const sunDir = new THREE.Vector3(14, 28, 16).normalize();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this._skyMaterial(sunDir, false));
    dome.renderOrder = -10;
    this.scene.add(dome);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this._skyMaterial(sunDir, true)));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();

    this._setupLights();
    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this.quality = QUALITY_PRESETS.high;
    this.setQuality(qualityKey);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  // Bầu trời gradient + quầng và đĩa mặt trời. `linear` = xuất màu tuyến tính (dùng làm môi trường PBR).
  _skyMaterial(sunDir, linear) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: sunDir.clone() }, linear: { value: linear ? 1 : 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 sunDir; uniform float linear;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 horizon = vec3(0.93, 0.95, 0.96);
          vec3 mid = vec3(0.58, 0.78, 0.96);
          vec3 top = vec3(0.17, 0.42, 0.82);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, top, smoothstep(0.18, 0.85, h));
          col = mix(col, vec3(0.78, 0.84, 0.82), smoothstep(0.0, -0.35, h));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 5.0) * 0.12);
          if (linear > 0.5) col = pow(col, vec3(2.2)) * 1.1;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#d9c7a3', 0.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff0d6', 2.8);
    this.sun.position.set(14, 28, 16);
    this.sun.target.position.set(0, 0, 0);
    const s = this.sun.shadow;
    s.camera.left = -19;
    s.camera.right = 19;
    s.camera.top = 19;
    s.camera.bottom = -19;
    s.camera.near = 5;
    s.camera.far = 80;
    s.bias = -0.0004;
    s.radius = 3;
    s.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    const rim = new THREE.DirectionalLight('#b9d4ff', 0.5);
    rim.position.set(-18, 12, -14);
    this.scene.add(rim);
  }

  setQuality(key) {
    const q = QUALITY_PRESETS[key] || QUALITY_PRESETS.high;
    this.quality = q;
    this.qualityKey = QUALITY_PRESETS[key] ? key : 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
    this.resize();
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _tick() {
    // Giới hạn dt để tránh nhảy cóc khi tab bị ẩn, nhưng đủ rộng để máy yếu vẫn chạy đúng tốc độ.
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;
    for (const fn of this.updaters) {
      try {
        fn(dt, elapsed);
      } catch (err) {
        console.error('[SceneManager] updater failed', err);
        this.updaters.delete(fn);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX, clientY, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  // Chiếu một điểm 3D ra toạ độ màn hình (px).
  project(vec3) {
    const v = vec3.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z < 1,
    };
  }
}
