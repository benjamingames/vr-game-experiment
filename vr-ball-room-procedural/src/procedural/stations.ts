/**
 * Modelled bodies for the toy stations, replacing plain blocks with the parts the real things
 * have: frames, brackets, trim, fixings, printed graphics. Colliders and gameplay meshes stay in
 * room.ts; everything here is visual only. Dimensions are metres.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry as PlainSphere,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { BoxGeometry, CylinderGeometry } from './geometry.js';
import { canMetal, oak, plastic } from './materials.js';
import { QUALITY } from './quality.js';

const std = (color: number, rough: number, metal = 0) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: rough, metalness: metal });

function add<T extends Mesh>(parent: Group | Mesh, m: T, x: number, y: number, z: number, shadow = true): T {
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.raycast = () => {};
  parent.add(m);
  return m;
}

/** Catmull-Rom smoothing of a lathe profile so silhouettes are curves, not facets. */
function smoothProfile(pts: Array<[number, number]>, sub = 4): Vector2[] {
  const out: Vector2[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      const c = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
      out.push(new Vector2(Math.max(0, c(0)), c(1)));
    }
  }
  const last = pts[pts.length - 1];
  out.push(new Vector2(last[0], last[1]));
  return out;
}

function lathe(pts: Array<[number, number]>, segs = 48, smoothSub = 0) {
  const prof = smoothSub ? smoothProfile(pts, smoothSub) : pts.map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(prof, QUALITY.high ? segs : Math.round(segs / 2));
}

