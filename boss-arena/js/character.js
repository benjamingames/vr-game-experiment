// Boss Arena: "Rook", the first playable character. Jointed cartoon fighter with procedural animation.
// Model faces +Z. Left side of the character is +X. Positive rotation.x swings limbs BACKWARD,
// so every "forward swing" below is written as rotation.x = -amount.
import * as THREE from 'three';
import * as T from './textures.js';

export const PALETTE = {
  suit: 0x2f6bff, suitDark: 0x1d3f9c, helmet: 0xf1f3f8, stripe: 0xff7a1a, glove: 0xe8322b,
  boot: 0xffcc33, scarf: 0xff5a36, belt: 0x1c1f26, star: 0xffcc33, skin: 0xf0b48a,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04, ...o });
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 12);
const ease = x => x * x * (3 - 2 * x);
const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
// piecewise-smooth keyframes: keys = [[t, v], ...]
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return lerp(v0, v1, ease((t - t0) / (t1 - t0))); }
  }
  return keys[keys.length - 1][1];
}

const J = ['spine', 'head', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'hpR', 'knR'];
const UPPER = ['spine', 'head', 'shL', 'elL', 'shR', 'elR'];
const mk = () => { const o = { hipY: 0 }; for (const k of J) o[k] = [0, 0, 0]; return o; };

// ---- poses: each fills a target pose object (angles in radians) ----
function guard(p, t) {
  const b = Math.sin(t * 5.5);
  p.hipY = -0.07 + b * 0.012;
  p.hpL[0] = -0.22; p.hpR[0] = 0.12; p.knL[0] = 0.42; p.knR[0] = 0.5;
  p.spine[0] = -0.1 + b * 0.02; p.spine[1] = -0.2; p.head[1] = 0.2; p.head[0] = 0.05;
  p.shL[0] = -0.95; p.shL[2] = 0.28; p.elL[0] = -1.85;
  p.shR[0] = -0.75; p.shR[2] = -0.25; p.elR[0] = -1.95;
}
function loco(p, ph, run, t) {
  const A = lerp(0.62, 1.0, run), K = lerp(0.75, 1.5, run), el = lerp(0.55, 1.6, run), arm = lerp(0.55, 1.1, run);
  const s = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
  p.hipY = -0.03 - run * 0.05 + Math.cos(ph * 2) * lerp(0.018, 0.035, run);
  p.hpL[0] = -A * s;      p.knL[0] = 0.12 + K * Math.max(0, Math.cos(ph));
  p.hpR[0] = -A * s2;     p.knR[0] = 0.12 + K * Math.max(0, Math.cos(ph + Math.PI));
  p.shL[0] = arm * s;     p.elL[0] = -el;  p.shL[2] = 0.1;
  p.shR[0] = arm * s2;    p.elR[0] = -el;  p.shR[2] = -0.1;
  p.spine[0] = lerp(0.04, 0.26, run); p.spine[1] = 0.16 * s * (0.6 + run * 0.6);
  p.head[0] = -p.spine[0] * 0.6; p.head[1] = -p.spine[1] * 0.7;
}
function setUpper(p, o) { for (const k of UPPER) p[k] = o[k]; p.hipY += o.hipY || 0; }
const up = () => { const o = mk(); return o; };

