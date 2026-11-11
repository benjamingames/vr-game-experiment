/**
 * Modelled furniture: pieces with the curves, soft edges and mixed materials the real things have,
 * instead of plain blocks. Build a piece, add it to the scene, then call `bake.bakeObject(piece)`
 * so it receives the same baked light and ambient occlusion as the room around it.
 * All dimensions are metres; every piece stands on y = 0 at its own origin.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { fabric } from './materials.js';
import { QUALITY } from './quality.js';

const metal = (color: number, rough: number) =>
  new MeshStandardMaterial({ color: new Color(color), metalness: 1, roughness: rough });
const matte = (color: number, rough: number) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: rough });

function lathe(pts: Array<[number, number]>, segs = 48) {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), QUALITY.high ? segs : segs / 2);
}

function put<T extends Mesh>(parent: Group | Mesh, m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * A cushion: a box whose edges are rounded with radius `r` and whose face along `puffAxis`
 * (1 = top, 2 = front) swells by `puff`, like stuffed upholstery. Smooth normals throughout.
 */
export function pillow(w: number, h: number, d: number, r: number, puff = 0, puffAxis: 1 | 2 = 1): BufferGeometry {
  const seg = (len: number) => Math.max(4, Math.min(QUALITY.high ? 22 : 10, Math.ceil(len / 0.03)));
  const g = new BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
  const half = [w / 2, h / 2, d / 2];
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const oa = puffAxis === 1 ? 0 : 0;
  const ob = puffAxis === 1 ? 2 : 1;
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i);
    p[1] = pos.getY(i);
    p[2] = pos.getZ(i);
    let len = 0;
    for (let a = 0; a < 3; a++) {
      const inner = Math.max(-(half[a] - r), Math.min(half[a] - r, p[a]));
      q[a] = p[a] - inner;
      p[a] = inner;
      len += q[a] * q[a];
    }
    len = Math.sqrt(len) || 1;
    for (let a = 0; a < 3; a++) p[a] += (q[a] / len) * r;
    // Swell the stuffed face, fading to nothing at its edges and on the opposite side
    const ua = p[oa] / half[oa];
    const ub = p[ob] / half[ob];
    const up = Math.max(0, p[puffAxis] / half[puffAxis]);
    p[puffAxis] += puff * (1 - ua * ua) * (1 - ub * ub) * up;
    pos.setXYZ(i, p[0], p[1], p[2]);
    nrm.setXYZ(i, q[0] / len, q[1] / len, q[2] / len);
  }
  return g;
}

/** Bends a geometry around the vertical axis: x-extremes move forward by `k * x^2`. */
function wrap(g: BufferGeometry, k: number) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + k * pos.getX(i) * pos.getX(i));
  g.computeVertexNormals();
  return g;
}

