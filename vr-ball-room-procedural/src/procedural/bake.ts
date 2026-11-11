/**
 * GPU light bake. Static scenery is described as axis-aligned boxes; every vertex of that scenery
 * gets its incoming light computed by ray tracing on the GPU at load time:
 *
 *   - sky light entering through windows and skylights (soft, directional)
 *   - light from emissive boxes (lamp panels, LED strips) as true area lights
 *   - one bounce of sunlight off whatever the sun hits (the warm glow next to a sun patch)
 *   - ambient occlusion, as a by-product: creases and gaps simply receive fewer rays
 *
 * The result accumulates over a few dozen frames into a float texture that the materials read
 * per vertex, replacing the flat ambient term. Direct sun stays real-time (shadow mapped).
 *
 * Usage (see showcase.ts):
 *   const bake = new LightBake();
 *   const b = bake.builder();
 *   b.box(material, [x0, y0, z0], [x1, y1, z1], { albedo: [r, g, b] });
 *   group.add(...b.meshes());
 *   // each frame until bake.done:  bake.update(renderer)
 */
import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  Material,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from '@iwsdk/core';
import { boxCompile } from './env.js';
import { QUALITY } from './quality.js';

type V3 = [number, number, number];

export interface BoxOpts {
  /** Diffuse reflectance used for bounced light (roughly the material's average colour). */
  albedo?: V3;
  /** Emitted radiance, for lamps and LED strips. */
  emissive?: V3;
  /** Metres of surface per texture repeat, [u, v]. */
  uv?: [number, number];
  /** Skip tracing rays against this box (it still receives light). */
  noOcclude?: boolean;
  /** Vertex spacing override in metres. */
  spacing?: number;
  /** Rotate the texture a quarter turn on every face (run the grain the other way). */
  turn?: boolean;
}

const BAKE_FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uPos;
uniform sampler2D uNrm;
uniform sampler2D uBox;
uniform sampler2D uPrev;
uniform int uBoxN;
uniform float uFrame;
uniform float uEmScale;
uniform vec3 uSunDir;
uniform vec3 uSunE;
uniform vec3 uSkyZ;
uniform vec3 uSkyH;
uniform vec3 uGround;
uniform vec3 uAmb;
uniform int uEmN;
uniform int uEmId[24];
const float PI = 3.14159265;

float rnd( inout uint s ) {
  s = s * 747796405u + 2891336453u;
  uint w = ( ( s >> ( ( s >> 28u ) + 4u ) ) ^ s ) * 277803737u;
  w = ( w >> 22u ) ^ w;
  return float( w ) / 4294967295.0;
}

// Nearest box hit. Rays that start inside a box pass out of it, which keeps vertices that sit
// against a neighbouring box from going black.
bool trace( vec3 ro, vec3 rd, out float t, out int id, out vec3 n ) {
  vec3 inv = 1.0 / rd;
  t = 1e9;
  id = -1;
  n = vec3( 0.0 );
  for ( int i = 0; i < uBoxN; i++ ) {
    vec3 mn = texelFetch( uBox, ivec2( 0, i ), 0 ).xyz;
    vec3 mx = texelFetch( uBox, ivec2( 1, i ), 0 ).xyz;
    vec3 t0 = ( mn - ro ) * inv, t1 = ( mx - ro ) * inv;
    vec3 a = min( t0, t1 ), b = max( t0, t1 );
    float tn = max( max( a.x, a.y ), a.z ), tf = min( min( b.x, b.y ), b.z );
    if ( tn < tf && tn > 1e-4 && tn < t ) {
      t = tn;
      id = i;
      n = -sign( rd ) * step( a.yzx, a.xyz ) * step( a.zxy, a.xyz );
    }
  }
  return id >= 0;
}

bool occluded( vec3 ro, vec3 rd ) {
  vec3 inv = 1.0 / rd;
  for ( int i = 0; i < uBoxN; i++ ) {
    vec3 mn = texelFetch( uBox, ivec2( 0, i ), 0 ).xyz;
    vec3 mx = texelFetch( uBox, ivec2( 1, i ), 0 ).xyz;
    vec3 t0 = ( mn - ro ) * inv, t1 = ( mx - ro ) * inv;
    vec3 a = min( t0, t1 ), b = max( t0, t1 );
    float tn = max( max( a.x, a.y ), a.z ), tf = min( min( b.x, b.y ), b.z );
    if ( tn < tf && tn > 1e-4 ) return true;
  }
  return false;
}