/** A printed graphic on a thin transparent plane (faces +Z). `draw` paints a canvas of cw x ch pixels. */
function decal(w: number, h: number, cw: number, ch: number, draw: (x: CanvasRenderingContext2D) => void, glow = 0): Mesh {
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  draw(c.getContext('2d')!);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = QUALITY.anisotropy;
  const m = new MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  if (glow > 0) {
    m.emissive = new Color(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = glow;
  }
  const mesh = new Mesh(new PlaneGeometry(w, h), m);
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return mesh;
}

/** Makes a collider mesh draw nothing while its children (the modelled body) still show. */
export function hollow(mesh: Mesh) {
  mesh.geometry.dispose();
  mesh.geometry = new BufferGeometry();
  mesh.castShadow = false;
}

const chrome = () => std(0xe4e8ec, 0.12, 1);
const steel = () => canMetal(0xb9bec4);

// ---- Basketball hoop -----------------------------------------------------------------------

/**
 * Everything around the plain backboard slab: printed border and shooter's square, edge frame and
 * bottom padding, rim mount plate with neck and braces, score-lamp housing, floor flange.
 * World coordinates; the board's playing face is at x = faceX, facing +X.
 */
export function hoopDress(faceX: number, boardY: number, bbZ: number, rim: { x: number; y: number; z: number; radius: number }): Group {
  const g = new Group();
  const bw = 1.1;
  const bh = 0.78;
  const art = decal(bw - 0.012, bh - 0.012, 880, 624, (x) => {
    const W = 880;
    const H = 624;
    x.clearRect(0, 0, W, H);
    // Ball scuffs: faint grey arcs where the ball keeps hitting
    x.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const cx = W / 2 + (Math.sin(i * 12.9) * 0.5) * 420;
      const cy = H * 0.62 + Math.cos(i * 7.3) * 150;
      x.strokeStyle = `rgba(70,60,50,${0.03 + (i % 5) * 0.012})`;
      x.lineWidth = 3 + (i % 4) * 2;
      x.beginPath();
      x.arc(cx, cy, 30 + (i % 7) * 12, i, i + 0.5 + (i % 3) * 0.3);
      x.stroke();
    }
    x.strokeStyle = '#16171a';
    x.lineWidth = 30;
    x.strokeRect(15, 15, W - 30, H - 30);
    x.strokeStyle = '#d3222d';
    x.lineWidth = 22;
    const rw = 0.4 * (W / bw);
    const rh = 0.3 * (H / bh);
    x.strokeRect(W / 2 - rw / 2, H / 2 + 0.115 * (H / bh) - rh / 2 - 6, rw, rh);
  });
  art.rotation.y = Math.PI / 2;
  art.position.set(faceX + 0.0012, boardY, bbZ);
  g.add(art);
  // Aluminium edge channel and foam padding along the bottom
  const frame = std(0x202226, 0.5, 0.6);
  add(g, new Mesh(new BoxGeometry(0.052, 0.022, bw + 0.03), frame), faceX - 0.02, boardY + bh / 2 + 0.006, bbZ);
  for (const s of [-1, 1]) add(g, new Mesh(new BoxGeometry(0.052, bh + 0.03, 0.022), frame), faceX - 0.02, boardY, bbZ + s * (bw / 2 + 0.006));
  const pad = add(g, new Mesh(new CylinderGeometry(0.036, 0.036, bw + 0.04, 24), plastic(0x15171b, 0.75)), faceX - 0.018, boardY - bh / 2 - 0.004, bbZ);
  pad.rotation.x = Math.PI / 2;
  // Rim mount: plate bolted to the board, neck plate out to the ring, two braces underneath
  const orange = std(0xe8521c, 0.38, 0.75);
  add(g, new Mesh(new BoxGeometry(0.012, 0.12, 0.17), orange), faceX + 0.007, rim.y - 0.035, rim.z);
  const neckLen = rim.x - rim.radius - faceX + 0.02;
  add(g, new Mesh(new BoxGeometry(neckLen, 0.01, 0.12), orange), faceX + neckLen / 2, rim.y, rim.z);
  const up = new Vector3(0, 1, 0);
  for (const s of [-1, 1]) {
    const a = new Vector3(faceX + 0.012, rim.y - 0.085, rim.z + s * 0.06);
    const b = new Vector3(rim.x - rim.radius * 0.55, rim.y - 0.012, rim.z + s * rim.radius * 0.82);
    const brace = add(g, new Mesh(new CylinderGeometry(0.006, 0.006, a.distanceTo(b), 10), orange), 0, 0, 0);
    brace.position.copy(a).add(b).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    for (const bz of [-0.06, 0.06]) {
      const bolt = add(g, new Mesh(new CylinderGeometry(0.008, 0.008, 0.006, 6), chrome()), faceX + 0.016, rim.y - 0.035 + s * 0.04, rim.z + bz, false);
      bolt.rotation.z = Math.PI / 2;
    }
  }
  // Score lamps sit in a housing with chrome bezels
  add(g, new Mesh(new BoxGeometry(0.05, 0.12, 0.86), plastic(0x17191d, 0.55)), faceX - 0.012, boardY + 0.46, bbZ);
  const bezel = chrome();
  for (let i = 0; i < 5; i++) {
    const ring = add(g, new Mesh(new TorusGeometry(0.041, 0.005, 10, 36), bezel), faceX + 0.014, boardY + 0.46, bbZ - 0.32 + i * 0.16, false);
    ring.rotation.y = Math.PI / 2;
  }
  // Post flange bolted to the floor
  add(g, new Mesh(new CylinderGeometry(0.1, 0.105, 0.012, 32), frame), faceX - 0.06, 0.006, bbZ);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    add(g, new Mesh(new CylinderGeometry(0.009, 0.009, 0.01, 6), chrome()), faceX - 0.06 + Math.cos(a) * 0.08, 0.016, bbZ + Math.sin(a) * 0.08, false);
  }
  return g;
}

// ---- Ball pedestal -------------------------------------------------------------------------

/** Turned hardwood pedestal with a square plinth and cap and a rubber cradle ring. Origin: centre of a w x h x w box. */
export function pedestal(w: number, h: number): Group {
  const g = new Group();
  const wood = oak('#000000', '#6e4a2c', 1, 1, 0.36);
  const y0 = -h / 2;
  add(g, new Mesh(new BoxGeometry(w, 0.05, w), wood), 0, y0 + 0.025, 0);
  add(g, new Mesh(new BoxGeometry(w - 0.045, 0.03, w - 0.045), wood), 0, y0 + 0.065, 0);
  const a = y0 + 0.08;
  const b = h / 2 - 0.07;
  const R = w * 0.5;
  add(
    g,
    new Mesh(
      lathe(
        [
          [R * 0.74, a], [R * 0.8, a + 0.014], [R * 0.72, a + 0.03], [R * 0.56, a + 0.045], [R * 0.6, a + 0.06], [R * 0.5, a + 0.085],
          [R * 0.46, a + (b - a) * 0.4], [R * 0.52, b - 0.11], [R * 0.6, b - 0.07], [R * 0.54, b - 0.055], [R * 0.68, b - 0.03],
          [R * 0.8, b - 0.014], [R * 0.74, b],
        ],
        40,
        4,
      ),
      wood,
    ),
    0,
    0,
    0,
  );
  add(g, new Mesh(new BoxGeometry(w - 0.045, 0.03, w - 0.045), wood), 0, b + 0.015, 0);
  add(g, new Mesh(new BoxGeometry(w, 0.04, w), wood), 0, h / 2 - 0.02, 0);
  const ring = add(g, new Mesh(new TorusGeometry(0.05, 0.0065, 10, 40), plastic(0x121315, 0.8)), 0, h / 2 + 0.004, 0);
  ring.rotation.x = Math.PI / 2;
  return g;
}

