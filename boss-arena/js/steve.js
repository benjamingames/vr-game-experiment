// Boss Arena: the player's avatar, the Minecraft player model, driven with simple R6-style movement:
// six body parts (head, torso, two arms, two legs) that swing stiffly from their joints.
// Same public API the game used for the old character: play / setHold / update / setFirstPerson / setArmsVisible.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as T from './textures.js';

export const gltfLoader = new GLTFLoader();
export const loadGLB = (url, onProgress) => new Promise((res, rej) => gltfLoader.load(url, res, onProgress, rej));

// scale a skinned model to `height` metres and stand it on y = 0 (skeletons must be updated first or the box is garbage)
export function fitHeight(model, root, height) {
  root.updateMatrixWorld(true);
  model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3());
  const s = height / size.y; model.scale.multiplyScalar(s); model.position.y -= box.min.y * s;
  root.updateMatrixWorld(true);
  return { scale: s, rawHeight: size.y };
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => x * x * (3 - 2 * x);
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

// ---- the Minecraft player, built from six textured blocks (standard 64x64 skin layout) ----
const U = 1.8 / 32;   // one skin pixel in metres at 1.8 m tall
function skinBox(w, h, d, u, v, mat) {
  const g = new THREE.BoxGeometry(w * U, h * U, d * U), uv = g.attributes.uv;
  // three face order: +x, -x, +y, -y, +z, -z  (+x = the character's left, +z = front)
  const rect = [[u + d + w, v + d, d, h], [u, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + d, v + d, w, h], [u + d + w + d, v + d, w, h]];
  rect.forEach(([x, y, rw, rh], f) => {
    const u0 = x / 64, u1 = (x + rw) / 64, vt = 1 - y / 64, vb = 1 - (y + rh) / 64;
    uv.setXY(f * 4, u0, vt); uv.setXY(f * 4 + 1, u1, vt); uv.setXY(f * 4 + 2, u0, vb); uv.setXY(f * 4 + 3, u1, vb);
  });
  return new THREE.Mesh(g, mat);
}
function limb(mat, w, h, d, u, v, x, y) {   // pivot at the top of the block so it swings from the shoulder / hip
  const grp = new THREE.Group(); grp.position.set(x * U, y * U, 0); grp.rotation.order = 'YXZ';
  const m = skinBox(w, h, d, u, v, mat); m.position.y = -h * U / 2; m.frustumCulled = false; grp.add(m); grp.mesh = m; return grp;
}
class Joint {
  constructor(grp) { this.g = grp; grp.rotation.order = 'YXZ'; }
  // pitch: + swings a hanging limb tip BACKWARD (callers pass forward = -pitch); + tips an upright part (head/spine) forward.
  // roll: + swings the tip toward +x (the character's left). yaw: twist.
  set(pitch, roll = 0, yaw = 0) { this.g.rotation.set(pitch, yaw, roll); }
}

