// Procedural textures: every surface texture in the world is painted here at load time
// (colour + matching normal and roughness maps), so the game ships with no image files.
import * as THREE from 'three';

export let MAX_ANISO = 4;
export function setMaxAniso(a) { MAX_ANISO = a; }

// ---------- noise ----------
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rng = mulberry(1337);

// Tileable value-noise field: returns f(u,v) in [0,1], u,v in texture space [0,1)
function makeNoise(seed, period) {
  const r = mulberry(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = u * period, y = v * period;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i0 = ((x0 % period) + period) % period, j0 = ((y0 % period) + period) % period;
    const i1 = (i0 + 1) % period, j1 = (j0 + 1) % period;
    const a = g[j0 * period + i0], b = g[j0 * period + i1], c = g[j1 * period + i0], d = g[j1 * period + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(seed, base, oct = 5) {
  const ns = []; for (let o = 0; o < oct; o++) ns.push(makeNoise(seed + o * 17, base << o));
  return (u, v) => { let s = 0, a = 0.5, t = 0; for (const n of ns) { s += n(u, v) * a; t += a; a *= 0.5; } return s / t; };
}

// ---------- canvas helpers ----------
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Paint a field: fn(u, v) -> [r,g,b,height,rough] (0-255 for colour, 0-1 height/rough)
function field(w, h, fn) {
  const col = canvas(w, h), cx = col.getContext('2d'), img = cx.createImageData(w, h);
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = fn(x / w, y / h, x, y);
    const i = y * w + x;
    img.data[i*4] = o[0]; img.data[i*4+1] = o[1]; img.data[i*4+2] = o[2]; img.data[i*4+3] = 255;
    H[i] = o[3] ?? 0.5; R[i] = o[4] ?? 0.8;
  }
  cx.putImageData(img, 0, 0);
  return { col, H, R, w, h };
}

function normalFromHeight(H, w, h, strength = 2) {
  const c = canvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = H[y * w + (x - 1 + w) % w], r = H[y * w + (x + 1) % w];
    const u = H[((y - 1 + h) % h) * w + x], d = H[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i+1] = (ny * 0.5 + 0.5) * 255; img.data[i+2] = (nz * 0.5 + 0.5) * 255; img.data[i+3] = 255;
  }
  cx.putImageData(img, 0, 0); return c;
}
function roughCanvas(R, w, h) {
  const c = canvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, R[i] * 255)); img.data[i*4] = 0; img.data[i*4+1] = v; img.data[i*4+2] = 0; img.data[i*4+3] = 255; }
  cx.putImageData(img, 0, 0); return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// Build a material set from a field.
function pbr(f, { normal = 2, rough = true, ...opts } = {}) {
  const set = { map: tex(f.col), normalMap: tex(normalFromHeight(f.H, f.w, f.h, normal), false) };
  if (rough) set.roughnessMap = tex(roughCanvas(f.R, f.w, f.h), false);
  return set;
}
const clamp = (v, a = 0, b = 255) => v < a ? a : v > b ? b : v;
const mix = (a, b, t) => a + (b - a) * t;

// Material factory with repeat helper
export function mat(set, { repeat = [1, 1], ...params } = {}) {
  const m = new THREE.MeshStandardMaterial({ ...set, ...params });
  for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(repeat[0], repeat[1]); m[k].needsUpdate = true; }
  if (set.roughnessMap && params.roughness === undefined) m.roughness = 1;
  return m;
}

// ---------- surfaces ----------
const cache = {};
const memo = (k, f) => cache[k] || (cache[k] = f());

// Garage concrete floor: trowelled slab with oil stains and a saw-cut joint. One texture = 3m.
export const concrete = () => memo('concrete', () => {
  const n = fbm(11, 6, 6), n2 = fbm(91, 24, 3), stain = fbm(5, 3, 4);
  const f = field(1024, 1024, (u, v) => {
    let h = n(u, v) * 0.6 + n2(u, v) * 0.4;
    let c = 150 + (h - 0.5) * 60;
    const s = Math.max(0, stain(u, v) - 0.58) * 3.2;
    c *= 1 - Math.min(0.3, s * 0.6);
    const joint = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.0025;
    if (joint) { c *= 0.45; h = 0; }
    const speck = n2(u * 3 % 1, v * 3 % 1) > 0.8 ? -14 : 0;
    return [clamp(c + speck), clamp(c * 0.98 + speck), clamp(c * 0.94 + speck), h, 0.62 + (h - 0.5) * 0.3 - s * 0.35];
  });
  return pbr(f, { normal: 3 });
});

