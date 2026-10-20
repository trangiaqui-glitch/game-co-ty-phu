import * as THREE from 'three';
import { CHARACTER_CONFIG } from '../data/characterConfig.js';
import { BOARD_LAYOUT } from '../data/boardData.js';
import { resolveClips, ANIM_STATES } from './CharacterAnimationController.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_LABEL = { pending: 'chờ', loading: 'đang tải', loaded: 'đã tải', failed: 'LỖI' };

/**
 * Công cụ debug nhân vật: trạng thái tải GLB, skeleton, clip, ánh xạ trạng thái,
 * animation đang phát, hộp bao, scale và độ lệch chân so với mặt bàn cờ.
 * Bật/tắt bằng nút 🐞, phím F2, hoặc thêm ?debug vào URL.
 */
export class CharacterDebugPanel {
  constructor({ charAssets, scene, getControllers, getPlayers }) {
    this.charAssets = charAssets;
    this.scene = scene;
    this.getControllers = getControllers;
    this.getPlayers = getPlayers;
    this.helpers = [];
    this.showHelpers = false;
    this.el = document.createElement('aside');
    this.el.id = 'char-debug';
    this.el.className = 'panel hidden';
    document.body.appendChild(this.el);
    this._box = new THREE.Box3();
    this._timer = null;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.toggle();
      }
    });
    charAssets.on('status', () => this.isOpen && this.render());
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  toggle(force) {
    const open = force ?? !this.isOpen;
    this.el.classList.toggle('hidden', !open);
    clearInterval(this._timer);
    if (open) {
      this.render();
      this._timer = setInterval(() => this.render(), 400);
    } else {
      this.setHelpers(false);
    }
  }

  setHelpers(on) {
    this.showHelpers = on;
    for (const h of this.helpers) {
      h.parent?.remove(h);
      h.dispose?.();
    }
    this.helpers = [];
    if (!on) return;
    for (const c of this.getControllers()) {
      if (c.source === 'glb') {
        const sk = new THREE.SkeletonHelper(c.asset.animationRoot);
        this.scene.add(sk);
        this.helpers.push(sk);
      }
      const box = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(c.player.color));
      box.userData.controller = c;
      this.scene.add(box);
      this.helpers.push(box);
    }
  }

  _measure(c) {
    this._box.setFromObject(c.asset.root, true);
    return this._box;
  }

  render() {
    const ctrls = this.getControllers();
    for (const h of this.helpers) {
      if (h.isBox3Helper) h.box.copy(this._measure(h.userData.controller));
    }
    const rows = Object.keys(CHARACTER_CONFIG).map((id) => {
      const e = this.charAssets.status(id);
      const cfg = CHARACTER_CONFIG[id];
      const info = e.info;
      let mapping = '';
      if (e.gltf) {
        const map = resolveClips(e.gltf.animations, cfg.animationAliases);
        mapping = Object.values(ANIM_STATES).map((s) => (map[s]
          ? `<span class="ok">${s}→${esc(map[s].name)}</span>`
          : `<span class="miss">${s}: thiếu</span>`)).join(' ');
      }
      return `<tr class="st-${e.status}">
        <td><b>${esc(id)}</b>${cfg.overridden ? ' <span class="miss">(override)</span>' : ''}<br><small>${esc(e.path)}</small></td>
        <td><span class="pill ${e.status}">${STATUS_LABEL[e.status] || e.status}</span>${e.error ? `<br><small class="miss">${esc(e.error)}</small>` : ''}</td>
        <td>${info ? `${info.hasSkeleton ? '✔' : '✘'} ${info.bones} xương, ${info.skinnedMeshes}/${info.meshes} skinned<br><small>${info.materials} material, ${info.textures} texture</small>` : '—'}</td>
        <td>${info ? `<small>${info.clips.map((c) => `${esc(c.name)} (${c.duration}s)`).join(', ') || '(không có)'}</small>${info.generatedClips?.length ? `<br><small><b>Clip tự tạo (không có trong GLB):</b> ${info.generatedClips.map((c) => `${esc(c.name)} từ ${esc(c.basedOn)}`).join(', ')}</small>` : ''}<br>${mapping}` : '—'}</td>
        <td>${e.norm ? `<small>scale ${e.norm.scale.toFixed(4)}<br>kích thước ${e.norm.worldSize.join(' × ')}${e.norm.footprintClamped ? '<br><span class="miss">đã thu nhỏ theo bề ngang</span>' : ''}</small>` : '—'}</td>
      </tr>`;
    }).join('');

    const players = this.getPlayers();
    const live = ctrls.map((c) => {
      const box = this._measure(c);
      const size = box.getSize(new THREE.Vector3());
      const foot = box.min.y - BOARD_LAYOUT.tileHeight;
      const p = c.root.position;
      const player = players.find((x) => x.id === c.player.id);
      return `<tr>
        <td><i class="dot" style="background:${c.player.color}"></i><b>${esc(c.player.name)}</b><br><small>${esc(c.def.id)}</small></td>
        <td><span class="pill ${c.source === 'glb' ? 'loaded' : 'failed'}">${c.source === 'glb' ? 'GLB' : 'TẠM'}</span></td>
        <td>${esc(c.anim.state)}<br><small>clip: ${esc(c.anim.currentClipName || '—')}${c.motion ? ' · đang đi' : ''}</small></td>
        <td><small>(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})<br>ô ${player?.position ?? '?'} · hướng ${(c.heading * 57.3).toFixed(0)}°</small></td>
        <td><small>hộp ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}<br>chân lệch mặt bàn: <b class="${Math.abs(foot) > 0.03 ? 'miss' : 'ok'}">${foot >= 0 ? '+' : ''}${foot.toFixed(3)}</b></small></td>
      </tr>`;
    }).join('');

    this.el.innerHTML = `
      <div class="dbg-head"><b>🐞 Debug nhân vật</b>
        <label><input type="checkbox" data-helpers ${this.showHelpers ? 'checked' : ''}> skeleton + hộp bao</label>
        <button class="icon-btn small" data-close title="Đóng (F2)">✕</button></div>
      <h4>Tài nguyên GLB</h4>
      <table><thead><tr><th>Nhân vật</th><th>Trạng thái</th><th>Skeleton</th><th>Clip &amp; ánh xạ</th><th>Chuẩn hoá</th></tr></thead><tbody>${rows}</tbody></table>
      ${ctrls.length ? `<h4>Trong ván đấu</h4><table><thead><tr><th>Người chơi</th><th>Nguồn</th><th>Animation</th><th>Vị trí</th><th>Hộp bao</th></tr></thead><tbody>${live}</tbody></table>` : ''}`;
    this.el.querySelector('[data-close]').onclick = () => this.toggle(false);
    this.el.querySelector('[data-helpers]').onchange = (e) => this.setHelpers(e.target.checked);
  }
}