/** Ergonomic task chair: five-star base on castors, gas lift, contoured seat, curved back, arms, headrest. Faces +Z. */
export function officeChair(): Group {
  const g = new Group();
  const cloth = fabric(0x2f3035);
  const clothBack = fabric(0x3b3c42);
  const shell = matte(0x121316, 0.42);
  const alu = metal(0xc9ccd1, 0.28);
  const chrome = metal(0xe8ebef, 0.1);
  const rubber = matte(0x0b0b0c, 0.85);

  // Five-star base with twin-wheel castors
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const arm = new Group();
    arm.rotation.y = a;
    g.add(arm);
    const spoke = put(arm, new Mesh(new CylinderGeometry(0.013, 0.024, 0.3, 14), alu), 0, 0.088, 0.17);
    spoke.rotation.x = Math.PI / 2 - 0.1;
    spoke.scale.z = 0.7;
    const stem = put(arm, new Mesh(new CylinderGeometry(0.006, 0.006, 0.03, 10), chrome), 0, 0.058, 0.315);
    void stem;
    put(arm, new Mesh(pillow(0.034, 0.026, 0.05, 0.01), shell), 0, 0.044, 0.318);
    for (const s of [-1, 1]) {
      const wheel = put(arm, new Mesh(new CylinderGeometry(0.026, 0.026, 0.014, 24), rubber), s * 0.016, 0.026, 0.322);
      wheel.rotation.z = Math.PI / 2;
    }
  }
  put(g, new Mesh(lathe([[0, 0.07], [0.04, 0.07], [0.046, 0.085], [0.04, 0.125], [0.03, 0.135], [0, 0.135]], 28), alu), 0, 0, 0);
  put(g, new Mesh(new CylinderGeometry(0.027, 0.03, 0.17, 24), shell), 0, 0.215, 0);
  put(g, new Mesh(new CylinderGeometry(0.015, 0.015, 0.16, 20), chrome), 0, 0.36, 0);
  // Tilt mechanism with a paddle lever
  put(g, new Mesh(pillow(0.2, 0.045, 0.24, 0.014), shell), 0, 0.425, -0.01);
  const lever = put(g, new Mesh(new CylinderGeometry(0.005, 0.005, 0.16, 10), shell), 0.17, 0.42, 0.05);
  lever.rotation.z = Math.PI / 2;
  put(g, new Mesh(pillow(0.05, 0.012, 0.03, 0.005), shell), 0.26, 0.42, 0.05);
  // Seat: moulded shell, then a contoured cushion with a waterfall front edge
  put(g, new Mesh(pillow(0.5, 0.03, 0.49, 0.014), shell), 0, 0.455, 0.01);
  const seatG = pillow(0.49, 0.075, 0.48, 0.034, 0.014);
  const sp = seatG.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) / 0.245;
    const z = sp.getZ(i) / 0.24;
    // Dished centre, raised sides, front edge rolling down
    sp.setY(i, sp.getY(i) + 0.012 * x * x - 0.008 * (1 - x * x) * (1 - z * z) - (z > 0.6 ? (z - 0.6) * 0.045 : 0));
  }
  seatG.computeVertexNormals();
  put(g, new Mesh(seatG, cloth), 0, 0.51, 0.01);
  // Back: spine, curved upholstered panel, lumbar pad, headrest
  const spine = put(g, new Mesh(pillow(0.06, 0.5, 0.03, 0.012), shell), 0, 0.66, -0.255);
  spine.rotation.x = -0.14;
  const back = put(g, new Mesh(wrap(pillow(0.46, 0.56, 0.045, 0.02, 0.012, 2), 0.42), clothBack), 0, 0.86, -0.255);
  back.rotation.x = -0.13;
  const rim = put(g, new Mesh(wrap(pillow(0.48, 0.58, 0.022, 0.01), 0.42), shell), 0, 0.86, -0.275);
  rim.rotation.x = -0.13;
  const lumbar = put(g, new Mesh(wrap(pillow(0.34, 0.11, 0.03, 0.013, 0.008, 2), 0.42), cloth), 0, 0.7, -0.212);
  lumbar.rotation.x = -0.1;
  const neck = put(g, new Mesh(pillow(0.03, 0.16, 0.014, 0.006), shell), 0, 1.17, -0.325);
  neck.rotation.x = -0.2;
  const head = put(g, new Mesh(wrap(pillow(0.27, 0.13, 0.055, 0.024, 0.01, 2), 0.5), cloth), 0, 1.26, -0.325);
  head.rotation.x = -0.1;
  // Armrests: post, height sleeve, soft pad
  for (const s of [-1, 1]) {
    put(g, new Mesh(pillow(0.03, 0.2, 0.055, 0.01), shell), s * 0.275, 0.56, -0.04);
    put(g, new Mesh(pillow(0.04, 0.07, 0.065, 0.012), shell), s * 0.275, 0.63, -0.04);
    put(g, new Mesh(pillow(0.075, 0.032, 0.25, 0.014, 0.004), rubber), s * 0.275, 0.685, 0.0);
    const brace = put(g, new Mesh(pillow(0.09, 0.022, 0.05, 0.009), shell), s * 0.235, 0.465, -0.04);
    void brace;
  }
  return g;
}

