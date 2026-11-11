/**
 * Procedural PBR texture synthesis. Every surface in this game gets its albedo, normal and
 * roughness/metalness maps computed at startup by noise shaders running on the GPU (so they can
 * be 2048px and still generate in milliseconds): no image files. The JS noise below is only used
 * for displacing geometry.
 */
import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  WebGLRenderer,
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


// ---- GPU texture set builder -------------------------------------------------

export interface PBRSet {
  map: DataTexture;
  normalMap: DataTexture;
  /** G = roughness, B = metalness (usable as both roughnessMap and metalnessMap). */
  ormMap: DataTexture;
}

const GLSL_LIB = /* glsl */ `
precision highp float;
precision highp int;
uniform int uMode;
uniform float uTexel;
uniform float uK;
varying vec2 vUv;
uint h3( uvec3 v ) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
float ih( vec2 p, float s ) {
  return float( h3( uvec3( ivec3( int( p.x ) + 32768, int( p.y ) + 32768, int( s ) + 64 ) ) ) ) / 4294967295.0;
}
// Tileable value noise; per = lattice period
float vnoise( vec2 x, vec2 per, float s ) {
  vec2 i = floor( x ), f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  vec2 a = mod( i, per ), b = mod( i + 1.0, per );
  return mix( mix( ih( a, s ), ih( vec2( b.x, a.y ), s ), f.x ), mix( ih( vec2( a.x, b.y ), s ), ih( b, s ), f.x ), f.y );
}
float fbm( vec2 x, vec2 per, int oct, float s ) {
  float a = 0.5, sum = 0.0, n = 0.0;
  for ( int o = 0; o < 9; o++ ) {
    if ( o >= oct ) break;
    sum += a * vnoise( x, per, s + float( o ) * 17.0 );
    n += a; x *= 2.0; per *= 2.0; a *= 0.5;
  }
  return sum / n;
}
// Tileable cellular noise: distance to nearest feature point (0 at the point)
float cells( vec2 x, vec2 per, float s ) {
  vec2 i = floor( x ), f = fract( x );
  float d = 9.0;
  for ( int yy = -1; yy <= 1; yy++ ) for ( int xx = -1; xx <= 1; xx++ ) {
    vec2 g = vec2( float( xx ), float( yy ) );
    vec2 c = mod( i + g, per );
    vec2 o = vec2( ih( c, s ), ih( c, s + 7.0 ) );
    d = min( d, length( g + o - f ) );
  }
  return d;
}
`;
const GLSL_MAIN = /* glsl */ `
void main() {
  vec3 c; float h, r, m;
  surf( vUv, c, h, r, m );
  if ( uMode == 0 ) { gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 ); return; }
  if ( uMode == 1 ) { gl_FragColor = vec4( 1.0, clamp( r, 0.0, 1.0 ), clamp( m, 0.0, 1.0 ), 1.0 ); return; }
  vec3 c2; float r2, m2, hx0, hx1, hy0, hy1;
  surf( fract( vUv - vec2( uTexel, 0.0 ) ), c2, hx0, r2, m2 );
  surf( fract( vUv + vec2( uTexel, 0.0 ) ), c2, hx1, r2, m2 );
  surf( fract( vUv - vec2( 0.0, uTexel ) ), c2, hy0, r2, m2 );
  surf( fract( vUv + vec2( 0.0, uTexel ) ), c2, hy1, r2, m2 );
  vec3 n = normalize( vec3( -( hx1 - hx0 ) * uK, -( hy1 - hy0 ) * uK, 1.0 ) );
  gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
}
`;

let gpu: WebGLRenderer | null = null;
let quadScene: Scene | null = null;
let quadCam: OrthographicCamera | null = null;
let quad: Mesh | null = null;

