/**
 * Lario, the stretchy head: an original character built in code. A shaped skull with a jaw, eye
 * sockets and a neck in a knitted roll collar; wet eyes with fibrous hazel irises; a ribbed teal
 * beanie with a pom-pom; auburn hair. The face is ONE continuous skin surface with the nose, lids,
 * cheeks, lips and chin sculpted into it. Pulling a feature drags the skin around its grab point
 * (`LarioSkin`), so the face stretches like rubber instead of parts coming off. The beanie and the
 * ears are separate pieces. The head faces -Z and is about twice life size.
 */
import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { fabric, skin } from './materials.js';
import { QUALITY } from './quality.js';
import { fbm3 } from './textures.js';

export const LARIO = {
  skin: 0xe9bd9e,
  rosy: 0xe6b193,
  lips: 0xb9665f,
  hair: 0x7a3f1c,
  beanie: 0x1f7a78,
};

const seg = (n: number) => (QUALITY.high ? n : Math.max(8, Math.round(n / 2)));

function part<T extends Mesh>(parent: Mesh | Group, m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  m.castShadow = true;
  m.raycast = () => {};
  parent.add(m);
  return m;
}

let hairMat: MeshStandardMaterial | null = null;
/** Hair: fine strands painted as streaks, with a soft sheen. */
function hair(): MeshStandardMaterial {
  if (hairMat) return hairMat;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#8a4a22';
  x.fillRect(0, 0, 256, 256);
  let s = 31;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const v = r();
    x.strokeStyle = v > 0.6 ? `rgba(196,120,60,${0.25 + r() * 0.3})` : `rgba(48,20,6,${0.25 + r() * 0.35})`;
    x.lineWidth = 0.6 + r() * 1.2;
    const px = r() * 256;
    const py = r() * 256;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + (r() - 0.5) * 10, py + 20, px + (r() - 0.5) * 14, py + 44, px + (r() - 0.5) * 18, py + 70);
    x.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = 1000;
  tex.repeat.set(3, 2);
  hairMat = new MeshPhysicalMaterial({ map: tex, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new Color(0xd08a50) });
  return hairMat;
}

const HEAD_R = 0.22;
const G = (x: number, y: number, x0: number, y0: number, rx: number, ry: number) =>
  Math.exp(-(((x - x0) / rx) ** 2) - ((y - y0) / ry) ** 2);
const ss = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Grab points on the skin: part id -> [x, y] on the face (in head radii) and how far the pull reaches (metres). */
const HANDLES: Array<{ id: number; x: number; y: number; reach: number }> = [
  { id: 0, x: 0, y: -0.06, reach: 0.085 },
  { id: 1, x: -0.42, y: -0.1, reach: 0.1 },
  { id: 2, x: 0.42, y: -0.1, reach: 0.1 },
  { id: 3, x: 0, y: -0.575, reach: 0.078 },
  { id: 7, x: -0.34, y: 0.33, reach: 0.06 },
  { id: 8, x: 0.34, y: 0.33, reach: 0.06 },
  { id: 9, x: 0, y: -0.9, reach: 0.085 },
];

interface Target {
  geo: BufferGeometry;
  rest: Float32Array;
  /** Per handle: affected vertex indices and their weights */
  idx: Uint32Array[];
  w: Float32Array[];
}

/** Rubber-sheet deformation of the face: each grab point drags the skin around it, fading with distance. */
export class LarioSkin {
  homes = new Map<number, Vector3>();
  private targets: Target[] = [];
  private pull = new Map<number, Vector3>();
  private dirty = false;

  /** Head-local position of a grab point. */
  home(id: number): Vector3 {
    return this.homes.get(id)!;
  }

  has(id: number) {
    return this.homes.has(id);
  }

