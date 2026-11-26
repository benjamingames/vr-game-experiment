// FNAF Morphs: a "morph" is a rigged animatronic model you wear. Your head, hands and walking drive the bones,
// (the springlock failure only plays its sound now; the animation was removed).
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

const GLAM = { pelvis: 'root_jnt', spine: 'spine_jnt', neck: 'neck_jnt', head: 'head_jnt', jaw: 'jaw_jnt', eyeL: 'l_eye_jnt', eyeR: 'r_eye_jnt',
  upL: 'l_shoulder_jnt', loL: 'l_elbow_jnt', hdL: 'l_wrist_jnt', upR: 'r_shoulder_jnt', loR: 'r_elbow_jnt', hdR: 'r_wrist_jnt',
  hipL: 'l_upperleg_jnt', kneeL: 'l_knee_jnt', footL: 'l_ankle_jnt', hipR: 'r_upperleg_jnt', kneeR: 'r_knee_jnt', footR: 'r_ankle_jnt' };
const PUPPET = { pelvis: 'p_pelvis', spine: 'p_spine', neck: 'p_neck', head: 'p_head', eyeL: 'p_eyel', eyeR: 'p_eyer',
  upL: 'p_upl', loL: 'p_lol', hdL: 'p_hdl', upR: 'p_upr', loR: 'p_lor', hdR: 'p_hdr',
  hipL: 'p_hipl', kneeL: 'p_kneel', footL: 'p_footl', hipR: 'p_hipr', kneeR: 'p_kneer', footR: 'p_footr' };
const ENDO = { ...BIP, jaw: 'bip_jaw_endo' };

// Add a morph here (plus its .glb in models/) and it shows up in the menu.
//   springlock: gets the 1:30 springlock failure.  climb: can stab its hands into walls and climb (grip button).
export const MORPH_DEFS = [
  { id: 'springbonnie', label: 'Spring Bonnie', icon: '\u{1F430}', file: 'springbonnie.glb', color: '#e3b52a', springlock: true },
  { id: 'springtrap', label: 'Springtrap', icon: '\u{1F430}', file: 'springtrap.glb', color: '#7d8a3a', springlock: true, mask: 'bip_mask_28' },
  { id: 'freddy', label: 'Freddy', icon: '\u{1F43B}', file: 'freddy.glb', color: '#9b6a38' },
  { id: 'bonnie', label: 'Bonnie', icon: '\u{1F430}', file: 'bonnie.glb', color: '#4f63c9', hideEndo: true },
  { id: 'chica', label: 'Chica', icon: '\u{1F414}', file: 'chica.glb', color: '#f0c419', hideEndo: true },
  { id: 'foxy', label: 'Foxy', icon: '\u{1F98A}', file: 'foxy.glb', color: '#c8402c', names: FOXY, climb: true, hookHand: 'L' },
  { id: 'mangle', label: 'Mangle', icon: '\u{1F98A}', file: 'mangle.glb', color: '#e8e2e6', names: MANGLE, keepPose: true, splitHead: true, floatHand: 'R', extraHeads: ['endo_head_bn_066'] },
  { id: 'glamfreddy', label: 'Glam Freddy', icon: '\u{1F43B}', file: 'glamfreddy.glb', color: '#c9a227', names: GLAM },
  { id: 'puppet', label: 'Puppet', icon: '\u{1F3AD}', file: 'puppet.glb', color: '#e9e2b8', names: PUPPET, autoRig: 'puppet' },
  { id: 'endo', label: 'Endo', icon: '\u{1F916}', file: 'endo.glb', color: '#8c96a3', names: ENDO },
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

// The Puppet model has no skeleton (just rigid pieces). Build bones from its proportions and hang the pieces on them.
// Pieces that span a joint (the sleeves, the legs) are split by triangle height so the elbow / knee can bend.
function rigPuppet(model) {
  model.updateMatrixWorld(true);
  const bones = {}, P = (n, parent, x, y, z) => {
    const b = new THREE.Bone(); b.name = n; (parent || model).add(b);
    const base = parent ? parent.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(); b.position.set(x, y, z).sub(base); bones[n] = b; return b;
  };
  const cx = -0.05;
  const pel = P('p_pelvis', null, cx, 3.5, 0), spn = P('p_spine', pel, cx, 4.6, 0), nck = P('p_neck', spn, cx, 5.8, 0), hed = P('p_head', nck, cx, 6.05, 0);
  P('p_eyel', hed, cx + 0.2, 6.68, 0.32); P('p_eyer', hed, cx - 0.2, 6.68, 0.32);
  for (const [sd, sg] of [['l', 1], ['r', -1]]) {
    const up = P('p_up' + sd, spn, cx + sg * 0.2, 5.45, 0), lo = P('p_lo' + sd, up, cx + sg * 0.75, 4.4, 0), hd = P('p_hd' + sd, lo, cx + sg * 1.32, 3.4, 0);
    P('p_tip' + sd, hd, cx + sg * 1.4, 2.5, 0);
    const hip = P('p_hip' + sd, pel, cx + sg * 0.3, 3.4, 0), kn = P('p_knee' + sd, hip, cx + sg * 0.33, 1.85, 0); P('p_foot' + sd, kn, cx + sg * 0.33, 0.12, 0);
  }
  const meshes = []; model.traverse(o => { if (o.isMesh) meshes.push(o); else if (o.isLine || o.isPoints) o.visible = false; });   // (the model ships a floor ring line)
  const box = new THREE.Box3(), c = new THREE.Vector3(), tmp = new THREE.Vector3();
  const attach = (m, bone) => { bone.attach(m); };
  const splitBy = (m, key) => {   // key(centroid) -> bone; builds one mesh per bone from the triangles
    const g = m.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count, groups = new Map();
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, d = idx ? idx[t + 2] : t + 2;
      tmp.set(0, 0, 0); for (const i of [a, b, d]) tmp.add(c.fromBufferAttribute(pos, i)); tmp.divideScalar(3).applyMatrix4(m.matrixWorld);
      const k = key(tmp); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a, b, d);
    }
    for (const [k, list] of groups) {
      const ng = new THREE.BufferGeometry(); for (const nm in g.attributes) ng.setAttribute(nm, g.attributes[nm]); ng.setIndex(list);
      const m2 = new THREE.Mesh(ng, m.material); m2.frustumCulled = false; m2.applyMatrix4(m.matrixWorld); model.add(m2); m2.updateMatrixWorld(true); attach(m2, bones[k]);
    }
    m.visible = false; m.parent.remove(m);
  };
  for (const m of meshes) {
    box.setFromObject(m); box.getCenter(c);
    if (box.max.x - box.min.x > 3 && box.max.y - box.min.y < 0.05) { m.visible = false; continue; }   // the floor disc that comes with the model
    const sd = c.x > cx ? 'l' : 'r', ay = Math.abs(c.x - cx);
    if (c.y > 6.0) attach(m, bones.p_head);
    else if (ay > 0.45 && c.y > 2.3) {                                   // arms
      if (box.max.y - box.min.y > 2.5) splitBy(m, p => p.y > 4.45 ? 'p_up' + sd : p.y > 3.4 ? 'p_lo' + sd : 'p_hd' + sd);
      else attach(m, bones['p_lo' + sd]);
    } else if (c.y < 2.5 || ay > 0.1 && c.y < 3.8 && box.min.y < 0.5) {  // legs
      if (box.max.y - box.min.y > 3) splitBy(m, p => p.y > 1.9 ? 'p_hip' + sd : 'p_knee' + sd);
      else attach(m, bones['p_knee' + sd]);
    } else if (box.min.y < 0.5 && box.max.y > 3) splitBy(m, p => p.y > 1.9 ? 'p_hip' + (p.x > cx ? 'l' : 'r') : 'p_knee' + (p.x > cx ? 'l' : 'r'));
    else attach(m, bones.p_spine);
  }
}