function upperPunch(side, t, dur) {
  const o = up(), k = t / dur;
  const reach = kf(k, [[0, 0], [0.22, -0.25], [0.45, 1], [0.6, 1], [1, 0]]);
  const twist = kf(k, [[0, 0], [0.22, -0.55], [0.45, 0.6], [0.6, 0.6], [1, 0]]);
  const sh = side === 'R' ? 'shR' : 'shL', el = side === 'R' ? 'elR' : 'elL', ot = side === 'R' ? 'L' : 'R';
  const sgn = side === 'R' ? -1 : 1;
  o[sh] = [lerp(-0.8, -1.55, reach), 0, sgn * lerp(0.2, 0.0, reach)];
  o[el] = [lerp(-1.95, -0.06, reach), 0, 0];
  o['sh' + ot] = [-0.95, 0, -sgn * 0.28]; o['el' + ot] = [-1.9, 0, 0];
  o.spine = [-0.08, twist * (side === 'R' ? 1 : -1) * 0.55 - (side === 'R' ? 0.2 : -0.2) * 0, 0];
  o.spine[1] = (side === 'R' ? 1 : -1) * twist * 0.6;
  o.head = [0.05, -o.spine[1] * 0.7, 0];
  o.hipY = -0.07 - reach * 0.03;
  return o;
}
function upperBlock(t) {
  const o = up(); const b = Math.sin(t * 6) * 0.015;
  o.shL = [-1.2, 0, 0.05]; o.elL = [-2.35, 0, 0.0]; o.shR = [-1.2, 0, -0.05]; o.elR = [-2.35, 0, 0];
  o.shL[1] = -0.4; o.shR[1] = 0.4;
  o.spine = [0.28 + b, 0, 0]; o.head = [0.25, 0, 0]; o.hipY = -0.1;
  return o;
}
function upperWave(t) {
  const o = guard2(); o.shR = [0, 0, -2.75]; o.elR = [0, 0, 0.55 * Math.sin(t * 11)];
  o.shL = [0.05, 0, 0.12]; o.elL = [-0.3, 0, 0]; o.head = [-0.05, 0, 0.12 * Math.sin(t * 5.5)]; o.spine = [0, 0, 0.05];
  return o;
}
function upperTaunt(t) {
  const o = up(); const k = clamp01(t / 0.25);
  o.shL = [0, 0, lerp(0.1, 1.55, k)]; o.elL = [0, 0, lerp(0, 1.55, k)];
  o.shR = [0, 0, -lerp(0.1, 1.55, k)]; o.elR = [0, 0, -lerp(0, 1.55, k)];
  o.spine = [-0.1, 0.12 * Math.sin(t * 4), 0]; o.head = [-0.12, 0, 0]; o.hipY = Math.abs(Math.sin(t * 5)) * -0.05;
  return o;
}
function upperCheer(t) {
  const o = up(); const hop = Math.abs(Math.sin(t * 7));
  o.shL = [0, 0, 2.7]; o.shR = [0, 0, -2.7]; o.elL = [0, 0, 0.25 * Math.sin(t * 14)]; o.elR = [0, 0, -0.25 * Math.sin(t * 14)];
  o.spine = [-0.1, 0, 0]; o.head = [-0.2, 0, 0]; o.hipY = hop * 0.14;
  return o;
}
function upperHurt(t, dur) {
  const o = up(); const k = t / dur, d = 1 - k;
  o.spine = [-0.45 * kf(k, [[0, 1], [0.35, 0.8], [1, 0]]), 0.2 * Math.sin(k * 20) * d, 0];
  o.head = [-0.45 * d, 0.15 * Math.sin(k * 24) * d, 0];
  o.shL = [-0.2, 0, 1.0 * d + 0.2]; o.shR = [-0.2, 0, -1.0 * d - 0.2]; o.elL = [-0.6, 0, 0]; o.elR = [-0.6, 0, 0];
  o.hipY = -0.08 * d;
  return o;
}
function guard2() { const o = mk(); guard(o, 0); const u = up(); for (const k of UPPER) u[k] = o[k]; return u; }

export const ONESHOTS = {
  punch: { dur: 0.46 }, punchL: { dur: 0.46 }, wave: { dur: 2.0 }, taunt: { dur: 2.0 }, cheer: { dur: 2.2 }, hurt: { dur: 0.6 },
};

export function makeGlove(color = PALETTE.glove) {
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), mat(color, { roughness: 0.4 }));
  fist.scale.set(1, 0.92, 1.12); g.add(fist);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), mat(color, { roughness: 0.4 })); thumb.position.set(0.07, 0.01, 0.045); g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.07, 14), mat(0xf4f4f4)); cuff.position.y = 0.09; g.add(cuff);
  return g;
}