  addTarget(geo: BufferGeometry) {
    const pos = geo.attributes.position;
    const rest = new Float32Array(pos.array as ArrayLike<number>);
    const idx: Uint32Array[] = [];
    const w: Float32Array[] = [];
    for (const h of HANDLES) {
      const c = this.homes.get(h.id)!;
      const ii: number[] = [];
      const ww: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        const d2 = (rest[i * 3] - c.x) ** 2 + (rest[i * 3 + 1] - c.y) ** 2 + (rest[i * 3 + 2] - c.z) ** 2;
        const q = 1 - d2 / (h.reach * h.reach);
        if (q > 0) {
          ii.push(i);
          ww.push(q * q);
        }
      }
      idx.push(new Uint32Array(ii));
      w.push(new Float32Array(ww));
    }
    this.targets.push({ geo, rest, idx, w });
  }

  setPull(id: number, dx: number, dy: number, dz: number) {
    let p = this.pull.get(id);
    if (!p) this.pull.set(id, (p = new Vector3()));
    if (Math.abs(p.x - dx) + Math.abs(p.y - dy) + Math.abs(p.z - dz) < 1e-5) return;
    p.set(dx, dy, dz);
    this.dirty = true;
  }

  apply() {
    if (!this.dirty) return;
    this.dirty = false;
    for (const t of this.targets) {
      const arr = t.geo.attributes.position.array as Float32Array;
      arr.set(t.rest);
      HANDLES.forEach((h, k) => {
        const p = this.pull.get(h.id);
        if (!p || p.lengthSq() < 1e-10) return;
        const ii = t.idx[k];
        const ww = t.w[k];
        for (let n = 0; n < ii.length; n++) {
          const i = ii[n] * 3;
          arr[i] += p.x * ww[n];
          arr[i + 1] += p.y * ww[n];
          arr[i + 2] += p.z * ww[n];
        }
      });
      t.geo.attributes.position.needsUpdate = true;
      t.geo.computeVertexNormals();
    }
  }
}

/**
 * The head: skull, jaw and a fully sculpted face in one skin surface (vertex colours tint the
 * lips, flush and lash lines), with eyes, brows, hair, neck and collar attached.
 */
