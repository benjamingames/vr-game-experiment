/**
 * "Hollow Grove": the Monke Map arena, generated entirely in code. A giant hollow stump at the
 * origin (spawn), leaning logs up to its rim, rolling terrain in a bowl, climbable trees with
 * thick branches, boulders and wind-blown grass.
 *
 * All collidable geometry is baked into world space (identity transforms), because the
 * hand-locomotion solver reads raw triangle positions. Materials whose name starts with
 * "leaves" are decorative and skipped by collision.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';
import { timeUniform } from './env.js';
import { oak } from './materials.js';
import { leafMaterial } from './plants.js';
import {
  PBRSet,
  barkSet,
  endGrainSet,
  fbm3,
  groundSet,
  retile,
  rockSet,
} from './textures.js';

const STUMP = { rin: 3.45, rout: 4.25, segs: 48, doorHalf: 0.21, doorTop: 2.7 };
const DOORS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
const BOWL = 42;

const ss2 = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terrain height: flat clearing around the stump, rolling hills, then a steep bowl rim. */
export function arenaHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const hills = fbm3(x * 0.045 + 40, 0.5, z * 0.045 + 40, 4, 5);
  const detail = fbm3(x * 0.21 + 9, 3.5, z * 0.21 + 9, 3, 9);
  let h = sstep(6.5, 17, r) * ((hills - 0.38) * 7.5 + (detail - 0.5) * 0.9);
  h = Math.max(h, -0.9);
  return h + Math.pow(sstep(29, BOWL, r), 1.5) * 18;
}

function stumpTop(a: number): number {
  return 4.3 + (fbm3(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 1.5, 3, 3) - 0.5) * 2.4;
}

function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accumulates world-space triangles for one material (one draw call each). */
class Bucket {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];

  add(geo: BufferGeometry, m: Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const p = g.attributes.position.array as ArrayLike<number>;
    const n = g.attributes.normal.array as ArrayLike<number>;
    const u = g.attributes.uv.array as ArrayLike<number>;
    for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    for (let i = 0; i < n.length; i++) this.nrm.push(n[i]);
    for (let i = 0; i < u.length; i++) this.uv.push(u[i]);
    g.dispose();
    geo.dispose();
  }

  /** Quad a-b-c-d (counter-clockwise seen from the normal side). */
  quad(v: number[][], n: number[][], t: number[][]) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(v[i][0], v[i][1], v[i][2]);
      this.nrm.push(n[i][0], n[i][1], n[i][2]);
      this.uv.push(t[i][0], t[i][1]);
    }
  }

  mesh(material: Material, cast = true): Mesh {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    const mesh = new Mesh(geo, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    return mesh;
  }
}

function pbrMat(name: string, set: PBRSet, extra: Partial<MeshStandardMaterial> = {}) {
  const m = new MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.ormMap,
    roughness: 1,
    metalness: 0,
  });
  m.normalScale = new Vector2(1.4, 1.4);
  Object.assign(m, extra);
  m.name = name;
  return m;
}

/**
 * A tube along a curved path with a radius that varies along it and around it, so trunks and
 * limbs can flare, flute and bulge. Frames are carried along the path, so the lobes do not twist.
 */