/** Floor lamp: weighted bronze base, slim brass stem, linen drum shade with rings, spider and bulb. */
export function floorLamp(): Group {
  const g = new Group();
  const bronze = metal(0x3a3027, 0.42);
  const brassM = metal(0xb89a5a, 0.3);
  put(g, new Mesh(lathe([[0, 0], [0.15, 0], [0.156, 0.005], [0.154, 0.016], [0.14, 0.022], [0.03, 0.027], [0.018, 0.04], [0, 0.04]]), bronze), 0, 0, 0);
  put(g, new Mesh(new CylinderGeometry(0.008, 0.008, 1.44, 16), brassM), 0, 0.76, 0);
  put(g, new Mesh(lathe([[0.008, 0], [0.016, 0.006], [0.016, 0.03], [0.011, 0.036], [0.011, 0.07], [0, 0.07]], 20), brassM), 0, 1.44, 0);
  // Shade: glowing woven linen, open top and bottom
  const linen = fabric(0xf3e7d2);
  linen.emissive = new Color(0xffc98a);
  linen.emissiveIntensity = 1.1;
  {
    // Light through cloth: hottest level with the bulb, falling off toward both rims
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const x = c.getContext('2d')!;
    const grad = x.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, '#6f6f6f');
    grad.addColorStop(0.32, '#ffffff');
    grad.addColorStop(0.55, '#c8c8c8');
    grad.addColorStop(1, '#5c5c5c');
    x.fillStyle = grad;
    x.fillRect(0, 0, 4, 64);
    linen.emissiveMap = new CanvasTexture(c);
  }
  linen.side = DoubleSide;
  linen.userData.noBake = true;
  const shade = put(g, new Mesh(new CylinderGeometry(0.17, 0.2, 0.3, 56, 1, true), linen), 0, 1.56, 0);
  shade.castShadow = false;
  for (const [r, y] of [[0.17, 1.71], [0.2, 1.41]]) {
    const ring = put(g, new Mesh(new TorusGeometry(r, 0.003, 8, 56), brassM), 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const wire = put(g, new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.17, 6), brassM), Math.cos(a) * 0.085, 1.71, Math.sin(a) * 0.085);
    wire.rotation.z = Math.PI / 2;
    wire.rotation.y = -a;
  }
  const bulbMat = new MeshStandardMaterial({ color: new Color(0xfff4e0), emissive: new Color(0xffd9a0), emissiveIntensity: 6 });
  bulbMat.userData.noBake = true;
  const bulb = put(g, new Mesh(lathe([[0, 0], [0.012, 0.004], [0.014, 0.03], [0.03, 0.06], [0.034, 0.085], [0.024, 0.11], [0, 0.118]], 24), bulbMat), 0, 1.5, 0);
  bulb.castShadow = false;
  const chain = put(g, new Mesh(new CylinderGeometry(0.001, 0.001, 0.14, 6), brassM), 0.04, 1.42, 0);
  void chain;
  put(g, new Mesh(new SphereGeometry(0.005, 12, 8), brassM), 0.04, 1.345, 0);
  return g;
}

