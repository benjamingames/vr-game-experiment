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
  CircleGeometry,
  Color,
  CylinderGeometry as PlainCylinder,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MeshPhysicalMaterial,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry as PlainSphere,
  TorusGeometry,
  Vector2,
  Vector3,
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

// ---- Darts, dartboard, RC car ---------------------------------------------------------

const metalMat = (color: number, rough = 0.25, metal = 1) =>
  new MeshStandardMaterial({ color: new Color(color), metalness: metal, roughness: rough });

/** Steel-tip dart along Z (point at -Z): knurled barrel, collar, shaft and four kite flights. */
export function detailedDart(color: number, width: number): Mesh {
  // Torpedo barrel with machined grip rings
  const prof: Array<[number, number]> = [[0, -0.03]];
  const n = 44;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const body = 0.0052 + 0.0052 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08));
    const grip = t > 0.18 && t < 0.82 ? 0.0009 * (i % 2) : 0;
    prof.push([body - grip, -0.03 + t * 0.06]);
  }
  prof.push([0, 0.03]);
  const barrelGeo = lathe(prof, 28);
  barrelGeo.rotateX(Math.PI / 2);
  const barrel = shadowed(new Mesh(barrelGeo, metalMat(color, 0.3, 0.85)));

  const tipGeo = lathe([[0, 0], [0.0012, 0.004], [0.0026, 0.03], [0.004, 0.044], [0, 0.044]], 16);
  tipGeo.rotateX(Math.PI / 2);
  const tip = shadowed(new Mesh(tipGeo, metalMat(0xdfe6ee, 0.18)));
  tip.position.z = -0.072;
  barrel.add(tip);

  const collarGeo = lathe([[0.0042, 0], [0.006, 0.002], [0.006, 0.006], [0.0045, 0.008]], 20);
  collarGeo.rotateX(Math.PI / 2);
  const collar = new Mesh(collarGeo, metalMat(0xd4af37, 0.22));
  collar.position.z = -0.036;
  barrel.add(collar);

  const shaftGeo = lathe(
    [[0.0048, 0], [0.0052, 0.003], [0.0036, 0.008], [0.003, 0.04], [0.0042, 0.046], [0.0042, 0.05], [0, 0.05]],
    16,
  );
  shaftGeo.rotateX(Math.PI / 2);
  const shaft = new Mesh(shaftGeo, new MeshStandardMaterial({ color: new Color(0x1c1f24), roughness: 0.4 }));
  shaft.position.z = 0.028;
  barrel.add(shaft);

  // Flights: four thin kites with a moulded rib
  const w = width / 2;
  const pos: number[] = [];
  const kite: Array<[number, number]> = [[0.0015, 0.05], [w * 0.75, 0.058], [w, 0.074], [w * 0.8, 0.088], [0.0015, 0.086]];
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    for (let i = 1; i < kite.length - 1; i++) {
      for (const k of [0, i, i + 1]) pos.push(kite[k][0] * cx, kite[k][0] * sy, kite[k][1]);
    }
  }
  const finGeo = new BufferGeometry();
  finGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  finGeo.computeVertexNormals();
  const fins = new Mesh(
    finGeo,
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.35, side: DoubleSide }),
  );
  fins.castShadow = true;
  barrel.add(fins);
  return barrel;
}

