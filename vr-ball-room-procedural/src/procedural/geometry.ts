/**
 * Detailed geometry generated in code. The Box / Cylinder / Sphere classes here are drop-in
 * replacements for the Three.js primitives that room.ts builds everything from: boxes get
 * rounded, highlight-catching edges and cylinders / spheres get enough segments to be smooth.
 * Physics colliders are separate, so none of this changes gameplay.
 */
import {
  BoxGeometry as PlainBox,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry as PlainCylinder,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry as PlainSphere,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';

// [uAxis, vAxis, uDir, vDir] for the six faces, in BoxGeometry's build order (+x -x +y -y +z -z)
const FACE_AXES: Array<[number, number, number, number]> = [
  [2, 1, -1, -1],
  [2, 1, 1, -1],
  [0, 2, 1, 1],
  [0, 2, 1, -1],
  [0, 1, 1, -1],
  [0, 1, -1, -1],
];

/** Box with rounded edges and corners (UVs stay proportional to the faces). */
export class BoxGeometry extends PlainBox {
  constructor(w = 1, h = 1, d = 1) {
    const seg = QUALITY.high ? 4 : 1;
    super(w, h, d, seg, seg, seg);
    if (seg === 1) return;
    const half = [w / 2, h / 2, d / 2];
    const r = Math.min(0.01, 0.2 * Math.min(w, h, d));
    const pos = this.attributes.position;
    const nrm = this.attributes.normal;
    const uv = this.attributes.uv;
    const perFace = (seg + 1) * (seg + 1);
    const p = [0, 0, 0];
    const q = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      p[0] = pos.getX(i);
      p[1] = pos.getY(i);
      p[2] = pos.getZ(i);
      // Move the grid lines next to each edge so the bevel is exactly r wide
      for (let a = 0; a < 3; a++) {
        const n = p[a] / half[a];
        if (Math.abs(Math.abs(n) - 0.5) < 0.01) p[a] = Math.sign(n) * (half[a] - r);
      }
      const [ua, va, ud, vd] = FACE_AXES[Math.floor(i / perFace)];
      uv.setXY(
        i,
        (p[ua] * ud) / (2 * half[ua]) + 0.5,
        1 - ((p[va] * vd) / (2 * half[va]) + 0.5),
      );
      // Push the outer ring onto a sphere of radius r around the inset corner
      let len = 0;
      for (let a = 0; a < 3; a++) {
        const inner = Math.max(-(half[a] - r), Math.min(half[a] - r, p[a]));
        q[a] = p[a] - inner;
        p[a] = inner;
        len += q[a] * q[a];
      }
      len = Math.sqrt(len) || 1;
      pos.setXYZ(i, p[0] + (q[0] / len) * r, p[1] + (q[1] / len) * r, p[2] + (q[2] / len) * r);
      nrm.setXYZ(i, q[0] / len, q[1] / len, q[2] / len);
    }
  }
}

export class CylinderGeometry extends PlainCylinder {
  constructor(rt = 1, rb = 1, h = 1, radial = 32, hs = 1, open = false, ts?: number, tl?: number) {
    // Keep deliberately faceted shapes (under 10 sides) as they are
    const n = QUALITY.high && radial >= 10 ? Math.max(radial, 48) : radial;
    super(rt, rb, h, n, hs, open, ts, tl);
  }
}

export class SphereGeometry extends PlainSphere {
  constructor(r = 1, ws = 32, hs = 16, ...rest: number[]) {
    const hi = QUALITY.high;
    super(r, hi ? Math.max(ws, 56) : ws, hi ? Math.max(hs, 36) : hs, ...rest);
  }
}

function lathe(points: Array<[number, number]>, segs = 48): LatheGeometry {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    QUALITY.high ? segs : Math.round(segs / 2),
  );
}

function shadowed<T extends Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A proper table in place of a plain block: overhanging top with rounded edge, apron, a drawer
 * with brass pulls, four turned legs and stretchers. Returned geometry/children are laid out for
 * a mesh whose origin is the centre of the w x h x d collider box.
 */