// Black & white checkered tile, 4x4 tiles (30cm) per texture.
export const checker = () => memo('checker', () => {
  const n = fbm(21, 8, 5), g = fbm(77, 32, 3);
  const N = 4;
  const f = field(1024, 1024, (u, v) => {
    const tx = Math.floor(u * N), ty = Math.floor(v * N);
    const fu = u * N - tx, fv = v * N - ty;
    const edge = Math.min(fu, fv, 1 - fu, 1 - fv);
    const black = (tx + ty) % 2 === 0;
    const grime = n(u, v);
    let c = black ? 22 + grime * 18 : 222 - grime * 50;
    let h = 0.8 + (g(u, v) - 0.5) * 0.04;
    let r = black ? 0.18 : 0.22;
    r += (grime - 0.5) * 0.25;
    if (edge < 0.012) { c = 95 - grime * 30; h = 0.2; r = 0.9; }
    else if (edge < 0.025) { h = 0.2 + (edge - 0.012) / 0.013 * 0.6; }
    return [clamp(c), clamp(c * 0.99), clamp(c * 0.96), h, r];
  });
  return pbr(f, { normal: 4 });
});

// Pizzeria wall: checker band along the bottom, then painted plaster with grime. Maps 0..1 v = 0..3.4 m.
export const pizzaWall = () => memo('pizzaWall', () => {
  const n = fbm(31, 6, 5), fine = fbm(41, 64, 2);
  const W = 1024, Hh = 1024;
  const f = field(W, Hh, (u, v) => {
    const y = (1 - v) * 3.4; // metres from floor
    const nn = n(u, v);
    let c, h = 0.5 + (fine(u, v) - 0.5) * 0.1, r = 0.85;
    if (y < 1.05 && y > 0.12) {
      const ts = 0.155; const tx = Math.floor(u * 2.5 / ts), ty = Math.floor((y - 0.12) / ts);
      const black = (tx + ty) % 2 === 0;
      const fu = (u * 2.5 / ts) % 1, fv = ((y - 0.12) / ts) % 1;
      const e = Math.min(fu, fv, 1 - fu, 1 - fv);
      const v0 = black ? 25 : 215 - nn * 40;
      c = [v0, v0, v0]; r = 0.25; h = 0.8;
      if (e < 0.04) { c = [120, 118, 112]; h = 0.3; r = 0.9; }
    } else if (y <= 0.12) { c = [38, 34, 32]; h = 0.6; r = 0.5; }
    else if (y < 1.12) { c = [150, 30, 30]; h = 0.75; r = 0.4; } // red trim strip
    else {
      const grime = Math.max(0, 1 - (y - 1.1) / 0.8) * 0.25 + (nn - 0.5) * 0.25;
      c = [182 * (1 - grime), 168 * (1 - grime), 150 * (1 - grime)];
    }
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), h, r];
  });
  return pbr(f, { normal: 2 });
});

// Painted drywall with subtle orange-peel texture, used in the garage. 1 tex = 2.5m, 0..1 v = height 3m.
export const drywall = () => memo('drywall', () => {
  const n = fbm(51, 64, 3), big = fbm(52, 4, 4);
  const f = field(512, 512, (u, v) => {
    const y = (1 - v) * 3;
    const peel = n(u, v);
    const dirt = Math.max(0, 0.5 - y) * 0.4 + (big(u, v) - 0.5) * 0.12;
    const c = 205 * (1 - dirt);
    const seam = Math.abs(u - 0.5) < 0.002 ? 0.35 : 0;
    return [clamp(c), clamp(c * 0.97), clamp(c * 0.9), peel * 0.5 + 0.25 - seam, 0.9];
  });
  return pbr(f, { normal: 1.2 });
});

