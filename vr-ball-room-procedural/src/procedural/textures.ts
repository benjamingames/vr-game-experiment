/**
 * Procedural PBR texture synthesis. Every surface in this game gets its albedo, normal and
 * roughness/metalness maps computed here at startup from noise functions: no image files.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';

// ---- Noise -----------------------------------------------------------------

/** Integer lattice hash -> [0, 1). */
export function ih(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable 2D value noise; (px, py) is the lattice period. */
export function vnoise(x: number, y: number, px: number, py: number, s: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % px) + px) % px;
  const xb = (xa + 1) % px;
  const ya = ((y0 % py) + py) % py;
  const yb = (ya + 1) % py;
  const a = ih(xa, ya, s);
  const b = ih(xb, ya, s);
  const c = ih(xa, yb, s);
  const d = ih(xb, yb, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Tileable fractal noise in [0, 1]. Pass coordinates already scaled to the lattice period. */
export function fbm(
  x: number,
  y: number,
  px: number,
  py: number,
  oct: number,
  s: number,
): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x, y, px, py, s + o * 17);
    norm += amp;
    x *= 2;
    y *= 2;
    px *= 2;
    py *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Non-tiling 3D value noise in [0, 1] (used for displacing rocks, foliage and terrain). */
export function noise3(x: number, y: number, z: number, s = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number, k: number) => ih(x0 + i, y0 + j, s + (z0 + k) * 131);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), ux), l(h(0, 1, 0), h(1, 1, 0), ux), uy),
    l(l(h(0, 0, 1), h(1, 0, 1), ux), l(h(0, 1, 1), h(1, 1, 1), ux), uy),
    uz,
  );
}

export function fbm3(x: number, y: number, z: number, oct: number, s = 0): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise3(x, y, z, s + o * 31);
    norm += amp;
    x *= 2.02;
    y *= 2.02;
    z *= 2.02;
    amp *= 0.5;
  }
  return sum / norm;
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- Texture set builder -----------------------------------------------------

export interface Texel {
  r: number;
  g: number;
  b: number;
  /** Height in [0, 1]; the normal map is derived from it. */
  h: number;
  rough: number;
  metal: number;
}

export interface PBRSet {
  map: DataTexture;
  normalMap: DataTexture;
  /** G = roughness, B = metalness (usable as both roughnessMap and metalnessMap). */
  ormMap: DataTexture;
}

function finish(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = QUALITY.anisotropy;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildSet(
  size: number,
  normalStrength: number,
  fn: (u: number, v: number, o: Texel) => void,
): PBRSet {
  const n = size * size;
  const albedo = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const normal = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  const o: Texel = { r: 0, g: 0, b: 0, h: 0, rough: 1, metal: 0 };
  const c8 = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      o.metal = 0;
      fn((x + 0.5) / size, (y + 0.5) / size, o);
      const i = y * size + x;
      albedo[i * 4] = c8(o.r);
      albedo[i * 4 + 1] = c8(o.g);
      albedo[i * 4 + 2] = c8(o.b);
      albedo[i * 4 + 3] = 255;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = c8(o.rough);
      orm[i * 4 + 2] = c8(o.metal);
      orm[i * 4 + 3] = 255;
      height[i] = o.h;
    }
  }
  const k = (normalStrength * size) / 512;
  for (let y = 0; y < size; y++) {
    const yu = ((y + 1) % size) * size;
    const yd = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) % size;
      const xl = (x - 1 + size) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * k;
      const dy = (height[yu + x] - height[yd + x]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      normal[i] = c8(-dx * inv * 0.5 + 0.5);
      normal[i + 1] = c8(-dy * inv * 0.5 + 0.5);
      normal[i + 2] = c8(inv * 0.5 + 0.5);
      normal[i + 3] = 255;
    }
  }
  return {
    map: finish(albedo, size, true),
    normalMap: finish(normal, size, false),
    ormMap: finish(orm, size, false),
  };
}

/** Same pixels, different tiling (shares the GPU upload source). */
export function retile(set: PBRSet, rx: number, ry: number): PBRSet {
  const c = (t: DataTexture) => {
    const n = t.clone();
    n.repeat.set(rx, ry);
    n.needsUpdate = true;
    return n;
  };
  return { map: c(set.map), normalMap: c(set.normalMap), ormMap: c(set.ormMap) };
}