export function buildTable(
  w: number,
  h: number,
  d: number,
  wood: MeshStandardMaterial,
  topWood: MeshStandardMaterial,
): { top: BufferGeometry; parts: Group } {
  const topT = 0.045;
  const top = new BoxGeometry(w, topT, d);
  top.translate(0, h / 2 - topT / 2, 0);

  const parts = new Group();
  const brass = new MeshStandardMaterial({ color: new Color(0xc9a04e), metalness: 1, roughness: 0.25 });
  const inset = 0.07;
  const apronH = 0.1;
  const apronY = h / 2 - topT - apronH / 2;
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  const add = (geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = shadowed(new Mesh(geo, m));
    mesh.position.set(x, y, z);
    parts.add(mesh);
    return mesh;
  };

  // Moulding under the top
  add(new BoxGeometry(w - 0.05, 0.014, d - 0.05), wood, 0, h / 2 - topT - 0.007, 0);
  // Apron
  add(new BoxGeometry(2 * lx, apronH, 0.022), wood, 0, apronY, -lz);
  add(new BoxGeometry(0.022, apronH, 2 * lz), wood, -lx, apronY, 0);
  add(new BoxGeometry(0.022, apronH, 2 * lz), wood, lx, apronY, 0);
  // Front apron with a drawer (player side, +Z)
  add(new BoxGeometry(2 * lx, apronH, 0.02), wood, 0, apronY, lz);
  const drawer = add(new BoxGeometry(w * 0.52, apronH - 0.022, 0.016), topWood, 0, apronY, lz + 0.012);
  for (const sx of [-0.17, 0.17]) {
    const stem = new Mesh(new CylinderGeometry(0.005, 0.007, 0.018, 16), brass);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(sx, 0, 0.016);
    drawer.add(stem);
    const knob = new Mesh(lathe([[0, 0], [0.012, 0.001], [0.016, 0.006], [0.013, 0.012], [0, 0.014]], 24), brass);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(sx, 0, 0.024);
    drawer.add(knob);
  }

  // Turned legs: bun foot, vase, rings, square block at the apron
  const legH = h - topT - 0.012;
  const blockH = apronH + 0.02;
  const turnH = legH - blockH;
  const prof: Array<[number, number]> = [
    [0, 0], [0.02, 0], [0.027, 0.006], [0.03, 0.02], [0.026, 0.034], [0.017, 0.042], [0.015, 0.06],
    [0.016, 0.1], [0.022, 0.2], [0.03, 0.31], [0.033, 0.37], [0.029, 0.42], [0.02, 0.455],
    [0.018, 0.47], [0.029, 0.478], [0.031, 0.488], [0.029, 0.498], [0.018, 0.506], [0.017, 0.53],
    [0.024, 0.575], [0.034, 0.6], [0.036, 0.612], [0.036, 0.625],
  ].map(([r, y]) => [r, (y / 0.625) * turnH] as [number, number]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(lathe(prof, 40), wood, sx * lx, -h / 2, sz * lz);
      add(new BoxGeometry(0.074, blockH, 0.074), wood, sx * lx, -h / 2 + turnH + blockH / 2, sz * lz);
    }
  }
  // H-stretcher near the floor
  for (const sx of [-1, 1]) add(new BoxGeometry(0.03, 0.035, 2 * lz), wood, sx * lx, -h / 2 + 0.14, 0);
  add(new BoxGeometry(2 * lx, 0.03, 0.035), wood, 0, -h / 2 + 0.14, 0);
  return { top, parts };
}

/** Drinks-can profile: domed base, shoulder, neck, rolled lip. Origin at the can's centre. */
export function canGeometry(r: number, h: number): LatheGeometry {
  const k = r / 0.06;
  const pts: Array<[number, number]> = [
    [0, 0.008], [0.03, 0.006], [0.043, 0.001], [0.048, 0], [0.052, 0.002], [0.057, 0.012],
    [0.06, 0.024], [0.06, h - 0.03], [0.0585, h - 0.02], [0.054, h - 0.008], [0.0525, h - 0.004],
    [0.0535, h - 0.0015], [0.0525, h], [0.0505, h - 0.001], [0.0495, h - 0.006],
  ];
  const g = lathe(pts.map(([pr, y]) => [pr * k, y - h / 2]), 56);
  // Lathe V follows the point index; remap it to height so a label wraps the side wall evenly
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / h + 0.5);
  return g;
}

/** Bare-aluminium lid with a stay-on tab, to sit inside the can's lip. */
export function canLid(r: number, h: number, metal: MeshStandardMaterial): Group {
  const g = new Group();
  const lid = new Mesh(new CylinderGeometry(r * 0.83, r * 0.83, 0.0015, 40), metal);
  lid.position.y = h / 2 - 0.006;
  g.add(lid);
  const groove = new Mesh(new TorusGeometry(r * 0.72, 0.0012, 8, 40), metal);
  groove.rotation.x = Math.PI / 2;
  groove.position.y = h / 2 - 0.0055;
  g.add(groove);
  const tab = new Mesh(new BoxGeometry(r * 0.3, 0.0016, r * 0.62), metal);
  tab.position.set(0, h / 2 - 0.0038, r * 0.12);
  g.add(tab);
  const ring = new Mesh(new TorusGeometry(r * 0.13, 0.0022, 8, 24), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, h / 2 - 0.0035, r * 0.34);
  g.add(ring);
  const rivet = new Mesh(new PlainSphere(r * 0.05, 12, 8), metal);
  rivet.position.set(0, h / 2 - 0.004, 0);
  g.add(rivet);
  return g;
}

/** Printed can label, drawn with canvas calls (white base so the metal colour tints it). */
export function canLabel(word: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 1024, 512);
  x.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = -6; i < 30; i++) {
    x.beginPath();
    x.moveTo(i * 48, 400);
    x.lineTo(i * 48 + 22, 400);
    x.lineTo(i * 48 + 150, 110);
    x.lineTo(i * 48 + 128, 110);
    x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(0, 96, 1024, 8);
  x.fillRect(0, 404, 1024, 8);
  for (const cx of [256, 768]) {
    x.fillStyle = 'rgba(20,20,30,0.82)';
    x.beginPath();
    x.ellipse(cx, 256, 170, 96, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 6;
    x.stroke();
    x.fillStyle = '#fff';
    x.font = 'italic 900 104px Arial Black, Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(word, cx, 262);
    x.font = '600 20px Arial, sans-serif';
    x.fillText('SPARKLING  •  355 mL', cx, 330);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = QUALITY.anisotropy;
  return t;
}
