// Chica's Party: a little pixel-art minigame. Touch Mr. Cupcake or Carl on the office desk to play.
// You stand on one side of a low wall. Cupcakes appear on your table (a new one 3 s after you take one).
// Grab one (grip or trigger) and throw it over the wall to the kids. Feed 10 kids to win.
import * as THREE from 'three';
import * as A from './audio.js';

export const MG_ORIGIN = new THREE.Vector3(300, 0, 0);     // the minigame room sits far away from the pizzeria
export const GOAL = 10, RESPAWN = 3;
const WALL_Z = -1.5, WALL_H = 0.9, TABLE_Z = -1.1, TABLE_H = 0.8;

// ---------- pixel art helpers (every texture is nearest-filtered so it stays chunky) ----------
function pixTex(rows, pal) {
  const h = rows.length, w = rows[0].length, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; return t;
}
function pixText(lines, w, h, scale, bg = '#1a1030', fg = '#ffd23c') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = `bold ${l.size || scale}px monospace`; g.fillStyle = l.color || fg; g.fillText(l.t, w / 2, l.y); });
  g.strokeStyle = '#ff6fb5'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; return { tex: t, canvas: c };
}
const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, fog: false, ...o });

const KID_ROWS = [
  '....rrrr....', '...rrYYrr...', '....rrrr....', '...ssssss...', '..ssKssKss..', '..ssssssss..', '...sMMMMs...', '....ssss....',
  '.ss.TTTT.ss.', '.ss.TTTT.ss.', '....TTTT....', '....TTTT....', '....pppp....', '....p..p....', '....p..p....', '...bb..bb...',
];
const KID_PALS = [
  { r: '#ff4d6d', Y: '#ffd23c', s: '#f1b27d', K: '#222', M: '#c0392b', T: '#3fa7ff', p: '#2b3a67', b: '#111' },
  { r: '#4dff88', Y: '#fff', s: '#c68642', K: '#222', M: '#8e2a1d', T: '#ff9f1c', p: '#444', b: '#111' },
  { r: '#b46bff', Y: '#ffd23c', s: '#f6cfa6', K: '#222', M: '#c0392b', T: '#ff5fa2', p: '#1d6f42', b: '#111' },
  { r: '#ffd23c', Y: '#ff4d6d', s: '#8d5524', K: '#222', M: '#7a1d12', T: '#3ee0c2', p: '#5a3d8a', b: '#111' },
  { r: '#3fa7ff', Y: '#ffd23c', s: '#e0ac69', K: '#222', M: '#a52a1d', T: '#ff4d4d', p: '#2b2b2b', b: '#111' },
];