export class Steve {
  // yawOffset turns the model so it faces +Z.
  constructor({ height = 1.8, yawOffset = 0 } = {}) {
    this.root = new THREE.Group(); this.root.scale.setScalar(height / 1.8);
    const pivot = new THREE.Group(); pivot.rotation.y = yawOffset; this.root.add(pivot);
    const tex = new THREE.TextureLoader().load('./models/steve_skin.png'); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, alphaTest: 0.5 });
    const rig = this.rig = new THREE.Group(); pivot.add(rig);
    const spine = new THREE.Group(); spine.position.y = 12 * U; rig.add(spine);          // hips
    const torso = skinBox(8, 12, 4, 16, 16, mat); torso.position.y = 6 * U; spine.add(torso);
    const head = new THREE.Group(); head.position.y = 12 * U; spine.add(head);           // neck
    const hm = skinBox(8, 8, 8, 0, 0, mat); hm.position.y = 4 * U; head.add(hm);
    const larm = limb(mat, 4, 12, 4, 32, 48, 6, 12), rarm = limb(mat, 4, 12, 4, 40, 16, -6, 12);   // +x = left
    spine.add(larm, rarm);
    const lleg = limb(mat, 4, 12, 4, 16, 48, 2, 12), rleg = limb(mat, 4, 12, 4, 0, 16, -2, 12);
    lleg.position.y = rleg.position.y = 12 * U; rig.add(lleg, rleg);
    for (const m of [torso, hm]) m.frustumCulled = false;
    this.parts = { head: [hm], body: [torso], rarm: [rarm.mesh], larm: [larm.mesh], lleg: [lleg.mesh], rleg: [rleg.mesh] };
    this.j = { spine: new Joint(spine), head: new Joint(head), larm: new Joint(larm), rarm: new Joint(rarm), lleg: new Joint(lleg), rleg: new Joint(rleg) };
    this.t = 0; this.phase = 0; this.once = null; this.onceT = 0; this.hold = null; this.side = 'R';
    const P = () => ({ y: 0, spine: [0, 0, 0], head: [0, 0, 0], larm: [0, 0, 0], rarm: [0, 0, 0], lleg: [0, 0, 0], rleg: [0, 0, 0] });
    this.cur = P(); this.tgt = P(); this._mk = P;
    // soft contact shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.shadowBlobTex(), transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.scale.set(0.9, 0.9, 1); sh.renderOrder = 1; this.shadow = sh; this.root.add(sh);
    this.apply();
  }

  setFirstPerson(on) { for (const m of this.parts.head) m.visible = !on; }
  setArmsVisible(on) { for (const m of [...this.parts.rarm, ...this.parts.larm]) m.visible = on; }
  play(name) {
    const dur = { punch: 0.38, wave: 2.0, taunt: 2.0, cheer: 2.2, hurt: 0.6 }[name]; if (!dur) return;
    if (name === 'punch') this.side = this.side === 'R' ? 'L' : 'R';
    this.once = { name, dur, side: this.side }; this.onceT = 0;
  }
  setHold(n) { this.hold = n; }

  update(dt, speed = 0) {
    this.t += dt;
    const run = clamp01((speed - 2.8) / 2.0), walkW = clamp01(speed / 1.2);
    this.phase += dt * Math.PI * 2 * (speed / lerp(1.6, 2.6, run));
    const T0 = this.tgt, ph = this.phase, s = Math.sin(ph);
    // ---- R6 style: every limb is a stiff block swinging from its joint. forward = positive here ----
    const swing = lerp(0.75, 1.15, run) * walkW, idleSway = Math.sin(this.t * 1.6) * 0.04 * (1 - walkW);
    T0.y = Math.abs(Math.cos(ph)) * 0.035 * walkW;
    T0.lleg = [s * swing, 0, 0]; T0.rleg = [-s * swing, 0, 0];
    T0.larm = [-s * swing * 0.9 + idleSway, 0.05, 0]; T0.rarm = [s * swing * 0.9 - idleSway, -0.05, 0];
    T0.spine = [run * 0.12, 0, 0]; T0.head = [0, 0, 0];

    // ---- upper-body actions (arms/torso only; legs keep walking) ----
    let ov = null, w = 0;
    const arm = (f, r = 0) => [f, r, 0];
    if (this.hold === 'block') { ov = { larm: arm(1.25, -0.25), rarm: arm(1.25, 0.25), spine: [0.08, 0, 0] }; w = 1; }
    if (this.once) {
      this.onceT += dt; const { name, dur, side } = this.once, k = this.onceT / dur;
      w = Math.min(clamp01(this.onceT / 0.05), clamp01((dur - this.onceT) / 0.1));
      if (name === 'punch') { const a = kfPunch(k); ov = side === 'R' ? { rarm: arm(a * 1.7), spine: [0, -a * 0.18, 0] } : { larm: arm(a * 1.7), spine: [0, a * 0.18, 0] }; }
      else if (name === 'wave') ov = { rarm: arm(Math.sin(this.onceT * 9) * 0.35, -2.9), head: [0, 0, 0.0] };
      else if (name === 'taunt') ov = { larm: arm(0, 1.55), rarm: arm(0, -1.55), spine: [-0.06, 0, 0], y: Math.abs(Math.sin(this.onceT * 5)) * -0.0 };
      else if (name === 'cheer') ov = { larm: arm(0.15 * Math.sin(this.onceT * 14), 2.8), rarm: arm(-0.15 * Math.sin(this.onceT * 14), -2.8), y: Math.abs(Math.sin(this.onceT * 7)) * 0.16 };
      else if (name === 'hurt') { const d = 1 - k; ov = { spine: [-0.5 * d, 0.2 * Math.sin(k * 20) * d, 0], head: [-0.3 * d, 0, 0], larm: arm(0.4 * d, 0.9 * d), rarm: arm(0.4 * d, -0.9 * d) }; w = Math.min(1, this.onceT * 20); }
      if (this.onceT >= dur) this.once = null;
    }
    if (ov) for (const key of ['larm', 'rarm', 'spine', 'head']) if (ov[key]) for (let i = 0; i < 3; i++) T0[key][i] = lerp(T0[key][i], ov[key][i], w);
    if (ov && ov.y !== undefined) T0.y += ov.y * w;

    const rate = 1 - Math.exp(-dt * 26), c = this.cur;
    c.y += (T0.y - c.y) * rate;
    for (const key of ['larm', 'rarm', 'lleg', 'rleg', 'spine', 'head']) for (let i = 0; i < 3; i++) c[key][i] += (T0[key][i] - c[key][i]) * rate;
    this.apply();
  }

  apply() {
    const c = this.cur, j = this.j;
    // forward swing f  ->  pitch = -f (model faces +Z, see Joint.set)
    j.larm.set(-c.larm[0], c.larm[1]); j.rarm.set(-c.rarm[0], c.rarm[1]);
    j.lleg.set(-c.lleg[0], c.lleg[1]); j.rleg.set(-c.rleg[0], c.rleg[1]);
    // spine / head point UP, so a positive pitch tips them forward (the opposite sign to the hanging limbs)
    j.spine.set(c.spine[0], c.spine[2], c.spine[1]); j.head.set(c.head[0], c.head[2], c.head[1]);
    this.rig.position.y = c.y;
  }
}
function kfPunch(k) { // 0..1..0: quick raise, short hold, drop
  if (k < 0.25) return ease(k / 0.25); if (k < 0.5) return 1; return 1 - ease((k - 0.5) / 0.5);
}

// a blocky hand for the VR controllers (skin colour + shirt sleeve)
export function makeBlockHand() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98264, roughness: 0.9 }), sleeve = new THREE.MeshStandardMaterial({ color: 0x1ea7b0, roughness: 0.9 });
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.11), skin); hand.position.z = -0.01; g.add(hand);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.22), sleeve); arm.position.z = 0.15; g.add(arm);
  return g;
}