// Brick. One texture = 1.6m wide x 0.8m tall (8 courses).
export const brick = (tint = [150, 62, 45]) => memo('brick' + tint, () => {
  const n = fbm(61, 8, 5), m = fbm(62, 64, 2), per = fbm(63, 4, 3);
  const rows = 12, cols = 4;
  const f = field(1024, 1024, (u, v) => {
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const bu = (u * cols + off) % cols; const col = Math.floor(bu);
    const fu = bu - col, fv = v * rows - row;
    const mortar = fu < 0.035 || fv < 0.09;
    const bv = per((col + 0.5) / cols * 0.37 + row * 0.11 % 1, (row + 0.5) / rows);
    const nn = n(u, v);
    if (mortar) { const c = 150 + m(u, v) * 30; return [c, c * 0.96, c * 0.9, 0.2 + m(u, v) * 0.1, 0.95]; }
    const k = 0.75 + bv * 0.45 + (nn - 0.5) * 0.3;
    const edge = Math.min(fu, 1 - fu, (fv - 0.09) * 4, (1 - fv) * 4);
    return [clamp(tint[0] * k), clamp(tint[1] * k), clamp(tint[2] * k), 0.75 + nn * 0.2 - Math.max(0, 0.06 - edge) * 3, 0.85];
  });
  return pbr(f, { normal: 3 });
});

// Wood planks: vertical boards, 1 tex = 1.2m.
export const planks = (base = [120, 78, 44], name = 'planks') => memo(name, () => {
  const grain = fbm(71, 4, 5), fine = fbm(72, 64, 3), knot = fbm(73, 8, 3);
  const boards = 8;
  const f = field(1024, 1024, (u, v) => {
    const b = Math.floor(u * boards); const fu = u * boards - b;
    const shift = (b * 0.37) % 1;
    const g = grain((u * 0.3 + b * 0.13) % 1, (v * 1 + shift) % 1);
    const stripes = Math.sin((g * 18 + u * boards * 2) * Math.PI) * 0.5 + 0.5;
    const tone = 0.78 + ((b * 7919) % 13) / 13 * 0.35;
    const k = tone * (0.75 + stripes * 0.2 + fine(u, v) * 0.15) * (knot(u, v) > 0.78 ? 0.6 : 1);
    const gap = fu < 0.02 || fu > 0.98;
    const endJoint = Math.abs(((v + shift) % 0.5)) < 0.004;
    if (gap || endJoint) return [30, 20, 12, 0.05, 0.9];
    return [clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k), 0.6 + stripes * 0.15 + fine(u, v) * 0.1, 0.55 + stripes * 0.2];
  });
  return pbr(f, { normal: 2.5 });
});

// Asphalt road: 1 tex = 4m
export const asphalt = () => memo('asphalt', () => {
  const n = fbm(81, 16, 4), big = fbm(82, 3, 4), crack = fbm(83, 6, 5);
  const f = field(1024, 1024, (u, v) => {
    const a = n(u, v), b = big(u, v);
    const agg = n((u * 7) % 1, (v * 7) % 1);
    let c = 52 + a * 30 + (b - 0.5) * 25 + (agg > 0.7 ? 25 : 0);
    let h = a * 0.5 + agg * 0.5;
    const cr = Math.abs(crack(u, v) - 0.5) < 0.006;
    if (cr) { c = 20; h = 0; }
    return [clamp(c), clamp(c), clamp(c * 1.02), h, 0.75 + (agg - 0.5) * 0.3];
  });
  return pbr(f, { normal: 3 });
});

// Sidewalk slabs: 1 tex = 1.5m square slab
export const sidewalk = () => memo('sidewalk', () => {
  const n = fbm(91, 8, 5), f2 = fbm(92, 48, 2);
  const f = field(512, 512, (u, v) => {
    const e = Math.min(u, v, 1 - u, 1 - v);
    let c = 168 + (n(u, v) - 0.5) * 50 + (f2(u, v) - 0.5) * 20; let h = 0.6 + f2(u, v) * 0.2;
    if (e < 0.008) { c = 80; h = 0; }
    return [clamp(c), clamp(c * 0.98), clamp(c * 0.94), h, 0.85];
  });
  return pbr(f, { normal: 3 });
});

// Lawn: 1 tex = 3m
export const grass = () => memo('grass', () => {
  const n = fbm(101, 8, 4), blades = fbm(102, 128, 2), patch = fbm(103, 3, 3);
  const f = field(1024, 1024, (u, v) => {
    const b = blades(u, v), p = patch(u, v);
    const k = 0.5 + b * 0.6;
    const dry = Math.max(0, p - 0.55) * 2;
    return [clamp(mix(40, 95, dry) * k), clamp(mix(78, 85, dry) * k), clamp(mix(30, 40, dry) * k), b, 0.95];
  });
  return pbr(f, { normal: 2 });
});