function tube(path: Vector3[], radius: (i: number, ang: number) => number, sides: number, cap = false): BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const T = new Vector3();
  const N = new Vector3();
  const B = new Vector3();
  let along = 0;
  for (let i = 0; i < n; i++) {
    T.copy(path[Math.min(i + 1, n - 1)]).sub(path[Math.max(i - 1, 0)]).normalize();
    if (i === 0) N.crossVectors(T, Math.abs(T.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
    else N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    if (i > 0) along += path[i].distanceTo(path[i - 1]);
    for (let j = 0; j <= sides; j++) {
      const ang = ((j % sides) / sides) * Math.PI * 2;
      const r = radius(i, ang);
      const cx = Math.cos(ang) * r;
      const sx = Math.sin(ang) * r;
      pos.push(path[i].x + N.x * cx + B.x * sx, path[i].y + N.y * cx + B.y * sx, path[i].z + N.z * cx + B.z * sx);
      uv.push((j / sides) * 2, along / 3);
    }
  }
  const ring = sides + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * ring + j;
      idx.push(a, a + 1, a + ring, a + 1, a + ring + 1, a + ring);
    }
  }
  if (cap) {
    for (const end of [0, n - 1]) {
      const c = pos.length / 3;
      pos.push(path[end].x, path[end].y, path[end].z);
      uv.push(0.5, 0.5);
      for (let j = 0; j < sides; j++) {
        const a = end * ring + j;
        if (end === 0) idx.push(c, a + 1, a);
        else idx.push(c, a, a + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The first and last vertex of each ring are the same point: share their normal so no seam shows
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const a = i * ring;
    const b = a + sides;
    const x = nr.getX(a) + nr.getX(b);
    const y = nr.getY(a) + nr.getY(b);
    const z = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Wind sway injected into a standard material's vertex stage. */
function windy(m: MeshStandardMaterial, body: string) {
  m.userData.noBoxProject = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  };
  m.customProgramCacheKey = () => 'wind:' + m.name;
}

function displacedBlob(ws: number, hs: number, amp: number, freq: number, seed: number) {
  const g = new SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = 1 + (fbm3(x * freq + seed, y * freq, z * freq - seed, 3, seed) - 0.5) * amp;
    p.setXYZ(i, x * d, y * d, z * d);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A leafy twig: leaves set alternately along a short stem (stem along +Y, 1 unit long, leaf faces
 * toward +Z). Instanced thousands of times over each crown, so the canopy is made of leaves.
 */
function sprayGeometry(): BufferGeometry {
  const r = mulberry(77);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const nLeaf = QUALITY.high ? 7 : 4;
  const rows = [0, 0.3, 0.72, 1];
  const widths = [0.012, 0.21, 0.2, 0];
  const X = new Vector3();
  const Y = new Vector3();
  const Z = new Vector3();
  for (let l = 0; l < nLeaf; l++) {
    const last = l === nLeaf - 1;
    const t = last ? 1 : 0.08 + (0.84 * l) / (nLeaf - 1);
    const ang = last ? (r() - 0.5) * 0.3 : (l % 2 ? 1 : -1) * (0.85 + r() * 0.45);
    Y.set(Math.sin(ang), Math.cos(ang), (r() - 0.5) * 0.7).normalize();
    Z.set((r() - 0.5) * 0.5, 0, 1).addScaledVector(Y, -Y.z).normalize();
    X.crossVectors(Y, Z);
    const L = 0.46 * (0.75 + r() * 0.45);
    const base = pos.length / 3;
    for (let i = 0; i < rows.length; i++) {
      for (const c of [-1, 0, 1]) {
        const x = c * widths[i];
        const z = 0.4 * Math.abs(c) * widths[i] - 0.14 * rows[i] * rows[i];
        pos.push(X.x * x * L + Y.x * rows[i] * L + Z.x * z * L, t * 0.72 + X.y * x * L + Y.y * rows[i] * L + Z.y * z * L, X.z * x * L + Y.z * rows[i] * L + Z.z * z * L);
        uv.push(c * 0.5 + 0.5, rows[i]);
      }
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < 2; j++) {
        const q = base + i * 3 + j;
        idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildProceduralArena(): Group {
  const root = new Group();
  root.name = 'hollow-grove';
  const rnd = mulberry(20261110);
  const M = new Matrix4();
  const Q = new Quaternion();
  const E = new Euler();
  const P = new Vector3();
  const S = new Vector3();

  const barkTex = barkSet();
  const bark = pbrMat('bark', retile(barkTex, 3, 2));
  const innerWood = oak('#4a2c14', '#a8743c', 1.5, 1, 0.7);
  innerWood.name = 'stumpwood';
  innerWood.side = DoubleSide;
  const rock = pbrMat('rock', retile(rockSet(), 2, 2));
  // Thin limbs inside each crown: same bark, but decorative (the "leaves" name skips collision)
  const leaves = pbrMat('leaves-twigs', retile(barkTex, 2, 3));
  const crowns: Array<{ c: Vector3; r: number }> = [];
  const UPV = new Vector3(0, 1, 0);
  /** Forking limbs from the heart of a crown out to where the leaves are, so the inside is wood, not a ball. */
  const crownLimbs = (c: Vector3, r: number) => {
    const n = QUALITY.high ? 7 : 4;
    const a0 = new Vector3(c.x, c.y - r * 0.38, c.z);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rnd();
      const el = 0.15 + rnd() * 1.1;
      const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el) * 0.75, Math.sin(az) * Math.cos(el));
      const len = r * (0.7 + rnd() * 0.25);
      const g = new CylinderGeometry(0.035, 0.1, len, 6, 1);
      P.copy(a0).addScaledVector(dir, len / 2);
      Q.setFromUnitVectors(UPV, dir);
      M.compose(P, Q, S.set(1, 1, 1));
      bLeaves.add(g, M);
      if (!QUALITY.high) continue;
      // Each limb forks once near its end
      const tip = a0.clone().addScaledVector(dir, len * 0.6);
      for (const s of [-1, 1]) {
        const d2 = dir.clone();
        d2.x += s * (0.4 + rnd() * 0.4) * Math.sin(az);
        d2.z -= s * (0.4 + rnd() * 0.4) * Math.cos(az);
        d2.y += 0.2 - rnd() * 0.5;
        d2.normalize();
        const l2 = r * (0.35 + rnd() * 0.2);
        const g2 = new CylinderGeometry(0.014, 0.04, l2, 5, 1);
        P.copy(tip).addScaledVector(d2, l2 / 2);
        Q.setFromUnitVectors(UPV, d2);
        M.compose(P, Q, S.set(1, 1, 1));
        bLeaves.add(g2, M);
      }
    }
  };

  const bLeaves = new Bucket();
  const bBark = new Bucket();
  const bInner = new Bucket();
  const bRock = new Bucket();

  // ---- Terrain ----------------------------------------------------------------
  {
    const N = QUALITY.high ? 168 : 84;
    const size = BOWL * 2 + 4;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const uv = new Float32Array((N + 1) * (N + 1) * 2);
    const tint = new Float32Array((N + 1) * (N + 1) * 3);
    const idx: number[] = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = -size / 2 + (size * i) / N;
        const z = -size / 2 + (size * j) / N;
        const k = j * (N + 1) + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = arenaHeightAt(x, z);
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 5.5;
        uv[k * 2 + 1] = z / 5.5;
        // Broad colour drift so the tiled texture never reads as a repeat: lush, dry and shaded zones
        const lush = fbm3(x * 0.07 + 3, 2, z * 0.07 + 3, 3, 21);
        const dry = fbm3(x * 0.16 + 11, 5, z * 0.16 - 4, 3, 23);
        tint[k * 3] = 0.78 + dry * 0.5;
        tint[k * 3 + 1] = 0.72 + lush * 0.5;
        tint[k * 3 + 2] = 0.7 + lush * 0.3;
        if (i < N && j < N) idx.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('color', new BufferAttribute(tint, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const terrain = new Mesh(geo, pbrMat('ground', groundSet(), { vertexColors: true }));
    terrain.receiveShadow = true;
    terrain.frustumCulled = false;
    terrain.raycast = () => {};
    root.add(terrain);
  }

  // ---- Giant hollow stump -----------------------------------------------------
  {
    const { rin, rout, segs, doorHalf, doorTop } = STUMP;
    const isDoor = (a: number) =>
      DOORS.some((d) => {
        let diff = Math.abs(a - d) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < doorHalf;
      });
    // Outer radius flares into root buttresses near the ground and is lumpy all the way up.
    const R = (a: number, y: number) =>
      rout +
      0.85 * Math.exp(-y * 1.5) * (0.6 + 0.8 * fbm3(Math.cos(a) * 3, Math.sin(a) * 3, 7, 2, 4)) +
      (fbm3(Math.cos(a) * 4, y * 0.7, Math.sin(a) * 4, 3, 8) - 0.5) * 0.4;
    const pt = (r: number, a: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const rad = (a: number, s: number, up = 0) => {
      const l = Math.hypot(1, up);
      return [(Math.cos(a) * s) / l, up / l, (Math.sin(a) * s) / l];
    };
    const UP = [0, 1, 0];
    const DOWN = [0, -1, 0];
    const rows = 6;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      const door = isDoor((a0 + a1) / 2);
      const y0 = door ? doorTop : -0.3;
      const t0 = stumpTop(a0);
      const t1 = stumpTop(a1);
      const u0 = (s / segs) * 10;
      const u1 = ((s + 1) / segs) * 10;
      // Inner wall (faces the centre)
      bInner.quad(
        [pt(rin, a1, y0), pt(rin, a0, y0), pt(rin, a0, t0), pt(rin, a1, t1)],
        [rad(a1, -1), rad(a0, -1), rad(a0, -1), rad(a1, -1)],
        [[u1, y0 / 4], [u0, y0 / 4], [u0, t0 / 4], [u1, t1 / 4]],
      );
      // Outer bark, subdivided vertically so the root flare reads
      for (let r = 0; r < rows; r++) {
        const f0 = r / rows;
        const f1 = (r + 1) / rows;
        const ya0 = y0 + (t0 - y0) * f0 * f0;
        const ya1 = y0 + (t1 - y0) * f0 * f0;
        const yb0 = y0 + (t0 - y0) * f1 * f1;
        const yb1 = y0 + (t1 - y0) * f1 * f1;
        const tilt = 0.9 * Math.exp(-ya0 * 1.5);
        bBark.quad(
          [pt(R(a0, ya0), a0, ya0), pt(R(a1, ya1), a1, ya1), pt(R(a1, yb1), a1, yb1), pt(R(a0, yb0), a0, yb0)],
          [rad(a0, 1, tilt), rad(a1, 1, tilt), rad(a1, 1, tilt), rad(a0, 1, tilt)],
          [[u0 * 0.8, ya0 / 3], [u1 * 0.8, ya1 / 3], [u1 * 0.8, yb1 / 3], [u0 * 0.8, yb0 / 3]],
        );
      }
      // Top rim (walkable)
      bInner.quad(
        [pt(rin, a0, t0), pt(R(a0, t0), a0, t0), pt(R(a1, t1), a1, t1), pt(rin, a1, t1)],
        [UP, UP, UP, UP],
        [[u0, 0], [u0, 0.25], [u1, 0.25], [u1, 0]],
      );
      if (door) {
        // Underside of the lintel
        bInner.quad(
          [pt(rin, a1, y0), pt(R(a1, y0), a1, y0), pt(R(a0, y0), a0, y0), pt(rin, a0, y0)],
          [DOWN, DOWN, DOWN, DOWN],
          [[u1, 0], [u1, 0.25], [u0, 0.25], [u0, 0]],
        );
      } else {
        // Door jambs where a solid segment borders an opening
        const prevDoor = isDoor(a0 - Math.PI / segs);
        const nextDoor = isDoor(a1 + Math.PI / segs);
        if (prevDoor) {
          const n = [Math.sin(a0), 0, -Math.cos(a0)];
          bInner.quad(
            [pt(rin, a0, -0.3), pt(R(a0, 0), a0, -0.3), pt(R(a0, doorTop), a0, doorTop), pt(rin, a0, doorTop)],
            [n, n, n, n],
            [[0, 0], [0.3, 0], [0.3, 0.7], [0, 0.7]],
          );
        }
        if (nextDoor) {
          const n = [-Math.sin(a1), 0, Math.cos(a1)];
          bInner.quad(
            [pt(R(a1, 0), a1, -0.3), pt(rin, a1, -0.3), pt(rin, a1, doorTop), pt(R(a1, doorTop), a1, doorTop)],
            [n, n, n, n],
            [[0.3, 0], [0, 0], [0, 0.7], [0.3, 0.7]],
          );
        }
      }
    }
    // End-grain floor with growth rings
    const floor = new Mesh(new CircleGeometry(rin + 0.05, 64), pbrMat('stumpfloor', endGrainSet()));
    floor.geometry.rotateX(-Math.PI / 2);
    floor.geometry.translate(0, 0.012, 0);
    floor.receiveShadow = true;
    floor.raycast = () => {};
    root.add(floor);
  }

  // ---- Leaning logs up to the stump rim -----------------------------------------
  const sides = QUALITY.high ? 22 : 10;
  const logAngles = [Math.PI / 4, (5 * Math.PI) / 4];
  for (const a of logAngles) {
    const top = new Vector3(Math.cos(a) * 3.8, stumpTop(a) + 0.15, Math.sin(a) * 3.8);
    const gx = Math.cos(a) * 11.8;
    const gz = Math.sin(a) * 11.8;
    const bot = new Vector3(gx, arenaHeightAt(gx, gz) - 0.35, gz);
    // A fallen trunk: nearly straight (it is a ramp), but fluted, knotted and thicker at the butt
    const n = QUALITY.high ? 18 : 8;
    const path: Vector3[] = [];
    const sd = rnd() * 50;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = bot.clone().lerp(top, t);
      p.y += Math.sin(t * Math.PI) * 0.12 + (fbm3(t * 3, sd, 1, 2, 3) - 0.5) * 0.12;
      path.push(p);
    }
    const lobes = 5;
    bBark.add(
      tube(
        path,
        (i, ang) => {
          const t = i / n;
          const knot = 0.14 * Math.exp(-(((t - 0.45) / 0.05) ** 2) - ((ang - 1.4) / 0.5) ** 2);
          return (0.64 - 0.14 * t) * (1 + 0.25 * Math.exp(-t * 9)) * (1 + 0.06 * Math.sin(ang * lobes + t * 3) + 0.12 * (fbm3(Math.cos(ang) * 1.6 + sd, t * 6, Math.sin(ang) * 1.6, 3, 7) - 0.5)) + knot;
        },
        sides,
        true,
      ),
      M.identity(),
    );
  }

  // ---- Trees ----------------------------------------------------------------------
  const trees: Array<[number, number]> = [];
  let guard = 0;
  while (trees.length < QUALITY.treeCount && guard++ < 600) {
    const a = rnd() * Math.PI * 2;
    const r = 9 + rnd() * 19;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 6.5)) continue;
    if (logAngles.some((la) => Math.hypot(Math.cos(la) * 9 - x, Math.sin(la) * 9 - z) < 4.5)) continue;
    trees.push([x, z]);
  }
  /** A limb that leaves `from` along `dir`, bows, and ends at `to`; thick collar at the base, knuckles along it. */
  const limb = (from: Vector3, dir: Vector3, to: Vector3, r0: number, r1: number, seed: number) => {
    const n = QUALITY.high ? 12 : 6;
    const len = from.distanceTo(to);
    const c1 = from.clone().addScaledVector(dir, len * 0.45);
    const c2 = to.clone().lerp(from, 0.3);
    c1.y -= len * 0.06;
    c2.y -= len * 0.16;
    const path: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const p = from.clone().multiplyScalar(u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(to, t * t * t);
      p.x += (fbm3(t * 4 + seed, 2, 0, 2, 5) - 0.5) * len * 0.15 * Math.sin(t * Math.PI);
      p.z += (fbm3(0, t * 4 + seed, 6, 2, 9) - 0.5) * len * 0.15 * Math.sin(t * Math.PI);
      path.push(p);
    }
    bBark.add(
      tube(
        path,
        (i, ang) => {
          const t = i / n;
          const body = r0 + (r1 - r0) * Math.pow(t, 0.8);
          const collar = 1 + 0.6 * Math.exp(-t * 5);
          const knuckle = 1 + 0.12 * Math.exp(-(((t - 0.5) / 0.06) ** 2));
          return body * collar * knuckle * (1 + 0.16 * (fbm3(Math.cos(ang) * 1.5 + seed, t * 5, Math.sin(ang) * 1.5, 2, 3) - 0.5));
        },
        Math.max(8, Math.round(sides * 0.6)),
        true,
      ),
      M.identity(),
    );
  };
  for (const [x, z] of trees) {
    const H = 9 + rnd() * 6;
    const rb = 0.55 + rnd() * 0.35;
    const base = arenaHeightAt(x, z) - 0.4;
    // Trunk: leans and wanders, flares into buttress roots, fluted all the way up, with a burl or two
    const nT = QUALITY.high ? 30 : 12;
    const sd = rnd() * 80;
    const leanA = rnd() * Math.PI * 2;
    const lean = (0.02 + rnd() * 0.07) * H;
    const ph1 = rnd() * 6.28;
    const ph2 = rnd() * 6.28;
    const roots = 4 + Math.floor(rnd() * 3);
    const rootPh = rnd() * 6.28;
    const burlY = 0.18 + rnd() * 0.3;
    const burlA = rnd() * 6.28;
    const centre = (t: number) =>
      new Vector3(
        x + Math.cos(leanA) * lean * t * t + Math.sin(t * 2.6 + ph1) * 0.42 * t,
        base + H * t,
        z + Math.sin(leanA) * lean * t * t + Math.cos(t * 2.1 + ph2) * 0.42 * t,
      );
    const path: Vector3[] = [];
    // More rings near the ground, where the roots change shape quickly
    for (let i = 0; i <= nT; i++) path.push(centre(Math.pow(i / nT, 1.6)));
    bBark.add(
      tube(
        path,
        (i, ang) => {
          const t = Math.pow(i / nT, 1.6);
          const y = t * H;
          const buttress = Math.pow(0.5 + 0.5 * Math.sin(ang * roots + rootPh + y * 0.25), 2);
          const flare = 1 + 1.25 * Math.exp(-y * 1.0) * (0.35 + 0.65 * buttress);
          const flute = 1 + 0.07 * Math.sin(ang * roots + rootPh + y * 0.25) * Math.exp(-y * 0.12);
          const lumps = 1 + 0.2 * (fbm3(Math.cos(ang) * 1.8 + sd, y * 0.45, Math.sin(ang) * 1.8, 3, 11) - 0.5);
          let da = Math.abs(ang - burlA);
          if (da > Math.PI) da = Math.PI * 2 - da;
          const burl = 0.22 * rb * Math.exp(-(((t - burlY) / 0.035) ** 2) - (da / 0.45) ** 2);
          return rb * (1 - 0.6 * Math.pow(t, 0.85)) * flare * flute * lumps + burl;
        },
        sides,
        true,
      ),
      M.identity(),
    );

    const branches = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < branches; b++) {
      const by = 2.4 + (b / branches) * (H - 4.5) + rnd() * 0.8;
      const ba = rnd() * Math.PI * 2;
      const len = 3 + rnd() * 2.2;
      const tilt = 0.12 + rnd() * 0.22;
      const dir = new Vector3(Math.cos(ba) * Math.cos(tilt), Math.sin(tilt), Math.sin(ba) * Math.cos(tilt));
      const from = centre(by / H);
      const lr = 1.5 + rnd() * 0.9;
      // The limb sweeps out, sags a little, then turns up into its crown
      const to = from.clone().addScaledVector(dir, len + rb * 0.3);
      to.y += 0.9 + rnd() * 0.9;
      limb(from, dir, to, 0.24 + rnd() * 0.06, 0.1, rnd() * 40);
      P.copy(to);
      P.y += lr * 0.3;
      crowns.push({ c: P.clone(), r: lr });
      crownLimbs(P.clone(), lr);
    }
    // The trunk divides into leaders, each carrying one of the top crowns
    const topP = centre(0.97);
    for (let c = 0; c < 3; c++) {
      const lr = 2.4 + rnd() * 1.3;
      P.set(x + (rnd() - 0.5) * 2.4, base + H - 0.6 + c * 0.9 + rnd(), z + (rnd() - 0.5) * 2.4);
      P.x += topP.x - x;
      P.z += topP.z - z;
      crowns.push({ c: P.clone(), r: lr });
      crownLimbs(P.clone(), lr);
      const to = P.clone();
      to.y -= lr * 0.25;
      const up = to.clone().sub(topP);
      up.y = Math.abs(up.y) + 1.5;
      limb(centre(0.9 - c * 0.05), up.normalize(), to, rb * 0.3, 0.09, rnd() * 40);
    }
  }

  // ---- Boulders -------------------------------------------------------------------
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 6.2 + rnd() * 24;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const sr = 0.7 + rnd() * rnd() * 1.9;
    P.set(x, arenaHeightAt(x, z) + sr * 0.18, z);
    Q.setFromEuler(E.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6));
    M.compose(P, Q, S.set(sr * (0.9 + rnd() * 0.5), sr * (0.55 + rnd() * 0.3), sr));
    bRock.add(displacedBlob(16, 11, 0.85, 1.3, rnd() * 80), M);
  }

  root.add(bBark.mesh(bark), bInner.mesh(innerWood), bRock.mesh(rock), bLeaves.mesh(leaves));

  // ---- Canopy leaves: sprays over every crown, facing out and up, drooping at the edges ----
  {
    const lm = leafMaterial().clone();
    lm.name = 'leaves-spray';
    lm.emissiveIntensity = 0.2;
    lm.roughness = 0.62;
    windy(
      lm,
      'float sw = sin( uTime * 1.4 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6 ) + 0.5 * sin( uTime * 3.3 + instanceMatrix[3].y * 1.7 );\n' +
        'transformed.z += sw * 0.09 * position.y;\n' +
        'transformed.x += sw * 0.04 * position.y;',
    );
    const per = QUALITY.high ? 74 : 18;
    let total = 0;
    for (const cr of crowns) total += Math.round(per * cr.r * cr.r);
    const sprays = new InstancedMesh(sprayGeometry(), lm, total);
    const c = new Color();
    const N3 = new Vector3();
    const X3 = new Vector3();
    const Y3 = new Vector3();
    const Z3 = new Vector3();
    let n = 0;
    for (const cr of crowns) {
      const cnt = Math.round(per * cr.r * cr.r);
      for (let i = 0; i < cnt; i++) {
        // Even spread over the crown; skip most of the underside, where a real crown is bare wood
        const u = 1 - 2 * ((i + rnd()) / cnt);
        const ph = i * 2.39996 + rnd();
        const sr = Math.sqrt(Math.max(0, 1 - u * u));
        N3.set(Math.cos(ph) * sr, u, Math.sin(ph) * sr);
        if (N3.y < -0.45 && rnd() < 0.8) N3.y = -N3.y * rnd();
        // Leaves fill the whole crown, thinning toward its heart, so there is depth instead of a shell
        const shell = 0.28 + 0.8 * Math.pow(rnd(), 0.55);
        const bump = 1 + (fbm3(N3.x * 1.6 + cr.c.x, N3.y * 1.6, N3.z * 1.6 + cr.c.z, 2, 5) - 0.5) * 0.7;
        P.set(cr.c.x + N3.x * cr.r * shell * bump, cr.c.y + N3.y * cr.r * 0.7 * shell * bump, cr.c.z + N3.z * cr.r * shell * bump);
        Z3.copy(N3).multiplyScalar(0.7);
        Z3.y += 0.75;
        Z3.x += (rnd() - 0.5) * 0.6;
        Z3.z += (rnd() - 0.5) * 0.6;
        Z3.normalize();
        Y3.set(N3.x + (rnd() - 0.5) * 1.6, -0.25 - rnd() * 0.5, N3.z + (rnd() - 0.5) * 1.6);
        Y3.addScaledVector(Z3, -Y3.dot(Z3)).normalize();
        X3.crossVectors(Y3, Z3);
        const sc = (QUALITY.high ? 0.92 : 1.2) * (0.75 + rnd() * 0.6);
        M.makeBasis(X3.multiplyScalar(sc), Y3.multiplyScalar(sc), Z3.multiplyScalar(sc));
        M.setPosition(P);
        sprays.setMatrixAt(n, M);
        // Lit, yellower leaves on top and outside; deeper green underneath and inside
        const lit = (0.5 + 0.5 * N3.y) * (0.25 + 0.75 * ss2(0.35, 0.95, shell));
        const v = 0.7 + lit * 0.75 + rnd() * 0.3;
        c.setRGB(v * (0.85 + lit * 0.35 + rnd() * 0.15), v * (1.0 + lit * 0.1), v * (0.7 + rnd() * 0.2));
        sprays.setColorAt(n++, c);
      }
    }
    sprays.count = n;
    sprays.instanceMatrix.needsUpdate = true;
    if (sprays.instanceColor) sprays.instanceColor.needsUpdate = true;
    sprays.castShadow = true;
    sprays.receiveShadow = true;
    sprays.frustumCulled = false;
    sprays.raycast = () => {};
    root.add(sprays);
  }

  // ---- Grass (instanced tufts, wind in the vertex shader) ---------------------------
  {
    const blade: number[] = [];
    const col: number[] = [];
    const nrm: number[] = [];
    // A tuft of thin, arching blades of mixed height; some dry and straw-coloured
    const tuft = QUALITY.high ? 7 : 4;
    const gr = mulberry(4401);
    for (let t = 0; t < tuft; t++) {
      const a = gr() * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const ox = (gr() - 0.5) * 0.09;
      const oz = (gr() - 0.5) * 0.09;
      const H = 0.16 + gr() * 0.34;
      const w0 = 0.006 + gr() * 0.006;
      const lean = 0.15 + gr() * 0.75;
      const dry = gr() < 0.18;
      const seg = [0, 0.4, 0.75, 1];
      const pt = (k: number, sgn: number) => {
        const f = seg[k];
        const w = w0 * (1 - f * f) * sgn;
        const out = lean * f * f * H;
        return [ox + w * cz + out * cx, f * H * (1 - 0.25 * lean * f), oz - w * cx + out * cz, f];
      };
      for (let k = 0; k < 3; k++) {
        const q = k === 2 ? [pt(k, -1), pt(k, 1), pt(k + 1, 0)] : [pt(k, -1), pt(k, 1), pt(k + 1, 1), pt(k, -1), pt(k + 1, 1), pt(k + 1, -1)];
        for (const v of q) {
          blade.push(v[0], v[1], v[2]);
          const g = 0.28 + v[3] * 0.85;
          if (dry) col.push(g * 1.25, g * 1.05, g * 0.45);
          else col.push(g * 0.72, g, g * 0.42);
          nrm.push(0, 1, 0);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(blade), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    const gm = new MeshStandardMaterial({
      color: new Color(0x64883a),
      roughness: 0.7,
      side: DoubleSide,
      vertexColors: true,
    });
    gm.name = 'leaves-grass';
    windy(
      gm,
      'float gw = sin( uTime * 1.6 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9 ) + 0.5 * sin( uTime * 3.1 + instanceMatrix[3].x * 2.3 );\n' +
        'transformed.x += gw * position.y * position.y * 0.55;\n' +
        'transformed.z += gw * position.y * position.y * 0.3;',
    );
    const count = Math.round(QUALITY.grassBlades * (QUALITY.high ? 0.75 : 0.85));
    const inst = new InstancedMesh(geo, gm, count);
    const c = new Color();
    let placed = 0;
    let tries = 0;
    while (placed < count && tries++ < count * 4) {
      const a = rnd() * Math.PI * 2;
      const r = 4.9 + Math.pow(rnd(), 1.7) * 24;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Leave bare-earth patches, matching the ground texture's dirt noise loosely
      if (fbm3(x * 0.3, 1, z * 0.3, 2, 13) > 0.62) continue;
      const s = 0.8 + rnd() * 1.3;
      P.set(x, arenaHeightAt(x, z) - 0.02, z);
      M.compose(P, Q.setFromEuler(E.set(0, rnd() * 6.28, 0)), S.set(s, s * (0.7 + rnd() * 0.8), s));
      inst.setMatrixAt(placed, M);
      const v = 0.75 + rnd() * 0.5;
      inst.setColorAt(placed, c.setRGB(v * (0.85 + rnd() * 0.3), v, v * 0.8));
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    inst.receiveShadow = true;
    inst.raycast = () => {};
    root.add(inst);
  }

  return root;
}
