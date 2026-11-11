/**
 * Procedural environment: analytic sky shader (sun, moon, stars, animated clouds), a reflection
 * probe that captures the live scene into a PMREM environment map (box-projected so reflections
 * line up with the room's walls), light shafts and dust in the skylight beams, and lamps.
 * Nothing here loads a file: it is all shaders and generated geometry.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeCamera,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PointLight,
  Points,
  ShaderChunk,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  World,
  createSystem,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';

// ---- Shared state ----------------------------------------------------------------

const ROOM_PROBE_POS = new Vector3(0, 2.35, 0.15);
const SKYLIGHT_Y = 4.12;
/** [x0, x1, z0, z1] of the two ceiling skylights. */
const SKYLIGHTS: Array<[number, number, number, number]> = [
  [-1.5, 1.5, -2.05, -0.45],
  [-1.5, 1.5, 0.45, 2.05],
];

const boxUniforms = {
  uBoxMin: { value: new Vector3(-3, 0, -3) },
  uBoxMax: { value: new Vector3(3, 3.95, 3) },
  uProbePos: { value: ROOM_PROBE_POS.clone() },
  uBoxOn: { value: 1 },
};

const skyUniforms = {
  uSun: { value: new Vector3(0.2, 0.95, 0.25).normalize() },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uGain: { value: 1 },
};

const beamUniforms = {
  uTime: skyUniforms.uTime,
  uStrength: { value: 1 },
  uColor: { value: new Color(1.0, 0.93, 0.8) },
  uL: { value: new Vector3(0, -1, 0) },
};

/** Shared clock uniform for wind and other shader animation. */
export const timeUniform = skyUniforms.uTime;

export const procEnv = {
  night: false,
  monke: false,
  /** Set to re-capture the reflection probe on the next frame. */
  dirty: true,
  /** Lamps, light shafts and dust that belong to the indoor room (hidden in the Monke arena). */
  roomGroup: new Group(),
  lampGlow: null as MeshStandardMaterial | null,
  /** Concealed LED strips: the additive wall wash and the emissive strip itself. */
  cove: null as { glow: Material; strip: MeshStandardMaterial } | null,
  lampLights: [] as PointLight[],
  /** The warm ceiling point light that room.ts creates for night time. */
  mainLamp: null as PointLight | null,
  setNight(night: boolean) {
    this.night = night;
    this.dirty = true;
  },
  setMap(monke: boolean) {
    this.monke = monke;
    this.dirty = true;
  },
};

// ---- Box-projected image-based lighting ------------------------------------------

const BOX_FRAG = /* glsl */ `
varying vec3 vBoxWPos;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uProbePos;
uniform float uBoxOn;
vec3 boxProject( vec3 v ) {
  vec3 p = vBoxWPos;
  if ( uBoxOn < 0.5 || any( lessThan( p, uBoxMin - 0.3 ) ) || any( greaterThan( p, uBoxMax + 0.6 ) ) ) return v;
  vec3 pc = clamp( p, uBoxMin + 0.002, uBoxMax - 0.002 );
  vec3 tm = max( ( uBoxMax - pc ) / v, ( uBoxMin - pc ) / v );
  float t = min( min( tm.x, tm.y ), tm.z );
  return normalize( pc + v * t - uProbePos );
}
`;
const ENV_PARS = ShaderChunk.envmap_physical_pars_fragment.replace(
  'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
  'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );\n\t\t\treflectVec = boxProject( reflectVec );',
);

type CompileHook = Material['onBeforeCompile'];
const boxCompile: CompileHook = (shader) => {
  shader.uniforms.uBoxMin = boxUniforms.uBoxMin;
  shader.uniforms.uBoxMax = boxUniforms.uBoxMax;
  shader.uniforms.uProbePos = boxUniforms.uProbePos;
  shader.uniforms.uBoxOn = boxUniforms.uBoxOn;
  shader.vertexShader =
    'varying vec3 vBoxWPos;\n' +
    shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n#ifdef USE_ENVMAP\n\tvBoxWPos = worldPosition.xyz;\n#endif',
    );
  shader.fragmentShader =
    BOX_FRAG +
    shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', ENV_PARS);
};