function hexRGB(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---- Materials ---------------------------------------------------------------

/** Wood with growth rings, fibers and pores. Grain runs along V. `planks` > 0 splits U into boards. */
export function woodSet(
  darkHex: string,
  lightHex: string,
  opts: { seed?: number; planks?: number; rings?: number; rough?: number } = {},
): PBRSet {
  const seed = opts.seed ?? 1;
  const planks = opts.planks ?? 0;
  const rings = opts.rings ?? 7;
  const baseRough = opts.rough ?? 0.5;
  const dk = hexRGB(darkHex);
  const lt = hexRGB(lightHex);
  return buildSet(QUALITY.texSize, 2.2, (u, v0, o) => {
    let v = v0;
    let tint = 0;
    let groove = 0;
    if (planks > 0) {
      const pi = Math.floor(u * planks);
      const f = u * planks - pi;
      tint = ih(pi, 7, seed) - 0.5;
      v += ih(pi, 3, seed);
      groove = 1 - sstep(0, 0.035, Math.min(f, 1 - f));
    }
    const warp = fbm(u * 6, v * 2, 6, 2, 4, seed);
    const ring = 0.5 + 0.5 * Math.sin((u * rings + warp * 2.4 + tint * 9) * Math.PI * 2);
    const fiber = fbm(u * 96, v * 4, 96, 4, 3, seed + 5);
    const pore = Math.pow(fbm(u * 256, v * 10, 256, 10, 2, seed + 9), 3);
    const t = Math.min(1, Math.max(0, ring * 0.5 + fiber * 0.6 - 0.05));
    const shade = (1 + tint * 0.22) * (1 - pore * 0.55) * (1 - groove * 0.6);
    o.r = mix(dk[0], lt[0], t) * shade;
    o.g = mix(dk[1], lt[1], t) * shade;
    o.b = mix(dk[2], lt[2], t) * shade;
    o.h = t * 0.5 + fiber * 0.35 - pore * 0.5 - groove * 1.6;
    o.rough = Math.min(1, baseRough + (1 - t) * 0.16 + pore * 0.3 + groove * 0.3);
  });
}

/** Polished stone tiles with marble veining, bevelled edges and matte grout. */
export function tileSet(tiles = 4, seed = 11): PBRSet {
  return buildSet(QUALITY.texSize, 5.5, (u, v, o) => {
    const tu = u * tiles;
    const tv = v * tiles;
    const ti = Math.floor(tu);
    const tj = Math.floor(tv);
    const fu = tu - ti;
    const fv = tv - tj;
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const mask = sstep(0.012, 0.04, edge);
    const ts = seed + ti * 13 + tj * 57;
    const tone = (ih(ti, tj, seed) - 0.5) * 0.07;
    const wx = fbm(u * 8, v * 8, 8, 8, 3, ts + 3) * 2.5;
    const m = fbm(u * 6 + wx, v * 6 + wx * 0.7, 64, 64, 5, ts);
    const vein = Math.pow(1 - Math.abs(2 * m - 1), 7);
    const speck = fbm(u * 128, v * 128, 128, 128, 2, seed + 1);
    const base = 0.83 + tone + (m - 0.5) * 0.06 - vein * 0.1 + (speck - 0.5) * 0.03;
    const grout = 0.4 + speck * 0.12;
    o.r = mix(grout, base * 0.99, mask);
    o.g = mix(grout, base, mask);
    o.b = mix(grout * 1.02, base * 1.015, mask);
    o.h = mask * (1 - speck * 0.012) + (1 - mask) * speck * 0.1;
    o.rough = mix(0.92, 0.17 + vein * 0.1 + speck * 0.07, mask);
  });
}

/** Brushed / painted sheet metal: fine streaks along U. */
export function brushedMetalSet(seed = 21): PBRSet {
  return buildSet(QUALITY.texSize, 1.2, (u, v, o) => {
    const streak = fbm(u * 3, v * 256, 3, 256, 3, seed);
    const blot = fbm(u * 8, v * 8, 8, 8, 3, seed + 4);
    const c = 0.9 + (streak - 0.5) * 0.12;
    o.r = c;
    o.g = c;
    o.b = c;
    o.h = streak;
    o.rough = 0.22 + streak * 0.14 + blot * 0.08;
    o.metal = 1;
  });
}

/** Deeply ridged tree bark; ridges run along V. */
export function barkSet(seed = 31): PBRSet {
  return buildSet(QUALITY.texSize, 9, (u, v, o) => {
    const warp = fbm(u * 4, v * 3, 4, 3, 3, seed) * 1.6;
    const ridge = 1 - Math.abs(2 * fbm(u * 14 + warp, v * 2.5, 14, 5, 4, seed + 2) - 1);
    const fine = fbm(u * 64, v * 24, 64, 24, 3, seed + 6);
    const t = Math.pow(ridge, 1.6) * 0.75 + fine * 0.25;
    o.r = mix(0.1, 0.42, t);
    o.g = mix(0.07, 0.31, t);
    o.b = mix(0.05, 0.22, t);
    o.h = t;
    o.rough = 0.95 - t * 0.12;
  });
}

/** End grain: concentric growth rings and radial cracks for the stump floor (not tiled). */
export function endGrainSet(seed = 37): PBRSet {
  return buildSet(QUALITY.texSize, 3, (u, v, o) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const r = Math.sqrt(x * x + y * y);
    const a = Math.atan2(y, x);
    const wob = fbm(u * 6, v * 6, 6, 6, 4, seed) * 0.05;
    const ring = 0.5 + 0.5 * Math.sin((r + wob) * 150);
    const crack = Math.pow(1 - Math.abs(2 * vnoise((a / Math.PI) * 9 + 9, r * 3, 18, 64, seed + 3) - 1), 14) * sstep(0.05, 0.3, r);
    const fine = fbm(u * 128, v * 128, 128, 128, 2, seed + 8);
    const t = ring * 0.55 + fine * 0.45;
    const shade = (1 - crack * 0.75) * (1 - r * 0.35);
    o.r = mix(0.5, 0.8, t) * shade;
    o.g = mix(0.33, 0.6, t) * shade;
    o.b = mix(0.17, 0.36, t) * shade;
    o.h = t * 0.5 - crack * 2;
    o.rough = 0.72 + (1 - t) * 0.15;
  });
}