export function larioHead(): { head: Mesh; skin: LarioSkin } {
  const R = HEAD_R;
  const g = new SphereGeometry(R, seg(220), seg(170));
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / R;
    let y = p.getY(i) / R;
    let z = p.getZ(i) / R;
    x *= 0.96;
    y *= y > 0 ? 1.08 : 1.1;
    if (y < 0) {
      const t = -y;
      x *= 1 - 0.2 * t * t - 0.08 * t * t * t * t;
      z *= 1 - 0.1 * t * t;
    }
    let cr = 1;
    let cg = 1;
    let cb = 1;
    if (z < 0) {
      z *= 0.94;
      const front = ss(-0.05, -0.4, z);
      const ax = Math.abs(x);
      let F = 0;
      // Eye sockets, brow ridge, lids
      F -= 0.075 * G(ax, y, 0.34, 0.19, 0.17, 0.15);
      F -= 0.02 * G(ax, y, 0.5, -0.42, 0.2, 0.2);
      F += 0.045 * G(ax, y, 0.33, 0.47, 0.22, 0.06) + 0.02 * G(x, y, 0, 0.48, 0.15, 0.08);
      F += 0.075 * G(ax, y, 0.34, 0.318, 0.165, 0.05);
      F += 0.045 * G(ax, y, 0.34, 0.04, 0.15, 0.045);
      // Nose: bridge widening and rising to the tip, wings, nostrils
      const t = Math.max(0, Math.min(1, (0.42 - y) / 0.52));
      const wd = 0.05 + 0.062 * t;
      F += (0.05 + 0.31 * Math.pow(t, 1.5)) * ss(-0.2, -0.1, y) * ss(0.52, 0.4, y) * Math.exp(-((x / wd) ** 2));
      F += 0.1 * G(ax, y, 0.1, -0.085, 0.05, 0.055);
      const nostril = G(ax, y, 0.062, -0.155, 0.03, 0.026);
      F -= 0.03 * nostril;
      // Cheeks, muzzle, lips with a parting line that lifts at the corners, chin
      const cheek = G(ax, y, 0.42, -0.1, 0.2, 0.18);
      F += 0.05 * cheek;
      F += 0.045 * G(x, y, 0, -0.55, 0.3, 0.2);
      F -= 0.012 * G(x, y, 0, -0.4, 0.025, 0.08);
      const part = -0.578 + 0.35 * x * x;
      const upper = G(x, y, 0, part + 0.06, 0.25, 0.045) * (1 - 0.3 * G(x, y, 0, -0.49, 0.03, 0.04));
      const lower = G(x, y, 0, part - 0.06, 0.2, 0.052);
      const crease = G(x, y, 0, part, 0.27, 0.02);
      F += 0.05 * upper + 0.062 * lower - 0.036 * crease;
      F -= 0.02 * G(x, y, 0, -0.73, 0.14, 0.05);
      F += 0.075 * G(x, y, 0, -0.9, 0.17, 0.13);
      z -= F * front;
      // Colour: flush on cheeks and nose tip, lips, the dark parting line, lash lines, nostrils
      const flush = Math.min(1, cheek * 0.55 + G(x, y, 0, -0.07, 0.1, 0.1) * 0.5) * front;
      cr *= 1;
      cg *= 1 - 0.13 * flush;
      cb *= 1 - 0.16 * flush;
      const lip = ss(0.22, 0.5, Math.max(upper, lower)) * ss(0.32, 0.24, ax) * front;
      cr += (0.78 - cr) * lip;
      cg += (0.46 - cg) * lip;
      cb += (0.5 - cb) * lip;
      const dark = Math.min(1, ss(0.45, 0.9, crease) * ss(0.29, 0.23, ax) + nostril * 0.9) * front;
      cr += (0.32 - cr) * dark;
      cg += (0.16 - cg) * dark;
      cb += (0.15 - cb) * dark;
      const lash = ss(0.4, 0.8, G(ax, y, 0.34, 0.268, 0.14, 0.018)) * front;
      cr += (0.22 - cr) * lash;
      cg += (0.13 - cg) * lash;
      cb += (0.1 - cb) * lash;
    }
    p.setXYZ(i, x * R, y * R, z * R);
    col[i * 3] = cr;
    col[i * 3 + 1] = cg;
    col[i * 3 + 2] = cb;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const skinMat = skin(LARIO.skin);
  skinMat.vertexColors = true;
  const head = new Mesh(g, skinMat);
  head.castShadow = true;
  head.receiveShadow = true;
  head.frustumCulled = false;

  // Grab points sit on the sculpted surface
  const sk = new LarioSkin();
  const onSkin = (fx: number, fy: number) => {
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > -0.05) continue;
      const d = (p.getX(i) - fx * R) ** 2 + (p.getY(i) - fy * R) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return new Vector3(p.getX(best), p.getY(best), p.getZ(best));
  };
  for (const h of HANDLES) sk.homes.set(h.id, onSkin(h.x, h.y));
  sk.addTarget(g);

  // Eyebrows: individual hairs rooted on the brow ridge, moving with the skin
  {
    const strand = new CylinderGeometry(0.0015, 0.0032, 0.03, 5);
    const sp = strand.attributes.position;
    const sn = strand.attributes.normal;
    const si = strand.index!;
    const pos: number[] = [];
    const nrm: number[] = [];
    const idx: number[] = [];
    const M = new Matrix4();
    const Q = new Quaternion();
    const E = new Euler();
    const v = new Vector3();
    const one = new Vector3(1, 1, 1);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 30; k++) {
        const t = k / 29;
        for (const row of [0, 1, 2]) {
          const root = onSkin(side * (0.15 + t * 0.4), 0.46 + Math.sin(t * Math.PI) * 0.035 - t * 0.03 + row * 0.02);
          root.z -= 0.004;
          Q.setFromEuler(E.set(-0.25, 0, side * (-1.2 - t * 0.35 + row * 0.15)));
          M.compose(root, Q, one);
          const base = pos.length / 3;
          for (let i = 0; i < sp.count; i++) {
            v.set(sp.getX(i), sp.getY(i), sp.getZ(i)).applyMatrix4(M);
            pos.push(v.x, v.y, v.z);
            v.set(sn.getX(i), sn.getY(i), sn.getZ(i)).applyQuaternion(Q);
            nrm.push(v.x, v.y, v.z);
          }
          for (let i = 0; i < si.count; i++) idx.push(base + si.getX(i));
        }
      }
    }
    const bg = new BufferGeometry();
    bg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    bg.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    bg.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    bg.setIndex(idx);
    const brows = new Mesh(bg, hair());
    brows.frustumCulled = false;
    brows.raycast = () => {};
    head.add(brows);
    sk.addTarget(bg);
  }

  // Hair showing below the beanie at the back and sides
  const back = part(head, new Mesh(new SphereGeometry(0.224, seg(40), seg(28)), hair()), 0, 0.02, 0.055);
  back.scale.set(0.95, 0.92, 0.95);
  for (const s of [-1, 1]) {
    const burn = part(head, new Mesh(new SphereGeometry(0.05, seg(20), seg(14)), hair()), s * 0.196, -0.005, -0.045);
    burn.scale.set(0.32, 1.25, 0.6);
    head.add(larioEye(s));
  }
  // Neck and a knitted roll collar
  const lathe = (pts: Array<[number, number]>, n = 48) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg(n));
  part(head, new Mesh(lathe([[0.112, -0.16], [0.102, -0.11], [0.098, -0.05], [0.1, 0]]), skin(LARIO.skin)), 0, -0.19, 0.035);
  const collar = part(head, new Mesh(ribbed(new TorusGeometry(0.108, 0.03, seg(16), seg(96)), 40, 0.0035), fabric(LARIO.beanie)), 0, -0.325, 0.035);
  collar.rotation.x = Math.PI / 2;
  return { head, skin: sk };
}