/** Sofa upholstery to sit on a plain base: two seat cushions, two back cushions, rolled arms, throw pillows. */
export function sofaCushions(x0: number, x1: number, zBack: number, zFront: number, color: number): Group {
  const g = new Group();
  const cloth = fabric(color);
  const accent = fabric(0x8a6a3c);
  const dark = fabric(0x34353a);
  const armW = 0.23;
  const inner0 = x0 + armW;
  const inner1 = x1 - armW;
  const mid = (inner0 + inner1) / 2;
  const depth = zFront - zBack;
  for (const [a, b] of [[inner0, mid], [mid, inner1]]) {
    const w = b - a - 0.012;
    put(g, new Mesh(pillow(w, 0.16, depth - 0.26, 0.055, 0.022), cloth), (a + b) / 2, 0.47, zBack + 0.26 + (depth - 0.26) / 2 + 0.02);
    const backC = put(g, new Mesh(pillow(w, 0.42, 0.22, 0.075, 0.03, 2), cloth), (a + b) / 2, 0.75, zBack + 0.15);
    backC.rotation.x = -0.1;
  }
  for (const x of [x0 + armW / 2, x1 - armW / 2]) {
    put(g, new Mesh(pillow(armW, 0.52, depth, 0.085), cloth), x, 0.4, zBack + depth / 2);
  }
  const t1 = put(g, new Mesh(pillow(0.42, 0.42, 0.13, 0.06, 0.035, 2), dark), inner0 + 0.27, 0.72, zBack + 0.36);
  t1.rotation.set(-0.3, 0.3, 0.08);
  const t2 = put(g, new Mesh(pillow(0.36, 0.36, 0.12, 0.055, 0.03, 2), accent), inner1 - 0.25, 0.7, zBack + 0.38);
  t2.rotation.set(-0.32, -0.35, -0.1);
  // Stubby turned feet
  const foot = matte(0x1a1512, 0.5);
  for (const x of [x0 + 0.1, x1 - 0.1]) {
    for (const z of [zBack + 0.1, zFront - 0.1]) {
      put(g, new Mesh(lathe([[0, 0], [0.016, 0], [0.024, 0.06], [0.027, 0.1], [0, 0.1]], 16), foot), x, 0.012, z);
    }
  }
  return g;
}

/** Desk accessories around a monitor panel: weighted stand, mug, mouse, key caps, pen. Origin at the desk surface. */
export function deskSet(): Group {
  const g = new Group();
  const alu = metal(0xc4c7cc, 0.3);
  const ceramic = new MeshPhysicalMaterial({ color: new Color(0xf2efe8), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const black = matte(0x15161a, 0.4);
  // Monitor stand: disc foot and a swept neck
  put(g, new Mesh(lathe([[0, 0], [0.105, 0], [0.11, 0.004], [0.105, 0.009], [0.02, 0.012], [0, 0.012]]), alu), 0, 0, 0.09);
  const neck = put(g, new Mesh(pillow(0.05, 0.3, 0.014, 0.006), alu), 0, 0.15, 0.11);
  neck.rotation.x = 0.16;
  put(g, new Mesh(pillow(0.09, 0.09, 0.02, 0.008), black), 0, 0.3, 0.075);
  // Mug with handle
  const mug = put(g, new Mesh(lathe([[0, 0], [0.034, 0], [0.038, 0.004], [0.04, 0.09], [0.041, 0.094], [0.038, 0.094], [0.036, 0.012], [0, 0.01]], 36), ceramic), 0.62, 0, -0.22);
  mug.material.side = DoubleSide;
  const handle = put(g, new Mesh(new TorusGeometry(0.026, 0.006, 10, 24, Math.PI * 1.15), ceramic), 0.665, 0.05, -0.22);
  handle.rotation.z = -Math.PI * 0.58;
  const coffee = put(g, new Mesh(new CylinderGeometry(0.0365, 0.0365, 0.002, 28), matte(0x2a170c, 0.2)), 0.62, 0.078, -0.22);
  coffee.castShadow = false;
  // Mouse
  const mouse = put(g, new Mesh(new SphereGeometry(1, 28, 18), black), 0.36, 0.016, -0.3);
  mouse.scale.set(0.031, 0.017, 0.054);
  // Pen
  const pen = put(g, new Mesh(new CylinderGeometry(0.004, 0.004, 0.14, 12), metal(0x2a2c31, 0.35)), 0.72, 0.006, -0.42);
  pen.rotation.set(Math.PI / 2, 0, 0.5);
  // Key caps on the keyboard slab
  const cols = 21;
  const rows = 6;
  const cap = new BoxGeometry(0.0165, 0.005, 0.0165);
  const keys = new InstancedMesh(cap, matte(0x24262b, 0.55), cols * rows);
  keys.userData.noBake = true;
  const M = new Matrix4();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c > 5 && c < 13) continue;
      M.makeTranslation(-0.215 + c * 0.0205 + 0.01, 0.0135, -0.385 + r * 0.021 + 0.012);
      keys.setMatrixAt(n++, M);
    }
  }
  M.makeScale(7.4, 1, 1).setPosition(-0.215 + 9 * 0.0205 + 0.01, 0.0135, -0.385 + 5 * 0.021 + 0.012);
  keys.setMatrixAt(n++, M);
  keys.count = n;
  keys.instanceMatrix.needsUpdate = true;
  g.add(keys);
  void Vector3;
  return g;
}