// Any-hit test up to tmax, ignoring one box (the lamp being sampled)
bool blocked( vec3 ro, vec3 rd, float tmax, int skip ) {
  vec3 inv = 1.0 / rd;
  for ( int i = 0; i < uBoxN; i++ ) {
    if ( i == skip ) continue;
    vec3 mn = texelFetch( uBox, ivec2( 0, i ), 0 ).xyz;
    vec3 mx = texelFetch( uBox, ivec2( 1, i ), 0 ).xyz;
    vec3 t0 = ( mn - ro ) * inv, t1 = ( mx - ro ) * inv;
    vec3 a = min( t0, t1 ), b = max( t0, t1 );
    float tn = max( max( a.x, a.y ), a.z ), tf = min( min( b.x, b.y ), b.z );
    if ( tn < tf && tn > 1e-4 && tn < tmax ) return true;
  }
  return false;
}

vec3 sky( vec3 d ) {
  if ( d.y < 0.0 ) return uGround;
  return mix( uSkyH, uSkyZ, pow( d.y, 0.45 ) );
}

void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  vec4 nn = texelFetch( uNrm, px, 0 );
  if ( nn.w < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; }
  vec3 p = texelFetch( uPos, px, 0 ).xyz;
  vec3 n = nn.xyz;
  vec3 up = abs( n.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
  vec3 tx = normalize( cross( up, n ) );
  vec3 bx = cross( n, tx );
  // Every vertex uses the same ray directions in a given pass. That trades per-vertex noise
  // (blotchy triangles) for a smooth result that sharpens as passes accumulate.
  uint seed = uint( uFrame ) * 26699u + 1u;
  uint ps = uint( px.x ) * 1973u + uint( px.y ) * 9277u + 7u;
  vec3 lampShift = vec3( rnd( ps ), rnd( ps ), rnd( ps ) );
  vec3 sum = vec3( 0.0 );
  for ( int i = 0; i < RAYS; i++ ) {
    float r1 = rnd( seed ), r2 = rnd( seed );
    float phi = 2.0 * PI * r1, sr = sqrt( r2 );
    vec3 d = normalize( tx * cos( phi ) * sr + bx * sin( phi ) * sr + n * sqrt( 1.0 - r2 ) + 1e-5 );
    float t; int id; vec3 hn;
    if ( trace( p, d, t, id, hn ) ) {
      vec3 alb = texelFetch( uBox, ivec2( 2, id ), 0 ).rgb;
      // Lamps are sampled directly below, so a random ray that happens to hit one adds nothing
      vec3 em = uEmN > 0 ? vec3( 0.0 ) : texelFetch( uBox, ivec2( 3, id ), 0 ).rgb * uEmScale;
      vec3 hp = p + d * t + hn * 0.003;
      vec3 E = uAmb;
      float ndl = dot( hn, uSunDir );
      if ( ndl > 0.0 && !occluded( hp, normalize( uSunDir + 1e-5 ) ) ) E += uSunE * ndl;
      sum += em + alb * E / PI;
    } else {
      sum += sky( d );
    }
    // Direct light from one lamp per ray: aim at a random point on it (far less noisy than
    // waiting for random rays to find small, bright emitters)
    if ( uEmN > 0 ) {
      int j = uEmId[ ( i + int( uFrame ) ) % uEmN ];
      vec3 mn = texelFetch( uBox, ivec2( 0, j ), 0 ).xyz;
      vec3 mx = texelFetch( uBox, ivec2( 1, j ), 0 ).xyz;
      // Shift the shared sample by a per-vertex offset so long strips are covered evenly
      // instead of every vertex aiming at the same few spots (which leaves scallops)
      vec3 q = mix( mn, mx, fract( vec3( rnd( seed ), rnd( seed ), rnd( seed ) ) + lampShift ) );
      vec3 dv = q - p;
      float d2 = dot( dv, dv );
      vec3 dl = dv / sqrt( d2 );
      float cr = dot( n, dl );
      if ( cr > 0.0 ) {
        vec3 sz = mx - mn;
        float thin = min( sz.x, min( sz.y, sz.z ) );
        vec3 en = sz.x == thin ? vec3( 1.0, 0.0, 0.0 ) : ( sz.y == thin ? vec3( 0.0, 1.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) );
        float area = sz.x * sz.y * sz.z / thin;
        float ce = max( abs( dot( en, dl ) ), 0.15 );
        if ( !blocked( p, dl + 1e-5, sqrt( d2 ) - 0.01, j ) ) {
          vec3 em = texelFetch( uBox, ivec2( 3, j ), 0 ).rgb * uEmScale;
          sum += em * area * cr * ce / max( d2, 0.03 ) / PI * float( uEmN );
        }
      }
    }
  }
  vec3 L = sum / float( RAYS );
  vec3 prev = texelFetch( uPrev, px, 0 ).rgb;
  gl_FragColor = vec4( mix( prev, L, 1.0 / ( uFrame + 1.0 ) ), 1.0 );
}
`;

/** Collects boxes, grouped by material, and turns them into one bake-ready mesh per material. */
export class BakeBuilder {
  private groups = new Map<Material, { pos: number[]; nrm: number[]; uv: number[]; id: number[]; idx: number[] }>();
  constructor(private bake: LightBake) {}

  box(material: Material, min: V3, max: V3, opts: BoxOpts = {}) {
    if (!opts.noOcclude) this.bake.addOccluder(min, max, opts.albedo ?? [0.6, 0.6, 0.6], opts.emissive ?? [0, 0, 0]);
    let g = this.groups.get(material);
    if (!g) {
      g = { pos: [], nrm: [], uv: [], id: [], idx: [] };
      this.groups.set(material, g);
      this.bake.patch(material);
    }
    const sp = opts.spacing ?? this.bake.spacing;
    const [su, sv] = opts.uv ?? [1, 1];
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    // Six faces: axis k is the normal, (a, b) span the face
    for (let k = 0; k < 3; k++) {
      // Texture axes: horizontal faces use (x, z); vertical faces use (horizontal, y)
      const a = k === 1 ? 0 : k === 0 ? 2 : 0;
      const b = k === 1 ? 2 : 1;
      const na = Math.max(1, Math.min(140, Math.ceil(size[a] / sp)));
      const nb = Math.max(1, Math.min(140, Math.ceil(size[b] / sp)));
      for (const side of [0, 1]) {
        const base = g.pos.length / 3;
        const n = [0, 0, 0];
        n[k] = side ? 1 : -1;
        for (let j = 0; j <= nb; j++) {
          for (let i = 0; i <= na; i++) {
            const p = [0, 0, 0];
            p[k] = side ? max[k] : min[k];
            p[a] = min[a] + (size[a] * i) / na;
            p[b] = min[b] + (size[b] * j) / nb;
            g.pos.push(p[0], p[1], p[2]);
            g.nrm.push(n[0], n[1], n[2]);
            if (opts.turn) g.uv.push(p[b] / su, p[a] / sv);
            else g.uv.push(p[a] / su, p[b] / sv);
            // Sample point: nudged off the surface and in from the edges of the face
            const s = [p[0] + n[0] * 0.004, p[1] + n[1] * 0.004, p[2] + n[2] * 0.004];
            const ea = Math.min(0.02, size[a] * 0.25);
            const eb = Math.min(0.02, size[b] * 0.25);
            if (i === 0) s[a] += ea;
            if (i === na) s[a] -= ea;
            if (j === 0) s[b] += eb;
            if (j === nb) s[b] -= eb;
            g.id.push(this.bake.addSample(s as V3, n as V3));
          }
        }
        // e_a x e_b points along +k only for k = z (x cross y); for the other two it points along -k
        const natural = k === 2 ? 1 : 0;
        for (let j = 0; j < nb; j++) {
          for (let i = 0; i < na; i++) {
            const v0 = base + j * (na + 1) + i;
            const v1 = v0 + 1;
            const v2 = v0 + na + 1;
            const v3 = v2 + 1;
            if (side === natural) g.idx.push(v0, v1, v2, v1, v3, v2);
            else g.idx.push(v0, v2, v1, v1, v2, v3);
          }
        }
      }
    }
  }

  meshes(): Mesh[] {
    const out: Mesh[] = [];
    for (const [material, g] of this.groups) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new Float32BufferAttribute(g.nrm, 3));
      geo.setAttribute('uv', new Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('bakeId', new Float32BufferAttribute(g.id, 1));
      geo.setIndex(g.idx);
      const mesh = new Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

export class LightBake {
  /** Vertex spacing of baked surfaces, in metres. */
  spacing = QUALITY.high ? 0.07 : 0.16;
  frames = QUALITY.high ? 72 : 28;
  done = false;
  /** Sky / sun inputs; change them and call restart() to re-bake (e.g. day -> night). */
  sunDir = new Vector3(0, 1, 0);
  sunE = new Vector3(3, 2.8, 2.5);
  skyZenith = new Vector3(0.25, 0.5, 1.2);
  skyHorizon = new Vector3(1.0, 1.25, 1.6);
  ground = new Vector3(0.25, 0.27, 0.25);
  ambient = new Vector3(0.45, 0.43, 0.4);
  emissiveScale = 1;

  private occ: number[] = [];
  private sPos: number[] = [];
  private sNrm: number[] = [];
  private uniforms = { uBake: { value: null as Texture | null }, uBakeW: { value: 1024 }, uBakeGain: { value: 1 } };

  /** Exposure applied to the baked (indirect) light. */
  set gain(v: number) {
    this.uniforms.uBakeGain.value = v;
  }
  private rt: WebGLRenderTarget[] = [];
  private mat: ShaderMaterial | null = null;
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private frame = 0;
  private w = 1024;
  private h = 1;
  private patched = new WeakSet<Material>();

  builder() {
    return new BakeBuilder(this);
  }

  addOccluder(min: V3, max: V3, albedo: V3, emissive: V3) {
    this.occ.push(...min, 0, ...max, 0, ...albedo, 0, ...emissive, 0);
  }

  addSample(p: V3, n: V3): number {
    this.sPos.push(p[0], p[1], p[2], 1);
    this.sNrm.push(n[0], n[1], n[2], 1);
    return this.sPos.length / 4 - 1;
  }

  get sampleCount() {
    return this.sPos.length / 4;
  }
  get boxCount() {
    return this.occ.length / 16;
  }

  /**
   * Bakes an arbitrary object (any meshes, curved or not): every vertex becomes a sample, so the
   * piece gets the room's soft light and ambient occlusion. Call after the object is positioned
   * and before the first update(). Materials used here must not be shared with unbaked meshes.
   * Instanced meshes and anything with `userData.noBake` (on the mesh or its material) are skipped.
   */
  bakeObject(root: Object3D) {
    root.updateMatrixWorld(true);
    const p = new Vector3();
    const n = new Vector3();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
      const mat = mesh.material as Material;
      if (mesh.userData.noBake || Array.isArray(mat) || mat.userData.noBake) return;
      if (!(mat as unknown as MeshStandardMaterial).isMeshStandardMaterial) return;
      const geo = mesh.geometry;
      if (geo.attributes.bakeId || !geo.attributes.normal) return;
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const ids = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nrm, i).transformDirection(mesh.matrixWorld);
        ids[i] = this.addSample([p.x + n.x * 0.006, p.y + n.y * 0.006, p.z + n.z * 0.006], [n.x, n.y, n.z]);
      }
      geo.setAttribute('bakeId', new Float32BufferAttribute(ids, 1));
      this.patch(mat);
    });
  }

  /** Makes a standard/physical material read its ambient light from the bake. */
  patch<T extends Material>(m: T): T {
    if (this.patched.has(m)) return m;
    this.patched.add(m);
    if (!(m as unknown as MeshStandardMaterial).isMeshStandardMaterial) return m;
    m.userData.noBoxProject = true;
    const u = this.uniforms;
    m.onBeforeCompile = (shader, renderer) => {
      boxCompile(shader, renderer);
      shader.uniforms.uBake = u.uBake;
      shader.uniforms.uBakeW = u.uBakeW;
      shader.uniforms.uBakeGain = u.uBakeGain;
      shader.vertexShader =
        'attribute float bakeId;\nuniform highp sampler2D uBake;\nuniform float uBakeW;\nvarying vec3 vBake;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\tvBake = texelFetch( uBake, ivec2( int( mod( bakeId, uBakeW ) ), int( floor( bakeId / uBakeW ) ) ), 0 ).rgb;',
        );
      shader.fragmentShader =
        'varying vec3 vBake;\nuniform float uBakeGain;\n' +
        shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#if defined( RE_IndirectDiffuse )
	irradiance = vBake * PI * uBakeGain;
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	iblIrradiance = vec3( 0.0 );
	float bakeOcc = clamp( dot( vBake, vec3( 0.5 ) ), 0.04, 1.0 );
	radiance *= bakeOcc;
	#ifdef USE_CLEARCOAT
	clearcoatRadiance *= bakeOcc;
	#endif
#endif
#include <lights_fragment_end>`,
        );
    };
    m.customProgramCacheKey = () => 'lightbake';
    return m;
  }

  private init(renderer: WebGLRenderer) {
    const count = this.sampleCount;
    this.h = Math.max(1, Math.ceil(count / this.w));
    const pad = (src: number[]) => {
      const a = new Float32Array(this.w * this.h * 4);
      a.set(src);
      return a;
    };
    const dataTex = (data: Float32Array, w: number, h: number) => {
      const t = new DataTexture(data, w, h, RGBAFormat, FloatType);
      t.minFilter = t.magFilter = NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    const mk = () => {
      const rt = new WebGLRenderTarget(this.w, this.h, {
        type: HalfFloatType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
      });
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.rt = [mk(), mk()];
    // Boxes that emit light, sampled directly by the bake (largest first, at most 24)
    const emitters: number[] = [];
    for (let i = 0; i < this.boxCount; i++) {
      if (this.occ[i * 16 + 12] + this.occ[i * 16 + 13] + this.occ[i * 16 + 14] > 0 && emitters.length < 24) emitters.push(i);
    }
    this.mat = new ShaderMaterial({
      defines: { RAYS: QUALITY.high ? 6 : 4 },
      uniforms: {
        uPos: { value: dataTex(pad(this.sPos), this.w, this.h) },
        uNrm: { value: dataTex(pad(this.sNrm), this.w, this.h) },
        uBox: { value: dataTex(new Float32Array(this.occ), 4, this.boxCount) },
        uPrev: { value: null },
        uBoxN: { value: this.boxCount },
        uFrame: { value: 0 },
        uEmScale: { value: 1 },
        uSunDir: { value: this.sunDir },
        uSunE: { value: this.sunE },
        uSkyZ: { value: this.skyZenith },
        uSkyH: { value: this.skyHorizon },
        uGround: { value: this.ground },
        uAmb: { value: this.ambient },
        uEmN: { value: emitters.length },
        uEmId: { value: emitters.concat(new Array(24 - emitters.length).fill(0)) },
      },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.uniforms.uBakeW.value = this.w;
    this.uniforms.uBake.value = this.rt[0].texture;
    // Start from black so the first blend is well defined
    const prev = renderer.getRenderTarget();
    for (const rt of this.rt) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
    renderer.setRenderTarget(prev);
    // The CPU copies are no longer needed
    this.sPos = [];
    this.sNrm = [];
  }

  /** Re-runs the bake with the current sky / sun / emissive settings. */
  restart() {
    this.frame = 0;
    this.done = false;
  }

  /** Call once per frame; does one accumulation pass until the bake has converged. */
  update(renderer: WebGLRenderer): boolean {
    if (this.done) return false;
    if (!this.mat) {
      if (this.sampleCount === 0) return false;
      this.init(renderer);
    }
    const mat = this.mat!;
    const src = this.rt[this.frame % 2];
    const dst = this.rt[(this.frame + 1) % 2];
    mat.uniforms.uPrev.value = src.texture;
    mat.uniforms.uFrame.value = this.frame;
    mat.uniforms.uEmScale.value = this.emissiveScale;
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(dst);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    this.uniforms.uBake.value = dst.texture;
    this.frame++;
    if (this.frame >= this.frames) this.done = true;
    return true;
  }
}