/** Adds a wire spider, numbered ring, oak surround, bull stud and screws to the flat board. */
export function detailDartboard(board: Mesh, radius: number, thickness: number, wood: MeshStandardMaterial) {
  const chrome = metalMat(0xe6ebf0, 0.16);
  const z0 = thickness / 2 + 0.0105;
  for (const f of [1, 0.78, 0.56, 0.36, 0.18, 0.07]) {
    const ring = new Mesh(new TorusGeometry(radius * f, 0.0016, 8, 96), chrome);
    ring.position.z = z0;
    board.add(ring);
  }
  for (let i = 0; i < 20; i++) {
    const a = ((i + 0.5) / 20) * Math.PI * 2;
    const len = radius * (1 - 0.18);
    const wire = new Mesh(new PlainCylinder(0.0013, 0.0013, len, 6), chrome);
    wire.rotation.z = a;
    wire.position.set(-Math.sin(a) * (radius * 0.18 + len / 2), Math.cos(a) * (radius * 0.18 + len / 2), z0);
    board.add(wire);
  }
  // Number ring drawn on a canvas, sitting just outside the scoring area
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d')!;
  x.fillStyle = '#15161a';
  x.fillRect(0, 0, 1024, 1024);
  x.fillStyle = '#f4f1e8';
  x.font = '700 44px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const nums = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const outer = radius + 0.06;
  const rr = ((radius + 0.03) / outer) * 512;
  nums.forEach((nv, i) => {
    const a = (i / 20) * Math.PI * 2;
    x.save();
    x.translate(512 + Math.sin(a) * rr, 512 - Math.cos(a) * rr);
    x.rotate(a);
    x.fillText(String(nv), 0, 0);
    x.restore();
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = QUALITY.anisotropy;
  const numbers = new Mesh(
    new CircleGeometry(outer, 96),
    new MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  );
  numbers.position.z = thickness / 2 + 0.0006;
  numbers.receiveShadow = true;
  board.add(numbers);
  const hoop = shadowed(new Mesh(new TorusGeometry(outer + 0.012, 0.016, 16, 96), wood));
  hoop.position.z = thickness / 2 - 0.004;
  board.add(hoop);
  const stud = new Mesh(new PlainSphere(0.006, 16, 10), metalMat(0xc9a04e, 0.25));
  stud.scale.z = 0.5;
  stud.position.z = z0 + 0.001;
  board.add(stud);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const screw = new Mesh(new PlainCylinder(0.006, 0.006, 0.004, 12), chrome);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(Math.cos(a) * (outer + 0.012), Math.sin(a) * (outer + 0.012), thickness / 2 + 0.012);
    board.add(screw);
  }
}

/** Dresses the block-built RC car: tyres with tread, spoked rims, lights, glass, mirrors, aerial. */
/**
 * Moulded car body in one piece: low bonnet, raised cabin with inward-leaning glass, short rear
 * deck, rounded corners and a tucked sill. Spans the chassis box and the cabin above it; the
 * window band is painted dark through vertex colours. Front of the car is -Z.
 */
export function carShell(w: number, h: number, d: number): BufferGeometry {
  const hi = QUALITY.high;
  const geo = new PlainBox(1, 1, 1, hi ? 18 : 8, hi ? 18 : 8, hi ? 44 : 16);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const sm = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const y0 = -0.24 * h;
  const tall = 0.83 * h;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 2;
    let y = pos.getY(i) * 2;
    let z = pos.getZ(i) * 2;
    // Cube to superellipsoid: soft corners everywhere
    const s = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) / Math.pow(Math.abs(x) ** 6 + Math.abs(y) ** 6 + Math.abs(z) ** 6, 1 / 6);
    x *= s;
    y *= s;
    z *= s;
    // Roof line: bonnet, windscreen rake, roof, rear screen, boot deck
    const roof = 0.16 + 0.84 * sm(-0.62, -0.3, z) * (1 - 0.68 * sm(0.3, 0.66, z));
    if (y > 0) y *= roof;
    const f = (y + 1) / 2;
    x *= 1 - 0.3 * sm(0.6, 1, f);
    x *= 1 - 0.1 * sm(0.55, 1, Math.abs(z));
    if (y < 0) x *= 1 + 0.06 * y;
    pos.setXYZ(i, (x * w * 0.9) / 2, y0 + f * tall, (z * d * 0.96) / 2);
    const glass = f > 0.615 && f < 0.93 && z > -0.5 && z < 0.56;
    const v = glass ? 0.035 : 1;
    col[i * 3] = v;
    col[i * 3 + 1] = glass ? 0.045 : 1;
    col[i * 3 + 2] = glass ? 0.06 : 1;
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function detailCar(chassis: Mesh, w: number, h: number, d: number) {
  const rubber = new MeshStandardMaterial({ color: new Color(0x121314), roughness: 0.92 });
  const chrome = metalMat(0xe2e7ee, 0.14);
  const dark = new MeshStandardMaterial({ color: new Color(0x15181c), roughness: 0.45 });
  const add = (geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number, parent: Mesh | Group = chassis) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const name of ['rc-wheel-fl', 'rc-wheel-fr', 'rc-wheel-rl', 'rc-wheel-rr']) {
    const wheel = chassis.getObjectByName(name) as Mesh | undefined;
    if (!wheel) continue;
    const out = wheel.position.x > 0 ? 1 : -1;
    const tyre = add(new TorusGeometry(0.0225, 0.0085, 14, 40), rubber, 0, 0, 0, wheel);
    tyre.rotation.y = Math.PI / 2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const lug = add(new PlainBox(0.02, 0.004, 0.0045), rubber, 0, Math.cos(a) * 0.0305, Math.sin(a) * 0.0305, wheel);
      lug.rotation.x = a;
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spoke = add(new PlainBox(0.003, 0.014, 0.0035), chrome, out * 0.012, Math.cos(a) * 0.008, Math.sin(a) * 0.008, wheel);
      spoke.rotation.x = a;
    }
    const cap = add(new PlainSphere(0.0045, 12, 8), chrome, out * 0.0125, 0, 0, wheel);
    cap.scale.x = 0.5;
  }
  // Lamps
  const lamp = (color: number, x: number, y: number, z: number, glow: number) => {
    const m = new MeshStandardMaterial({
      color: new Color(color),
      emissive: new Color(color),
      emissiveIntensity: glow,
      roughness: 0.15,
    });
    const s = add(new PlainSphere(0.0075, 16, 10), m, x, y, z);
    s.scale.z = 0.45;
    const bezel = add(new TorusGeometry(0.0078, 0.0012, 8, 24), chrome, x, y, z);
    return bezel;
  };
  for (const s of [-1, 1]) {
    lamp(0xfff6d0, s * w * 0.28, 0.004, -d * 0.492, 1.6);
    lamp(0xff2a1a, s * w * 0.3, 0.006, d * 0.474, 1.2);
    // Mirrors
    add(new BoxGeometry(0.012, 0.008, 0.005), dark, s * w * 0.44, h * 0.3, -d * 0.16);
    // Exhausts
    const pipe = add(new PlainCylinder(0.0045, 0.0045, 0.02, 14, 1, true), chrome, s * w * 0.18, -h * 0.17, d * 0.48);
    pipe.rotation.x = Math.PI / 2;
  }
  // Grille slats
  for (let i = 0; i < 4; i++) add(new PlainBox(w * 0.34, 0.0018, 0.003), chrome, 0, -h * 0.18 + i * 0.005, -d * 0.492);
  // Wheel-arch flares
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arch = add(new TorusGeometry(0.0345, 0.005, 8, 28, Math.PI), dark, sx * w * 0.455, -h * 0.18, sz * d * 0.31);
    arch.rotation.y = Math.PI / 2;
  }
  // Racing stripes and aerial
  const white = new MeshStandardMaterial({ color: new Color(0xf5f5f0), roughness: 0.35 });
  for (const s of [-1, 1]) add(new PlainBox(w * 0.07, 0.001, d * 0.2), white, s * w * 0.07, h * 0.243, -d * 0.36);
  add(new PlainCylinder(0.0009, 0.0012, 0.09, 6), dark, w * 0.3, h * 0.6 + 0.02, d * 0.2);
  add(new PlainSphere(0.003, 10, 8), new MeshStandardMaterial({ color: new Color(0xff3b30), roughness: 0.3 }), w * 0.3, h * 0.6 + 0.066, d * 0.2);
}