// ---- Xylophone -----------------------------------------------------------------------------

/**
 * The instrument frame under the tone bars: two beech rails converging toward the short bars,
 * felt strips, end blocks and rubber feet. Origin: centre of the stand top; bars run along X and
 * are spaced along Z at `zs` with lengths `lens`; `gap` is the height of the bars' undersides.
 */
export function xyloFrame(lens: number[], zs: number[], gap: number): Group {
  const g = new Group();
  const beech = oak('#000000', '#d9bd8e', 1, 1, 0.42);
  const felt = std(0x7a1f24, 1);
  const n = lens.length;
  const zA = zs[0] - 0.055;
  const zB = zs[n - 1] + 0.055;
  const L = zB - zA;
  for (const s of [-1, 1]) {
    const xA = s * lens[0] * 0.37;
    const xB = s * lens[n - 1] * 0.37;
    const len = Math.hypot(xB - xA, L);
    const rail = add(g, new Mesh(new BoxGeometry(0.03, gap - 0.002, len), beech), (xA + xB) / 2, (gap - 0.002) / 2, (zA + zB) / 2);
    rail.rotation.y = Math.atan2(xB - xA, L);
    const strip = add(g, new Mesh(new BoxGeometry(0.016, 0.002, len - 0.02), felt), (xA + xB) / 2, gap - 0.001, (zA + zB) / 2, false);
    strip.rotation.y = rail.rotation.y;
  }
  add(g, new Mesh(new BoxGeometry(lens[0] * 0.74 + 0.05, gap - 0.003, 0.026), beech), 0, (gap - 0.003) / 2, zA + 0.004);
  add(g, new Mesh(new BoxGeometry(lens[n - 1] * 0.74 + 0.05, gap - 0.003, 0.026), beech), 0, (gap - 0.003) / 2, zB - 0.004);
  return g;
}

// ---- Whack-a-mole --------------------------------------------------------------------------

/**
 * Arcade cabinet: recessed black plinth, laminate carcass with printed side art and chrome edge
 * trim, brushed-steel playfield with chrome hole bezels, coin door, speaker grille.
 * Origin: centre of the w x h x d collider; the player stands at +X. `holes` are [x, z] offsets.
 */