export class ChicasParty {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.position.copy(MG_ORIGIN); this.group.visible = false; scene.add(this.group);
    this.active = false; this.score = 0; this.slots = []; this.thrown = []; this.fx = []; this.held = { L: null, R: null };
    this.hv = { L: [], R: [] }; this.lastPos = { L: null, R: null }; this.wasGrab = { L: false, R: false }; this.winT = 0; this.t = 0; this.onExit = null;
    this.build();
  }
  build() {
    const G = this.group;
    // floor (checkerboard), walls, banner
    const ft = pixTex(['pP', 'Pp'], { p: '#ff9ecb', P: '#fff2a8' }); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(12, 12);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 14), new THREE.MeshBasicMaterial({ map: ft, fog: false })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -3); G.add(floor);
    const wt = pixTex(['bbbbbbbb', 'bBbBbBbB', 'bbbbbbbb', 'BbBbBbBb'], { b: '#6d3bd1', B: '#8a5cf0' }); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(10, 3);
    const wallMat = new THREE.MeshBasicMaterial({ map: wt, fog: false, side: THREE.DoubleSide });
    for (const [x, z, ry, w] of [[0, -8, 0, 12], [-6, -3, Math.PI / 2, 14], [6, -3, -Math.PI / 2, 14], [0, 3.6, Math.PI, 12]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 4), wallMat); m.position.set(x, 2, z); m.rotation.y = ry; G.add(m);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 14), basic(0x2a1650, { side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 4, -3); G.add(ceil);
    const banner = pixText([{ t: "CHICA'S PARTY!", y: 58, size: 44, color: '#ffd23c' }, { t: 'HAPPY BIRTHDAY', y: 108, size: 26, color: '#ff6fb5' }], 512, 160, 40);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.25), new THREE.MeshBasicMaterial({ map: banner.tex, fog: false })); bm.position.set(0, 3, -7.9); G.add(bm);
    // balloons (little chunky cubes on sticks)
    const bc = [0xff4d6d, 0x3fa7ff, 0xffd23c, 0x4dff88, 0xb46bff];
    for (let i = 0; i < 12; i++) { const x = -5 + i * 0.9, z = -7.6 + (i % 3) * 0.2, c = bc[i % 5];
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), basic(c)); b.position.set(x, 2.1 + (i % 4) * 0.25, z); G.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), basic(0xdddddd)); s.position.set(x, 1.4 + (i % 4) * 0.25, z); G.add(s); }
    // the dividing wall (brick)
    const brt = pixTex(['rrrRrrrR', 'RrrrRrrr', 'rrRrrrRr', 'rRrrrRrr'], { r: '#d9534f', R: '#a8322e' }); brt.wrapS = brt.wrapT = THREE.RepeatWrapping; brt.repeat.set(10, 2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, WALL_H, 0.25), new THREE.MeshBasicMaterial({ map: brt, fog: false })); wall.position.set(0, WALL_H / 2, WALL_Z); G.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.08, 0.35), basic(0xfff2a8)); cap.position.set(0, WALL_H + 0.04, WALL_Z); G.add(cap);
    // your table (cupcakes appear here) and the kids' table (decoys, hands off)
    const mkTable = (z, col) => { const t = new THREE.Mesh(new THREE.BoxGeometry(2.6, TABLE_H, 0.5), basic(col)); t.position.set(0, TABLE_H / 2, z); G.add(t);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 0.6), basic(0xffffff)); top.position.set(0, TABLE_H + 0.03, z); G.add(top); };
    mkTable(TABLE_Z, 0x3fa7ff); mkTable(-2.3, 0xb46bff);
    for (const x of [-0.8, 0, 0.8]) { const c = this.makeCupcake(); c.position.set(x, TABLE_H + 0.06 + 0.08, -2.3); G.add(c); }     // decoys on the kids' side
    for (const x of [-0.7, 0, 0.7]) this.slots.push({ x, y: TABLE_H + 0.06 + 0.08, z: TABLE_Z, cup: null, timer: 0 });
    // kids
    this.kids = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: pixTex(KID_ROWS, KID_PALS[i]), transparent: true, alphaTest: 0.5, fog: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), mat); const home = { x: -2.4 + i * 1.2, z: -3.4 - (i % 2) * 0.9 };
      m.position.set(home.x, 0.8, home.z); G.add(m);
      this.kids.push({ m, home, speed: 0.5 + 0.18 * i, phase: i * 1.7, range: 0.7 + 0.12 * (i % 3), vy: 0, y: 0, flash: 0 });
    }
    // scoreboard over the wall
    this.board = pixText([{ t: '', y: 40 }], 512, 192, 40);
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: this.board.tex, fog: false })); this.boardMesh.position.set(0, 2.2, WALL_Z - 0.3); G.add(this.boardMesh);
    this.drawBoard();
    this.cupGeo = null;
  }
  makeCupcake() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), basic(0x8a5a2b)), b = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.06, 0.125), basic(0xff7fc0)),
      c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), basic(0xffa6d6)), d = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), basic(0xe02020));
    a.position.y = -0.04; b.position.y = 0.025; c.position.y = 0.08; d.position.y = 0.12; g.add(a, b, c, d); return g;
  }
  drawBoard(extra) {
    const c = this.board.canvas, g = c.getContext('2d'); g.fillStyle = '#1a1030'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#ff6fb5'; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd23c'; g.font = 'bold 34px monospace'; g.fillText("CHICA'S PARTY", c.width / 2, 36);
    g.fillStyle = '#ffffff'; g.font = 'bold 84px monospace'; g.fillText(`${this.score}/${GOAL}`, c.width / 2, 110);
    g.fillStyle = extra ? '#4dff88' : '#9fd0ff'; g.font = 'bold 22px monospace'; g.fillText(extra || 'GRAB A CUPCAKE - THROW IT TO A KID', c.width / 2, 166);
    this.board.tex.needsUpdate = true;
  }
  start() {
    this.active = true; this.group.visible = true; this.score = 0; this.winT = 0; this.t = 0;
    for (const t of this.thrown) this.group.remove(t.m); this.thrown = [];
    for (const s of this.slots) { if (s.cup) this.group.remove(s.cup); s.cup = null; s.timer = 0; this.fillSlot(s); }
    this.held.L = this.held.R = null; this.drawBoard(); A.blips([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]]);
  }
  stop() {
    this.active = false; this.group.visible = false;
    for (const t of this.thrown) this.group.remove(t.m); this.thrown = [];
    for (const k of ['L', 'R']) this.held[k] = null;
  }
  fillSlot(s) { s.cup = this.makeCupcake(); s.cup.position.set(s.x, s.y, s.z); this.group.add(s.cup); }
  // keeps the player on their side of the wall, inside the room (world coords in, world coords out)
  move(x, z, nx, nz) {
    const lx = THREE.MathUtils.clamp(nx - MG_ORIGIN.x, -2.6, 2.6), lz = THREE.MathUtils.clamp(nz - MG_ORIGIN.z, -0.45, 2.4);
    return [lx + MG_ORIGIN.x, lz + MG_ORIGIN.z];
  }
  // hands: { L:{pos:Vector3(world), grab:boolean}|null, R:... }
  update(dt, hands) {
    if (!this.active) return;
    this.t += dt;
    const lp = new THREE.Vector3();
    for (const sd of ['L', 'R']) {
      const h = hands[sd]; if (!h) { this.release(sd, new THREE.Vector3()); this.lastPos[sd] = null; continue; }
      const p = this.group.worldToLocal(lp.copy(h.pos)).clone();
      // smoothed hand velocity (last ~0.12 s) used for throwing
      const prev = this.lastPos[sd]; if (prev) { this.hv[sd].push({ v: p.clone().sub(prev).divideScalar(Math.max(dt, 1e-3)), t: this.t }); }
      this.hv[sd] = this.hv[sd].filter(e => this.t - e.t < 0.12); this.lastPos[sd] = p.clone();
      const vel = new THREE.Vector3(); this.hv[sd].forEach(e => vel.add(e.v)); if (this.hv[sd].length) vel.divideScalar(this.hv[sd].length);
      if (h.grab && !this.held[sd]) { if (!this.wasGrab[sd]) this.tryGrab(sd, p); }
      if (this.held[sd]) { if (h.grab) this.held[sd].position.copy(p); else this.release(sd, vel); }
      this.wasGrab[sd] = h.grab;
    }
    // table refills
    for (const s of this.slots) { if (!s.cup) { s.timer -= dt; if (s.timer <= 0) { this.fillSlot(s); A.blips([[880, 0.04], [1175, 0.05]], 'square', 0.08); } } }
    // thrown cupcakes
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]; t.life += dt; t.v.y -= 9.8 * dt; t.m.position.addScaledVector(t.v, dt); t.m.rotation.x += dt * 8; t.m.rotation.z += dt * 5;
      const p = t.m.position;
      // over/against the divider wall
      if (p.z < WALL_Z + 0.2 && p.z > WALL_Z - 0.2 && p.y < WALL_H && Math.abs(p.x) < 4) { p.z = t.v.z < 0 ? WALL_Z + 0.2 : WALL_Z - 0.2; t.v.z *= -0.3; t.v.x *= 0.6; }
      if (p.y < 0.06) { p.y = 0.06; t.v.y *= -0.35; t.v.x *= 0.7; t.v.z *= 0.7; t.onFloor += 1; }
      let hit = null;
      if (p.z < WALL_Z) for (const k of this.kids) { const dx = p.x - k.m.position.x, dz = p.z - k.m.position.z, dy = p.y - (k.y + 0.8); if (dx * dx + dz * dz < 0.3 && Math.abs(dy) < 0.85) { hit = k; break; } }
      if (hit) { this.feed(hit, t); this.group.remove(t.m); this.thrown.splice(i, 1); continue; }
      if (t.life > 3 || p.y < -2 || Math.abs(p.x) > 7 || p.z < -9 || p.z > 5) { this.group.remove(t.m); this.thrown.splice(i, 1); }
    }
    // kids wander and bounce
    for (const k of this.kids) {
      k.m.position.x = k.home.x + Math.sin(this.t * k.speed + k.phase) * k.range;
      k.vy -= 9 * dt; k.y = Math.max(0, k.y + k.vy * dt); if (k.y === 0) k.vy = (k.flash > 0 ? 0 : Math.abs(Math.sin(this.t * 2 + k.phase)) > 0.985 ? 2.2 : 0);
      k.m.position.y = 0.8 + k.y; k.flash = Math.max(0, k.flash - dt); k.m.material.color.setScalar(k.flash > 0 && ((k.flash * 14) | 0) % 2 ? 2.2 : 1);
    }
    // confetti
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life -= dt; f.v.y -= 6 * dt; f.m.position.addScaledVector(f.v, dt); if (f.life <= 0) { this.group.remove(f.m); this.fx.splice(i, 1); } }
    if (this.winT > 0) { this.winT -= dt; if (Math.random() < dt * 20) this.confetti(new THREE.Vector3((Math.random() - 0.5) * 4, 3.2, -3 + Math.random() * 2), 3); if (this.winT <= 0) this.onExit?.(true); }
  }
  tryGrab(sd, p) {
    let best = null, bd = 0.22;
    for (const s of this.slots) { if (!s.cup) continue; const d = p.distanceTo(s.cup.position); if (d < bd) { bd = d; best = { slot: s }; } }
    for (const t of this.thrown) { if (t.life < 0.4) continue; const d = p.distanceTo(t.m.position); if (d < bd) { bd = d; best = { thrown: t }; } }
    if (!best) return;
    let cup;
    if (best.slot) { cup = best.slot.cup; best.slot.cup = null; best.slot.timer = RESPAWN; }       // a new one appears 3 s later
    else { cup = best.thrown.m; this.thrown.splice(this.thrown.indexOf(best.thrown), 1); }
    this.held[sd] = cup; A.blips([[660, 0.04], [990, 0.05]], 'square', 0.1);
  }
  release(sd, vel) {
    const cup = this.held[sd]; if (!cup) return; this.held[sd] = null;
    const v = vel.clone().multiplyScalar(1.15); if (v.length() > 11) v.setLength(11);
    this.thrown.push({ m: cup, v, life: 0, onFloor: 0 }); A.blips([[440, 0.05], [330, 0.07]], 'square', 0.1);
  }
  feed(kid, t) {
    this.score++; kid.flash = 0.7; kid.vy = 3.2;
    this.confetti(t.m.position.clone(), 14); A.blips([[784, 0.06], [988, 0.06], [1319, 0.1]], 'square', 0.15);
    if (this.score >= GOAL) {
      this.drawBoard('YOU WIN!  THE KIDS LOVE IT!'); this.winT = 5.5; A.blips([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.2], [784, 0.1], [1047, 0.1], [1319, 0.35]]);
    } else this.drawBoard();
  }
  confetti(pos, n) {
    const cols = [0xff4d6d, 0x3fa7ff, 0xffd23c, 0x4dff88, 0xb46bff];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), basic(cols[i % 5])); m.position.copy(pos); this.group.add(m);
      this.fx.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.8 + Math.random() * 0.6 });
    }
  }
}

// ---- the touch trigger on the office desk: the real Mr. Cupcake model ----
export function makeDeskProps(scene, y, gltf) {
  const m = gltf.scene.clone(true), box = new THREE.Box3().setFromObject(m), h = box.max.y - box.min.y, k = 0.3 / h;   // about 30 cm tall
  const holder = new THREE.Group(); m.scale.setScalar(k); m.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  holder.add(m); holder.position.set(-0.8, y, -1.3); scene.add(holder);
  m.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return [{ m: holder, name: 'Mr. Cupcake', model: true }];
}