/** Knit ribs: pushes vertices in and out around the ring axis (the torus / cap axis is local Z or Y). */
function ribbed<T extends BufferGeometry>(g: T, ribs: number, depth: number, axisY = false): T {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const a = axisY ? p.getZ(i) : p.getY(i);
    const ang = Math.atan2(a, x);
    const r = Math.hypot(x, a) || 1;
    const k = 1 + (depth * Math.sin(ang * ribs)) / r;
    if (axisY) {
      p.setX(i, x * k);
      p.setZ(i, a * k);
    } else {
      p.setX(i, x * k);
      p.setY(i, a * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

let irisTex: CanvasTexture | null = null;
function irisTexture(): CanvasTexture {
  if (irisTex) return irisTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(128, 128, 30, 128, 128, 126);
  grad.addColorStop(0, '#a8742c');
  grad.addColorStop(0.45, '#6f7f3a');
  grad.addColorStop(0.86, '#3f5a34');
  grad.addColorStop(1, '#1b2618');
  x.fillStyle = grad;
  x.beginPath();
  x.arc(128, 128, 126, 0, Math.PI * 2);
  x.fill();
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2;
    const r0 = 40 + r() * 20;
    const r1 = 80 + r() * 44;
    x.strokeStyle = r() > 0.5 ? `rgba(226,200,130,${0.12 + r() * 0.25})` : `rgba(30,40,20,${0.12 + r() * 0.25})`;
    x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    x.lineTo(128 + Math.cos(a + (r() - 0.5) * 0.08) * r1, 128 + Math.sin(a + (r() - 0.5) * 0.08) * r1);
    x.stroke();
  }
  x.fillStyle = '#050505';
  x.beginPath();
  x.arc(128, 128, 44, 0, Math.PI * 2);
  x.fill();
  irisTex = new CanvasTexture(c);
  irisTex.colorSpace = SRGBColorSpace;
  return irisTex;
}

/** One eye: wet white, fibrous iris and a clear cornea that catches the light. */
function larioEye(side: number): Group {
  const g = new Group();
  g.position.set(side * 0.075, 0.0415, -0.15);
  const white = new MeshPhysicalMaterial({ color: new Color(0xf2ece4), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 });
  const ball = part(g, new Mesh(new SphereGeometry(0.043, seg(32), seg(24)), white), 0, 0, 0);
  ball.scale.z = 0.8;
  const iris = part(g, new Mesh(new CircleGeometry(0.0215, seg(40)), new MeshStandardMaterial({ map: irisTexture(), roughness: 0.35 })), 0, 0, -0.0338);
  iris.rotation.y = Math.PI;
  iris.castShadow = false;
  const cornea = part(
    g,
    new Mesh(
      new SphereGeometry(0.0245, seg(28), seg(18)),
      new MeshPhysicalMaterial({ color: new Color(0xffffff), roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    ),
    0,
    0,
    -0.03,
  );
  cornea.scale.z = 0.42;
  cornea.castShadow = false;
  return g;
}

/** Ribbed knit beanie pushed back on the head, with a folded cuff and a woolly pom-pom. */
export function larioBeanie(): Mesh {
  const tilt = 0.35;
  const knit = fabric(LARIO.beanie);
  const cap = ribbed(new SphereGeometry(0.238, seg(120), seg(28), 0, Math.PI * 2, 0, Math.PI * 0.56), 46, 0.0045, true);
  cap.scale(1.04, 0.95, 1.08);
  cap.rotateX(tilt);
  const beanie = new Mesh(cap, knit);
  const cuffG = ribbed(new TorusGeometry(0.236, 0.022, seg(14), seg(120)), 46, 0.004);
  cuffG.scale(1.04, 1.08, 1.5);
  cuffG.rotateX(Math.PI / 2);
  cuffG.translate(0, -0.04, 0);
  cuffG.rotateX(tilt);
  part(beanie, new Mesh(cuffG, knit), 0, 0, 0);
  // Pom-pom: a ball roughened into tufts
  const pomG = new SphereGeometry(0.052, seg(36), seg(26));
  const pp = pomG.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    const z = pp.getZ(i);
    const k = 1 + (fbm3(x * 90, y * 90, z * 90, 2, 3) - 0.5) * 0.5;
    pp.setXYZ(i, x * k, y * k, z * k);
  }
  pomG.computeVertexNormals();
  part(beanie, new Mesh(pomG, fabric(0xece4d2)), 0, 0.235 * Math.cos(tilt), 0.235 * Math.sin(tilt));
  return beanie;
}

/** Ear: shell, rolled helix rim, shaded bowl and lobe. */
export function larioEar(side: number): Mesh {
  const m = skin(LARIO.skin);
  const g = new SphereGeometry(0.058, seg(24), seg(18));
  g.scale(0.3, 1.15, 0.8);
  const ear = new Mesh(g, m);
  const rimG = new TorusGeometry(0.046, 0.011, seg(10), seg(28), 4.3);
  rimG.rotateZ(-0.55);
  rimG.scale(0.82, 1.22, 1);
  const rim = part(ear, new Mesh(rimG, m), side * 0.012, 0.004, 0);
  rim.rotation.y = side * Math.PI / 2;
  const bowl = part(ear, new Mesh(new SphereGeometry(0.026, seg(16), seg(12)), skin(0xc98a70)), side * 0.014, 0.004, -0.004);
  bowl.scale.set(0.3, 1.1, 0.8);
  bowl.castShadow = false;
  const lobe = part(ear, new Mesh(new SphereGeometry(0.02, seg(16), seg(12)), m), side * 0.008, -0.056, -0.004);
  lobe.scale.set(0.55, 1, 0.9);
  return ear;
}
