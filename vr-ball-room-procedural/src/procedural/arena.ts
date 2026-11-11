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
import {
  PBRSet,
  barkSet,
  buildSet,
  endGrainSet,
  fbm,
  fbm3,
  groundSet,
  retile,
  rockSet,
  woodSet,
} from './textures.js';

const STUMP = { rin: 3.45, rout: 4.25, segs: 48, doorHalf: 0.21, doorTop: 2.7 };
const DOORS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
const BOWL = 42;

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

function foliageSet(): PBRSet {
  return buildSet(QUALITY.texSize, 7, (u, v, o) => {
    const cell = fbm(u * 24, v * 24, 24, 24, 3, 61);
    const leaf = 1 - Math.abs(2 * fbm(u * 48, v * 48, 48, 48, 2, 63) - 1);
    const gap = sstep(0.3, 0.42, cell);
    const t = leaf * 0.7 + cell * 0.3;
    o.r = (0.05 + t * 0.2) * (0.35 + 0.65 * gap);
    o.g = (0.16 + t * 0.4) * (0.35 + 0.65 * gap);
    o.b = (0.03 + t * 0.1) * (0.35 + 0.65 * gap);
    o.h = t * gap;
    o.rough = 0.62 + (1 - t) * 0.25;
  });
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
  const innerWood = pbrMat(
    'stumpwood',
    retile(woodSet('#4a2c14', '#a8743c', { seed: 5, rings: 9, rough: 0.7 }), 1.5, 1),
    { side: DoubleSide },
  );
  const rock = pbrMat('rock', retile(rockSet(), 2, 2));
  const leaves = pbrMat('leaves-canopy', retile(foliageSet(), 4, 3));
  leaves.normalScale.set(2, 2);
  windy(
    leaves,
    'transformed += normal * ( sin( uTime * 1.3 + position.x * 0.8 + position.z * 0.6 ) * 0.035 + sin( uTime * 2.9 + position.y * 2.0 ) * 0.015 );',
  );

  const bBark = new Bucket();
  const bInner = new Bucket();
  const bRock = new Bucket();
  const bLeaves = new Bucket();

  // ---- Terrain ----------------------------------------------------------------
  {
    const N = 84;
    const size = BOWL * 2 + 4;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const uv = new Float32Array((N + 1) * (N + 1) * 2);
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
        if (i < N && j < N) idx.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const terrain = new Mesh(geo, pbrMat('ground', groundSet()));
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
  const logAngles = [Math.PI / 4, (5 * Math.PI) / 4];
  for (const a of logAngles) {
    const top = new Vector3(Math.cos(a) * 4.0, stumpTop(a) + 0.15, Math.sin(a) * 4.0);
    const gx = Math.cos(a) * 11.5;
    const gz = Math.sin(a) * 11.5;
    const bot = new Vector3(gx, arenaHeightAt(gx, gz) - 0.35, gz);
    const len = top.distanceTo(bot) + 0.6;
    const g = new CylinderGeometry(0.5, 0.62, len, 12, 8);
    P.copy(top).add(bot).multiplyScalar(0.5);
    Q.setFromUnitVectors(new Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    M.compose(P, Q, S.set(1, 1, 1));
    bBark.add(g, M);
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
  for (const [x, z] of trees) {
    const H = 9 + rnd() * 6;
    const rb = 0.55 + rnd() * 0.35;
    const base = arenaHeightAt(x, z) - 0.4;
    const trunk = new CylinderGeometry(rb * 0.55, rb, H, 12, 8, true);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i) + H / 2;
      const flare = 1 + 0.9 * Math.exp(-y * 1.3);
      tp.setX(i, tp.getX(i) * flare + Math.sin(y * 0.35 + x) * 0.18);
      tp.setZ(i, tp.getZ(i) * flare + Math.cos(y * 0.3 + z) * 0.18);
    }
    trunk.computeVertexNormals();
    M.makeTranslation(x, base + H / 2, z);
    bBark.add(trunk, M);

    const branches = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < branches; b++) {
      const by = 2.4 + (b / branches) * (H - 4.5) + rnd() * 0.8;
      const ba = rnd() * Math.PI * 2;
      const len = 3 + rnd() * 2.2;
      const tilt = 0.12 + rnd() * 0.22;
      const dir = new Vector3(Math.cos(ba) * Math.cos(tilt), Math.sin(tilt), Math.sin(ba) * Math.cos(tilt));
      const g = new CylinderGeometry(0.13, 0.27, len, 8, 2);
      P.set(x, base + by, z).addScaledVector(dir, len / 2 + rb * 0.3);
      Q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      M.compose(P, Q, S.set(1, 1, 1));
      bBark.add(g, M);
      const lr = 1.5 + rnd() * 0.9;
      P.set(x, base + by, z).addScaledVector(dir, len + rb * 0.3);
      P.y += lr * 0.35;
      M.compose(P, Q.setFromEuler(E.set(0, rnd() * 6, 0)), S.set(lr, lr * 0.68, lr));
      bLeaves.add(displacedBlob(16, 11, 0.7, 1.6, rnd() * 50), M);
    }
    for (let c = 0; c < 3; c++) {
      const lr = 2.4 + rnd() * 1.3;
      P.set(x + (rnd() - 0.5) * 2.4, base + H - 0.6 + c * 0.9 + rnd(), z + (rnd() - 0.5) * 2.4);
      M.compose(P, Q.setFromEuler(E.set(0, rnd() * 6, 0)), S.set(lr, lr * 0.7, lr));
      bLeaves.add(displacedBlob(18, 12, 0.75, 1.5, rnd() * 50), M);
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

  // ---- Grass (instanced tufts, wind in the vertex shader) ---------------------------
  {
    const blade: number[] = [];
    const col: number[] = [];
    const nrm: number[] = [];
    const tuft = 3;
    for (let t = 0; t < tuft; t++) {
      const a = (t / tuft) * Math.PI;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const lean = 0.08;
      const w = [0.03, 0.022, 0.0];
      const h = [0, 0.2, 0.42];
      for (let k = 0; k < 2; k++) {
        const l = [-w[k], w[k], w[k + 1], -w[k + 1]];
        const ys = [h[k], h[k], h[k + 1], h[k + 1]];
        const order = k === 1 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3];
        for (const i of order) {
          blade.push(l[i] * cx + lean * ys[i] * cz, ys[i], l[i] * cz - lean * ys[i] * cx);
          const g = 0.3 + (ys[i] / 0.42) * 0.9;
          col.push(g * 0.75, g, g * 0.5);
          nrm.push(0, 1, 0);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(blade), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    const gm = new MeshStandardMaterial({
      color: new Color(0x6f9a3a),
      roughness: 0.75,
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
    const count = QUALITY.grassBlades / tuft;
    const inst = new InstancedMesh(geo, gm, count);
    const c = new Color();
    let placed = 0;
    let tries = 0;
    while (placed < count && tries++ < count * 4) {
      const a = rnd() * Math.PI * 2;
      const r = 4.9 + Math.pow(rnd(), 1.5) * 24;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Leave bare-earth patches, matching the ground texture's dirt noise loosely
      if (fbm3(x * 0.3, 1, z * 0.3, 2, 13) > 0.62) continue;
      const s = 0.7 + rnd() * 1.1;
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
