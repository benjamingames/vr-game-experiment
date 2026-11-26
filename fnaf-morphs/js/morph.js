// FNAF Morphs: a "morph" is a rigged animatronic model you wear. Your head, hands and walking drive the bones,
// and the springlock failure plays on top (suit plates burst outward, the jaw and body shake with the laugh).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
// Bone names with their numeric / skeleton suffix stripped (see norm()). BIP covers the Source-style FNAF rigs, FOXY the Fortnite rig.
const BIP = { pelvis: 'bip_pelvis', spine: 'bip_spine_0', neck: 'bip_neck', head: 'bip_head', jaw: 'bip_jaw', eyeL: 'bip_eye_L', eyeR: 'bip_eye_R',
  upL: 'bip_upperarm_L', loL: 'bip_lowerarm_L', hdL: 'bip_hand_L', upR: 'bip_upperarm_R', loR: 'bip_lowerarm_R', hdR: 'bip_hand_R',
  hipL: 'bip_hip_L', kneeL: 'bip_knee_L', footL: 'bip_foot_L', hipR: 'bip_hip_R', kneeR: 'bip_knee_R', footR: 'bip_foot_R' };
const FOXY = { pelvis: 'pelvis', spine: 'spine_03', neck: 'neck_01', head: 'head', jaw: 'C_jaw', eyeL: 'L_eye', eyeR: 'R_eye',
  upL: 'upperarm_l', loL: 'lowerarm_l', hdL: 'hand_l', upR: 'upperarm_r', loR: 'lowerarm_r', hdR: 'hand_r',
  hipL: 'thigh_l', kneeL: 'calf_l', footL: 'foot_l', hipR: 'thigh_r', kneeR: 'calf_r', footR: 'foot_r' };
const norm = n => n.replace(/(_[A-Za-z0-9]+qc_skeleton)?(_\d+|_Armature)$/i, '').toLowerCase();

const MANGLE = { pelvis: 'hip_bn_03', spine: 'spine_bn_026', neck: 'neck_01_bn_041', head: 'head_bn_045', jaw: 'jaw_bn_051', eyeL: 'l_eye_bn_058', eyeR: 'r_eye_bn_061',
  upL: 'l_arm_01_bn_027', loL: 'l_arm_02_bn_028', hdL: 'l_arm_03_bn_029', upR: 'm_neck_bn_031', loR: 'm_neck_bn_031', hdR: 'm_hand_bn_032',
  hipL: 'l_front_leg_01_bn_06', kneeL: 'l_front_leg_02_bn_07', footL: 'l_front_leg_03_bn_08', hipR: 'r_front_leg_01_bn_012', kneeR: 'r_front_leg_02_bn_013', footR: 'r_front_leg_03_bn_014',
  rhipL: 'l_rear_leg_01_bn_09', rkneeL: 'l_rear_leg_02_bn_010', rhipR: 'r_rear_leg_01_bn_015', rkneeR: 'r_rear_leg_02_bn_016' };

// Add a morph here (plus its .glb in models/) and it shows up in the menu.
//   springlock: gets the 1:30 springlock failure.  climb: can stab its hands into walls and climb (grip button).
export const MORPH_DEFS = [
  { id: 'springbonnie', label: 'Spring Bonnie', icon: '\u{1F430}', file: 'springbonnie.glb', color: '#e3b52a', springlock: true },
  { id: 'springtrap', label: 'Springtrap', icon: '\u{1F430}', file: 'springtrap.glb', color: '#7d8a3a', springlock: true },
  { id: 'freddy', label: 'Freddy', icon: '\u{1F43B}', file: 'freddy.glb', color: '#9b6a38' },
  { id: 'bonnie', label: 'Bonnie', icon: '\u{1F430}', file: 'bonnie.glb', color: '#4f63c9', hideEndo: true },
  { id: 'chica', label: 'Chica', icon: '\u{1F414}', file: 'chica.glb', color: '#f0c419', hideEndo: true },
  { id: 'foxy', label: 'Foxy', icon: '\u{1F98A}', file: 'foxy.glb', color: '#c8402c', names: FOXY, climb: true, hookHand: 'L' },
  { id: 'mangle', label: 'Mangle', icon: '\u{1F98A}', file: 'mangle.glb', color: '#e8e2e6', names: MANGLE, splitHead: true, floatHand: 'R', extraHeads: ['endo_head_bn_066'] },
];

