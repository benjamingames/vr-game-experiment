// FNAF Morphs: a "morph" is a rigged animatronic model you wear. Your head, hands and walking drive the bones,
// and the springlock failure plays on top (suit plates burst outward, the jaw and body shake with the laugh).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const BONE_RE = {
  pelvis: /^bip_pelvis/i, spine: /^bip_spine_0/i, neck: /^bip_neck/i, head: /^bip_head(_\d+|_Armature)$/i, jaw: /^bip_jaw(_\d+|_Armature)$/i,
  eyeL: /^bip_eye_L/i, eyeR: /^bip_eye_R/i,
  upL: /^bip_upperarm_L/i, loL: /^bip_lowerarm_L/i, hdL: /^bip_hand_L/i, upR: /^bip_upperarm_R/i, loR: /^bip_lowerarm_R/i, hdR: /^bip_hand_R/i,
  hipL: /^bip_hip_L/i, kneeL: /^bip_knee_L/i, footL: /^bip_foot_L/i, hipR: /^bip_hip_R/i, kneeR: /^bip_knee_R/i, footR: /^bip_foot_R/i,
};

// Add a morph here (plus its .glb in models/) and it shows up in the menu.
export const MORPH_DEFS = [
  { id: 'springbonnie', label: 'Spring Bonnie', file: 'springbonnie.glb', color: '#e3b52a', springlock: true },
  { id: 'springtrap', label: 'Springtrap', file: 'springtrap.glb', color: '#7d8a3a', springlock: true },
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

// hand-bone alignment: controller grip space -> the rest hand (fingers forward, palm inward), derived from the T-pose
const R_L = basisQuat(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
const R_R = basisQuat(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));

export const FAIL = { laugh: 10, ret: 1.8, laughDelay: 0.55 };   // seconds
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
    for (const k in BONE_RE) this.bones[k] = all.find(b => BONE_RE[k].test(b.name));
    const B = this.bones;
    const need = ['head', 'upL', 'loL', 'hdL', 'upR', 'loR', 'hdR'].filter(k => !B[k]);
    if (need.length) console.warn(def.id, 'missing bones', need);
    this.rest = new Map(); for (const k in B) if (B[k]) this.rest.set(B[k], B[k].quaternion.clone());
    // rest measurements (model units; root is at identity right now)
    this.qHand0 = { L: B.hdL.getWorldQuaternion(new THREE.Quaternion()), R: B.hdR.getWorldQuaternion(new THREE.Quaternion()) };
    this.qHead0 = B.head.getWorldQuaternion(new THREE.Quaternion());
    const eye = this.eyeWorld(new THREE.Vector3());
    this.eyeY0 = eye.y; this.k = 1; this.bodyYaw = 0; this.phase = 0; this.fail = null; this.walk = 0;
    this.baseMin = new THREE.Box3().setFromObject(this.model).min.y;
    this.setupHeadHiding(all);
    this.setupParts();
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
      if (inHead) this.headMeshes.push(m);
    });
  }
  showHead(v) { for (const m of this.headMeshes) m.visible = v; }

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
    }
    // ---- head follows the headset ----
    this.root.updateMatrixWorld(true);
    setWorldQuat(B.head, _q.copy(d.headQuat).multiply(Y180).multiply(this.qHead0));
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
      const Rm = side === 'L' ? R_L : R_R;
      if (tgt) {
        handQ = tgt.quat.clone().multiply(Rm).multiply(this.qHand0[side]);
        const F = new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0).applyQuaternion(handQ);   // finger direction in world
        wrist = tgt.pos.clone().addScaledVector(F, -0.07);
      } else {
        handQ = yawQ.clone().multiply(Rm).multiply(this.qHand0[side]);
        wrist = pelvis.clone().addScaledVector(right, sg * 0.3 * k * 1.3).addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, 0.12 * k * 1.3, 0));
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