const patched = new WeakSet<Material>();
/** Makes a standard/physical material sample the room probe with parallax correction. */
export function boxProjected<T extends Material>(m: T): T {
  if (patched.has(m)) return m;
  const std = m as unknown as MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || m.userData.noBoxProject) return m;
  patched.add(m);
  m.onBeforeCompile = boxCompile;
  m.customProgramCacheKey = () => 'boxproj';
  return m;
}

function patchScene(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => boxProjected(m));
    else boxProjected(mesh.material);
  });
}

// ---- Sky -------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * p;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform float uNight;
uniform float uTime;
uniform float uGain;
varying vec3 vDir;
float hash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < SKY_OCT; i++ ) { s += a * noise( p ); p = p * 2.03 + vec2( 17.3, 9.1 ); a *= 0.5; }
  return s;
}
float hash3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
void main() {
  vec3 d = normalize( vDir );
  float up = max( d.y, 0.0 );
  float sd = max( dot( d, uSun ), 0.0 );

  // Daytime: Rayleigh-style gradient, Mie halo, sun disc
  vec3 day = mix( vec3( 0.62, 0.79, 1.0 ), vec3( 0.09, 0.27, 0.74 ), pow( up, 0.42 ) );
  day += vec3( 1.0, 0.85, 0.6 ) * ( pow( sd, 8.0 ) * 0.22 + pow( sd, 180.0 ) * 1.4 );
  day += vec3( 1.0, 0.95, 0.85 ) * smoothstep( 0.9993, 0.9998, sd ) * 24.0;
  day *= uGain;

  // Night: deep gradient, twinkling stars, moon with maria and halo
  vec3 night = mix( vec3( 0.016, 0.026, 0.06 ), vec3( 0.003, 0.005, 0.016 ), pow( up, 0.5 ) );
  vec3 g = d * 190.0;
  float h = hash3( floor( g ) );
  float star = step( 0.9915, h ) * smoothstep( 0.42, 0.0, length( fract( g ) - 0.5 ) );
  night += star * ( 0.55 + 0.45 * sin( uTime * 2.5 + h * 100.0 ) ) * mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.75, 0.85, 1.0 ), fract( h * 37.0 ) ) * 2.2 * smoothstep( 0.0, 0.15, d.y );
  float maria = 0.72 + 0.28 * noise( d.xz * 70.0 + 3.0 );
  night += vec3( 1.0, 0.97, 0.86 ) * smoothstep( 0.9989, 0.9993, sd ) * 3.2 * maria;
  night += vec3( 0.45, 0.55, 0.85 ) * ( pow( sd, 260.0 ) * 0.45 + pow( sd, 24.0 ) * 0.05 );

  vec3 col = mix( day, night, uNight );

  // Cloud deck projected onto a plane overhead, lit by the sun or moon
  if ( d.y > 0.01 ) {
    vec2 p = d.xz / ( d.y + 0.14 ) * 1.5 + uTime * vec2( 0.011, 0.004 );
    float n = fbm( p );
    float n2 = fbm( p * 2.6 + 4.0 - uTime * 0.01 );
    float dens = smoothstep( 0.46, 0.76, n + n2 * 0.28 - 0.08 ) * smoothstep( 0.01, 0.2, d.y );
    float thick = smoothstep( 0.5, 0.95, n );
    float towardLight = fbm( p + uSun.xz * 0.22 );
    float lit = clamp( 0.72 + ( n - towardLight ) * 2.2, 0.35, 1.25 );
    vec3 cDay = mix( vec3( 1.0, 0.99, 0.97 ), vec3( 0.56, 0.62, 0.74 ), thick * 0.75 ) * lit * 1.1 * uGain + vec3( 1.0, 0.8, 0.55 ) * pow( sd, 20.0 ) * 0.6 * uGain;
    vec3 cNight = vec3( 0.03, 0.04, 0.075 ) * lit + vec3( 0.3, 0.38, 0.6 ) * pow( sd, 30.0 ) * 0.5 * ( 1.0 - thick * 0.6 );
    col = mix( col, mix( cDay, cNight, uNight ), dens );
  }

  // Ground haze below the horizon
  vec3 ground = mix( vec3( 0.42, 0.48, 0.46 ) * uGain, vec3( 0.008, 0.011, 0.02 ), uNight );
  col = mix( col, ground, smoothstep( 0.0, -0.22, d.y ) );

  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function buildSkyDome(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    defines: { SKY_OCT: QUALITY.skyOctaves },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new Mesh(new SphereGeometry(170, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.raycast = () => {};
  return dome;
}

// ---- Light shafts and dust -------------------------------------------------------

const BEAM_VERT = /* glsl */ `
attribute float aT;
varying vec2 vUv;
varying float vT;
void main() {
  vUv = uv;
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const BEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform vec3 uColor;
varying vec2 vUv;
varying float vT;
float hash( float n ) { return fract( sin( n ) * 43758.5453 ); }
float n1( float x ) { float i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f ); return mix( hash( i ), hash( i + 1.0 ), f ); }
void main() {
  float edge = sin( 3.14159 * clamp( vUv.x, 0.0, 1.0 ) );
  float streak = 0.55 + 0.45 * n1( vUv.x * 23.0 + uTime * 0.05 ) * n1( vUv.x * 61.0 - uTime * 0.03 + 7.0 );
  float fall = smoothstep( 0.0, 0.06, vT ) * ( 1.0 - 0.55 * vT );
  float a = edge * edge * streak * fall * 0.032 * uStrength;
  gl_FragColor = vec4( uColor * a, 1.0 );
}
`;

function buildBeams(L: Vector3): Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const tt: number[] = [];
  const idx: number[] = [];
  const k = SKYLIGHT_Y / -L.y;
  const ox = L.x * k;
  const oz = L.z * k;
  const quad = (ax: number, az: number, bx: number, bz: number) => {
    const b = pos.length / 3;
    pos.push(ax, SKYLIGHT_Y, az, bx, SKYLIGHT_Y, bz, bx + ox, 0, bz + oz, ax + ox, 0, az + oz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    tt.push(0, 0, 1, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const [x0, x1, z0, z1] of SKYLIGHTS) {
    const nx = 6;
    const nz = 5;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      quad(x, z0, x, z1);
    }
    for (let j = 0; j <= nz; j++) {
      const z = z0 + ((z1 - z0) * j) / nz;
      quad(x0, z, x1, z);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('aT', new BufferAttribute(new Float32Array(tt), 1));
  geo.setIndex(idx);
  const mat = new ShaderMaterial({
    uniforms: beamUniforms,
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 20;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uL;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 p = position;
  p.y = mod( p.y - uTime * ( 0.012 + aSeed.x * 0.02 ), 3.9 ) + 0.05;
  p.x += sin( uTime * ( 0.2 + aSeed.y * 0.3 ) + aSeed.z * 40.0 ) * 0.12;
  p.z += cos( uTime * ( 0.17 + aSeed.x * 0.3 ) + aSeed.w * 40.0 ) * 0.12;
  // Trace back along the light direction to the ceiling: lit only if it passes through a skylight
  float k = ( ${SKYLIGHT_Y.toFixed(2)} - p.y ) / -uL.y;
  vec2 c = p.xz - uL.xz * k;
  float inX = step( -1.5, c.x ) * step( c.x, 1.5 );
  float inZ = step( 0.45, abs( c.y ) ) * step( abs( c.y ), 2.05 );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  float tw = 0.6 + 0.4 * sin( uTime * ( 1.0 + aSeed.w * 2.0 ) + aSeed.y * 60.0 );
  vA = inX * inZ * tw * smoothstep( 0.12, 0.5, -mv.z );
  gl_PointSize = clamp( ( 1.4 + aSeed.z * 2.2 ) * 1.6 / -mv.z, 1.0, 5.0 );
  gl_Position = projectionMatrix * mv;
}
`;
const DUST_FRAG = /* glsl */ `
uniform float uStrength;
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep( 0.5, 0.0, length( q ) ) * vA * 0.55 * uStrength;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor * a, 1.0 );
}
`;

function buildDust(): Points {
  const n = QUALITY.dustCount;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  let s = 12345;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * 5.6;
    pos[i * 3 + 1] = rnd() * 3.9;
    pos[i * 3 + 2] = (rnd() - 0.5) * 5.6;
    seed[i * 4] = rnd();
    seed[i * 4 + 1] = rnd();
    seed[i * 4 + 2] = rnd();
    seed[i * 4 + 3] = rnd();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 4));
  const pts = new Points(
    geo,
    new ShaderMaterial({
      uniforms: beamUniforms,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  pts.frustumCulled = false;
  pts.renderOrder = 21;
  pts.raycast = () => {};
  return pts;
}

// ---- Lamps -----------------------------------------------------------------------

function buildLamps(root: Group) {
  const brass = new MeshStandardMaterial({
    color: new Color(0xb08a45),
    metalness: 1,
    roughness: 0.28,
  });
  const iron = new MeshStandardMaterial({ color: new Color(0x1c1a18), metalness: 0.9, roughness: 0.5 });
  const glow = new MeshStandardMaterial({
    color: new Color(0xfff3dc),
    emissive: new Color(0xffc37a),
    emissiveIntensity: 0,
    roughness: 0.35,
  });
  procEnv.lampGlow = glow;

  // Chandelier hanging from the ridge beam: rod, brass ring, six shaded bulbs
  const chand = new Group();
  chand.position.set(0, 3.32, 0);
  const rod = new Mesh(new CylinderGeometry(0.011, 0.011, 0.92, 10), iron);
  rod.position.y = 0.46;
  chand.add(rod);
  const ring = new Mesh(new TorusGeometry(0.34, 0.016, 12, 48), brass);
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  const hub = new Mesh(new SphereGeometry(0.045, 20, 14), brass);
  chand.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spoke = new Mesh(new CylinderGeometry(0.006, 0.006, 0.34, 8), iron);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = -a;
    spoke.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
    chand.add(spoke);
    const cup = new Mesh(new CylinderGeometry(0.03, 0.018, 0.045, 16), brass);
    cup.position.set(Math.cos(a) * 0.34, -0.035, Math.sin(a) * 0.34);
    chand.add(cup);
    const bulb = new Mesh(new SphereGeometry(0.042, 20, 14), glow);
    bulb.position.set(Math.cos(a) * 0.34, -0.09, Math.sin(a) * 0.34);
    chand.add(bulb);
  }
  root.add(chand);

  // Wall sconces: brass backplate and arm, frosted glass shade
  const sconce = (x: number, z: number) => {
    const s = new Group();
    const sign = x > 0 ? -1 : 1;
    s.position.set(x, 2.28, z);
    const plate = new Mesh(new CylinderGeometry(0.06, 0.06, 0.014, 24), brass);
    plate.rotation.z = Math.PI / 2;
    s.add(plate);
    const arm = new Mesh(new CylinderGeometry(0.008, 0.008, 0.1, 8), brass);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = sign * 0.05;
    s.add(arm);
    const shade = new Mesh(new CylinderGeometry(0.05, 0.036, 0.13, 24), glow);
    shade.position.set(sign * 0.1, 0.03, 0);
    s.add(shade);
    const cap = new Mesh(new CylinderGeometry(0.04, 0.04, 0.012, 24), brass);
    cap.position.set(sign * 0.1, -0.04, 0);
    s.add(cap);
    root.add(s);
  };
  for (const z of [-0.35, 1.25]) {
    sconce(-2.985, z);
    sconce(2.985, z);
  }
  if (QUALITY.high) {
    for (const x of [-2.75, 2.75]) {
      const l = new PointLight(0xffc07a, 0, 5, 2);
      l.position.set(x, 2.3, 0.45);
      root.add(l);
      procEnv.lampLights.push(l);
    }
  }
}

// ---- Build + system --------------------------------------------------------------

let skyDome: Mesh | null = null;

export function buildProceduralEnvironment(world: World) {
  skyDome = buildSkyDome();
  world.createTransformEntity(skyDome);
  buildLamps(procEnv.roomGroup);
  world.createTransformEntity(procEnv.roomGroup);
}

export class ProcEnvSystem extends createSystem({}) {
  private dirLight: DirectionalLight | null = null;
  private hemiLight: HemisphereLight | null = null;
  private pmrem: PMREMGenerator | null = null;
  private cubeRT: WebGLCubeRenderTarget | null = null;
  private cubeCam: CubeCamera | null = null;
  private envRT: WebGLRenderTarget | null = null;
  private beams: Mesh | null = null;
  private dust: Points | null = null;
  private frames = 0;
  private settle = 0;
  private L = new Vector3(0, -1, 0);
  private lightHome = new Vector3();
  private targetHome = new Vector3();
  private camPos = new Vector3();
  private monkeFog = new FogExp2(0xbcd3ea, 0.0075);
  private appliedMonke = false;
  private appliedNight: boolean | null = null;

  private setup(): boolean {
    if (this.dirLight) return true;
    this.scene.traverse((o: Object3D) => {
      if ((o as DirectionalLight).isDirectionalLight) this.dirLight = o as DirectionalLight;
      else if ((o as HemisphereLight).isHemisphereLight) this.hemiLight = o as HemisphereLight;
    });
    const dl = this.dirLight as DirectionalLight | null;
    if (!dl) return false;

    dl.updateWorldMatrix(true, false);
    dl.target.updateWorldMatrix(true, false);
    dl.getWorldPosition(this.lightHome);
    dl.target.getWorldPosition(this.targetHome);
    this.L.copy(this.targetHome).sub(this.lightHome).normalize();
    skyUniforms.uSun.value.copy(this.L).negate();
    beamUniforms.uL.value.copy(this.L);

    dl.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
    dl.shadow.map?.dispose();
    dl.shadow.map = null as unknown as typeof dl.shadow.map;
    dl.shadow.bias = -0.0012;
    dl.shadow.normalBias = 0.045;
    dl.shadow.radius = QUALITY.high ? 6 : 3;

    this.beams = buildBeams(this.L);
    this.dust = buildDust();
    procEnv.roomGroup.add(this.beams, this.dust);

    this.pmrem = new PMREMGenerator(this.renderer);
    this.cubeRT = new WebGLCubeRenderTarget(QUALITY.probeSize, {
      type: HalfFloatType,
      generateMipmaps: false,
    });
    this.cubeCam = new CubeCamera(0.05, 190, this.cubeRT);
    return true;
  }

  private applyLighting() {
    const night = procEnv.night;
    const monke = procEnv.monke;
    const dl = this.dirLight!;
    // Sun / moon. The reflection probe supplies bounce light, so the flat fill is kept low.
    dl.color.setHex(night ? 0x8fb0ff : 0xfff0d8);
    dl.intensity = night ? (monke ? 1.1 : 0.55) : monke ? 3.2 : 3.0;
    if (this.hemiLight) {
      this.hemiLight.color.setHex(night ? 0x1c2a4a : 0xe6e9f2);
      this.hemiLight.groundColor.setHex(night ? 0x2a2018 : 0xa89878);
      this.hemiLight.intensity = night ? (monke ? 0.4 : 0.22) : monke ? 0.7 : 0.8;
    }
    skyUniforms.uNight.value = night ? 1 : 0;
    skyUniforms.uGain.value = 1.7;
    beamUniforms.uStrength.value = night ? 0.22 : 1;
    beamUniforms.uColor.value.setRGB(night ? 0.55 : 1, night ? 0.68 : 0.93, night ? 1 : 0.8);
    if (procEnv.lampGlow) procEnv.lampGlow.emissiveIntensity = night ? 7 : 0;
    if (procEnv.cove) {
      procEnv.cove.glow.opacity = night ? 0.9 : 0.6;
      procEnv.cove.strip.emissiveIntensity = night ? 5 : 2.5;
    }
    for (const l of procEnv.lampLights) l.intensity = night ? 2.2 : 0;
    if (procEnv.mainLamp) {
      procEnv.mainLamp.intensity = night ? 9 : 0;
      procEnv.mainLamp.castShadow = QUALITY.practicalLightShadows && night && !monke;
    }
    procEnv.roomGroup.visible = !monke;

    // Shadow frustum: tight on the room indoors, wide and player-following outdoors
    const cam = dl.shadow.camera;
    const half = monke ? 26 : 4.6;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = monke ? 120 : 26;
    cam.updateProjectionMatrix();
    if (!monke) {
      this.placeLight(this.targetHome, this.lightHome.distanceTo(this.targetHome));
    }
    this.monkeFog.color.setHex(night ? 0x060a14 : 0xbcd3ea);
    if (monke !== this.appliedMonke) {
      // The maze swaps scene.fog itself; only touch it when we own it.
      if (monke) this.scene.fog = this.monkeFog;
      else if (this.scene.fog === this.monkeFog) this.scene.fog = null;
      this.appliedMonke = monke;
    }
    this.appliedNight = night;
  }

  private placeLight(target: Vector3, dist: number) {
    const dl = this.dirLight!;
    const parent = dl.parent;
    dl.position.copy(target).addScaledVector(this.L, -dist);
    if (parent) parent.worldToLocal(dl.position);
    dl.target.position.copy(target);
    if (dl.target.parent) dl.target.parent.worldToLocal(dl.target.position);
    dl.updateMatrixWorld(true);
    dl.target.updateMatrixWorld(true);
  }

  private capture() {
    const cam = this.cubeCam!;
    const beamsVis = procEnv.roomGroup.visible;
    if (this.beams) this.beams.visible = false;
    if (this.dust) this.dust.visible = false;

    if (procEnv.monke) {
      this.player.getWorldPosition(cam.position);
      cam.position.y += 4;
      boxUniforms.uBoxOn.value = 0;
    } else {
      cam.position.copy(ROOM_PROBE_POS);
      boxUniforms.uBoxOn.value = 1;
    }
    const prevIntensity = this.scene.environmentIntensity;
    // Pass 1: direct light only. Pass 2: lit by pass 1, which adds one bounce of indirect light.
    this.scene.environmentIntensity = 0;
    cam.update(this.renderer, this.scene);
    const first = this.pmrem!.fromCubemap(this.cubeRT!.texture);
    const old = this.envRT;
    this.scene.environment = first.texture;
    this.scene.environmentIntensity = 1;
    cam.update(this.renderer, this.scene);
    this.envRT = this.pmrem!.fromCubemap(this.cubeRT!.texture);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = prevIntensity || 1;
    first.dispose();
    old?.dispose();

    if (this.beams) this.beams.visible = true;
    if (this.dust) this.dust.visible = true;
    procEnv.roomGroup.visible = beamsVis;
  }

  update(delta: number, time: number) {
    if (!this.setup()) return;
    this.frames++;
    skyUniforms.uTime.value = time;

    this.camera.getWorldPosition(this.camPos);
    if (skyDome) skyDome.position.copy(this.camPos);

    if (procEnv.monke) {
      this.player.getWorldPosition(this.camPos);
      this.placeLight(this.camPos, 60);
    }

    if (procEnv.dirty && this.frames > 3) {
      procEnv.dirty = false;
      patchScene(this.scene);
      this.applyLighting();
      this.settle = 2;
    } else if (this.settle > 0 && --this.settle === 0) {
      this.capture();
    }

    // Keep our probe bound (another system may reset it) and dim it inside the dark cake maze.
    if (this.envRT && this.scene.environment !== this.envRT.texture) {
      this.scene.environment = this.envRT.texture;
    }
    const fog = this.scene.fog as FogExp2 | null;
    const inMaze = !!fog && fog !== this.monkeFog;
    const want = inMaze ? 0.02 : 1;
    if (this.scene.environmentIntensity !== want) this.scene.environmentIntensity = want;
    if (skyDome) skyDome.visible = !inMaze;
    void delta;
    void this.appliedNight;
  }
}
