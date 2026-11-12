/**
 * Potted weeping fig (Ficus benjamina), modelled the way the real plant grows: a slim grey trunk,
 * a leader with side branches that arch outward and droop, twigs off those, and glossy pointed
 * leaves set alternately along every twig, hanging slightly with their faces to the light.
 * One merged mesh for the wood, one instanced mesh for the leaves.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  CylinderGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tapered tubes along polylines, merged into one geometry. */
class Tubes {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];
  add(pts: Vector3[], radii: number[], sides: number) {
    const base = this.pos.length / 3;
    const t = new Vector3();
    const a = new Vector3();
    const b = new Vector3();
    const ref = new Vector3();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      t.copy(pts[Math.min(i + 1, n - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
      ref.set(Math.abs(t.y) < 0.9 ? 0 : 1, Math.abs(t.y) < 0.9 ? 1 : 0, 0);
      a.crossVectors(t, ref).normalize();
      b.crossVectors(t, a);
      for (let j = 0; j < sides; j++) {
        const ang = (j / sides) * Math.PI * 2;
        const nx = a.x * Math.cos(ang) + b.x * Math.sin(ang);
        const ny = a.y * Math.cos(ang) + b.y * Math.sin(ang);
        const nz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
        this.pos.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
        this.nrm.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const p0 = base + i * sides + j;
        const p1 = base + i * sides + ((j + 1) % sides);
        this.idx.push(p0, p1, p0 + sides, p1, p1 + sides, p0 + sides);
      }
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let leafGeo: BufferGeometry | null = null;
/** One leaf, 1 unit long along +Y from the twig, face toward +Z: ovate blade, drip tip, folded midrib, short stalk. */
function leafGeometry(): BufferGeometry {
  if (leafGeo) return leafGeo;
  const rows = QUALITY.high ? [-0.13, 0, 0.07, 0.18, 0.32, 0.46, 0.6, 0.74, 0.86, 0.94, 1] : [-0.13, 0, 0.2, 0.46, 0.74, 1];
  const cols = QUALITY.high ? [-1, -0.55, 0, 0.55, 1] : [-1, 0, 1];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const t0 of rows) {
    const t = Math.max(0, t0);
    let w = 0.215 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.7))), 0.85);
    w *= 1 - 0.5 * smooth(0.7, 1, t);
    w += 0.007 * (1 - t);
    for (const c of cols) {
      const x = c * w;
      const fold = w * (0.5 * Math.abs(c) - 0.22 * c * c);
      const z = fold - 0.2 * t * t + 0.018 * Math.sin(t * 16 + c * 2) * Math.abs(c) + (t0 < 0 ? 0.01 : 0);
      pos.push(x, t0, z);
      uv.push(c * 0.5 + 0.5, t);
    }
  }
  const nc = cols.length;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < nc - 1; j++) {
      const p = i * nc + j;
      idx.push(p, p + 1, p + nc, p + 1, p + nc + 1, p + nc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  leafGeo = g;
  return g;
}

let leafMat: MeshStandardMaterial | null = null;
/** Leaf surface painted in code: pale midrib, forward-arching side veins, darker margin, faint mottling. */
export function leafMaterial(): MeshStandardMaterial {
  if (leafMat) return leafMat;
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const grad = x.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#39652a');
  grad.addColorStop(0.5, '#3f7030');
  grad.addColorStop(1, '#4a7d35');
  x.fillStyle = grad;
  x.fillRect(0, 0, W, H);
  // Darker toward the margins, lighter along the centre
  const side = x.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(10,30,8,0.35)');
  side.addColorStop(0.35, 'rgba(10,30,8,0)');
  side.addColorStop(0.65, 'rgba(10,30,8,0)');
  side.addColorStop(1, 'rgba(10,30,8,0.35)');
  x.fillStyle = side;
  x.fillRect(0, 0, W, H);
  const r = rng(5);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = r() > 0.5 ? 'rgba(20,50,14,0.10)' : 'rgba(120,170,70,0.08)';
    x.beginPath();
    x.arc(r() * W, r() * H, 2 + r() * 7, 0, Math.PI * 2);
    x.fill();
  }
  x.lineCap = 'round';
  for (let i = 0; i < 13; i++) {
    const y = H - 14 - i * 18;
    for (const s of [-1, 1]) {
      x.strokeStyle = 'rgba(150,190,105,0.34)';
      x.lineWidth = 1.3;
      x.beginPath();
      x.moveTo(W / 2, y);
      x.quadraticCurveTo(W / 2 + s * 34, y - 12, W / 2 + s * 62, y - 34);
      x.stroke();
    }
  }
  x.strokeStyle = 'rgba(178,208,128,0.9)';
  x.lineWidth = 3.2;
  x.beginPath();
  x.moveTo(W / 2, H);
  x.lineTo(W / 2, 30);
  x.stroke();
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(W / 2, 30);
  x.lineTo(W / 2, 0);
  x.stroke();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = QUALITY.anisotropy;
  leafMat = new MeshStandardMaterial({
    map: tex,
    roughness: 0.34,
    side: DoubleSide,
    // A little light comes through a leaf: keeps the shaded side from going black
    emissive: new Color(0x9fd060),
    emissiveMap: tex,
    emissiveIntensity: 0.07,
  });
  return leafMat;
}