export class Morph {
  constructor(def, gltf) {
    this.def = def;
    this.root = new THREE.Group();              // positioned / scaled / yawed every frame
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    if (def.autoRig === 'puppet') rigPuppet(this.model);
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
    if (def.climb) this.setupHooks();
    if (def.mask) this.setupMask();
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

  // Springtrap's face mask hinges up over the head (pull up on it) and shows the red head underneath.
  setupMask() {
    const node = this.model.getObjectByName(this.def.mask); if (!node) return;
    this.model.updateMatrixWorld(true);
    const par = node.parent, bb = new THREE.Box3(), pts = [], box = new THREE.Box3().setFromObject(node);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(par.worldToLocal(new THREE.Vector3(x, y, z)));
    bb.setFromPoints(pts);
    const pivot = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, bb.min.z + (bb.max.z - bb.min.z) * 0.3);
    this.mask = { node, pos: node.position.clone(), quat: node.quaternion.clone(), pivot, amt: 0, target: 0 };
  }
  setMask(v) { if (this.mask) this.mask.target = THREE.MathUtils.clamp(v, 0, 1); }
  get maskAmount() { return this.mask ? this.mask.amt : 0; }
  applyMask(dt) {
    const m = this.mask; if (!m) return;
    m.amt += (m.target - m.amt) * Math.min(1, dt * 9);
    const a = -2.0 * smooth(m.amt), qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
    m.node.quaternion.copy(qr).multiply(m.quat);
    m.node.position.copy(m.pos).sub(m.pivot).applyQuaternion(qr).add(m.pivot);
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

    // the springlock failure keeps its timing (the sound plays) but has no animation
    if (this.fail) { this.fail.t += dt; if (this.fail.t > FAIL.total) this.fail = null; }
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
      if (!tgt && this.def.keepPose) continue;               // keep the model's own pose until a controller drives this arm
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

    this.applyMask(dt);

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