// Drop ceiling tiles: 1 tex = 1.2 m (2x2 tiles)
export const ceilingTile = () => memo('ceilingTile', () => {
  const n = fbm(111, 64, 3), stain = fbm(112, 3, 4);
  const f = field(512, 512, (u, v) => {
    const fu = (u * 2) % 1, fv = (v * 2) % 1;
    const e = Math.min(fu, fv, 1 - fu, 1 - fv);
    if (e < 0.02) return [200, 200, 196, 0.9, 0.4];
    const pit = n(u, v) > 0.72 ? 0.15 : 0;
    const s = Math.max(0, stain(u, v) - 0.62) * 2;
    const c = 214 - pit * 90;
    return [clamp(c - s * 60), clamp(c - s * 75), clamp(c - 10 - s * 110), 0.5 - pit, 0.95];
  });
  return pbr(f, { normal: 2 });
});

// Pegboard: 1 tex = 1.2m
export const pegboard = () => memo('pegboard', () => {
  const n = fbm(121, 16, 3);
  const f = field(512, 512, (u, v) => {
    const g = 24; const fu = (u * g) % 1 - 0.5, fv = (v * g) % 1 - 0.5;
    const hole = fu * fu + fv * fv < 0.03;
    const c = 150 + n(u, v) * 30;
    if (hole) return [25, 20, 15, 0, 1];
    return [clamp(c), clamp(c * 0.82), clamp(c * 0.6), 0.7, 0.8];
  });
  return pbr(f, { normal: 3 });
});

// Vinyl siding for the house: horizontal laps, 1 tex = 1.2m tall
export const siding = () => memo('siding', () => {
  const n = fbm(131, 32, 3);
  const laps = 6;
  const f = field(256, 512, (u, v) => {
    const fv = (v * laps) % 1;
    const c = 196 + n(u, v) * 18 - fv * 25;
    return [clamp(c * 0.86), clamp(c * 0.9), clamp(c * 0.92), fv, 0.6];
  });
  return pbr(f, { normal: 5 });
});

// Roof shingles: 1 tex = 2m
export const shingles = () => memo('shingles', () => {
  const n = fbm(141, 32, 3), t = fbm(142, 16, 2);
  const rows = 10;
  const f = field(512, 512, (u, v) => {
    const row = Math.floor(v * rows); const off = (row % 2) * 0.5 / 5;
    const fu = ((u + off) * 5) % 1; const fv = (v * rows) % 1;
    const tab = Math.floor((u + off) * 5);
    const k = 0.7 + ((tab * 31 + row * 17) % 7) / 7 * 0.3 + (n(u, v) - 0.5) * 0.4;
    if (fu < 0.02 || fv > 0.95) return [20, 20, 22, 0, 1];
    return [clamp(58 * k), clamp(56 * k), clamp(60 * k), 1 - fv * 0.5, 0.95];
  });
  return pbr(f, { normal: 4 });
});

// Velvet curtain fabric (vertical colour variation); folds come from the geometry.
export const velvet = (rgb, name) => memo('velvet' + name, () => {
  const n = fbm(151, 64, 3), big = fbm(152, 4, 3);
  const f = field(256, 512, (u, v) => {
    const k = 0.7 + n(u, v) * 0.35 + (big(u, v) - 0.5) * 0.3;
    return [clamp(rgb[0] * k), clamp(rgb[1] * k), clamp(rgb[2] * k), n(u, v), 0.95];
  });
  return pbr(f, { normal: 1 });
});

// Brushed metal
export const brushed = () => memo('brushed', () => {
  const n = fbm(161, 4, 3), s = makeNoise(162, 256);
  const f = field(512, 512, (u, v) => {
    const st = s(u * 0.02, v);
    const c = 150 + st * 50 + (n(u, v) - 0.5) * 30;
    return [clamp(c), clamp(c), clamp(c * 1.02), st, 0.3 + st * 0.25];
  });
  return pbr(f, { normal: 0.6 });
});