export function moleCabinet(w: number, h: number, d: number, holes: Array<[number, number]>): Group {
  const g = new Group();
  const body = plastic(0x1f4fa8, 0.4);
  const black = plastic(0x0e0f12, 0.7);
  const ch = chrome();
  add(g, new Mesh(new BoxGeometry(w - 0.07, 0.075, d - 0.07), black), 0, -h / 2 + 0.0375, 0);
  add(g, new Mesh(new BoxGeometry(w, h - 0.076, d), body), 0, 0.035, 0);
  add(g, new Mesh(new BoxGeometry(w + 0.014, 0.008, d + 0.014), plastic(0xf2b42c, 0.38)), 0, h / 2 - 0.003, 0);
  for (const [hx, hz] of holes) {
    const ring = add(g, new Mesh(new TorusGeometry(0.075, 0.0055, 10, 40), ch), hx, h / 2 + 0.003, hz, false);
    ring.rotation.x = Math.PI / 2;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(g, new Mesh(new CylinderGeometry(0.006, 0.006, h - 0.08, 12), ch), sx * (w / 2 - 0.002), 0.035, sz * (d / 2 - 0.002), false);
  }
  // Side art: a sunburst with a star, printed on vinyl
  for (const s of [-1, 1]) {
    const art = decal(w - 0.09, h - 0.2, 384, 448, (x) => {
      const W = 384;
      const H = 448;
      x.save();
      x.beginPath();
      x.roundRect(0, 0, W, H, 26);
      x.clip();
      x.fillStyle = '#f2b02a';
      x.fillRect(0, 0, W, H);
      x.translate(W / 2, H * 0.56);
      for (let i = 0; i < 16; i++) {
        x.fillStyle = i % 2 ? '#e4442b' : '#f6c23a';
        x.beginPath();
        x.moveTo(0, 0);
        x.arc(0, 0, 520, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#fff6dc';
      x.strokeStyle = '#1b2140';
      x.lineWidth = 9;
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? 62 : 138;
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.closePath();
      x.fill();
      x.stroke();
      x.restore();
      x.strokeStyle = '#1b2140';
      x.lineWidth = 10;
      x.beginPath();
      x.roundRect(5, 5, W - 10, H - 10, 24);
      x.stroke();
    });
    art.position.set(0, 0.03, s * (d / 2 + 0.0012));
    if (s < 0) art.rotation.y = Math.PI;
    g.add(art);
  }
  // Front: coin door with slot, return flap and lock; speaker grille beside it
  const fx = w / 2;
  add(g, new Mesh(new BoxGeometry(0.006, 0.27, 0.21), black), fx + 0.002, -0.1, -0.16);
  add(g, new Mesh(new BoxGeometry(0.008, 0.245, 0.185), steel()), fx + 0.005, -0.1, -0.16);
  add(g, new Mesh(new BoxGeometry(0.006, 0.07, 0.05), black), fx + 0.008, -0.04, -0.16, false);
  const slot = new MeshStandardMaterial({ color: new Color(0x2a0d00), emissive: new Color(0xff7a1a), emissiveIntensity: 1.6 });
  add(g, new Mesh(new BoxGeometry(0.004, 0.036, 0.006), slot), fx + 0.011, -0.04, -0.16, false);
  add(g, new Mesh(new BoxGeometry(0.006, 0.045, 0.09), black), fx + 0.008, -0.17, -0.16, false);
  const lock = add(g, new Mesh(new CylinderGeometry(0.011, 0.011, 0.008, 20), ch), fx + 0.01, -0.1, -0.235, false);
  lock.rotation.z = Math.PI / 2;
  const grille = decal(0.2, 0.2, 256, 256, (x) => {
    x.fillStyle = '#0c0d10';
    x.beginPath();
    x.arc(128, 128, 120, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#34373e';
    for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {
      const px = 128 + i * 15 + (j % 2 ? 7.5 : 0);
      const py = 128 + j * 13;
      if (Math.hypot(px - 128, py - 128) > 108) continue;
      x.beginPath();
      x.arc(px, py, 4, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = '#a9aeb5';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(128, 128, 120, 0, Math.PI * 2);
    x.stroke();
  });
  grille.rotation.y = Math.PI / 2;
  grille.position.set(fx + 0.0012, -0.08, 0.17);
  g.add(grille);
  return g;
}

/** Marquee dressing for the cabinet's back panel (a 0.06 x 0.42 x d slab): lit header, lamp bezels, chrome cap and cheeks. */
export function moleMarquee(d: number, pipX: number, pipY: number, pipZs: number[]): Group {
  const g = new Group();
  const ch = chrome();
  add(g, new Mesh(new BoxGeometry(0.08, 0.014, d + 0.016), ch), 0, 0.214, 0);
  for (const s of [-1, 1]) add(g, new Mesh(new BoxGeometry(0.08, 0.43, 0.012), plastic(0x1f4fa8, 0.4)), 0, 0, s * (d / 2 + 0.004));
  const header = decal(d - 0.07, 0.1, 768, 112, (x) => {
    const grad = x.createLinearGradient(0, 0, 0, 112);
    grad.addColorStop(0, '#ffe27a');
    grad.addColorStop(1, '#f5a623');
    x.fillStyle = grad;
    x.beginPath();
    x.roundRect(0, 0, 768, 112, 16);
    x.fill();
    x.font = 'italic 900 78px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.strokeStyle = '#1b2140';
    x.lineWidth = 14;
    x.strokeText('WHACK-A-MOLE', 384, 60);
    x.fillStyle = '#e02a2a';
    x.fillText('WHACK-A-MOLE', 384, 60);
  }, 0.55);
  header.rotation.y = Math.PI / 2;
  header.position.set(0.0312, 0.15, 0);
  g.add(header);
  const label = decal(0.2, 0.035, 256, 44, (x) => {
    x.font = '700 34px Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff3d6';
    x.fillText('S C O R E', 128, 24);
  });
  label.rotation.y = Math.PI / 2;
  label.position.set(0.0312, pipY - 0.055, 0);
  g.add(label);
  for (const z of pipZs) {
    const ring = add(g, new Mesh(new TorusGeometry(0.033, 0.0045, 10, 32), ch), pipX, pipY, z, false);
    ring.rotation.y = Math.PI / 2;
  }
  return g;
}

/** Details for the foam mallet (shaft along Y, 0.24 long; head across X at y = 0.11, radius 0.042, 0.13 long). */
export function hammerDetail(headColor: number): Group {
  const g = new Group();
  const rubber = plastic(0x131417, 0.85);
  add(g, new Mesh(new CylinderGeometry(0.0175, 0.0165, 0.1, 20), rubber), 0, -0.068, 0);
  for (let i = 0; i < 6; i++) {
    const rib = add(g, new Mesh(new TorusGeometry(0.0175, 0.0022, 6, 20), rubber), 0, -0.105 + i * 0.015, 0, false);
    rib.rotation.x = Math.PI / 2;
  }
  const pommel = add(g, new Mesh(new PlainSphere(0.021, 18, 12), rubber), 0, -0.12, 0);
  pommel.scale.y = 0.55;
  add(g, new Mesh(new CylinderGeometry(0.021, 0.024, 0.028, 20), plastic(0xf2b02a, 0.4)), 0, 0.066, 0);
  const band = plastic(0xf2b02a, 0.4);
  const face = plastic(headColor, 0.5);
  for (const s of [-1, 1]) {
    const ring = add(g, new Mesh(new TorusGeometry(0.0425, 0.004, 8, 36), band), s * 0.04, 0.11, 0, false);
    ring.rotation.y = Math.PI / 2;
    const dome = add(g, new Mesh(new PlainSphere(0.0418, 24, 14), face), s * 0.064, 0.11, 0);
    dome.scale.x = 0.22;
  }
  return g;
}

// ---- High striker --------------------------------------------------------------------------

/**
 * Carnival high-striker dressing around the plain base and mast: printed strength scale, chrome
 * puck rails, chaser bulbs in brass sockets, back braces, name plaque and brass corner caps.
 * Origin: floor under the centre of the base; the player faces it from -Z. The mast's front face
 * is at z = mastZ and it spans y0..y1.
 */
export function strikerDress(mastZ: number, y0: number, y1: number, bulbGlow: MeshStandardMaterial): Group {
  const g = new Group();
  const H = y1 - y0 - 0.34;
  const scale = decal(0.124, H, 128, 2048, (x) => {
    const W = 128;
    const Hh = 2048;
    const grad = x.createLinearGradient(0, 0, 0, Hh);
    grad.addColorStop(0, '#f6efdb');
    grad.addColorStop(1, '#eadfc2');
    x.fillStyle = grad;
    x.fillRect(0, 0, W, Hh);
    const bands = ['#d7ecd0', '#e3efc4', '#f3edb9', '#f6dfae', '#f5cfa6', '#f2bca0', '#eea79a', '#e88f8f'];
    const top = 150;
    const bh = (Hh - top - 40) / bands.length;
    const names = ['FEATHER', 'ROOKIE', 'STEADY', 'STRONG', 'MIGHTY', 'HERO', 'CHAMP', 'LEGEND'];
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let i = 0; i < bands.length; i++) {
      const yb = Hh - 40 - (i + 1) * bh;
      x.fillStyle = bands[i];
      x.fillRect(10, yb, W - 20, bh);
      x.fillStyle = '#7a1c16';
      x.fillRect(10, yb, W - 20, 5);
      for (let k = 1; k < 5; k++) x.fillRect(10, yb + (k * bh) / 5, k % 5 ? 20 : 34, 2);
      for (let k = 1; k < 5; k++) x.fillRect(W - 30, yb + (k * bh) / 5, 20, 2);
      x.fillStyle = '#7a1c16';
      x.font = '900 46px Georgia, "Times New Roman", serif';
      x.fillText(String((i + 1) * 100), W / 2, yb + 44);
      x.save();
      x.translate(W / 2, yb + bh * 0.62);
      x.rotate(-Math.PI / 2);
      x.font = '700 24px Georgia, "Times New Roman", serif';
      x.fillStyle = '#2a2320';
      x.fillText(names[i], 0, 0);
      x.restore();
    }
    // Star burst under the bell
    x.fillStyle = '#c9a23a';
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? 26 : 54;
      x.lineTo(W / 2 + Math.cos(a) * rr, 78 + Math.sin(a) * rr);
    }
    x.fill();
    x.fillStyle = '#7a1c16';
    x.font = '900 28px Georgia, serif';
    x.fillText('DING', W / 2, 80);
    x.strokeStyle = '#7a1c16';
    x.lineWidth = 8;
    x.strokeRect(4, 4, W - 8, Hh - 8);
  });
  scale.rotation.y = Math.PI;
  scale.position.set(0, y0 + 0.17 + H / 2, mastZ - 0.0015);
  g.add(scale);
  const ch = chrome();
  for (const s of [-1, 1]) add(g, new Mesh(new CylinderGeometry(0.0045, 0.0045, H + 0.1, 10), ch), s * 0.066, y0 + 0.17 + H / 2, mastZ - 0.012, false);
  // Chaser bulbs down both edges
  const ys: number[] = [];
  for (let y = y0 + 0.3; y < y1 - 0.12; y += 0.17) ys.push(y);
  const bulbs = new InstancedMesh(new PlainSphere(0.0135, 14, 10), bulbGlow, ys.length * 2);
  const sockets = new InstancedMesh(new CylinderGeometry(0.0095, 0.0095, 0.014, 12), std(0xb08a45, 0.3, 1), ys.length * 2);
  const M = new Matrix4();
  const R = new Matrix4().makeRotationX(Math.PI / 2);
  let n = 0;
  for (const y of ys) for (const s of [-1, 1]) {
    M.makeTranslation(s * 0.083, y, mastZ - 0.012);
    bulbs.setMatrixAt(n, M);
    M.makeTranslation(s * 0.083, y, mastZ - 0.002).multiply(R);
    sockets.setMatrixAt(n++, M);
  }
  bulbs.instanceMatrix.needsUpdate = sockets.instanceMatrix.needsUpdate = true;
  bulbs.raycast = sockets.raycast = () => {};
  g.add(bulbs, sockets);
  // Painted edge posts carry the bulbs; braces at the back
  const red = plastic(0x9b1c14, 0.4);
  for (const s of [-1, 1]) add(g, new Mesh(new BoxGeometry(0.03, y1 - y0, 0.07), red), s * 0.083, (y0 + y1) / 2, mastZ + 0.036);
  const up = new Vector3(0, 1, 0);
  for (const s of [-1, 1]) {
    const a = new Vector3(s * 0.17, 0.13, mastZ + 0.12);
    const b = new Vector3(s * 0.05, 0.95, mastZ + 0.085);
    const brace = add(g, new Mesh(new CylinderGeometry(0.011, 0.011, a.distanceTo(b), 12), red), 0, 0, 0);
    brace.position.copy(a).add(b).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
  }
  // Brass finial on the mast and corner caps on the base
  const brassM = std(0xc9a23a, 0.25, 1);
  add(g, new Mesh(lathe([[0, 0], [0.05, 0], [0.055, 0.008], [0.03, 0.02], [0.018, 0.035], [0.03, 0.05], [0.036, 0.068], [0.026, 0.088], [0, 0.096]], 28, 3), brassM), 0, y1, mastZ + 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new Mesh(new BoxGeometry(0.05, 0.145, 0.05), brassM), sx * 0.209, 0.0715, sz * 0.209);
  const plaque = decal(0.3, 0.075, 512, 128, (x) => {
    x.fillStyle = '#5a0f0b';
    x.beginPath();
    x.roundRect(0, 0, 512, 128, 18);
    x.fill();
    x.strokeStyle = '#d9b24a';
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(8, 8, 496, 112, 14);
    x.stroke();
    x.font = '900 62px Georgia, "Times New Roman", serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#e6c25a';
    x.fillText('HIGH STRIKER', 256, 68);
  });
  plaque.rotation.y = Math.PI;
  plaque.position.set(0, 0.07, -0.2312);
  g.add(plaque);
  return g;
}

// ---- Reflex bag ----------------------------------------------------------------------------

/** Weighted round base with a filler cap. Origin: centre of the 0.08 tall collider slab. */
export function bagBase(): Group {
  const g = new Group();
  const shell = plastic(0x1a1c20, 0.62);
  add(
    g,
    new Mesh(
      lathe([[0, -0.04], [0.2, -0.04], [0.214, -0.034], [0.218, -0.02], [0.214, -0.004], [0.2, 0.008], [0.15, 0.02], [0.09, 0.03], [0.055, 0.04], [0.045, 0.058], [0, 0.058]], 56, 3),
      shell,
    ),
    0,
    0,
    0,
  );
  add(g, new Mesh(new CylinderGeometry(0.024, 0.026, 0.016, 20), plastic(0x8a8e94, 0.5)), 0.14, 0.024, 0.05);
  const ring = add(g, new Mesh(new TorusGeometry(0.048, 0.006, 10, 32), chrome()), 0, 0.058, 0, false);
  ring.rotation.x = Math.PI / 2;
  return g;
}

/** Teardrop punch bag on a rod: narrow collar at the bottom swelling to a rounded crown. Centred on the origin, about 0.43 tall. */
export function bagGeometry(): LatheGeometry {
  return lathe(
    [
      [0.001, -0.215], [0.027, -0.214], [0.033, -0.2], [0.036, -0.175], [0.052, -0.14], [0.085, -0.085], [0.122, -0.02],
      [0.15, 0.05], [0.16, 0.105], [0.153, 0.155], [0.128, 0.193], [0.085, 0.214], [0.035, 0.222], [0.001, 0.223],
    ],
    56,
    4,
  );
}

/** Collar and crown button for the punch bag. */
export function bagTrim(): Group {
  const g = new Group();
  const ch = chrome();
  add(g, new Mesh(new CylinderGeometry(0.03, 0.026, 0.03, 24), ch), 0, -0.222, 0);
  const cap = add(g, new Mesh(new PlainSphere(0.022, 20, 12), plastic(0x111214, 0.6)), 0, 0.222, 0);
  cap.scale.y = 0.4;
  return g;
}

// ---- Bowling lane --------------------------------------------------------------------------

/** Printed lane markings: pin spots, aiming arrows, approach dots, foul line. Lies flat; +Z of the lane is the bowler's end. */
export function laneMarkings(w: number, len: number, pinSpots: Array<[number, number]>): Mesh {
  const m = decal(w, len, 256, 1088, (x) => {
    const sx = 256 / w;
    const sz = 1088 / len;
    const X = (v: number) => 128 + v * sx;
    const Zp = (v: number) => (v + len / 2) * sz;
    x.fillStyle = 'rgba(48,26,10,0.78)';
    for (let k = -3; k <= 3; k++) {
      const cx = X(k * 0.095);
      const cz = Zp(len * 0.12 + Math.abs(k) * 0.07);
      x.beginPath();
      x.moveTo(cx, cz - 0.06 * sz);
      x.lineTo(cx + 0.016 * sx, cz + 0.04 * sz);
      x.lineTo(cx - 0.016 * sx, cz + 0.04 * sz);
      x.fill();
      x.beginPath();
      x.arc(X(k * 0.095), Zp(len * 0.36), 0.008 * sx, 0, Math.PI * 2);
      x.fill();
    }
    x.fillRect(0, Zp(len * 0.42), 256, 0.012 * sz);
    x.fillStyle = 'rgba(30,18,8,0.55)';
    for (const [px, pz] of pinSpots) {
      x.beginPath();
      x.arc(X(px), Zp(pz), 0.03 * sx, 0, Math.PI * 2);
      x.fill();
    }
  });
  m.rotation.x = -Math.PI / 2;
  return m;
}