const UP = new Vector3(0, 1, 0);

export function buildPlant(height: number, seed: number, chrome: boolean): Group {
  const g = new Group();
  const r = rng(seed * 7919 + 13);
  const hi = QUALITY.high;

  // ---- Planter: glazed ceramic or brushed steel, foot ring, rolled lip, soil with clay pebbles
  const potH = 0.34;
  const potR = 0.19;
  const potMat = chrome
    ? new MeshStandardMaterial({ color: new Color(0xc9cdd2), metalness: 1, roughness: 0.24 })
    : new MeshStandardMaterial({ color: new Color(0x34353a), roughness: 0.58 });
  const lathe = (pts: Array<[number, number]>, segs = 48) =>
    new LatheGeometry(pts.map(([rr, y]) => new Vector2(rr, y)), hi ? segs : segs / 2);
  const pot = new Mesh(
    lathe([
      [0, 0.004], [potR * 0.7, 0.004], [potR * 0.72, 0], [potR * 0.78, 0], [potR * 0.8, 0.008], [potR * 0.79, 0.016],
      [potR * 0.84, 0.03], [potR * 0.93, potH * 0.5], [potR, potH - 0.03], [potR * 1.035, potH - 0.018],
      [potR * 1.04, potH - 0.006], [potR * 1.02, potH], [potR * 0.95, potH], [potR * 0.93, potH - 0.012],
      [potR * 0.92, potH - 0.05], [0, potH - 0.05],
    ]),
    potMat,
  );
  pot.castShadow = pot.receiveShadow = true;
  g.add(pot);
  const soilY = potH - 0.045;
  const soil = new Mesh(
    new CylinderGeometry(potR * 0.925, potR * 0.925, 0.012, 32),
    new MeshStandardMaterial({ color: new Color(0x241a12), roughness: 1 }),
  );
  soil.position.y = soilY;
  soil.receiveShadow = true;
  g.add(soil);
  const nPeb = hi ? 420 : 60;
  const pebbles = new InstancedMesh(
    new SphereGeometry(1, 7, 5),
    new MeshStandardMaterial({ color: new Color(0xffffff), roughness: 0.95 }),
    nPeb,
  );
  const M = new Matrix4();
  const col = new Color();
  for (let i = 0; i < nPeb; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * potR * 0.86;
    const s = 0.005 + r() * 0.005;
    M.makeScale(s * (0.8 + r() * 0.5), s * 0.7, s * (0.8 + r() * 0.5));
    M.setPosition(Math.cos(a) * d, soilY + 0.008 + r() * 0.004, Math.sin(a) * d);
    pebbles.setMatrixAt(i, M);
    const v = 0.5 + r() * 0.5;
    pebbles.setColorAt(i, col.setRGB(0.3 * v, 0.19 * v, 0.12 * v));
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.receiveShadow = true;
  pebbles.raycast = () => {};
  g.add(pebbles);

  // ---- Wood skeleton
  const tubes = new Tubes();
  const leafM: Matrix4[] = [];
  const leafC: number[] = [];
  const X = new Vector3();
  const Y = new Vector3();
  const Z = new Vector3();
  const sideV = new Vector3();
  const leafLen = hi ? 0.082 : 0.12;
  const spacing = hi ? 0.021 : 0.06;

  const addLeaf = (q: Vector3, d: Vector3, s: number, along: number) => {
    sideV.crossVectors(d, UP);
    if (sideV.lengthSq() < 1e-4) sideV.set(1, 0, 0);
    sideV.normalize();
    Y.copy(d).multiplyScalar(0.5).addScaledVector(sideV, s * 0.85).addScaledVector(UP, -0.3 - r() * 0.4);
    Y.x += (r() - 0.5) * 0.35;
    Y.z += (r() - 0.5) * 0.35;
    Y.normalize();
    Z.copy(UP).addScaledVector(Y, -UP.dot(Y));
    if (Z.lengthSq() < 1e-3) Z.copy(sideV);
    Z.normalize().addScaledVector(sideV, (r() - 0.5) * 0.9).addScaledVector(Y, -Z.dot(Y)).normalize();
    X.crossVectors(Y, Z);
    const young = along > 0.8 && r() > 0.45;
    const L = leafLen * (0.72 + r() * 0.45) * (young ? 0.7 : 1);
    const m = new Matrix4().makeBasis(X.clone().multiplyScalar(L), Y.clone().multiplyScalar(L), Z.clone().multiplyScalar(L));
    m.setPosition(q);
    leafM.push(m);
    const v = 0.55 + r() * 0.45;
    if (young) leafC.push(v * 1.5, v * 1.3, v * 0.75);
    else leafC.push(v * (0.86 + r() * 0.22), v, v * (0.82 + r() * 0.2));
  };

  const maxDepth = hi ? 2 : 1;
  const branch = (origin: Vector3, dir: Vector3, len: number, rad: number, depth: number) => {
    const steps = depth === 0 ? 7 : 5;
    const pts = [origin.clone()];
    const dirs = [dir.clone()];
    const d = dir.clone();
    const droop = depth === 0 ? 0.1 : 0.3;
    for (let s = 1; s <= steps; s++) {
      d.y -= droop * (s / steps);
      d.x += (r() - 0.5) * 0.3;
      d.z += (r() - 0.5) * 0.3;
      d.normalize();
      pts.push(pts[s - 1].clone().addScaledVector(d, len / steps));
      dirs.push(d.clone());
    }
    tubes.add(pts, pts.map((_, i) => rad * (1 - 0.7 * (i / steps))), depth === 0 ? 6 : 4);
    const at = (t: number) => {
      const f = Math.min(steps - 1e-4, t * steps);
      const i = Math.floor(f);
      return { p: pts[i].clone().lerp(pts[i + 1], f - i), d: dirs[i + 1] };
    };
    if (depth < maxDepth) {
      const kids = depth === 0 ? 6 : 4;
      for (let k = 0; k < kids; k++) {
        const { p, d: dd } = at(0.28 + (0.7 * (k + r() * 0.8)) / kids);
        sideV.crossVectors(dd, UP).normalize();
        const cd = dd.clone().multiplyScalar(0.65).addScaledVector(sideV, (k % 2 ? 1 : -1) * (0.6 + r() * 0.4));
        cd.y += 0.25 - r() * 0.35;
        branch(p, cd.normalize(), len * (0.42 + r() * 0.25), rad * 0.55, depth + 1);
      }
    }
    if (depth >= 1 || !hi) {
      const n = Math.max(2, Math.floor((len * 0.8) / spacing));
      for (let i = 0; i < n; i++) {
        const t = 0.2 + 0.8 * (i / (n - 1));
        const { p, d: dd } = at(t);
        addLeaf(p, dd, i % 2 ? 1 : -1, t);
      }
      addLeaf(pts[steps], dirs[steps], 0, 1);
    }
  };

  // Trunk with a gentle S-curve, flaring into the soil
  const potTop = soilY;
  const topY = height * 0.8;
  const trunk: Vector3[] = [];
  const tr: number[] = [];
  const ph = r() * 6.28;
  const nT = 12;
  const baseR = 0.012 + height * 0.006;
  for (let i = 0; i <= nT; i++) {
    const t = i / nT;
    trunk.push(new Vector3(Math.sin(t * 3.2 + ph) * 0.035 * t, potTop + (topY - potTop) * t, Math.cos(t * 2.6 + ph) * 0.03 * t));
    tr.push(baseR * (1 - 0.72 * t) * (1 + 0.6 * Math.exp(-t * 30)));
  }
  tubes.add(trunk, tr, hi ? 10 : 6);
  const nMain = Math.round(8 + height * 3.4);
  for (let i = 0; i < nMain; i++) {
    const f = i / (nMain - 1);
    const tt = 0.46 + 0.54 * f;
    const fi = Math.min(nT - 1e-4, tt * nT);
    const o = trunk[Math.floor(fi)].clone().lerp(trunk[Math.floor(fi) + 1], fi - Math.floor(fi));
    const az = i * 2.39996 + r() * 0.6;
    const el = 0.62 + 0.7 * f + (r() - 0.5) * 0.25;
    const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    branch(o, dir, height * (0.36 - 0.12 * f) * (0.8 + r() * 0.4), baseR * 0.42 * (1 - 0.4 * f), 0);
  }
  const wood = new Mesh(tubes.build(), new MeshStandardMaterial({ color: new Color(0x8b7d6c), roughness: 0.86 }));
  wood.castShadow = true;
  wood.receiveShadow = true;
  wood.userData.noBake = true;
  g.add(wood);

  const leaves = new InstancedMesh(leafGeometry(), leafMaterial(), leafM.length);
  for (let i = 0; i < leafM.length; i++) {
    leaves.setMatrixAt(i, leafM[i]);
    leaves.setColorAt(i, col.setRGB(leafC[i * 3], leafC[i * 3 + 1], leafC[i * 3 + 2]));
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