/** Must be called once (with the world's renderer) before any texture set is requested. */
export function setTextureRenderer(r: WebGLRenderer) {
  gpu = r;
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

type Uniforms = Record<string, { value: unknown }>;

/**
 * Renders a surface shader into albedo / ORM / normal textures.
 * `surfBody` is GLSL defining: void surf(vec2 uv, out vec3 c, out float h, out float r, out float m)
 */
export function buildSet(
  size: number,
  normalStrength: number,
  surfBody: string,
  uniforms: Uniforms = {},
): PBRSet {
  if (!gpu) throw new Error('setTextureRenderer() was not called');
  if (!quadScene) {
    quadScene = new Scene();
    quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new Mesh(new PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    quadScene.add(quad);
  }
  const mat = new ShaderMaterial({
    uniforms: {
      uMode: { value: 0 },
      uTexel: { value: 1 / size },
      uK: { value: (normalStrength * size) / 512 },
      ...uniforms,
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: GLSL_LIB + surfBody + GLSL_MAIN,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  quad!.material = mat;
  const rt = new WebGLRenderTarget(size, size, { depthBuffer: false });
  const prevTarget = gpu.getRenderTarget();
  const prevXr = gpu.xr.enabled;
  gpu.xr.enabled = false;
  const pass = (mode: number, srgb: boolean) => {
    mat.uniforms.uMode.value = mode;
    gpu!.setRenderTarget(rt);
    gpu!.render(quadScene!, quadCam!);
    const buf = new Uint8Array(size * size * 4);
    gpu!.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    return finish(buf, size, srgb);
  };
  const set: PBRSet = { map: pass(0, true), ormMap: pass(1, false), normalMap: pass(2, false) };
  gpu.setRenderTarget(prevTarget);
  gpu.xr.enabled = prevXr;
  rt.dispose();
  mat.dispose();
  return set;
}

/** Same pixels, different tiling / rotation (shares the GPU upload source). */
export function retile(set: PBRSet, rx: number, ry: number, rotation = 0): PBRSet {
  const c = (t: DataTexture) => {
    const n = t.clone();
    n.repeat.set(rx, ry);
    n.rotation = rotation;
    n.needsUpdate = true;
    return n;
  };
  return { map: c(set.map), normalMap: c(set.normalMap), ormMap: c(set.ormMap) };
}

const BIG = QUALITY.texSize;
const MID = Math.max(256, QUALITY.texSize / 2);

// ---- Materials ---------------------------------------------------------------

/**
 * Wood with growth rings, medullary fibers, pores and fine scratches. Grain runs along V.
 * `planks` > 0 splits U into boards with their own tint, offset and a bevelled joint.
 */
export function woodSet(
  darkHex: string,
  lightHex: string,
  opts: { seed?: number; planks?: number; rings?: number; rough?: number } = {},
): PBRSet {
  return buildSet(
    BIG,
    2.4,
    /* glsl */ `
uniform vec3 uDark; uniform vec3 uLight; uniform float uSeed, uPlanks, uRings, uRough;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float u = uv.x, v = uv.y, tint = 0.0, groove = 0.0;
  if ( uPlanks > 0.5 ) {
    float pi = floor( u * uPlanks ), f = fract( u * uPlanks );
    tint = ih( vec2( pi, 7.0 ), uSeed ) - 0.5;
    v += ih( vec2( pi, 3.0 ), uSeed );
    groove = 1.0 - smoothstep( 0.0, 0.02, min( f, 1.0 - f ) );
  }
  float warp = fbm( vec2( u * 6.0, v * 2.0 ), vec2( 6.0, 2.0 ), 5, uSeed );
  float ringc = u * uRings + warp * 2.4 + tint * 9.0;
  float ring = 0.5 + 0.5 * sin( ringc * 6.2831853 );
  ring = mix( ring, smoothstep( 0.15, 0.9, ring ), 0.6 );            // sharper late-wood lines
  float fiber = fbm( vec2( u * 128.0, v * 5.0 ), vec2( 128.0, 5.0 ), 5, uSeed + 5.0 );
  float pore = pow( fbm( vec2( u * 512.0, v * 20.0 ), vec2( 512.0, 20.0 ), 3, uSeed + 9.0 ), 3.0 );
  float fleck = smoothstep( 0.72, 0.8, vnoise( vec2( u * 90.0, v * 400.0 ), vec2( 90.0, 400.0 ), uSeed + 13.0 ) ) * 0.5;
  float knotd = cells( vec2( u * 2.0, v * 1.0 ) + warp * 0.3, vec2( 2.0, 1.0 ), uSeed + 21.0 );
  float knot = smoothstep( 0.09, 0.02, knotd );
  float t = clamp( ring * 0.62 + fiber * 0.42 - 0.03 + fleck * 0.12, 0.0, 1.0 );
  t = mix( t, 0.1 + 0.3 * sin( knotd * 260.0 ), knot );
  float shade = ( 1.0 + tint * 0.22 ) * ( 1.0 - pore * 0.55 ) * ( 1.0 - groove * 0.65 ) * ( 1.0 - knot * 0.35 );
  c = mix( uDark, uLight, t ) * shade;
  h = t * 0.5 + fiber * 0.22 - pore * 0.6 - groove * 1.8 - knot * 0.3;
  r = min( 1.0, uRough + ( 1.0 - t ) * 0.16 + pore * 0.3 + groove * 0.3 );
  m = 0.0;
}`,
    {
      uDark: { value: new Color(darkHex).convertLinearToSRGB() },
      uLight: { value: new Color(lightHex).convertLinearToSRGB() },
      uSeed: { value: opts.seed ?? 1 },
      uPlanks: { value: opts.planks ?? 0 },
      uRings: { value: opts.rings ?? 7 },
      uRough: { value: opts.rough ?? 0.5 },
    },
  );
}

/** Polished stone tiles with marble veining, fossil specks, bevelled edges and matte grout. */
export function tileSet(tiles = 4, seed = 11): PBRSet {
  return buildSet(
    BIG,
    5.5,
    /* glsl */ `
uniform float uTiles, uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  vec2 t = uv * uTiles, ti = floor( t ), f = fract( t );
  float edge = min( min( f.x, 1.0 - f.x ), min( f.y, 1.0 - f.y ) );
  float mask = smoothstep( 0.008, 0.03, edge );
  float ts = uSeed + ti.x * 13.0 + ti.y * 57.0;
  float tone = ( ih( ti, uSeed ) - 0.5 ) * 0.07;
  float wx = fbm( uv * 8.0, vec2( 8.0 ), 4, ts + 3.0 ) * 2.5;
  float mm = fbm( uv * 6.0 + wx * vec2( 1.0, 0.7 ), vec2( 64.0 ), 7, ts );
  float vein = pow( 1.0 - abs( 2.0 * mm - 1.0 ), 9.0 );
  float mm2 = fbm( uv * 14.0 + wx * 0.5, vec2( 64.0 ), 5, ts + 40.0 );
  float hair = pow( 1.0 - abs( 2.0 * mm2 - 1.0 ), 22.0 );
  float speck = fbm( uv * 512.0, vec2( 512.0 ), 3, uSeed + 1.0 );
  float fossil = smoothstep( 0.1, 0.03, cells( uv * 90.0, vec2( 90.0 ), ts + 5.0 ) ) * 0.5;
  float base = 0.84 + tone + ( mm - 0.5 ) * 0.07 - vein * 0.12 - hair * 0.08 + ( speck - 0.5 ) * 0.035 - fossil * 0.05;
  float grout = 0.36 + speck * 0.16;
  c = mix( vec3( grout, grout, grout * 1.02 ), vec3( base * 0.995, base, base * 1.012 ) - vec3( 0.0, 0.01, 0.02 ) * vein, mask );
  h = mask * ( 1.0 - speck * 0.01 - hair * 0.02 ) + ( 1.0 - mask ) * speck * 0.12;
  r = mix( 0.94, 0.15 + vein * 0.1 + hair * 0.1 + speck * 0.06, mask );
  m = 0.0;
}`,
    { uTiles: { value: tiles }, uSeed: { value: seed } },
  );
}

/** Brushed sheet metal: fine streaks along U, faint scratches and smudges. */
export function brushedMetalSet(seed = 21): PBRSet {
  return buildSet(
    MID,
    1.4,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float streak = fbm( vec2( uv.x * 3.0, uv.y * 700.0 ), vec2( 3.0, 700.0 ), 4, uSeed );
  float blot = fbm( uv * 8.0, vec2( 8.0 ), 4, uSeed + 4.0 );
  float scratch = smoothstep( 0.93, 0.97, vnoise( vec2( uv.x * 14.0 + uv.y * 3.0, uv.y * 220.0 ), vec2( 17.0, 220.0 ), uSeed + 8.0 ) );
  float g = 0.9 + ( streak - 0.5 ) * 0.12 + scratch * 0.06;
  c = vec3( g );
  h = streak - scratch * 0.8;
  r = 0.2 + streak * 0.14 + blot * 0.1 + scratch * 0.15;
  m = 1.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** Deeply furrowed tree bark with plates, cracks and lichen. Ridges run along V. */
export function barkSet(seed = 31): PBRSet {
  return buildSet(
    BIG,
    10,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float warp = fbm( vec2( uv.x * 4.0, uv.y * 3.0 ), vec2( 4.0, 3.0 ), 4, uSeed ) * 1.6;
  float ridge = 1.0 - abs( 2.0 * fbm( vec2( uv.x * 14.0 + warp, uv.y * 2.5 ), vec2( 14.0, 5.0 ), 5, uSeed + 2.0 ) - 1.0 );
  float plate = cells( vec2( uv.x * 18.0 + warp, uv.y * 5.0 ), vec2( 18.0, 5.0 ), uSeed + 3.0 );
  float fine = fbm( vec2( uv.x * 160.0, uv.y * 60.0 ), vec2( 160.0, 60.0 ), 4, uSeed + 6.0 );
  float t = clamp( pow( ridge, 1.6 ) * 0.55 + smoothstep( 0.0, 0.6, plate ) * 0.25 + fine * 0.25, 0.0, 1.0 );
  float lichen = smoothstep( 0.62, 0.72, fbm( uv * 7.0, vec2( 7.0 ), 4, uSeed + 11.0 ) ) * smoothstep( 0.4, 0.8, t );
  c = mix( vec3( 0.09, 0.065, 0.045 ), vec3( 0.44, 0.33, 0.24 ), t );
  c = mix( c, vec3( 0.42, 0.48, 0.3 ) * ( 0.7 + fine * 0.6 ), lichen * 0.55 );
  h = t;
  r = 0.96 - t * 0.12;
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** End grain: concentric growth rings and radial checks for the stump floor (not tiled). */
export function endGrainSet(seed = 37): PBRSet {
  return buildSet(
    BIG,
    3,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  vec2 p = uv - 0.5;
  float rad = length( p ), a = atan( p.y, p.x );
  float wob = fbm( uv * 6.0, vec2( 6.0 ), 5, uSeed ) * 0.05;
  float ring = 0.5 + 0.5 * sin( ( rad + wob ) * 420.0 );
  float broad = 0.5 + 0.5 * sin( ( rad + wob ) * 60.0 );
  float crack = pow( 1.0 - abs( 2.0 * vnoise( vec2( a / 3.14159 * 9.0 + 9.0, rad * 3.0 ), vec2( 18.0, 64.0 ), uSeed + 3.0 ) - 1.0 ), 16.0 ) * smoothstep( 0.05, 0.3, rad );
  float fine = fbm( uv * 400.0, vec2( 400.0 ), 3, uSeed + 8.0 );
  float t = ring * 0.4 + broad * 0.2 + fine * 0.4;
  float shade = ( 1.0 - crack * 0.8 ) * ( 1.0 - rad * 0.35 );
  c = mix( vec3( 0.48, 0.31, 0.16 ), vec3( 0.82, 0.62, 0.38 ), t ) * shade;
  h = t * 0.5 - crack * 2.0;
  r = 0.72 + ( 1.0 - t ) * 0.15;
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** Forest floor: grass blades and moss with bare-earth patches, twigs and pebbles. */
export function groundSet(seed = 41): PBRSet {
  return buildSet(
    BIG,
    6,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float patchN = fbm( uv * 4.0, vec2( 4.0 ), 6, uSeed );
  float dirt = smoothstep( 0.66, 0.82, patchN );
  float blades = fbm( vec2( uv.x * 300.0, uv.y * 120.0 ), vec2( 300.0, 120.0 ), 3, uSeed + 3.0 );
  float blades2 = fbm( vec2( uv.x * 110.0, uv.y * 320.0 ), vec2( 110.0, 320.0 ), 3, uSeed + 4.0 );
  float bl = max( blades, blades2 );
  float clump = fbm( uv * 16.0, vec2( 16.0 ), 4, uSeed + 7.0 );
  float pebble = smoothstep( 0.22, 0.1, cells( uv * 60.0, vec2( 60.0 ), uSeed + 9.0 ) ) * dirt;
  float g = 0.5 + bl * 0.7 + ( clump - 0.5 ) * 0.5;
  vec3 grass = vec3( 0.2, 0.4, 0.1 ) * g + vec3( 0.08, 0.05, 0.0 ) * clump;
  vec3 earth = vec3( 0.26, 0.2, 0.13 ) * ( 0.7 + bl * 0.6 );
  c = mix( grass, earth, dirt );
  c = mix( c, vec3( 0.5, 0.48, 0.45 ) * ( 0.7 + clump * 0.5 ), pebble );
  h = mix( bl * 0.8 + clump * 0.4, bl * 0.3, dirt ) + pebble * 0.8;
  r = mix( 0.86, 0.97, dirt );
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** Weathered granite: crystals, cracks and moss. */
export function rockSet(seed = 51): PBRSet {
  return buildSet(
    MID,
    8,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float big = fbm( uv * 4.0, vec2( 4.0 ), 6, uSeed );
  float ridge = 1.0 - abs( 2.0 * fbm( uv * 10.0, vec2( 10.0 ), 5, uSeed + 2.0 ) - 1.0 );
  float crack = pow( ridge, 12.0 );
  float grain = fbm( uv * 256.0, vec2( 256.0 ), 3, uSeed + 5.0 );
  float crystal = smoothstep( 0.2, 0.05, cells( uv * 140.0, vec2( 140.0 ), uSeed + 6.0 ) );
  float moss = smoothstep( 0.6, 0.75, fbm( uv * 6.0, vec2( 6.0 ), 5, uSeed + 9.0 ) );
  float g = 0.3 + big * 0.3 + ( grain - 0.5 ) * 0.14 - crack * 0.2 + crystal * 0.1;
  c = mix( vec3( g, g * 0.98, g * 0.94 ), vec3( 0.2 + grain * 0.1, 0.31 + grain * 0.12, 0.12 ), moss );
  h = big * 0.6 + ridge * ridge * 0.3 - crack * 0.8 + grain * 0.12;
  r = 0.8 + grain * 0.15 - crystal * 0.25;
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** Dense overlapping leaves with veins and dark gaps. */
export function foliageSet(seed = 61): PBRSet {
  return buildSet(
    MID,
    7,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float d = cells( uv * 40.0, vec2( 40.0 ), uSeed );
  float d2 = cells( uv * 40.0 + 0.5, vec2( 40.0 ), uSeed + 5.0 );
  float leaf = max( smoothstep( 0.62, 0.1, d ), smoothstep( 0.55, 0.1, d2 ) * 0.85 );
  float vein = 1.0 - abs( 2.0 * fbm( uv * 220.0, vec2( 220.0 ), 2, uSeed + 3.0 ) - 1.0 );
  float tone = fbm( uv * 10.0, vec2( 10.0 ), 3, uSeed + 8.0 );
  float t = leaf * ( 0.7 + vein * 0.3 );
  c = mix( vec3( 0.015, 0.04, 0.012 ), vec3( 0.2, 0.5, 0.11 ) + vec3( 0.12, 0.08, 0.0 ) * tone, t );
  h = t;
  r = 0.55 + ( 1.0 - t ) * 0.3;
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

/** Pebbled rubber with moulded seams, for the play balls (UV sphere mapping). */
export function rubberSet(seed = 71): PBRSet {
  return buildSet(
    MID,
    6,
    /* glsl */ `
uniform float uSeed;
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  float squash = max( 0.25, sin( uv.y * 3.14159 ) );
  float peb = smoothstep( 0.5, 0.15, cells( vec2( uv.x * 150.0 * squash, uv.y * 75.0 ), vec2( floor( 150.0 * squash ), 75.0 ), uSeed ) );
  float sv = abs( fract( uv.x * 4.0 ) - 0.5 ) / 4.0;
  float seam = max( smoothstep( 0.006, 0.002, abs( uv.y - 0.5 ) ), smoothstep( 0.004, 0.0012, 0.125 - sv ) );
  c = vec3( 1.0 - seam * 0.55 ) * ( 0.93 + peb * 0.07 );
  h = peb * 0.6 * ( 1.0 - seam ) - seam * 1.5;
  r = 0.75 + seam * 0.2 - peb * 0.1;
  m = 0.0;
}`,
    { uSeed: { value: seed } },
  );
}

let detailCache: DataTexture | null = null;
/** Fine "orange peel" micro-normal shared by the moulded-plastic toys. */
export function detailNormal(): DataTexture {
  if (!detailCache) {
    const set = buildSet(
      Math.min(1024, MID),
      1.1,
      /* glsl */ `
void surf( vec2 uv, out vec3 c, out float h, out float r, out float m ) {
  c = vec3( 1.0 ); r = 1.0; m = 0.0;
  h = fbm( uv * 96.0, vec2( 96.0 ), 4, 77.0 );
}`,
    );
    set.map.dispose();
    set.ormMap.dispose();
    detailCache = set.normalMap;
    detailCache.repeat.set(3, 3);
  }
  return detailCache;
}
