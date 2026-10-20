import * as THREE from 'three';

// Tạo clip "Sad" (buồn bã) trên chính skeleton của GLB khi file không có sẵn clip này.
// Cách làm: lấy clip Idle thật của model, cúi đầu + gù lưng bằng cách quay thêm các xương
// đầu/cổ/ngực quanh trục ngang của nhân vật (model hướng +Z, trục ngang = X), và phát chậm hơn.
// Clip được đặt tên "Sad (procedural)" để luôn phân biệt với clip có trong file.

const BEND = [
  { re: /^head$/i, deg: 26 },
  { re: /^neck$/i, deg: 12 },
  { re: /^(chest|upperchest|spine2)$/i, deg: 10 },
  { re: /^(torso|spine1)$/i, deg: 6 },
];
const SHOULDER = [
  { re: /^shoulder\.?l$|^leftshoulder$/i, deg: 10 },
  { re: /^shoulder\.?r$|^rightshoulder$/i, deg: 10 },
];

const trackName = (bone) => `${THREE.PropertyBinding.sanitizeNodeName(bone.name)}.quaternion`;

export function createSadClip(scene, idleClip, { slow = 1.5 } = {}) {
  if (!idleClip) return null;
  const bones = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.isBone) bones.push(o);
  });
  const sceneInv = new THREE.Quaternion();
  scene.getWorldQuaternion(sceneInv).invert();
  const tracks = idleClip.tracks.map((t) => t.clone());
  const byName = new Map(tracks.map((t) => [t.name, t]));
  let touched = 0;

  const apply = (bone, deg, axis) => {
    // Quay delta D (trong hệ toạ độ model) đặt trước xương: L' = P⁻¹·D·P·L, P = hướng thế giới của xương cha.
    const parent = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parent);
    parent.premultiply(sceneInv);
    const d = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
    const q = parent.clone().invert().multiply(d).multiply(parent);
    const name = trackName(bone);
    let track = byName.get(name);
    if (!track) {
      track = new THREE.QuaternionKeyframeTrack(name, [0], bone.quaternion.toArray());
      tracks.push(track);
      byName.set(name, track);
    }
    const v = track.values;
    const tmp = new THREE.Quaternion();
    for (let i = 0; i < v.length; i += 4) {
      tmp.fromArray(v, i).premultiply(q).normalize().toArray(v, i);
    }
    touched++;
  };

  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  for (const { re, deg } of BEND) {
    const bone = bones.find((b) => re.test(b.name));
    if (bone?.parent) apply(bone, deg, X);
  }
  for (const { re, deg } of SHOULDER) {
    const bone = bones.find((b) => re.test(b.name));
    // Vai rũ xuống: quay quanh trục trước-sau (Z). Vai trái nằm phía +X nên góc âm hạ vai xuống, vai phải ngược lại.
    if (bone?.parent) apply(bone, /l$|left/i.test(bone.name) ? -deg : deg, Z);
  }
  if (!touched) return null;
  for (const t of tracks) t.times = t.times.map((x) => x * slow);
  const clip = new THREE.AnimationClip('Sad (procedural)', idleClip.duration * slow, tracks);
  clip.userData = { procedural: true, basedOn: idleClip.name };
  return clip;
}