export class Hero {
  constructor({ suit = PALETTE.suit, accent = PALETTE.stripe } = {}) {
    this.root = new THREE.Group();
    this.t = 0; this.phase = 0; this.once = null; this.onceT = 0; this.onceFade = 0; this.hold = null; this.side = 'R';
    this.tgt = mk(); this.cur = mk(); this.A = mk(); this.B = mk();
    const M = {
      suit: mat(suit), dark: mat(PALETTE.suitDark), helmet: mat(PALETTE.helmet, { roughness: 0.3, metalness: 0.1 }),
      accent: mat(accent), glove: mat(PALETTE.glove, { roughness: 0.4 }), boot: mat(PALETTE.boot, { roughness: 0.6 }),
      belt: mat(PALETTE.belt), star: mat(PALETTE.star, { metalness: 0.7, roughness: 0.25 }), scarf: mat(PALETTE.scarf, { roughness: 0.8 }),
      white: mat(0xf4f4f4),
    };
    const part = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
    const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // hips + legs
    this.HIP_Y = 0.92;
    const hips = this.hips = grp(this.root, 0, this.HIP_Y, 0);
    const pelvis = part(new THREE.SphereGeometry(1, 20, 14), M.dark); pelvis.scale.set(0.19, 0.13, 0.14); hips.add(pelvis);
    hips.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), M.belt, 0, 0.1, 0));
    const spine = this.spine = grp(hips, 0, 0.1, 0);
    const buckle = part(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), M.star, 0, 0.0, 0.205); buckle.rotation.x = Math.PI / 2; spine.add(buckle);

    const leg = (sx) => {
      const hp = grp(hips, sx * 0.1, -0.04, 0);
      hp.add(part(capsule(0.075, 0.27), M.dark, 0, -0.2, 0));
      const kn = grp(hp, 0, -0.4, 0);
      kn.add(part(capsule(0.065, 0.27), M.suit, 0, -0.2, 0));
      const an = grp(kn, 0, -0.4, 0);
      const boot = part(new THREE.SphereGeometry(1, 16, 12), M.boot, 0, -0.04, 0.05); boot.scale.set(0.08, 0.07, 0.15); an.add(boot);
      an.add(part(new THREE.CylinderGeometry(0.07, 0.075, 0.1, 12), M.white, 0, 0.0, 0));
      return { hp, kn, an };
    };
    const lL = leg(1), lR = leg(-1);
    this.hpL = lL.hp; this.knL = lL.kn; this.anL = lL.an; this.hpR = lR.hp; this.knR = lR.kn; this.anR = lR.an;

    // torso
    const chest = part(new THREE.SphereGeometry(1, 24, 16), M.suit, 0, 0.2, 0); chest.scale.set(0.215, 0.26, 0.15); spine.add(chest);
    const chestPlate = part(new THREE.SphereGeometry(1, 20, 12), M.dark, 0, 0.07, 0.03); chestPlate.scale.set(0.2, 0.13, 0.14); spine.add(chestPlate);
    const badge = part(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8), M.star, 0, 0.26, 0.142); badge.rotation.x = Math.PI / 2; spine.add(badge);

    // arms
    const arm = (sx) => {
      const sh = grp(spine, sx * 0.255, 0.37, 0);
      sh.add(part(new THREE.SphereGeometry(0.075, 14, 10), M.dark));
      sh.add(part(capsule(0.056, 0.2), M.suit, 0, -0.16, 0));
      const el = grp(sh, 0, -0.3, 0);
      el.add(part(capsule(0.05, 0.19), M.white, 0, -0.14, 0));
      const hand = grp(el, 0, -0.29, 0);
      const glove = makeGlove(); hand.add(glove);   // fist sits below the wrist, cuff tucks up over the forearm
      glove.position.y = -0.065;
      return { sh, el, hand };
    };
    const aL = arm(1), aR = arm(-1);
    this.shL = aL.sh; this.elL = aL.el; this.shR = aR.sh; this.elR = aR.el;
    this.arms = [aL.sh, aR.sh];

    // neck + head + helmet
    const head = this.head = grp(spine, 0, 0.52, 0.01);
    this.neck = part(capsule(0.045, 0.05), M.white, 0, -0.07, 0); head.add(this.neck);
    const helmet = this.helmet = part(new THREE.SphereGeometry(0.155, 28, 20), M.helmet, 0, 0.1, 0); helmet.scale.set(1, 0.98, 1.02); head.add(helmet);
    const vis = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 28, 16, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.55, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.12, metalness: 0.35, emissive: 0xffffff, emissiveMap: T.visorTex(), emissiveIntensity: 1.4 }));
    vis.position.set(0, 0.1, 0.004); this.visor = vis; head.add(vis);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 28, Math.PI), M.accent); band.position.set(0, 0.2, 0); band.rotation.set(0, Math.PI / 2, 0); band.rotation.z = 0; this.band = band; head.add(band);
    for (const sx of [-1, 1]) { const ph = part(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), M.accent, sx * 0.15, 0.1, 0); ph.rotation.z = Math.PI / 2; head.add(ph); }
    const ant = part(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 6), M.dark, 0, 0.29, -0.02); head.add(ant);
    const ball = part(new THREE.SphereGeometry(0.026, 12, 8), M.accent, 0, 0.345, -0.02); head.add(ball);
    this.headParts = [helmet, vis, band, ant, ball, this.neck];

    // scarf: chain of flat boxes hanging off the neck
    this.scarf = [];
    let sp = grp(spine, 0, 0.46, -0.1);
    const collar = part(new THREE.TorusGeometry(0.085, 0.032, 8, 18), M.scarf, 0, 0.0, 0.1); collar.rotation.x = Math.PI / 2; sp.add(collar);
    for (let i = 0; i < 5; i++) {
      const seg = grp(sp, 0, i === 0 ? 0 : -0.1, 0);
      seg.add(part(new THREE.BoxGeometry(0.09 - i * 0.004, 0.11, 0.018), M.scarf, 0, -0.05, 0));
      this.scarf.push(seg); sp = seg;
    }

    // soft contact shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.shadowBlobTex(), transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.scale.set(0.9, 0.9, 1); sh.renderOrder = 1; this.shadow = sh; this.root.add(sh);

    this.root.traverse(o => { if (o.isMesh && o !== sh) { o.castShadow = false; o.frustumCulled = true; } });
    this.apply(1);
  }

  setFirstPerson(on) { for (const m of this.headParts) m.visible = !on; }
  setArmsVisible(on) { for (const a of this.arms) a.visible = on; }

  play(name) {
    if (name === 'punch') { this.side = this.side === 'R' ? 'L' : 'R'; }
    const key = name === 'punch' ? 'punch' : name;
    const spec = ONESHOTS[key]; if (!spec) return;
    this.once = { name: key, side: this.side, dur: spec.dur }; this.onceT = 0;
  }
  setHold(name) { this.hold = name; }

  // speed: horizontal speed in m/s. Call once per frame.
  update(dt, speed = 0) {
    this.t += dt;
    const run = clamp01((speed - 2.6) / 2.2), walkW = clamp01(speed / 1.4);
    this.phase += dt * Math.PI * 2 * (speed / lerp(1.5, 2.5, run));
    const A = this.A, B = this.B, tgt = this.tgt;
    A.hipY = 0; for (const k of J) A[k].fill(0); B.hipY = 0; for (const k of J) B[k].fill(0);
    guard(A, this.t); loco(B, this.phase, run, this.t);
    // blend idle guard <-> locomotion
    tgt.hipY = lerp(A.hipY, B.hipY, walkW);
    for (const k of J) for (let i = 0; i < 3; i++) tgt[k][i] = lerp(A[k][i], B[k][i], walkW);
    // upper-body overrides
    let ov = null, w = 0;
    if (this.hold === 'block') { ov = upperBlock(this.t); w = 1; }
    if (this.once) {
      this.onceT += dt;
      const { name, dur, side } = this.once;
      const fadeIn = clamp01(this.onceT / 0.06), fadeOut = clamp01((dur - this.onceT) / 0.12);
      w = Math.min(fadeIn, fadeOut);
      if (name === 'punch') ov = upperPunch(side, this.onceT, dur);
      else if (name === 'wave') ov = upperWave(this.onceT);
      else if (name === 'taunt') ov = upperTaunt(this.onceT);
      else if (name === 'cheer') ov = upperCheer(this.onceT);
      else if (name === 'hurt') { ov = upperHurt(this.onceT, dur); w = Math.min(1, fadeIn * 3); }
      if (this.onceT >= dur) this.once = null;
    }
    if (ov) {
      for (const k of UPPER) for (let i = 0; i < 3; i++) tgt[k][i] = lerp(tgt[k][i], ov[k][i], w);
      tgt.hipY += ov.hipY * w * (this.once && this.once.name === 'cheer' ? 1 : 0.5);
    }
    // damped follow
    const rate = 1 - Math.exp(-dt * 28), cur = this.cur;
    cur.hipY += (tgt.hipY - cur.hipY) * rate;
    for (const k of J) for (let i = 0; i < 3; i++) cur[k][i] += (tgt[k][i] - cur[k][i]) * rate;
    this.apply(speed);
  }

  apply(speed) {
    const c = this.cur, set = (o, a) => o.rotation.set(a[0], a[1], a[2]);
    this.hips.position.y = this.HIP_Y + c.hipY;
    set(this.spine, c.spine); set(this.head, c.head);
    set(this.shL, c.shL); set(this.elL, c.elL); set(this.shR, c.shR); set(this.elR, c.elR);
    set(this.hpL, c.hpL); set(this.knL, c.knL); set(this.hpR, c.hpR); set(this.knR, c.knR);
    // keep boots level with the floor: ankle cancels hip + knee pitch
    this.anL.rotation.x = -(c.hpL[0] + c.knL[0]) * 0.9; this.anR.rotation.x = -(c.hpR[0] + c.knR[0]) * 0.9;
    // scarf streams behind and ripples
    const lift = 0.12 + Math.min(1, speed / 4.5) * 0.5;
    this.scarf.forEach((s, i) => { s.rotation.x = (i === 0 ? lift : 0.12 + lift * 0.3) + Math.sin(this.t * 7 - i * 0.9) * (0.06 + speed * 0.025); s.rotation.z = Math.sin(this.t * 4 - i * 0.7) * 0.05; });
    // shadow stays on the floor when the hips hop
    this.shadow.position.y = 0.012 - this.root.position.y * 0 ;
  }
}