/** Forest floor: grass blades and moss with bare-earth patches. */
export function groundSet(seed = 41): PBRSet {
  return buildSet(QUALITY.texSize, 6, (u, v, o) => {
    const patch = fbm(u * 4, v * 4, 4, 4, 5, seed);
    const dirt = sstep(0.66, 0.82, patch);
    const blades = fbm(u * 96, v * 96, 96, 96, 3, seed + 3);
    const clump = fbm(u * 16, v * 16, 16, 16, 3, seed + 7);
    const g = 0.55 + blades * 0.6 + (clump - 0.5) * 0.5;
    o.r = mix(0.2 * g, 0.26 + blades * 0.1, dirt);
    o.g = mix(0.4 * g, 0.24 + blades * 0.08, dirt);
    o.b = mix(0.1 * g, 0.13 + blades * 0.05, dirt);
    o.h = mix(blades * 0.8 + clump * 0.4, blades * 0.3, dirt);
    o.rough = mix(0.86, 0.97, dirt);
  });
}

/** Weathered granite with lichen-like blotches. */
export function rockSet(seed = 51): PBRSet {
  return buildSet(QUALITY.texSize, 8, (u, v, o) => {
    const big = fbm(u * 4, v * 4, 4, 4, 5, seed);
    const ridge = 1 - Math.abs(2 * fbm(u * 10, v * 10, 10, 10, 4, seed + 2) - 1);
    const grain = fbm(u * 128, v * 128, 128, 128, 2, seed + 5);
    const moss = sstep(0.6, 0.75, fbm(u * 6, v * 6, 6, 6, 4, seed + 9));
    const c = 0.3 + big * 0.3 + (grain - 0.5) * 0.14 - ridge * 0.08;
    o.r = mix(c, 0.2 + grain * 0.1, moss);
    o.g = mix(c * 0.98, 0.31 + grain * 0.12, moss);
    o.b = mix(c * 0.94, 0.12, moss);
    o.h = big * 0.6 + Math.pow(ridge, 2) * 0.35 + grain * 0.12;
    o.rough = 0.8 + grain * 0.15;
  });
}

let detailCache: DataTexture | null = null;
/** Fine "orange peel" micro-normal shared by the moulded-plastic toys. */
export function detailNormal(): DataTexture {
  if (!detailCache) {
    const set = buildSet(Math.min(256, QUALITY.texSize), 1.1, (u, v, o) => {
      o.r = o.g = o.b = 1;
      o.h = fbm(u * 48, v * 48, 48, 48, 3, 77);
      o.rough = 1;
    });
    set.map.dispose();
    set.ormMap.dispose();
    detailCache = set.normalMap;
    detailCache.repeat.set(3, 3);
  }
  return detailCache;
}