// ---- Toy stations -------------------------------------------------------------------

/** Classic bowling-pin silhouette (belly, neck, crown) centred on the origin. */
export function pinGeometry(R: number, H: number): LatheGeometry {
  const f: Array<[number, number]> = [
    [0, 0], [0.5, 0], [0.62, 0.02], [0.85, 0.12], [1, 0.27], [0.97, 0.38], [0.78, 0.52],
    [0.52, 0.64], [0.43, 0.72], [0.46, 0.8], [0.56, 0.87], [0.58, 0.92], [0.5, 0.97], [0.3, 0.995], [0, 1],
  ];
  return lathe(f.map(([r, y]) => [r * R, (y - 0.5) * H]), 40);
}

/** Flared bell with a rolled lip, same extents as a 0.16 tall, 0.12 radius cone. */
export function bellGeometry(): LatheGeometry {
  return lathe(
    [[0.112, -0.08], [0.12, -0.076], [0.118, -0.066], [0.1, -0.045], [0.082, 0], [0.07, 0.04],
     [0.052, 0.068], [0.028, 0.081], [0.012, 0.084], [0.012, 0.095], [0, 0.097]],
    48,
  );
}

export function brass(): MeshStandardMaterial {
  const m = metalMat(0xd9b24a, 0.2);
  m.side = DoubleSide;
  return m;
}

/** Three drilled finger holes near the top of a bowling ball of radius r. */
export function fingerHoles(r: number): Group {
  const g = new Group();
  const dark = new MeshStandardMaterial({ color: new Color(0x05070a), roughness: 0.9 });
  const spots: Array<[number, number]> = [[-0.2, 0.32], [0.2, 0.32], [0, -0.08]];
  for (const [ax, az] of spots) {
    const hole = new Mesh(new PlainCylinder(r * 0.11, r * 0.11, r * 0.12, 20), dark);
    const nx = Math.sin(ax);
    const nz = Math.sin(az);
    const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    hole.position.set(nx * r * 0.955, ny * r * 0.955, nz * r * 0.955);
    hole.lookAt(0, 0, 0);
    hole.rotateX(Math.PI / 2);
    g.add(hole);
  }
  return g;
}

