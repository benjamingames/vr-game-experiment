/**
 * Interior dressing, all generated: potted trees, floating shelves with books, vases and framed
 * art, a woven rug, concealed LED wall washes, and soft ambient-occlusion gradients in the
 * corners and under furniture. Everything is added to the room group (hidden in the Monke arena).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry as PlainCylinder,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { procEnv } from './env.js';
import { BoxGeometry } from './geometry.js';
import { oak, rug } from './materials.js';
import { QUALITY } from './quality.js';

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lathe(pts: Array<[number, number]>, segs = 40) {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), QUALITY.high ? segs : segs / 2);
}

function gradientTexture(rgb: string, radial = false): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = radial ? x.createRadialGradient(64, 64, 0, 64, 64, 64) : x.createLinearGradient(0, 128, 0, 0);
  // Eased falloff so the gradient has no visible end
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    g.addColorStop(t, `rgba(${rgb},${Math.pow(1 - t, 2.2).toFixed(3)})`);
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Quad whose first edge (p0-p1) is the strong end of the gradient. */
function gradQuad(p: number[][]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(p.flat(), 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// ---- Ambient occlusion + LED washes ---------------------------------------------------

function buildAO(root: Group) {
  const mat = new MeshBasicMaterial({
    map: gradientTexture('0,0,0'),
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const add = (p: number[][], order = 3) => {
    const m = new Mesh(gradQuad(p), mat);
    m.renderOrder = order;
    m.raycast = () => {};
    root.add(m);
  };
  const y = 0.004;
  const w = 0.55;
  const R = 2.99;
  // Floor, along each wall
  add([[-R, y, -R], [R, y, -R], [R, y, -R + w], [-R, y, -R + w]]);
  add([[R, y, R], [-R, y, R], [-R, y, R - w], [R, y, R - w]]);
  add([[-R, y, R], [-R, y, -R], [-R + w, y, -R], [-R + w, y, R]]);
  add([[R, y, -R], [R, y, R], [R - w, y, R], [R - w, y, -R]]);
  // Walls: vertical corners, and the band just above the floor
  const o = 2.962;
  const cw = 0.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add([[sx * o, 0, sz * o], [sx * o, 3, sz * o], [sx * (o - cw), 3, sz * o], [sx * (o - cw), 0, sz * o]]);
      add([[sx * o, 0, sz * o], [sx * o, 3, sz * o], [sx * o, 3, sz * (o - cw)], [sx * o, 0, sz * (o - cw)]]);
    }
    add([[-o, 0.14, sx * o], [o, 0.14, sx * o], [o, 0.5, sx * o], [-o, 0.5, sx * o]]);
    add([[sx * o, 0.14, -o], [sx * o, 0.14, o], [sx * o, 0.5, o], [sx * o, 0.5, -o]]);
    // Under the crown rail
    add([[-o, 2.86, sx * o], [o, 2.86, sx * o], [o, 2.6, sx * o], [-o, 2.6, sx * o]]);
    add([[sx * o, 2.86, -o], [sx * o, 2.86, o], [sx * o, 2.6, o], [sx * o, 2.6, -o]]);
  }
  // Soft contact shadows under furniture
  const blob = new MeshBasicMaterial({
    map: gradientTexture('0,0,0', true),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  const contact = (x: number, z: number, sx: number, sz: number, h = 0.018) => {
    const m = new Mesh(new PlaneGeometry(sx, sz), blob);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, h, z);
    m.renderOrder = 4;
    m.raycast = () => {};
    root.add(m);
  };
  contact(0, -0.7, 2.0, 1.25);
  contact(-1.75, 0.05, 1.0, 1.4, 0.006);
  contact(-1.95, 1.65, 1.1, 1.3, 0.006);
  contact(2.18, -0.55, 1.3, 3.7, 0.006);
  return contact;
}

function buildCove(root: Group) {
  const glow = new MeshBasicMaterial({
    map: gradientTexture('255,196,128'),
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const strip = new MeshStandardMaterial({
    color: new Color(0xfff0d8),
    emissive: new Color(0xffc988),
    emissiveIntensity: 3,
    roughness: 0.4,
  });
  procEnv.cove = { glow, strip };
  const o = 2.955;
  const top = 2.855;
  const bot = 1.75;
  for (const s of [-1, 1]) {
    const a = new Mesh(gradQuad([[-o, top, s * o], [o, top, s * o], [o, bot, s * o], [-o, bot, s * o]]), glow);
    const b = new Mesh(gradQuad([[s * o, top, -o], [s * o, top, o], [s * o, bot, o], [s * o, bot, -o]]), glow);
    for (const m of [a, b]) {
      m.renderOrder = 6;
      m.raycast = () => {};
      root.add(m);
    }
    const la = new Mesh(new BoxGeometry(5.9, 0.01, 0.014), strip);
    la.position.set(0, top + 0.006, s * 2.975);
    const lb = new Mesh(new BoxGeometry(0.014, 0.01, 5.9), strip);
    lb.position.set(s * 2.975, top + 0.006, 0);
    root.add(la, lb);
  }
  return glow;
}

// ---- Plants ---------------------------------------------------------------------------

export function buildPlant(height: number, seed: number, chrome: boolean): Group {
  const g = new Group();
  const r = rng(seed);
  const potH = 0.34;
  const potR = 0.19;
  const potMat = chrome
    ? new MeshStandardMaterial({ color: new Color(0xd9dde2), metalness: 1, roughness: 0.14 })
    : new MeshStandardMaterial({ color: new Color(0x2a2b2e), roughness: 0.55 });
  const pot = new Mesh(
    lathe([
      [0, 0], [potR * 0.78, 0], [potR * 0.84, 0.012], [potR, potH - 0.02], [potR * 1.02, potH - 0.008],
      [potR * 1.0, potH], [potR * 0.93, potH], [potR * 0.91, potH - 0.04], [0, potH - 0.04],
    ]),
    potMat,
  );
  pot.castShadow = pot.receiveShadow = true;
  g.add(pot);
  const soil = new Mesh(
    new PlainCylinder(potR * 0.92, potR * 0.92, 0.01, 32),
    new MeshStandardMaterial({ color: new Color(0x2b1e14), roughness: 1 }),
  );
  soil.position.y = potH - 0.035;
  g.add(soil);

  const barkMat = new MeshStandardMaterial({ color: new Color(0x6a5440), roughness: 0.9 });
  const up = new Vector3(0, 1, 0);
  const limb = (a: Vector3, b: Vector3, r0: number, r1: number) => {
    const len = a.distanceTo(b);
    const m = new Mesh(new PlainCylinder(r1, r0, len, 8), barkMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    m.castShadow = true;
    g.add(m);
  };
  // Gently wandering trunk, then a spray of branches
  const trunk: Vector3[] = [new Vector3(0, potH - 0.04, 0)];
  const crownBase = height * 0.42;
  for (let i = 1; i <= 5; i++) {
    const p = trunk[i - 1].clone();
    p.y += (crownBase - potH) / 5 + 0.02;
    p.x += (r() - 0.5) * 0.07;
    p.z += (r() - 0.5) * 0.07;
    limb(trunk[i - 1], p, 0.02 - i * 0.0015, 0.0185 - i * 0.0015);
    trunk.push(p);
  }
  const tips: Vector3[] = [];
  const crownR = height * 0.24;
  const nb = 11;
  for (let i = 0; i < nb; i++) {
    const from = trunk[3 + (i % 3)];
    const a = (i / nb) * Math.PI * 2 + r();
    const rise = 0.25 + r() * (height - crownBase - 0.3);
    const out = crownR * (0.45 + r() * 0.55);
    const mid = from.clone().add(new Vector3(Math.cos(a) * out * 0.5, rise * 0.6, Math.sin(a) * out * 0.5));
    const tip = from.clone().add(new Vector3(Math.cos(a) * out, rise, Math.sin(a) * out));
    limb(from, mid, 0.009, 0.006);
    limb(mid, tip, 0.006, 0.003);
    tips.push(mid, tip);
  }
  // Leaves: small folded blades instanced around the branch ends
  const l = 0.085;
  const w = 0.03;
  const c = 0.012;
  const lg = new BufferGeometry();
  lg.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, -w, l * 0.42, -c, 0, l * 0.45, 0, w, l * 0.42, -c, 0, l, -c * 1.6], 3),
  );
  lg.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]);
  lg.computeVertexNormals();
  const leafMat = new MeshStandardMaterial({ color: new Color(0x3f6f30), roughness: 0.42, side: DoubleSide });
  const count = QUALITY.high ? Math.round(1500 * height) : Math.round(350 * height);
  const leaves = new InstancedMesh(lg, leafMat, count);
  const M = new Matrix4();
  const Q = new Quaternion();
  const E = new Euler();
  const P = new Vector3();
  const S = new Vector3();
  const col = new Color();
  const centre = new Vector3(0, crownBase + (height - crownBase) * 0.5, 0);
  for (let i = 0; i < count; i++) {
    const t = tips[Math.floor(r() * tips.length)];
    const spread = 0.05 + r() * 0.15;
    P.set(t.x + (r() - 0.5) * 2 * spread, t.y + (r() - 0.5) * 2 * spread, t.z + (r() - 0.5) * 2 * spread);
    // Point outward from the crown centre with some droop and roll
    const d = P.clone().sub(centre).normalize();
    Q.setFromUnitVectors(up, d.add(new Vector3((r() - 0.5) * 0.9, (r() - 0.6) * 0.9, (r() - 0.5) * 0.9)).normalize());
    Q.multiply(new Quaternion().setFromEuler(E.set(0, r() * 6.28, 0)));
    const s = 0.7 + r() * 0.8;
    M.compose(P, Q, S.set(s, s, s));
    leaves.setMatrixAt(i, M);
    const v = 0.55 + r() * 0.6;
    leaves.setColorAt(i, col.setRGB(v * (0.8 + r() * 0.35), v, v * (0.65 + r() * 0.3)));
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.frustumCulled = false;
  leaves.raycast = () => {};
  g.add(leaves);
  return g;
}

// ---- Shelves, books, vases, frames ----------------------------------------------------

const BOOK_COLORS = [0xe9e4d8, 0xd8d2c4, 0x2b2c30, 0x40454d, 0x8a6a4a, 0x6f7f72, 0xb9a48a, 0x1f2a36, 0x7a3b32, 0xc9c5bb];

export function artTexture(seed: number): CanvasTexture {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ece7dc';
  x.fillRect(0, 0, 384, 512);
  const inks = ['#23252a', '#8a6a4a', '#b9a48a', '#59665c'];
  for (let i = 0; i < 5; i++) {
    x.fillStyle = inks[Math.floor(r() * inks.length)];
    x.globalAlpha = 0.55 + r() * 0.4;
    x.beginPath();
    if (r() > 0.5) x.arc(80 + r() * 224, 110 + r() * 290, 40 + r() * 90, Math.PI * r(), Math.PI * (1 + r()));
    else x.ellipse(80 + r() * 224, 110 + r() * 290, 30 + r() * 70, 60 + r() * 90, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.strokeStyle = '#23252a';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(40, 440);
  x.bezierCurveTo(140, 380 + r() * 60, 220, 470, 344, 400 + r() * 50);
  x.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = QUALITY.anisotropy;
  return t;
}

export function vase(kind: number): Mesh {
  const shapes: Array<Array<[number, number]>> = [
    [[0, 0], [0.04, 0], [0.062, 0.03], [0.07, 0.08], [0.055, 0.13], [0.022, 0.17], [0.018, 0.2], [0.026, 0.215], [0.02, 0.215], [0.014, 0.2], [0, 0.2]],
    [[0, 0], [0.03, 0], [0.036, 0.01], [0.03, 0.06], [0.045, 0.12], [0.05, 0.19], [0.04, 0.25], [0.03, 0.27], [0.034, 0.285], [0.027, 0.285], [0, 0.27]],
    [[0, 0], [0.05, 0], [0.085, 0.035], [0.095, 0.075], [0.09, 0.085], [0.082, 0.078], [0.05, 0.02], [0, 0.02]],
  ];
  const mats = [
    new MeshStandardMaterial({ color: new Color(0x1b1c1f), roughness: 0.45 }),
    new MeshStandardMaterial({ color: new Color(0xe6dfd0), roughness: 0.6 }),
    new MeshStandardMaterial({ color: new Color(0xb08d57), metalness: 1, roughness: 0.3 }),
  ];
  const m = new Mesh(lathe(shapes[kind % 3], 36), mats[kind % 3]);
  m.material.side = DoubleSide;
  m.castShadow = true;
  return m;
}

/**
 * A run of floating shelves against a wall. Local space: wall at z = 0, shelves project to +z,
 * x runs along the wall.
 */
function buildShelves(len: number, heights: number[], seed: number, glow: MeshBasicMaterial): Group {
  const g = new Group();
  const r = rng(seed);
  const wood = oak('#000000', '#b99a72', 2, 1, 0.55);
  const dark = new MeshStandardMaterial({ color: new Color(0x26272b), roughness: 0.6 });
  const depth = 0.24;
  const th = 0.036;
  // Dark slatted back panel behind the shelves, like a fitted unit
  const y0 = heights[0] - 0.12;
  const y1 = heights[heights.length - 1] + 0.42;
  const back = new Mesh(new BoxGeometry(len + 0.08, y1 - y0, 0.014), dark);
  back.position.set(0, (y0 + y1) / 2, 0.008);
  back.receiveShadow = true;
  g.add(back);
  const slats = Math.round(len / 0.045);
  for (let i = 0; i < slats; i++) {
    if (i % 2) continue;
    const s = new Mesh(new BoxGeometry(0.02, y1 - y0, 0.012), dark);
    s.position.set(-len / 2 + (i + 0.5) * (len / slats), (y0 + y1) / 2, 0.02);
    g.add(s);
  }
  for (const y of heights) {
    const shelf = new Mesh(new BoxGeometry(len, th, depth), wood);
    shelf.position.set(0, y, depth / 2 + 0.014);
    shelf.castShadow = shelf.receiveShadow = true;
    g.add(shelf);
    // LED strip under the shelf washing the back panel
    const wash = new Mesh(
      gradQuad([[-len / 2, y - th / 2, 0.03], [len / 2, y - th / 2, 0.03], [len / 2, y - 0.33, 0.03], [-len / 2, y - 0.33, 0.03]]),
      glow,
    );
    wash.renderOrder = 6;
    g.add(wash);
    if (procEnv.cove) {
      const led = new Mesh(new BoxGeometry(len - 0.04, 0.006, 0.012), procEnv.cove.strip);
      led.position.set(0, y - th / 2 - 0.003, 0.03);
      g.add(led);
    }
    // Contents: runs of books, with vases, frames and gaps between
    const top = y + th / 2;
    let x = -len / 2 + 0.05 + r() * 0.1;
    while (x < len / 2 - 0.12) {
      const pick = r();
      if (pick < 0.5) {
        const n = 3 + Math.floor(r() * 6);
        for (let i = 0; i < n && x < len / 2 - 0.06; i++) {
          const bw = 0.018 + r() * 0.028;
          const bh = 0.17 + r() * 0.09;
          const bd = 0.13 + r() * 0.05;
          const book = new Mesh(
            new BoxGeometry(bw, bh, bd),
            new MeshStandardMaterial({ color: new Color(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), roughness: 0.75 }),
          );
          book.position.set(x + bw / 2, top + bh / 2, 0.03 + bd / 2);
          if (i === n - 1 && r() > 0.5) {
            book.rotation.z = 0.2;
            book.position.x += 0.02;
            book.position.y -= 0.004;
          }
          book.castShadow = true;
          g.add(book);
          // Paper block showing at the top and fore-edge
          const pages = new Mesh(
            new BoxGeometry(bw * 0.78, bh * 0.965, bd * 0.96),
            new MeshStandardMaterial({ color: new Color(0xf1ecdf), roughness: 0.95 }),
          );
          pages.position.set(0, 0.004, 0.006);
          book.add(pages);
          x += bw + 0.0015;
        }
        x += 0.03 + r() * 0.12;
      } else if (pick < 0.72) {
        const v = vase(Math.floor(r() * 3));
        v.position.set(x + 0.09, top, 0.13);
        g.add(v);
        x += 0.22 + r() * 0.1;
      } else if (pick < 0.88) {
        const fw = 0.17 + r() * 0.05;
        const fh = fw * 1.3;
        const frame = new Mesh(new BoxGeometry(fw, fh, 0.016), dark);
        frame.position.set(x + fw / 2, top + fh / 2 - 0.002, 0.06);
        frame.rotation.x = -0.12;
        frame.castShadow = true;
        const art = new Mesh(
          new PlaneGeometry(fw - 0.03, fh - 0.03),
          new MeshStandardMaterial({ map: artTexture(Math.floor(r() * 1e6)), roughness: 0.9 }),
        );
        art.position.z = 0.0085;
        frame.add(art);
        g.add(frame);
        x += fw + 0.06;
      } else {
        // A flat stack of books
        let sy = top;
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const bt = 0.02 + r() * 0.02;
          const book = new Mesh(
            new BoxGeometry(0.19 - i * 0.012, bt, 0.14),
            new MeshStandardMaterial({ color: new Color(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]), roughness: 0.75 }),
          );
          book.position.set(x + 0.1, sy + bt / 2, 0.12);
          book.rotation.y = (r() - 0.5) * 0.25;
          book.castShadow = true;
          g.add(book);
          sy += bt;
        }
        x += 0.26 + r() * 0.08;
      }
    }
  }
  return g;
}

// ---- Entry point ----------------------------------------------------------------------

export function buildDecor() {
  const root = procEnv.roomGroup;
  const contact = buildAO(root);
  const glow = buildCove(root);

  // Woven rug under the table
  const rugMesh = new Mesh(new BoxGeometry(2.7, 0.012, 1.9), rug());
  rugMesh.position.set(0, 0.006, -0.55);
  rugMesh.receiveShadow = true;
  rugMesh.raycast = () => {};
  root.add(rugMesh);

  const plants: Array<[number, number, number, boolean]> = [
    [-2.58, -2.5, 1.35, true],
    [2.6, -2.62, 1.2, false],
    [2.6, 2.62, 1.95, true],
    [-2.6, 2.62, 1.8, false],
  ];
  plants.forEach(([x, z, h, chrome], i) => {
    const p = buildPlant(h, 100 + i * 17, chrome);
    p.position.set(x, 0, z);
    root.add(p);
    contact(x, z, 0.75, 0.75, 0.006);
  });

  const far = buildShelves(1.7, [1.3, 1.75, 2.2], 7, glow);
  far.position.set(1.72, 0, -2.99);
  root.add(far);
  for (const [x, seed] of [[-1.7, 21], [1.7, 33]]) {
    const s = buildShelves(1.7, [1.45, 1.9, 2.35], seed, glow);
    s.position.set(x, 0, 2.99);
    s.rotation.y = Math.PI;
    root.add(s);
  }
}