const cache = new Map();
export function loadMorphAsset(def, onProgress) {
  if (!cache.has(def.id)) cache.set(def.id, loader.loadAsync('./models/' + def.file, onProgress));
  return cache.get(def.id);
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const wp = (b, out = new THREE.Vector3()) => { b.updateWorldMatrix(true, false); return out.setFromMatrixPosition(b.matrixWorld); };
function setWorldQuat(bone, q) { bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_q2); bone.quaternion.copy(_q2.invert().multiply(q)); }
function rotWorld(bone, axis, ang) { bone.parent.updateWorldMatrix(true, false); bone.getWorldQuaternion(_q); _q.premultiply(_q2.setFromAxisAngle(axis, ang)); setWorldQuat(bone, _q); }
function aim(bone, child, target) {
  const bp = wp(bone, _v), cp = wp(child, _v2);
  const d0 = cp.sub(bp).normalize(), d1 = target.clone().sub(bp).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d0, d1);
  bone.getWorldQuaternion(_q); _q.premultiply(q); setWorldQuat(bone, _q);
}
const basisQuat = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

export const FAIL = { laugh: 10, ret: 1.8, laughDelay: 0 };   // seconds
FAIL.total = FAIL.laughDelay + FAIL.laugh + FAIL.ret;

export class Morph {
  constructor(def, gltf) {
    this.def = def;
    this.root = new THREE.Group();              // positioned / scaled / yawed every frame
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.side = THREE.FrontSide; } });
    this.root.updateMatrixWorld(true);
    this.bones = {};
    const all = [];
    this.model.traverse(o => { if (o.isBone) all.push(o); });
    const names = def.names || BIP;
    for (const k in names) this.bones[k] = all.find(b => norm(b.name) === names[k].toLowerCase());
    const B = this.bones;
    const need = ['head', 'upL', 'loL', 'hdL', 'upR', 'loR', 'hdR'].filter(k => !B[k]);
    if (need.length) console.warn(def.id, 'missing bones', need);
    this.rest = new Map(); for (const k in B) if (B[k]) this.rest.set(B[k], B[k].quaternion.clone());
    // rest measurements (model units; root is at identity right now)
    this.qHand0 = { L: B.hdL.getWorldQuaternion(new THREE.Quaternion()), R: B.hdR.getWorldQuaternion(new THREE.Quaternion()) };
    this.qHead0 = B.head.getWorldQuaternion(new THREE.Quaternion());
    // rest hand frame (F = fingers, N = palm): works for T-pose and A-pose rigs
    this.hand0 = {};
    for (const sd of ['L', 'R']) {
      const hd = B['hd' + sd], hp = wp(hd, new THREE.Vector3());
      const kids = hd.children.filter(o => o.isBone && !/dyn|twist/i.test(o.name));
      const mid = kids.find(o => /middle/i.test(o.name)) || kids.sort((a, b) => wp(b, new THREE.Vector3()).distanceTo(hp) - wp(a, new THREE.Vector3()).distanceTo(hp))[0];
      const F0 = mid ? wp(mid, new THREE.Vector3()).sub(hp).normalize() : new THREE.Vector3(sd === 'L' ? 1 : -1, 0, 0);
      const N0 = Math.abs(F0.y) < 0.5 ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(sd === 'L' ? -1 : 1, 0, 0);
      N0.addScaledVector(F0, -N0.dot(F0)).normalize();
      this.hand0[sd] = { F0, Q: basisQuat(F0, N0, new THREE.Vector3().crossVectors(F0, N0)) };
    }
    const eye = this.eyeWorld(new THREE.Vector3());
    this.eyeY0 = eye.y; this.k = 1; this.bodyYaw = 0; this.phase = 0; this.fail = null; this.walk = 0;
    this.baseMin = new THREE.Box3().setFromObject(this.model).min.y;
    this.extra = (def.extraHeads || []).map(n => all.find(b => norm(b.name) === n)).filter(Boolean).map(bone => ({ bone, q0: bone.getWorldQuaternion(new THREE.Quaternion()) }));
    this.setupHeadHiding(all);
    this.parts = []; if (def.springlock) this.setupParts();
    if (def.climb) this.setupHooks();
    this.showHead(true);
  }
  eyeWorld(out) {
    const B = this.bones;
    if (B.eyeL && B.eyeR) return out.addVectors(wp(B.eyeL, _v), wp(B.eyeR, _v2)).multiplyScalar(0.5);
    return wp(B.head, out);
  }
  // Meshes that belong to the head (rigid children of head bones, or skinned meshes mostly weighted to them).
  setupHeadHiding(all) {
    const headSet = new Set(); this.bones.head.traverse(o => { if (o.isBone) headSet.add(o); }); this.headSet = headSet;
    if (this.def.splitHead) this.splitHeadParts(headSet);
    this.headMeshes = [];
    this.model.traverse(m => {
      if (!m.isMesh) return;
      let inHead = false;
      if (m.isSkinnedMesh) {
        const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, acc = new Float32Array(m.skeleton.bones.length);
        for (let i = 0; i < si.count; i++) for (let j = 0; j < 4; j++) acc[si.getComponent(i, j)] += sw.getComponent(i, j);
        let best = 0; for (let i = 1; i < acc.length; i++) if (acc[i] > acc[best]) best = i;
        inHead = headSet.has(m.skeleton.bones[best]);
      } else { for (let p = m.parent; p; p = p.parent) if (headSet.has(p)) { inHead = true; break; } }
      if (inHead || this.splitHeads?.includes(m) || (this.def.hideEndo && /endo/i.test(m.material?.name || ''))) this.headMeshes.push(m);   // endo is hidden from your own eyes (it shows in mirrors)
    });
  }
  // Some models fuse the head into one body mesh. Split such a mesh by triangle (by which bones they are weighted to) so only the head part gets hidden.
  splitHeadParts(headSet) {
    const list = []; this.model.traverse(m => { if (m.isSkinnedMesh && m.geometry.index) list.push(m); });
    for (const m of list) {
      const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = m.skeleton.bones, idx = g.index.array;
      const inHead = new Float32Array(si.count);
      for (let i = 0; i < si.count; i++) { let w = 0; for (let j = 0; j < 4; j++) if (headSet.has(bones[si.getComponent(i, j)])) w += sw.getComponent(i, j); inHead[i] = w; }
      const a = [], b = [];
      for (let t = 0; t < idx.length; t += 3) ((inHead[idx[t]] + inHead[idx[t + 1]] + inHead[idx[t + 2]]) > 1.5 ? a : b).push(idx[t], idx[t + 1], idx[t + 2]);
      if (!a.length) continue;
      const mk = list => { const ng = new THREE.BufferGeometry(); for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]); ng.setIndex(list); ng.boundingSphere = null; return ng; };
      const head = new THREE.SkinnedMesh(mk(a), m.material); head.name = m.name + '_head'; head.frustumCulled = false;
      head.position.copy(m.position); head.quaternion.copy(m.quaternion); head.scale.copy(m.scale);
      m.parent.add(head); head.updateMatrixWorld(true); head.bind(m.skeleton, m.bindMatrix);
      m.geometry = mk(b); m.frustumCulled = false; this.splitHeads = (this.splitHeads || []).concat(head);
    }
  }
  // The head is hidden from your own eyes by moving it to layer 5, which only mirrors / reflections look at.
  showHead(v) { for (const m of this.headMeshes) m.layers.set(v ? 0 : 5); }

  // Rigid suit plates (meshes parented to bones). Each gets an outward direction for the springlock burst.
  setupParts() {
    this.parts = [];
    const tops = new Set();
    this.model.traverse(m => {
      if (!m.isMesh || m.isSkinnedMesh) return;
      let n = m; while (n.parent && !n.parent.isBone) n = n.parent;
      if (n.parent && n.parent.isBone && !this.headSet.has(n.parent)) tops.add(n);
    });
    const box = new THREE.Box3();
    for (const node of tops) {
      const bone = node.parent; box.setFromObject(node); if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3());
      const child = bone.children.find(o => o.isBone);
      let axisPt;
      if (child) { const a = wp(bone, new THREE.Vector3()), b = wp(child, new THREE.Vector3()), ab = b.clone().sub(a), t = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9))); axisPt = a.addScaledVector(ab, t); }
      else axisPt = new THREE.Vector3(0, c.y, 0);
      const dir = c.clone().sub(axisPt); dir.y *= 0.5;
      if (dir.length() < 1e-4) dir.set(Math.random() - 0.5, 0.3, Math.random() - 0.5);
      dir.normalize();
      bone.updateWorldMatrix(true, false);
      const dirLocal = dir.clone().transformDirection(bone.matrixWorld.clone().invert());
      this.parts.push({ m: node, rest: node.position.clone(), restQ: node.quaternion.clone(), dirLocal, scale: bone.matrixWorld.getMaxScaleOnAxis(), amp: 0.07 + Math.random() * 0.1, delay: Math.random() * 0.28, axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), tilt: (Math.random() - 0.3) * 0.5, ph: Math.random() * 6.28 });
    }
  }

  // Foxy: a steel hook for each hand (the model already has one on the left; the right gets a matching one so both hands can stab).
  setupHooks() {
    const B = this.bones, mat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 0.95, roughness: 0.28 });
    const u = this.eyeY0 / 1.6;                       // metres -> model units
    this.hooks = {};
    for (const sd of ['L', 'R']) {
      if (sd === this.def.hookHand) continue;         // this hand's hook is already part of the model
      const hd = B['hd' + sd], g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * u, 0.016 * u, 0.12 * u, 10), mat); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.06 * u; g.add(shaft);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.05 * u, 0.011 * u, 8, 20, Math.PI * 1.25), mat); arc.position.set(0.12 * u, -0.05 * u, 0); arc.rotation.z = Math.PI / 2; g.add(arc);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014 * u, 0.045 * u, 10), mat); tip.position.set(0.075 * u, -0.072 * u, 0); tip.rotation.z = Math.PI * 0.72; g.add(tip);
      // orient so +X (shaft) follows the hand's finger direction
      const F0 = this.hand0[sd].F0; const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), F0);
      hd.updateWorldMatrix(true, false); const hq = hd.getWorldQuaternion(new THREE.Quaternion());
      g.quaternion.copy(hq.invert().multiply(q)); g.position.copy(new THREE.Vector3(0, 0, 0));
      hd.add(g); g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.hooks[sd] = g;
      this.addTrigger(sd, g, new THREE.Vector3(0.08 * u, -0.068 * u, 0));
    }
    // the hook that is already part of the model: put the trigger block at the far tip of that hand's hook
    const sd = this.def.hookHand, hd = B['hd' + sd]; if (!hd) return;
    this.model.updateMatrixWorld(true);
    const sub = new Set(); hd.traverse(o => { if (o.isBone) sub.add(o); });
    const hp = wp(hd, new THREE.Vector3()), v = new THREE.Vector3(), pts = [];
    this.model.traverse(m => {
      if (!m.isSkinnedMesh) return;
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, bones = m.skeleton.bones;
      for (let i = 0; i < si.count; i++) {
        let w = 0; for (let j = 0; j < 4; j++) if (sub.has(bones[si.getComponent(i, j)])) w += sw.getComponent(i, j);
        if (w > 0.8) { m.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(m.matrixWorld)); }
      }
    });
    let tip = null, best = 0; for (const q of pts) { const d = q.distanceTo(hp); if (d > best) { best = d; tip = q; } }
    if (tip) { const c = new THREE.Vector3(); for (const q of pts) c.add(q); c.divideScalar(pts.length); tip.lerp(c, 0.12); this.addTrigger(sd, hd, hd.worldToLocal(tip.clone())); }
    else this.addTrigger(sd, hd, new THREE.Vector3());
  }
  // a small block inside the hook; its world position is what bites into walls (invisible unless ?showblocks=1)
  addTrigger(sd, parent, pos) {
    const u = this.eyeY0 / 1.6, b = new THREE.Mesh(new THREE.BoxGeometry(0.03 * u, 0.03 * u, 0.03 * u), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
    b.position.copy(pos); b.visible = /showblocks/.test(location.search); b.frustumCulled = false; parent.add(b);
    (this.triggers ||= {})[sd] = b;
  }
  triggerPos(sd, out) { const b = this.triggers?.[sd]; return b ? b.getWorldPosition(out) : null; }

  calibrate(eyeHeight) { this.k = THREE.MathUtils.clamp(eyeHeight, 1.1, 2.1) / this.eyeY0; this.root.scale.setScalar(this.k); }
  startFail() { this.fail = { t: 0 }; this.snapped = false; }
  get failing() { return !!this.fail; }

  // d: { eye:Vector3, headQuat:Quaternion, L:{pos,quat}|null, R:{...}|null, speed:number, floorY:number, laugh:number }
  update(dt, d) {
    const B = this.bones, k = this.k, R = this.rest;
    for (const [b, q] of R) b.quaternion.copy(q);
    // ---- body yaw follows the head (and the walking direction) ----
    _v.set(0, 0, -1).applyQuaternion(d.headQuat); const headYaw = Math.atan2(-_v.x, -_v.z);
    let diff = Math.atan2(Math.sin(headYaw - this.bodyYaw), Math.cos(headYaw - this.bodyYaw));
    if (d.speed > 0.3 || Math.abs(diff) > 0.75) this.bodyYaw += diff * Math.min(1, dt * (d.speed > 0.3 ? 7 : 4));
    this.root.quaternion.setFromAxisAngle(_v.set(0, 1, 0), this.bodyYaw).multiply(Y180);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), this.bodyYaw);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQ);
    const leftAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion); // model +X (the character's left) in world
    this.root.scale.setScalar(k);
    this.root.updateMatrixWorld(true);

    // ---- springlock failure timeline ----
    let f = null, laugh = 0, burst = 0, hold = 0;
    if (this.fail) {
      this.fail.t += dt; f = this.fail.t;
      if (f > FAIL.total) { this.fail = null; f = null; }
    }
    if (f !== null) {
      const tl = f - FAIL.laughDelay;                      // time since the laugh began
      laugh = tl > 0 ? d.laugh : 0;
      const endLaugh = FAIL.laughDelay + FAIL.laugh;
      hold = 1 - smooth((f - endLaugh) / FAIL.ret);        // plates stay out while laughing, then ease back in
      burst = hold;
      // laughing torso: lean back, bob with the laugh loudness
      if (B.spine) {
        const sh = Math.sin(f * 24) * 0.05 * laugh;
        rotWorld(B.spine, leftAxis, (-0.16 * Math.min(1, tl * 3 + 0.5) * hold) - 0.1 * laugh + sh);
      }
      if (B.jaw) rotWorld(B.jaw, leftAxis, 0.55 * laugh * hold + (f < 0.4 ? 0.2 * (1 - f / 0.4) : 0));
    }
    // ---- walking legs ----
    const sp = Math.min(1, d.speed / 1.4);
    this.phase += d.speed * dt * 2.6; this.walk += (sp - this.walk) * Math.min(1, dt * 8);
    if (this.walk > 0.02 && B.hipL) {
      const s = Math.sin(this.phase), amp = 0.55 * this.walk;
      rotWorld(B.hipL, leftAxis, -s * amp); rotWorld(B.hipR, leftAxis, s * amp);
      B.kneeL.updateWorldMatrix(true, false); rotWorld(B.kneeL, leftAxis, Math.max(0, Math.sin(this.phase + 1.2)) * 0.8 * this.walk);
      B.kneeR.updateWorldMatrix(true, false); rotWorld(B.kneeR, leftAxis, Math.max(0, -Math.sin(this.phase + 1.2)) * 0.8 * this.walk);
      if (B.rhipL) {                                       // four-legged: the rear pair walks opposite the front pair
        rotWorld(B.rhipL, leftAxis, s * amp); rotWorld(B.rhipR, leftAxis, -s * amp);
        B.rkneeL.updateWorldMatrix(true, false); rotWorld(B.rkneeL, leftAxis, Math.max(0, -Math.sin(this.phase + 1.2)) * 0.8 * this.walk);
        B.rkneeR.updateWorldMatrix(true, false); rotWorld(B.rkneeR, leftAxis, Math.max(0, Math.sin(this.phase + 1.2)) * 0.8 * this.walk);
      }
    }
    // ---- head follows the headset ----
    this.root.updateMatrixWorld(true);
    setWorldQuat(B.head, _q.copy(d.headQuat).multiply(Y180).multiply(this.qHead0));
    if (this.extra) for (const e of this.extra) { this.root.updateMatrixWorld(true); setWorldQuat(e.bone, _q.copy(d.headQuat).multiply(Y180).multiply(e.q0)); }   // second head turns with yours
    // keep the eyes exactly at the camera (the animation above moved the bones), by sliding the whole avatar
    this.root.updateMatrixWorld(true);
    this.eyeWorld(_v); this.root.position.add(_v2.copy(d.eye).sub(_v));
    this.root.updateMatrixWorld(true);

    // ---- arms (two-bone IK to the controllers) ----
    const pelvis = wp(B.pelvis || B.spine, new THREE.Vector3());
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1;                    // world side relative to the body (left = -right)
      const up = B['up' + side], lo = B['lo' + side], hd = B['hd' + side];
      const tgt = d[side];
      let handQ, wrist;
      const gq = tgt ? tgt.quat : yawQ, h0 = this.hand0[side];
      const Fc = new THREE.Vector3(0, 0, -1).applyQuaternion(gq), Nc = new THREE.Vector3(sg > 0 ? -1 : 1, 0, 0).applyQuaternion(gq);   // finger / palm direction from the controller
      handQ = basisQuat(Fc, Nc, new THREE.Vector3().crossVectors(Fc, Nc)).multiply(_q2.copy(h0.Q).invert()).multiply(this.qHand0[side]);
      if (tgt) {
        wrist = tgt.pos.clone().addScaledVector(Fc, -0.07);
      } else {
        wrist = pelvis.clone().addScaledVector(right, sg * 0.3 * k * 1.3).addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, 0.12 * k * 1.3, 0));
      }
      if (this.def.floatHand === side) {                    // a detached hand (Mangle): it simply follows the controller, the arm stretches to it
        if (tgt) { const sh = wp(up, new THREE.Vector3()), to = wrist.clone().sub(sh); if (to.length() > 1.1 * k) to.setLength(1.1 * k); hd.parent.updateWorldMatrix(true, false); hd.position.copy(hd.parent.worldToLocal(sh.add(to))); setWorldQuat(hd, handQ); }
        continue;
      }
      const S = wp(up, new THREE.Vector3()), E = wp(lo, new THREE.Vector3()), W = wp(hd, new THREE.Vector3());
      const l1 = S.distanceTo(E), l2 = E.distanceTo(W);
      const toT = wrist.clone().sub(S); let dist = toT.length(); const dir = toT.divideScalar(Math.max(dist, 1e-6));
      dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 0.02), (l1 + l2) * 0.998);
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pole = new THREE.Vector3(0, -1, 0).addScaledVector(right, sg * 0.55).addScaledVector(fwd, -0.35);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const Ep = S.clone().addScaledVector(dir, a).addScaledVector(pole, h);
      aim(up, lo, Ep);
      aim(lo, hd, S.clone().addScaledVector(dir, dist));
      setWorldQuat(hd, handQ);
    }

    // ---- springlock plates ----
    if (f !== null) {
      const ks = 1 / k;                                    // meters -> model units
      for (const p of this.parts) {
        const t = f - p.delay;
        let o = 0, rot = 0;
        if (t > 0) {
          const rise = 1 - Math.exp(-t * 38);
          const ring = Math.exp(-t * 3.4) * Math.cos(t * 24) * 0.45;
          o = rise * (0.62 + 0.38 * Math.exp(-t * 2.2)) + ring * rise;
          o += laugh * 0.16 * Math.sin(f * 41 + p.ph);       // the plates rattle with the laugh
          o *= burst; rot = o * p.tilt;
        }
        const disp = p.amp * ks / p.scale * o;
        p.m.position.copy(p.rest).addScaledVector(p.dirLocal, disp);
        p.m.quaternion.copy(p.restQ).premultiply(_q.setFromAxisAngle(p.axis, rot));
      }
      this.partsDirty = true;
    } else if (this.partsDirty) {
      for (const p of this.parts) { p.m.position.copy(p.rest); p.m.quaternion.copy(p.restQ); }
      this.partsDirty = false;
    }
    this.root.updateMatrixWorld(true);
  }
}

// reflect a world position / orientation across a plane (point P, unit normal N): for the mirror
export function reflectPos(p, P, N, out = new THREE.Vector3()) { const d = p.clone().sub(P).dot(N); return out.copy(p).addScaledVector(N, -2 * d); }
export function reflectQuat(q, N, out = new THREE.Quaternion()) {
  const refl = v => v.clone().addScaledVector(N, -2 * v.dot(N));
  const x = refl(new THREE.Vector3(1, 0, 0).applyQuaternion(q)).negate(), y = refl(new THREE.Vector3(0, 1, 0).applyQuaternion(q)), z = refl(new THREE.Vector3(0, 0, 1).applyQuaternion(q));
  return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
}