// Painted steel with chips & scratches
export const paintedMetal = (rgb, name) => memo('pm' + name, () => {
  const n = fbm(171, 16, 4), chip = fbm(172, 24, 3);
  const f = field(512, 512, (u, v) => {
    const ch = chip(u, v) > 0.74;
    if (ch) return [110, 110, 112, 0.3, 0.4];
    const k = 0.9 + (n(u, v) - 0.5) * 0.2;
    return [clamp(rgb[0] * k), clamp(rgb[1] * k), clamp(rgb[2] * k), 0.6, 0.35 + n(u, v) * 0.2];
  });
  return pbr(f, { normal: 1.5 });
});

// Starry stage backdrop: dark purple/blue with painted stars
export const starBackdrop = () => memo('stars', () => {
  const c = canvas(1024, 512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0d0820'); g.addColorStop(1, '#1d1240');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  const r = mulberry(7);
  const star = (cx, cy, R, col) => {
    x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? R * 0.45 : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fillStyle = col; x.fill();
  };
  for (let i = 0; i < 70; i++) star(r() * 1024, r() * 512, 6 + r() * 18, ['#f5e9a8', '#e8d070', '#ffffff', '#c9b6ff'][Math.floor(r() * 4)]);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.5})`; x.fillRect(r() * 1024, r() * 512, 1.5, 1.5); }
  const t = tex(c); return { map: t, emissiveMap: t };
});

// Pirate cove curtain: purple with silver stars
export const coveCurtain = () => memo('cove', () => {
  const c = canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#3c1f5c'; x.fillRect(0, 0, 512, 512);
  const r = mulberry(9);
  for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.15})`; x.fillRect(r() * 512, 0, 2 + r() * 10, 512); }
  for (let i = 0; i < 40; i++) {
    const cx = r() * 512, cy = r() * 512, R = 8 + r() * 10;
    x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const rr = k % 2 ? R * 0.45 : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fillStyle = '#d8d8e8'; x.fill();
  }
  return { map: tex(c) };
});

// ---------- painted signs, posters and screens ----------
export function textCanvas(w, h, draw) { const c = canvas(w, h); draw(c.getContext('2d'), w, h); return c; }
export function canvasTex(c, srgb = true) { const t = tex(c, srgb); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }

// Kid's crayon drawing of an animatronic (original art, drawn with code)
export function kidDrawing(seed, palette) {
  const r = mulberry(seed);
  return textCanvas(256, 200, (x, w, h) => {
    x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, w, h);
    x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
    const wob = (v) => v + (r() - 0.5) * 6;
    const cx = w * (0.35 + r() * 0.3), cy = h * 0.42;
    x.strokeStyle = palette[0]; x.fillStyle = palette[1];
    // body
    x.beginPath(); x.ellipse(wob(cx), wob(cy + 55), 34, 44, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    // head
    x.beginPath(); x.arc(wob(cx), wob(cy), 30, 0, Math.PI * 2); x.fill(); x.stroke();
    // ears
    x.beginPath(); x.arc(wob(cx - 24), wob(cy - 26), 10, 0, Math.PI * 2); x.arc(wob(cx + 24), wob(cy - 26), 10, 0, Math.PI * 2); x.fill(); x.stroke();
    // face
    x.fillStyle = '#111'; x.beginPath(); x.arc(cx - 10, cy - 4, 4, 0, 7); x.arc(cx + 10, cy - 4, 4, 0, 7); x.fill();
    x.beginPath(); x.arc(cx, cy + 8, 12, 0.2, Math.PI - 0.2); x.stroke();
    // arms/legs
    x.beginPath(); x.moveTo(cx - 30, cy + 45); x.lineTo(wob(cx - 60), wob(cy + 70)); x.moveTo(cx + 30, cy + 45); x.lineTo(wob(cx + 60), wob(cy + 30));
    x.moveTo(cx - 15, cy + 95); x.lineTo(wob(cx - 20), h - 10); x.moveTo(cx + 15, cy + 95); x.lineTo(wob(cx + 20), h - 10); x.stroke();
    // sun & kid
    x.strokeStyle = '#f2b400'; x.beginPath(); x.arc(w - 30, 30, 14, 0, 7); x.stroke();
    x.strokeStyle = '#1d4fd8'; x.beginPath(); const kx = cx > w / 2 ? 40 : w - 50; x.arc(kx, h - 70, 10, 0, 7); x.moveTo(kx, h - 60); x.lineTo(kx, h - 30); x.lineTo(kx - 10, h - 10); x.moveTo(kx, h - 30); x.lineTo(kx + 10, h - 10); x.stroke();
  });
}