/** Eyes, ears, teeth, whiskers and a hat brim for a whack-a-mole (face points to +X). */
export function moleFace(): Group {
  const g = new Group();
  const eye = new MeshPhysicalMaterial({ color: new Color(0x0a0a0c), roughness: 0.05, clearcoat: 1 });
  const fur = new MeshStandardMaterial({ color: new Color(0x6f3f18), roughness: 0.9 });
  const white = new MeshStandardMaterial({ color: new Color(0xf7f3e8), roughness: 0.3 });
  const yellow = new MeshStandardMaterial({ color: new Color(0xffd23f), roughness: 0.35 });
  for (const s of [-1, 1]) {
    const e = new Mesh(new PlainSphere(0.0075, 16, 12), eye);
    e.position.set(0.043, 0.074, s * 0.02);
    g.add(e);
    const glint = new Mesh(new PlainSphere(0.002, 8, 6), white);
    glint.position.set(0.049, 0.077, s * 0.02 + 0.002);
    g.add(glint);
    const ear = new Mesh(new PlainSphere(0.014, 14, 10), fur);
    ear.scale.x = 0.5;
    ear.position.set(0.005, 0.078, s * 0.05);
    g.add(ear);
    for (let w = 0; w < 3; w++) {
      const wh = new Mesh(new PlainCylinder(0.0005, 0.0005, 0.035, 4), eye);
      wh.rotation.x = Math.PI / 2 + (w - 1) * 0.22;
      wh.position.set(0.05, 0.05 + (w - 1) * 0.004, s * 0.028);
      g.add(wh);
    }
  }
  const teeth = new Mesh(new BoxGeometry(0.004, 0.013, 0.015), white);
  teeth.position.set(0.049, 0.036, 0);
  g.add(teeth);
  const brim = new Mesh(new TorusGeometry(0.054, 0.005, 10, 36), yellow);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = 0.096;
  g.add(brim);
  return g;
}

/** Chrome fixing studs for a xylophone bar that runs along X. */
export function barStuds(len: number): Group {
  const g = new Group();
  const chrome = metalMat(0xe6ebf0, 0.15);
  for (const s of [-1, 1]) {
    const stud = new Mesh(new PlainSphere(0.0055, 14, 10), chrome);
    stud.scale.y = 0.6;
    stud.position.set(s * len * 0.37, 0.0112, 0);
    g.add(stud);
  }
  return g;
}

/** Steel tube rim and a diamond-mesh nylon net for the basketball hoop (world coordinates). */
export function hoopDetail(x: number, y: number, z: number, r: number): Group {
  const g = new Group();
  const rim = shadowed(new Mesh(new TorusGeometry(r, 0.011, 14, 72), metalMat(0xff5a1f, 0.35, 0.8)));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y, z);
  g.add(rim);
  const nylon = new MeshStandardMaterial({ color: new Color(0xf4f4f0), roughness: 0.8 });
  const n = 16;
  const drop = 0.3;
  const up = new Vector3(0, 1, 0);
  const a0 = new Vector3();
  const a1 = new Vector3();
  for (let i = 0; i < n; i++) {
    for (const twist of [-1, 1]) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = t0 + twist * 1.05;
      a0.set(x + Math.cos(t0) * r, y - 0.012, z + Math.sin(t0) * r);
      a1.set(x + Math.cos(t1) * r * 0.5, y - drop, z + Math.sin(t1) * r * 0.5);
      const len = a0.distanceTo(a1);
      const s = new Mesh(new PlainCylinder(0.0022, 0.0022, len, 5), nylon);
      s.position.copy(a0).add(a1).multiplyScalar(0.5);
      s.quaternion.setFromUnitVectors(up, a1.clone().sub(a0).normalize());
      g.add(s);
    }
  }
  return g;
}

/** Coil spring wrapped around the base of a rod (rod along +Y from the origin). */
export function coilSpring(radius: number, height: number, turns: number): Mesh {
  const pts: number[] = [];
  const idx: number[] = [];
  const seg = turns * 24;
  const tube = 0.006;
  const ring = 8;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = t * turns * Math.PI * 2;
    const cx = Math.cos(a) * radius;
    const cz = Math.sin(a) * radius;
    const cy = t * height;
    for (let j = 0; j < ring; j++) {
      const b = (j / ring) * Math.PI * 2;
      const rr = radius + Math.cos(b) * tube;
      pts.push(Math.cos(a) * rr, cy + Math.sin(b) * tube, Math.sin(a) * rr);
      if (i < seg) {
        const p = i * ring + j;
        const q = i * ring + ((j + 1) % ring);
        idx.push(p, p + ring, q, q, p + ring, q + ring);
      }
    }
    void cx;
    void cz;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = metalMat(0xdfe5ec, 0.2);
  m.side = DoubleSide;
  return shadowed(new Mesh(geo, m));
}