/** A lit monitor image: a desktop with an editor window, a chart and a dock. Faces +Z; w x h metres. */
export function screenImage(w: number, h: number): Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const x = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#22344f');
  bg.addColorStop(0.55, '#3d5d7c');
  bg.addColorStop(1, '#c58a62');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(12,14,18,0.55)';
  x.fillRect(0, 0, W, 22);
  const win = (px: number, py: number, pw: number, ph: number, fill: string) => {
    x.fillStyle = 'rgba(0,0,0,0.28)';
    x.beginPath();
    x.roundRect(px + 4, py + 8, pw, ph, 10);
    x.fill();
    x.fillStyle = fill;
    x.beginPath();
    x.roundRect(px, py, pw, ph, 10);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(px, py + 26, pw, 1);
    ['#ee6a5f', '#f5bd4f', '#61c454'].forEach((col, i) => {
      x.fillStyle = col;
      x.beginPath();
      x.arc(px + 16 + i * 16, py + 13, 5, 0, Math.PI * 2);
      x.fill();
    });
  };
  // Editor window with indented lines of "code"
  win(50, 50, 560, H - 150, '#1d2026');
  const inks = ['#7fb4e6', '#d8dee9', '#c792ea', '#9ccc8f', '#e0b072'];
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < Math.floor((H - 210) / 15); i++) {
    let px = 72 + Math.floor(rnd() * 4) * 18;
    const y = 90 + i * 15;
    x.fillStyle = '#4a505c';
    x.fillRect(58, y, 8, 5);
    if (rnd() < 0.12) continue;
    const n = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const len = 18 + rnd() * 90;
      x.fillStyle = inks[Math.floor(rnd() * inks.length)];
      x.fillRect(px, y, len, 5);
      px += len + 8;
      if (px > 560) break;
    }
  }
  // Chart window
  win(640, 80, 340, 230, '#f4f2ee');
  x.strokeStyle = '#d9d5cd';
  x.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.moveTo(660, 130 + i * 38);
    x.lineTo(960, 130 + i * 38);
    x.stroke();
  }
  x.strokeStyle = '#2f6fb2';
  x.lineWidth = 3;
  x.beginPath();
  for (let i = 0; i <= 20; i++) x.lineTo(660 + i * 15, 260 - i * 5 - Math.sin(i * 0.9) * 22 - rnd() * 10);
  x.stroke();
  // Notes window
  win(690, 340, 290, H - 450, '#fbf6e6');
  x.fillStyle = '#6d675c';
  for (let i = 0; i < Math.floor((H - 520) / 16); i++) x.fillRect(708, 384 + i * 16, 90 + rnd() * 160, 4);
  // Dock
  x.fillStyle = 'rgba(240,240,245,0.28)';
  x.beginPath();
  x.roundRect(W / 2 - 190, H - 62, 380, 50, 14);
  x.fill();
  ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#e5e7eb', '#0ea5e9'].forEach((col, i) => {
    x.fillStyle = col;
    x.beginPath();
    x.roundRect(W / 2 - 172 + i * 50, H - 54, 34, 34, 8);
    x.fill();
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = QUALITY.anisotropy;
  const m = new MeshStandardMaterial({
    color: new Color(0x000000),
    emissive: new Color(0xffffff),
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    roughness: 0.25,
  });
  m.userData.noBake = true;
  const mesh = new Mesh(new PlaneGeometry(w, h), m);
  mesh.userData.noBake = true;
  return mesh;
}
