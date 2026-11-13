// Builds the whole map: your garage + house, the street at night, and Freddy's pizzeria
// with its dining room, show stage and Pirate Cove. Static geometry is merged per material
// so the whole world draws in a few dozen calls (important on Quest).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

// ---------------- layout (metres) ----------------
export const L = {
  garage: { x0: -4.5, x1: 4.5, z0: -7.5, z1: 0, h: 3.0, door: 3.4, doorH: 2.45 },
  street: { z0: 11, z1: 19 },
  pizza: { x0: -11, x1: 11, z0: 24, z1: 47, h: 3.6 },
  stage: { x0: -6.2, x1: 6.2, z0: 41.2, z1: 47, h: 0.65, stairX: 1.3, stairZ0: 40.0 },
  stands: [-2.85, -0.95, 0.95, 2.85].map(x => new THREE.Vector3(x, 0.09, -4.3)),
  spawn: new THREE.Vector3(0, 0, -1.2),
};

// ---------------- batching helpers ----------------
class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, material, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
  }
  build(parent, { shadows = false } = {}) {
    for (const [m, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, m);
      mesh.receiveShadow = true; mesh.castShadow = shadows && !m.transparent;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

// Box with UVs in metres / texSize so tiled textures keep real-world scale.
function boxGeo(w, h, d, ts = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / ts, uv.getY(k) * dims[f][1] / ts);
  }
  return g;
}
// Vertical wall quad from A to B. Normal = (-dz, 0, dx). v maps y/vH (so a texture can paint height bands).
function wallGeo(ax, az, bx, bz, y0, y1, uScale, vH, u0 = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BufferGeometry();
  const pos = [ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az];
  const dx = (bx - ax) / len, dz = (bz - az) / len;
  const n = [-dz, 0, dx];
  const uv = [u0 / uScale, y0 / vH, (u0 + len) / uScale, y0 / vH, (u0 + len) / uScale, y1 / vH, u0 / uScale, y1 / vH];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
// Floor/ceiling rectangle (faces up, or down if flip)
function rectGeo(x0, z0, x1, z1, y, ts, flip = false) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const p = g.attributes.position;
    uv.setXY(i, p.getX(i) / ts, (flip ? 1 : -1) * p.getZ(i) / ts);
  }
  return g;
}

// Curtain: vertical folds
function curtainGeo(w, h, folds = 10, amp = 0.07, gather = 0) {
  const g = new THREE.PlaneGeometry(w, h, folds * 6, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (y + h / 2) / h; // 0 bottom..1 top
    const a = amp * (0.7 + 0.3 * (1 - t));
    p.setZ(i, Math.sin((x / w + 0.5) * folds * Math.PI * 2) * a);
    if (gather) p.setX(i, x * (1 - gather * (1 - t) * 0.5));
  }
  g.computeVertexNormals();
  return g;
}

// Radial soft blob (fake contact shadow / light pool)
function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(scene, quality) {
  const world = new THREE.Group(); world.name = 'world'; scene.add(world);
  const colliders = [];
  const solid = (x0, z0, x1, z1) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  const B = new Batch();
  const dyn = []; // things to animate
  const hi = quality === 'high';

  // ---------- materials ----------
  const mConcrete = T.mat(T.concrete(), { repeat: [1, 1], metalness: 0 });
  const mChecker = T.mat(T.checker());
  const mPizzaWall = T.mat(T.pizzaWall());
  const mDrywall = T.mat(T.drywall());
  const mBrick = T.mat(T.brick());
  const mBrickDark = T.mat(T.brick([92, 52, 44]));
  const mStageWood = T.mat(T.planks([98, 58, 34], 'stage'));
  const mBenchWood = T.mat(T.planks([150, 108, 66], 'bench'));
  const mAsphalt = T.mat(T.asphalt());
  const mSidewalk = T.mat(T.sidewalk());
  const mGrass = T.mat(T.grass());
  const mCeil = T.mat(T.ceilingTile());
  const mPeg = T.mat(T.pegboard());
  const mSiding = T.mat(T.siding());
  const mRoof = T.mat(T.shingles());
  const mSteel = T.mat(T.brushed(), { metalness: 0.9 });
  const mRedTool = T.mat(T.paintedMetal([170, 22, 18], 'red'), { metalness: 0.5 });
  const mGreyMetal = T.mat(T.paintedMetal([90, 96, 104], 'grey'), { metalness: 0.4 });
  const mCurtainRed = T.mat(T.velvet([120, 18, 28], 'red'), { side: THREE.DoubleSide });
  const mCove = T.mat(T.coveCurtain(), { side: THREE.DoubleSide, roughness: 0.95 });
  const sb = T.starBackdrop();
  const mBackdrop = new THREE.MeshStandardMaterial({ map: sb.map, emissiveMap: sb.emissiveMap, emissive: 0x7766aa, emissiveIntensity: 0.35, roughness: 0.9 });
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
  const mCloth = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.95 });
  const mBlack = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5 });
  const mDarkTrim = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, envMapIntensity: 2 });
  // lit windows: warm interior with half-open blinds
  const winC = T.textCanvas(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffcf8a'); g.addColorStop(1, '#a8682e'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(60,30,10,.55)'; for (let y = 0; y < h * 0.45; y += 12) x.fillRect(0, y, w, 7);
    x.fillStyle = 'rgba(40,20,8,.6)'; x.fillRect(w * 0.08, h * 0.7, w * 0.3, h * 0.3); x.fillRect(w * 0.6, h * 0.62, w * 0.25, h * 0.38);
    x.fillStyle = '#e8e2d4'; x.fillRect(w / 2 - 3, 0, 6, h); x.fillRect(0, h / 2 - 3, w, 6);
  });
  const winTex = T.canvasTex(winC);
  const mWindowGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.1, roughness: 0.1 });
  const mTube = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef4ff, emissiveIntensity: 3 });
  const mWarmBulb = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc070, emissiveIntensity: 4 });
  const mCurb = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 });
  const mPaintLine = new THREE.MeshStandardMaterial({ color: 0xd8c050, roughness: 0.8 });
  const mPaintWhite = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.8 });
  const mDoor = T.mat(T.paintedMetal([220, 220, 214], 'door'), { metalness: 0.2 });
  const mPole = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.7 });
  const mFence = T.mat(T.planks([110, 90, 70], 'fence'));
  const mTrunk = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 });
  const mLeaf = new THREE.MeshStandardMaterial({ color: 0x1f3a1c, roughness: 1 });
  const mCardboard = new THREE.MeshStandardMaterial({ color: 0x9c7448, roughness: 0.95 });
  const mPlasticBlue = new THREE.MeshStandardMaterial({ color: 0x2d5fa8, roughness: 0.4 });
  const mPlasticYel = new THREE.MeshStandardMaterial({ color: 0xd8a422, roughness: 0.4 });
  const mRubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { moonDir: { value: new THREE.Vector3(-0.5, 0.45, 0.75).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 moonDir;
      float h(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        float y = vDir.y;
        vec3 col = mix(vec3(0.045,0.05,0.09), vec3(0.008,0.012,0.035), smoothstep(0.0,0.6,y));
        col += vec3(0.08,0.05,0.03) * exp(-max(y,0.0)*14.0); // town glow on the horizon
        vec3 p = vDir*300.0; vec3 c = floor(p);
        float s = h(c); float star = step(0.9985, s) * smoothstep(0.0,0.15,y) * (0.5 + 0.5*h(c+3.1));
        col += vec3(star);
        float m = dot(vDir, moonDir);
        col += vec3(0.95,0.93,0.85) * smoothstep(0.9993,0.9995,m);
        col += vec3(0.2,0.22,0.3) * pow(max(m,0.0), 60.0) * 0.6;
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; world.add(sky);

  // ---------- ground ----------
  const G = L.garage, Pz = L.pizza, St = L.stage;
  // lawn (two pieces around driveway), big ground
  B.add(rectGeo(-60, -40, 60, L.street.z0 - 2, -0.02, 3), mGrass);
  B.add(rectGeo(-60, L.street.z1 + 2, 60, 80, -0.02, 3), mGrass);
  // driveway
  B.add(rectGeo(-3.6, 0, 3.6, L.street.z0 - 2, 0.005, 3), mConcrete);
  // sidewalks
  B.add(boxGeo(120, 0.12, 2, 1.5), mSidewalk, mtx(0, 0.0, L.street.z0 - 1));
  B.add(boxGeo(120, 0.12, 2, 1.5), mSidewalk, mtx(0, 0.0, L.street.z1 + 1));
  // curbs
  B.add(boxGeo(120, 0.16, 0.18), mCurb, mtx(0, 0.0, L.street.z0 + 0.05));
  B.add(boxGeo(120, 0.16, 0.18), mCurb, mtx(0, 0.0, L.street.z1 - 0.05));
  // road
  B.add(rectGeo(-60, L.street.z0, 60, L.street.z1, -0.01, 4), mAsphalt);
  for (let x = -58; x < 60; x += 6) B.add(rectGeo(x, 14.93, x + 3, 15.07, -0.005, 1), mPaintLine);
  // pizzeria parking strip
  B.add(rectGeo(-30, L.street.z1 + 2, 30, Pz.z0, 0.0, 4), mAsphalt);
  for (let x = -20; x <= 20; x += 3) if (Math.abs(x) > 3) B.add(rectGeo(x - 0.05, 21.2, x + 0.05, 23.6, 0.006, 1), mPaintWhite);

  // ---------- house + garage exterior ----------
  // garage walls (interior faces) - drywall; exterior siding boxes
  const wt = 0.18;
  // back
  B.add(wallGeo(G.x0, G.z0, G.x1, G.z0, 0, G.h, 2.5, G.h), mDrywall);
  // left & right
  B.add(wallGeo(G.x0, G.z1, G.x0, G.z0, 0, G.h, 2.5, G.h), mDrywall);
  B.add(wallGeo(G.x1, G.z0, G.x1, G.z1, 0, G.h, 2.5, G.h), mDrywall);
  // front wall, interior faces (facing -z) around the door opening
  const dh = G.door / 2;
  B.add(wallGeo(-dh, G.z1 - 0.001, G.x0, G.z1 - 0.001, 0, G.h, 2.5, G.h), mDrywall);
  B.add(wallGeo(G.x1, G.z1 - 0.001, dh, G.z1 - 0.001, 0, G.h, 2.5, G.h), mDrywall);
  B.add(wallGeo(dh, G.z1 - 0.001, -dh, G.z1 - 0.001, G.doorH, G.h, 2.5, G.h), mDrywall);
  // floor + ceiling
  B.add(rectGeo(G.x0, G.z0, G.x1, G.z1, 0.01, 3), mConcrete);
  B.add(rectGeo(G.x0, G.z0, G.x1, G.z1, G.h, 2.5, true), mDrywall);
  // exterior shell (siding), roof
  const ex = 0.15;
  B.add(boxGeo(G.x1 - G.x0 + ex * 2, G.h + 0.4, ex, 1.2), mSiding, mtx(0, (G.h + 0.4) / 2, G.z0 - ex / 2 - 0.02));
  B.add(boxGeo(ex, G.h + 0.4, G.z1 - G.z0, 1.2), mSiding, mtx(G.x1 + ex / 2 + 0.02, (G.h + 0.4) / 2, (G.z0 + G.z1) / 2));
  B.add(boxGeo(G.x1 - dh + ex, G.h + 0.4, ex, 1.2), mSiding, mtx((dh + G.x1 + ex) / 2, (G.h + 0.4) / 2, G.z1 + ex / 2 + 0.02));
  B.add(boxGeo(-dh - G.x0 + ex, G.h + 0.4, ex, 1.2), mSiding, mtx((G.x0 - ex - dh) / 2, (G.h + 0.4) / 2, G.z1 + ex / 2 + 0.02));
  B.add(boxGeo(G.door, G.h + 0.4 - G.doorH, ex, 1.2), mSiding, mtx(0, G.doorH + (G.h + 0.4 - G.doorH) / 2, G.z1 + ex / 2 + 0.02));
  // door trim
  B.add(boxGeo(0.12, G.doorH, 0.22), mWhite, mtx(-dh - 0.06, G.doorH / 2, G.z1 + 0.05));
  B.add(boxGeo(0.12, G.doorH, 0.22), mWhite, mtx(dh + 0.06, G.doorH / 2, G.z1 + 0.05));
  B.add(boxGeo(G.door + 0.24, 0.12, 0.22), mWhite, mtx(0, G.doorH + 0.06, G.z1 + 0.05));
  // rolled-up garage door: panels lying under the ceiling on rails
  for (let i = 0; i < 4; i++) B.add(boxGeo(G.door - 0.05, 0.04, 0.55, 0.6), mDoor, mtx(0, G.h - 0.18, G.z1 - 0.35 - i * 0.56));
  B.add(boxGeo(0.06, 0.06, 2.6), mSteel, mtx(-dh + 0.05, G.h - 0.12, G.z1 - 1.3));
  B.add(boxGeo(0.06, 0.06, 2.6), mSteel, mtx(dh - 0.05, G.h - 0.12, G.z1 - 1.3));
  B.add(boxGeo(0.4, 0.2, 0.6), mGreyMetal, mtx(0, G.h - 0.15, G.z1 - 3.0)); // opener motor
  // house body to the left of the garage
  const hx0 = -16, hx1 = G.x0 - ex, hz0 = -10, hz1 = -0.6, hh = 5.6;
  B.add(boxGeo(hx1 - hx0, hh, hz1 - hz0, 1.2), mSiding, mtx((hx0 + hx1) / 2, hh / 2, (hz0 + hz1) / 2));
  solid(hx0, hz0, hx1, hz1);
  // house windows (warm glow) + door
  for (const wx of [-14, -11.2, -8]) {
    B.add(new THREE.PlaneGeometry(1.2, 1.3), mWindowGlow, mtx(wx, 1.6, hz1 + 0.02));
    B.add(boxGeo(1.36, 0.1, 0.14), mWhite, mtx(wx, 0.92, hz1 + 0.06));
    B.add(boxGeo(1.36, 0.1, 0.1), mWhite, mtx(wx, 2.3, hz1 + 0.05));
    B.add(new THREE.PlaneGeometry(1.2, 1.3), mWindowGlow, mtx(wx, 4.2, hz1 + 0.02));
  }
  B.add(boxGeo(1.0, 2.1, 0.08), mRedTool, mtx(-5.9, 1.05, hz1 + 0.04));
  B.add(boxGeo(1.6, 0.2, 1.2), mSidewalk, mtx(-5.9, 0.1, hz1 + 0.6));
  // roofs
  const roof = (x0, x1, z0, z1, y, rise) => {
    const w = x1 - x0, d = (z1 - z0) / 2, slope = Math.hypot(d, rise), ang = Math.atan2(rise, d);
    B.add(boxGeo(w + 0.6, 0.1, slope + 0.4, 2), mRoof, mtx((x0 + x1) / 2, y + rise / 2, z0 + d / 2, ang, 0, 0));
    B.add(boxGeo(w + 0.6, 0.1, slope + 0.4, 2), mRoof, mtx((x0 + x1) / 2, y + rise / 2, z1 - d / 2, -ang, 0, 0));
    // gable ends
    const tri = new THREE.Shape([new THREE.Vector2(-d, 0), new THREE.Vector2(d, 0), new THREE.Vector2(0, rise)]);
    const tg = new THREE.ShapeGeometry(tri);
    B.add(tg, mSiding, mtx(x0 - 0.01, y, (z0 + z1) / 2, 0, -Math.PI / 2, 0));
    B.add(tg, mSiding, mtx(x1 + 0.01, y, (z0 + z1) / 2, 0, Math.PI / 2, 0));
  };
  roof(G.x0 - ex, G.x1 + ex, G.z0 - ex, G.z1 + ex, G.h + 0.4, 1.6);
  roof(hx0, hx1, hz0, hz1, hh, 2.4);
  // garage colliders (walls) with door gap
  solid(G.x0 - 0.3, G.z0 - 0.3, G.x1 + 0.3, G.z0);
  solid(G.x0 - 0.3, G.z0, G.x0, G.z1 + 0.2);
  solid(G.x1, G.z0, G.x1 + 0.3, G.z1 + 0.2);
  solid(G.x0, G.z1 - 0.05, -dh, G.z1 + 0.2);
  solid(dh, G.z1 - 0.05, G.x1, G.z1 + 0.2);
  // wall lamp by garage door
  B.add(boxGeo(0.16, 0.26, 0.12), mBlack, mtx(dh + 0.5, 2.2, G.z1 + 0.2));
  B.add(boxGeo(0.1, 0.16, 0.06), mWarmBulb, mtx(dh + 0.5, 2.2, G.z1 + 0.28));
  // "repair shop" sign over the door
  const shopSign = T.textCanvas(1024, 192, (x, w, h) => {
    x.fillStyle = '#1b1b1d'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d6a62a'; x.lineWidth = 10; x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#f1c64a'; x.font = 'bold 88px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ANIMATRONIC REPAIR', w / 2, h / 2 + 4);
  });
  const ss = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshStandardMaterial({ map: T.canvasTex(shopSign), emissive: 0xffffff, emissiveMap: T.canvasTex(shopSign), emissiveIntensity: 0.25, roughness: 0.5 }));
  ss.position.set(0, G.doorH + 0.42, G.z1 + 0.16); world.add(ss);

  // fences & neighbour silhouettes
  for (const side of [-1, 1]) {
    const x = side * 22;
    B.add(boxGeo(0.1, 1.8, 30, 1.2), mFence, mtx(x, 0.9, -12));
  }
  B.add(boxGeo(44, 1.8, 0.1, 1.2), mFence, mtx(0, 0.9, -27));
  for (const [x, z, w, d, h] of [[24, -8, 12, 10, 6], [-32, -6, 12, 10, 6.5], [36, 34, 14, 12, 7], [-36, 36, 14, 12, 6]]) {
    B.add(boxGeo(w, h, d, 1.2), mSiding, mtx(x, h / 2, z));
    for (let i = -1; i <= 1; i++) B.add(new THREE.PlaneGeometry(1.1, 1.2), mWindowGlow, mtx(x + i * 3.5, 1.7, z + d / 2 + 0.02));
    roof(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, 2.2);
  }

  // trees
  const trunkG = new THREE.CylinderGeometry(0.14, 0.22, 3.2, 8);
  const crownG = new THREE.IcosahedronGeometry(1.8, 1);
  const tree = (x, z, s = 1) => {
    B.add(trunkG, mTrunk, mtx(x, 1.6 * s, z, 0, 0, 0, s, s, s));
    B.add(crownG, mLeaf, mtx(x, 3.8 * s, z, 0, x, 0, s * 1.1, s * 0.9, s));
    B.add(crownG, mLeaf, mtx(x + 0.8 * s, 4.6 * s, z + 0.4, 0.3, 0, 0, s * 0.7, s * 0.7, s * 0.7));
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  };
  tree(8, 4, 1.2); tree(-8, 5, 1); tree(14, -4, 1.3); tree(-18, 4, 1.1); tree(16, 27, 1.2); tree(-16, 28, 1.0);

  // street lights
  const streetLamp = (x, z, facing) => {
    B.add(new THREE.CylinderGeometry(0.08, 0.12, 6, 10), mPole, mtx(x, 3, z));
    B.add(boxGeo(0.08, 0.08, 1.6), mPole, mtx(x, 5.95, z + facing * 0.8));
    B.add(boxGeo(0.34, 0.16, 0.6), mPole, mtx(x, 5.9, z + facing * 1.5));
    B.add(boxGeo(0.28, 0.03, 0.5), mWarmBulb, mtx(x, 5.81, z + facing * 1.5));
    solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
  };
  streetLamp(-7, L.street.z0 - 0.6, 1); streetLamp(7, L.street.z1 + 0.6, -1);

  // ---------- PIZZERIA ----------
  // exterior shell (brick) with door gap at x in [-1,1]
  const fd = 1.0, fdh = 2.4;
  const pzH = Pz.h + 1.2; // facade taller than ceiling
  B.add(boxGeo(Pz.x1 - fd + 0.3, pzH, 0.3, 1.6), mBrick, mtx((fd + Pz.x1 + 0.3) / 2, pzH / 2, Pz.z0 - 0.17));
  B.add(boxGeo(Pz.x1 - fd + 0.3, pzH, 0.3, 1.6), mBrick, mtx(-(fd + Pz.x1 + 0.3) / 2, pzH / 2, Pz.z0 - 0.17));
  B.add(boxGeo(fd * 2, pzH - fdh, 0.3, 1.6), mBrick, mtx(0, fdh + (pzH - fdh) / 2, Pz.z0 - 0.17));
  B.add(boxGeo(0.3, pzH, Pz.z1 - Pz.z0 + 0.3, 1.6), mBrickDark, mtx(Pz.x0 - 0.17, pzH / 2, (Pz.z0 + Pz.z1) / 2));
  B.add(boxGeo(0.3, pzH, Pz.z1 - Pz.z0 + 0.3, 1.6), mBrickDark, mtx(Pz.x1 + 0.17, pzH / 2, (Pz.z0 + Pz.z1) / 2));
  B.add(boxGeo(Pz.x1 - Pz.x0 + 0.6, pzH, 0.3, 1.6), mBrickDark, mtx(0, pzH / 2, Pz.z1 + 0.17));
  B.add(boxGeo(Pz.x1 - Pz.x0 + 0.8, 0.25, Pz.z1 - Pz.z0 + 0.8), mDarkTrim, mtx(0, pzH + 0.1, (Pz.z0 + Pz.z1) / 2));
  // cornice
  B.add(boxGeo(Pz.x1 - Pz.x0 + 0.9, 0.3, 0.5), mDarkTrim, mtx(0, pzH - 0.1, Pz.z0 - 0.3));
  // windows on facade (lit from inside)
  for (const wx of [-8.2, -5, 5, 8.2]) {
    B.add(new THREE.PlaneGeometry(2.4, 1.5), mWindowGlow, mtx(wx, 1.65, Pz.z0 - 0.33, 0, Math.PI, 0));
    B.add(boxGeo(2.6, 0.12, 0.25), mDarkTrim, mtx(wx, 0.86, Pz.z0 - 0.38));
    B.add(boxGeo(2.6, 0.1, 0.1), mDarkTrim, mtx(wx, 2.45, Pz.z0 - 0.33));
    B.add(boxGeo(0.06, 1.5, 0.08), mDarkTrim, mtx(wx, 1.65, Pz.z0 - 0.33));
  }
  // awning stripes above door
  for (let i = 0; i < 8; i++) B.add(boxGeo(0.4, 0.05, 1.4), i % 2 ? mWhite : mCurtainRed, mtx(-1.4 + i * 0.4, 2.75, Pz.z0 - 0.9, -0.35, 0, 0));
  // door frame and open glass doors
  B.add(boxGeo(0.12, fdh, 0.36), mSteel, mtx(-fd, fdh / 2, Pz.z0 - 0.15));
  B.add(boxGeo(0.12, fdh, 0.36), mSteel, mtx(fd, fdh / 2, Pz.z0 - 0.15));
  B.add(boxGeo(fd * 2, 0.12, 0.36), mSteel, mtx(0, fdh, Pz.z0 - 0.15));
  B.add(boxGeo(0.95, fdh - 0.1, 0.03), mGlass, mtx(-fd + 0.05, (fdh - 0.1) / 2, Pz.z0 + 0.45, 0, Math.PI / 2 - 0.2, 0));
  B.add(boxGeo(0.95, fdh - 0.1, 0.03), mGlass, mtx(fd - 0.05, (fdh - 0.1) / 2, Pz.z0 + 0.45, 0, -Math.PI / 2 + 0.2, 0));
  // big sign (glowing letters)
  const signC = T.textCanvas(2048, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 190px "Brush Script MT", "Segoe Script", cursive';
    x.shadowColor = '#ff3b3b'; x.shadowBlur = 40; x.fillStyle = '#ffe9e0';
    x.fillText("Freddy Fazbear's", w / 2, h * 0.36);
    x.font = 'bold 170px Impact, "Arial Black", sans-serif'; x.shadowColor = '#ffd23b'; x.fillStyle = '#fff6d0';
    x.fillText('PIZZA', w / 2, h * 0.78);
  });
  const signTex = T.canvasTex(signC);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, fog: false, color: 0xffffff }));
  sign.position.set(0, pzH + 1.0, Pz.z0 - 0.45); sign.rotation.y = Math.PI; world.add(sign); // faces the street
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(9.4, 2.4, 0.2), mDarkTrim);
  signBack.position.set(0, pzH + 1.0, Pz.z0 - 0.3); world.add(signBack);
  dyn.push(t => { sign.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 3.0) * (Math.random() > 0.995 ? -3 : 1)); });

  // pizzeria colliders
  solid(Pz.x0 - 0.3, Pz.z0 - 0.4, -fd, Pz.z0);
  solid(fd, Pz.z0 - 0.4, Pz.x1 + 0.3, Pz.z0);
  solid(Pz.x0 - 0.3, Pz.z0, Pz.x0, Pz.z1 + 0.3);
  solid(Pz.x1, Pz.z0, Pz.x1 + 0.3, Pz.z1 + 0.3);
  solid(Pz.x0, Pz.z1, Pz.x1, Pz.z1 + 0.3);

  // interior walls
  const ins = 0.001;
  const inner = (ax, az, bx, bz, y0 = 0, y1 = Pz.h) => B.add(wallGeo(ax, az, bx, bz, y0, y1, 2.5, Pz.h), mPizzaWall);
  inner(Pz.x0, Pz.z0, -fd, Pz.z0);           // front wall left, faces +z
  inner(fd, Pz.z0, Pz.x1, Pz.z0);            // front wall right
  inner(-fd, Pz.z0, fd, Pz.z0, fdh, Pz.h);   // above door
  inner(Pz.x1, Pz.z1, Pz.x0, Pz.z1);         // back, faces -z
  inner(Pz.x0, Pz.z1, Pz.x0, Pz.z0);         // left, faces +x
  inner(Pz.x1, Pz.z0, Pz.x1, Pz.z1);         // right, faces -x
  // floor & ceiling
  B.add(rectGeo(Pz.x0, Pz.z0, Pz.x1, Pz.z1, 0.004, 1.2), mChecker);
  B.add(rectGeo(Pz.x0, Pz.z0, Pz.x1, Pz.z1, Pz.h, 1.2, true), mCeil);
  // fluorescent troffers
  for (let x = -7.2; x <= 7.2; x += 4.8) for (let z = 27; z <= 39; z += 4) {
    B.add(boxGeo(0.6, 0.03, 1.2), mTube, mtx(x, Pz.h - 0.015, z));
    B.add(boxGeo(0.66, 0.04, 1.26), mGreyMetal, mtx(x, Pz.h - 0.005, z));
  }

  // ---------- STAGE ----------
  const stageCol = (x0, z0, x1, z1) => solid(x0, z0, x1, z1);
  B.add(boxGeo(St.x1 - St.x0, St.h, St.z1 - St.z0, 1.2), mStageWood, mtx(0, St.h / 2, (St.z0 + St.z1) / 2));
  // skirt
  B.add(wallGeo(St.x0, St.z0 - 0.01, St.x1, St.z0 - 0.01, 0, St.h, 1, St.h), mDarkTrim);
  // stairs (center front)
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const h = St.h * (i + 1) / steps, d = (St.z0 - St.stairZ0) * (steps - i) / steps;
    B.add(boxGeo(St.stairX * 2, h, d / (steps - i) + 0.001, 1.2), mStageWood, mtx(0, h / 2, St.z0 - d + (d / (steps - i)) / 2));
  }
  // stage edge colliders (except stairs)
  stageCol(St.x0, St.z0 - 0.05, -St.stairX, St.z0 + 0.05);
  stageCol(St.stairX, St.z0 - 0.05, St.x1, St.z0 + 0.05);
  stageCol(St.x0 - 0.05, St.z0, St.x0, St.z1); stageCol(St.x1, St.z0, St.x1 + 0.05, St.z1);
  // backdrop with stars
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(St.x1 - St.x0, Pz.h - St.h), mBackdrop);
  bd.position.set(0, St.h + (Pz.h - St.h) / 2, Pz.z1 - 0.05); bd.rotation.y = Math.PI; world.add(bd);
  // curtains: side drapes + valance
  const cg = curtainGeo(2.2, Pz.h - St.h, 7, 0.08, 0.6);
  B.add(cg, mCurtainRed, mtx(St.x0 + 1.0, St.h + (Pz.h - St.h) / 2, St.z0 + 0.4, 0, Math.PI, 0));
  B.add(cg, mCurtainRed, mtx(St.x1 - 1.0, St.h + (Pz.h - St.h) / 2, St.z0 + 0.4, 0, Math.PI, 0));
  B.add(curtainGeo(St.x1 - St.x0 + 0.4, 0.75, 30, 0.05), mCurtainRed, mtx(0, Pz.h - 0.37, St.z0 + 0.25, 0, Math.PI, 0));
  B.add(boxGeo(St.x1 - St.x0 + 0.4, 0.12, 0.2), mStageWood, mtx(0, Pz.h - 0.02, St.z0 + 0.25));
  // speakers + light truss
  for (const sx of [St.x0 + 0.4, St.x1 - 0.4]) {
    B.add(boxGeo(0.7, 1.1, 0.6), mBlack, mtx(sx, St.h + 0.55, St.z0 + 1.5));
    B.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), mDarkTrim, mtx(sx, St.h + 0.7, St.z0 + 1.19, Math.PI / 2, 0, 0));
    B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), mDarkTrim, mtx(sx, St.h + 0.25, St.z0 + 1.19, Math.PI / 2, 0, 0));
    stageCol(sx - 0.35, St.z0 + 1.2, sx + 0.35, St.z0 + 1.8);
  }
  B.add(new THREE.CylinderGeometry(0.04, 0.04, St.x1 - St.x0, 8), mPole, mtx(0, Pz.h - 0.5, St.z0 - 1.2, 0, 0, Math.PI / 2));
  const cans = [];
  for (const [cx, col] of [[-3, 0xff4fa0], [0, 0xffffff], [3, 0x4fa0ff]]) {
    B.add(new THREE.CylinderGeometry(0.13, 0.16, 0.4, 14), mBlack, mtx(cx, Pz.h - 0.75, St.z0 - 1.2, 0.8, 0, 0));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    lens.position.set(cx, Pz.h - 0.9, St.z0 - 1.05); lens.lookAt(cx, 0, St.z0 + 3); world.add(lens);
    cans.push(lens);
  }
  // "stars" on the valance
  // ---------- PIRATE COVE (left wall alcove) ----------
  const pcz0 = 30, pcz1 = 34.5, pcx = Pz.x0;
  B.add(boxGeo(1.6, 0.35, pcz1 - pcz0, 1.2), mStageWood, mtx(pcx + 0.8, 0.175, (pcz0 + pcz1) / 2));
  const cv = curtainGeo(pcz1 - pcz0, Pz.h - 0.5, 9, 0.07);
  B.add(cv, mCove, mtx(pcx + 1.6, 0.35 + (Pz.h - 0.5) / 2 - 0.1, (pcz0 + pcz1) / 2, 0, Math.PI / 2, 0));
  solid(pcx, pcz0, pcx + 1.7, pcz1);
  const oooC = T.textCanvas(512, 256, (x, w, h) => {
    x.fillStyle = '#efe6cf'; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#b01818'; x.font = 'bold 64px Arial Black, sans-serif'; x.textAlign = 'center'; x.fillText('SORRY!', w / 2, 95);
    x.fillStyle = '#222'; x.font = 'bold 50px Arial, sans-serif'; x.fillText('OUT OF ORDER', w / 2, 175);
  });
  const ooo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshStandardMaterial({ map: T.canvasTex(oooC), roughness: 0.8 }));
  ooo.position.set(pcx + 1.75, 1.3, (pcz0 + pcz1) / 2); ooo.rotation.y = Math.PI / 2; ooo.rotation.z = 0.06; world.add(ooo);
  const coveSignC = T.textCanvas(1024, 256, (x, w, h) => {
    x.fillStyle = '#2b1a0e'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8c070'; x.font = 'bold 120px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Pirate Cove', w / 2, h / 2);
  });
  const coveSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: T.canvasTex(coveSignC), roughness: 0.7 }));
  coveSign.position.set(pcx + 1.62, Pz.h - 0.3, (pcz0 + pcz1) / 2); coveSign.rotation.y = Math.PI / 2; world.add(coveSign);

  // ---------- dining room furniture ----------
  const tableG = boxGeo(1.0, 0.05, 4.2, 1);
  const clothG = boxGeo(1.12, 0.3, 4.32, 1);
  const legG = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
  const hatG = new THREE.ConeGeometry(0.07, 0.2, 16, 1, true);
  const plateG = new THREE.CylinderGeometry(0.12, 0.1, 0.015, 20);
  const seatG = boxGeo(0.42, 0.04, 0.42), backG = boxGeo(0.42, 0.4, 0.03), chairLeg = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6);
  const hatC = T.textCanvas(128, 128, (x, w, h) => {
    const cols = ['#e83a8a', '#3a7be8', '#f2c230', '#33c27a'];
    for (let i = 0; i < 8; i++) { x.fillStyle = cols[i % 4]; x.fillRect(0, i * 16, w, 16); }
    x.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 20; i++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 4, 0, 7); x.fill(); }
  });
  const mHat = new THREE.MeshStandardMaterial({ map: T.canvasTex(hatC), roughness: 0.6, side: THREE.DoubleSide });
  const mChair = new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.4, metalness: 0.6 });
  for (const tx of [-6.5, -2.2, 2.2, 6.5]) {
    const tz = 32.5;
    B.add(tableG, mWhite, mtx(tx, 0.76, tz));
    B.add(clothG, mCloth, mtx(tx, 0.63, tz));
    for (const lx of [-0.4, 0.4]) for (const lz of [-1.9, 1.9]) B.add(legG, mChair, mtx(tx + lx, 0.36, tz + lz));
    solid(tx - 0.6, tz - 2.2, tx + 0.6, tz + 2.2);
    for (let i = 0; i < 5; i++) {
      const z = tz - 1.7 + i * 0.85;
      for (const side of [-1, 1]) {
        B.add(plateG, mWhite, mtx(tx + side * 0.3, 0.795, z));
        B.add(hatG, mHat, mtx(tx + side * 0.3 + 0.12, 0.89, z + 0.15, 0, 0, side * 0.1));
        const cx = tx + side * 0.82;
        B.add(seatG, mChair, mtx(cx, 0.46, z));
        B.add(backG, mChair, mtx(cx + side * 0.2, 0.68, z, 0, Math.PI / 2, 0));
        for (const a of [-0.17, 0.17]) for (const b of [-0.17, 0.17]) B.add(chairLeg, mChair, mtx(cx + a, 0.225, z + b));
      }
    }
  }
  // arcade cabinets on the right wall
  const arcadeC = (hue) => T.textCanvas(256, 200, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `hsl(${hue},80%,25%)`); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff0'; for (let i = 0; i < 30; i++) x.fillRect(Math.random() * w, Math.random() * h, 6, 6);
    x.fillStyle = '#fff'; x.font = 'bold 28px monospace'; x.fillText('INSERT COIN', 30, h - 20);
  });
  for (let i = 0; i < 3; i++) {
    const az = 27 + i * 1.1, ax = Pz.x1 - 0.45;
    B.add(boxGeo(0.7, 1.8, 0.8), i % 2 ? mPlasticBlue : mBlack, mtx(ax, 0.9, az));
    B.add(boxGeo(0.4, 0.06, 0.66), mBlack, mtx(ax - 0.42, 1.0, az, 0, 0, 0.3));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.42), new THREE.MeshBasicMaterial({ map: T.canvasTex(arcadeC(i * 120)), toneMapped: false }));
    scr.position.set(ax - 0.36, 1.35, az); scr.rotation.y = -Math.PI / 2; scr.rotation.x = 0; world.add(scr);
    solid(ax - 0.5, az - 0.4, ax + 0.4, az + 0.4);
  }
  // kid drawings + posters on the walls
  const pal = [['#5a3313', '#b07a3a'], ['#2a2266', '#6a5ad0'], ['#7a5a00', '#f1cd2c'], ['#6a1810', '#c4442c']];
  for (let i = 0; i < 12; i++) {
    const dc = T.kidDrawing(100 + i, pal[i % 4]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.33), new THREE.MeshStandardMaterial({ map: T.canvasTex(dc), roughness: 0.9 }));
    const left = i < 6; const k = i % 6;
    if (left) { m.position.set(Pz.x0 + 0.01, 1.55 + (k % 2) * 0.4 + Math.random() * 0.06, 36 + k * 0.5); m.rotation.y = Math.PI / 2; }
    else { m.position.set(-8 + k * 0.5 + Math.random() * 0.05, 1.5 + (k % 2) * 0.42, Pz.z0 + 0.01); }
    m.rotation.z = (Math.random() - 0.5) * 0.2; world.add(m);
  }
  const poster = T.textCanvas(512, 768, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a1036'); g.addColorStop(1, '#3a1a5a'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd84a'; x.font = 'bold 110px Impact, sans-serif'; x.textAlign = 'center'; x.fillText('PARTY', w / 2, 140); x.fillText('TIME!', w / 2, 250);
    for (let i = 0; i < 3; i++) { x.fillStyle = ['#a0612a', '#6a5ad0', '#f1cd2c'][i]; x.beginPath(); x.arc(110 + i * 145, 470, 62, 0, 7); x.fill(); x.beginPath(); x.ellipse(110 + i * 145, 640, 60, 90, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(92 + i * 145, 460, 12, 0, 7); x.arc(128 + i * 145, 460, 12, 0, 7); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(92 + i * 145, 462, 5, 0, 7); x.arc(128 + i * 145, 462, 5, 0, 7); x.fill(); }
  });
  for (const pz of [28, 39]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshStandardMaterial({ map: T.canvasTex(poster), roughness: 0.5 }));
    m.position.set(Pz.x1 - 0.01, 1.9, pz); m.rotation.y = -Math.PI / 2; world.add(m);
  }
  // bunting (party flags) across the ceiling
  const flagG = new THREE.BufferGeometry();
  flagG.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.22, 0], 3));
  flagG.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flagG.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  const flagMats = [0xe8384f, 0x3a7be8, 0xf2c230, 0x33c27a].map(c => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 }));
  for (let r = 0; r < 4; r++) {
    const z = 27 + r * 3.5;
    for (let i = 0; i < 44; i++) {
      const x = Pz.x0 + 0.5 + i * 0.48; const sag = -0.35 * Math.sin((i / 43) * Math.PI);
      B.add(flagG, flagMats[(i + r) % 4], mtx(x, Pz.h - 0.15 + sag, z));
    }
  }
  // exit sign + hallway door (closed) on right of stage
  B.add(boxGeo(1.0, 2.2, 0.06), mDoor, mtx(8.5, 1.1, Pz.z1 - 0.03));
  B.add(boxGeo(0.06, 0.06, 0.12), mSteel, mtx(8.1, 1.05, Pz.z1 - 0.1));
  const exitC = T.textCanvas(256, 96, (x, w, h) => { x.fillStyle = '#0b2a10'; x.fillRect(0, 0, w, h); x.fillStyle = '#3cff6a'; x.font = 'bold 64px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXIT', w / 2, h / 2 + 3); });
  for (const [x, y, z, ry] of [[8.5, 2.5, Pz.z1 - 0.06, Math.PI], [0, 2.8, Pz.z0 + 0.06, 0]]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: T.canvasTex(exitC), toneMapped: false }));
    e.position.set(x, y, z); e.rotation.y = ry; world.add(e);
  }

  // ---------- GARAGE interior ----------
  // workbench along the back wall
  const bx0 = -3.9, bx1 = 0.6, bz = G.z0 + 0.4;
  B.add(boxGeo(bx1 - bx0, 0.06, 0.75, 1.2), mBenchWood, mtx((bx0 + bx1) / 2, 0.92, bz));
  B.add(boxGeo(bx1 - bx0, 0.04, 0.7, 1.2), mBenchWood, mtx((bx0 + bx1) / 2, 0.25, bz));
  for (const x of [bx0 + 0.05, bx1 - 0.05, (bx0 + bx1) / 2]) for (const z of [bz - 0.32, bz + 0.32]) B.add(boxGeo(0.07, 0.9, 0.07, 1), mBenchWood, mtx(x, 0.45, z));
  solid(bx0 - 0.05, G.z0, bx1 + 0.05, bz + 0.4);
  // pegboard with tools
  B.add(boxGeo(bx1 - bx0, 1.2, 0.02, 1.2), mPeg, mtx((bx0 + bx1) / 2, 1.75, G.z0 + 0.02));
  const toolSil = (x, y, w, h, m) => B.add(boxGeo(w, h, 0.03), m, mtx(x, y, G.z0 + 0.05));
  for (let i = 0; i < 7; i++) { // wrenches of different sizes
    const x = -3.6 + i * 0.13, h = 0.18 + i * 0.03;
    toolSil(x, 1.95 - h / 2, 0.025, h, mSteel); toolSil(x, 1.95, 0.05, 0.04, mSteel);
  }
  for (let i = 0; i < 5; i++) { toolSil(-2.5 + i * 0.12, 1.7, 0.03, 0.14, i % 2 ? mPlasticYel : mRedTool); toolSil(-2.5 + i * 0.12, 1.57, 0.008, 0.13, mSteel); }
  toolSil(-1.5, 1.85, 0.32, 0.05, mSteel); toolSil(-1.38, 1.75, 0.06, 0.16, mBlack); // hand saw-ish
  toolSil(-0.9, 1.8, 0.05, 0.3, mBenchWood); toolSil(-0.9, 1.98, 0.16, 0.06, mGreyMetal); // hammer
  toolSil(-0.4, 1.6, 0.26, 0.2, mPlasticYel); toolSil(-0.4, 1.45, 0.08, 0.12, mBlack); // drill (on peg)
  // vise + clutter on bench
  B.add(boxGeo(0.2, 0.15, 0.25), mGreyMetal, mtx(0.3, 1.02, bz));
  B.add(boxGeo(0.45, 0.25, 0.3), mRedTool, mtx(-3.3, 1.07, bz)); // small toolbox
  B.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 16), mPlasticBlue, mtx(-2.6, 1.05, bz + 0.1));
  for (let i = 0; i < 6; i++) B.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 6), mSteel, mtx(-2.2 + Math.random() * 1.4, 0.957, bz + (Math.random() - 0.5) * 0.4));
  // big rolling tool chest (right back corner)
  B.add(boxGeo(1.2, 1.0, 0.6, 1), mRedTool, mtx(3.6, 0.55, G.z0 + 0.4));
  B.add(boxGeo(1.2, 0.5, 0.55, 1), mRedTool, mtx(3.6, 1.32, G.z0 + 0.38));
  for (let i = 0; i < 7; i++) B.add(boxGeo(1.0, 0.02, 0.02), mSteel, mtx(3.6, 0.2 + i * 0.17, G.z0 + 0.71));
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.22, 0.22]) B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), mRubber, mtx(3.6 + sx, 0.04, G.z0 + 0.4 + sz, Math.PI / 2, 0, 0));
  solid(2.95, G.z0, G.x1, G.z0 + 0.75);
  // metal shelving on the right wall with boxes
  const shX = G.x1 - 0.32;
  for (const y of [0.15, 0.75, 1.35, 1.95]) B.add(boxGeo(0.55, 0.03, 2.4), mGreyMetal, mtx(shX, y, -2.1));
  for (const z of [-3.28, -0.92]) for (const x of [-0.25, 0.25]) B.add(boxGeo(0.03, 2.05, 0.03), mGreyMetal, mtx(shX + x, 1.02, z));
  for (const [y, z, w, h, m] of [[0.17, -2.8, 0.45, 0.4, mCardboard], [0.17, -1.9, 0.45, 0.35, mCardboard], [0.77, -2.6, 0.4, 0.3, mPlasticBlue], [0.77, -1.6, 0.42, 0.45, mCardboard], [1.37, -2.9, 0.3, 0.25, mPlasticYel], [1.37, -2.1, 0.45, 0.3, mCardboard], [1.97, -2.4, 0.45, 0.4, mCardboard]])
    B.add(boxGeo(w, h, w * 1.3, 0.6), m, mtx(shX, y + h / 2, z, 0, Math.random() * 0.2 - 0.1, 0));
  solid(shX - 0.3, -3.3, G.x1, -0.9);
  // spare tyres + paint cans in front-left corner
  const tyre = new THREE.TorusGeometry(0.28, 0.11, 10, 24);
  for (let i = 0; i < 3; i++) B.add(tyre, mRubber, mtx(-3.9, 0.11 + i * 0.22, -1.0, Math.PI / 2, 0, 0));
  solid(-4.3, -1.4, -3.5, -0.6);
  for (let i = 0; i < 4; i++) B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 16), [mPlasticBlue, mWhite, mPlasticYel, mRedTool][i], mtx(-3.2 + i * 0.22, 0.12, -0.6));
  // computer desk on left wall (the shop terminal sits on it)
  const dz = -2.6;
  B.add(boxGeo(0.75, 0.05, 1.4, 1.2), mBenchWood, mtx(G.x0 + 0.4, 0.76, dz));
  for (const z of [dz - 0.65, dz + 0.65]) B.add(boxGeo(0.7, 0.74, 0.04), mBenchWood, mtx(G.x0 + 0.4, 0.37, z));
  B.add(boxGeo(0.4, 0.3, 0.45), mBlack, mtx(G.x0 + 0.3, 0.94, dz + 0.42)); // PC tower on its side
  B.add(boxGeo(0.25, 0.04, 0.5), mWhite, mtx(G.x0 + 0.62, 0.8, dz)); // keyboard
  solid(G.x0, dz - 0.75, G.x0 + 0.8, dz + 0.75);
  // repair stands (round steel platforms + back pole + clamp)
  const standG = new THREE.CylinderGeometry(0.62, 0.68, 0.09, 40);
  const ringG = new THREE.TorusGeometry(0.62, 0.012, 6, 48);
  for (const s of L.stands) {
    B.add(standG, mSteel, mtx(s.x, 0.045, s.z));
    B.add(ringG, mPlasticYel, mtx(s.x, 0.092, s.z, Math.PI / 2, 0, 0));
    B.add(boxGeo(0.07, 1.25, 0.07), mGreyMetal, mtx(s.x, 0.7, s.z - 0.42));
    B.add(boxGeo(0.3, 0.06, 0.18), mGreyMetal, mtx(s.x, 1.3, s.z - 0.33));
    solid(s.x - 0.55, s.z - 0.55, s.x + 0.55, s.z + 0.5);
  }
  // fluorescent fixtures in garage
  for (const x of [-2, 2]) {
    B.add(boxGeo(0.25, 0.08, 1.3), mGreyMetal, mtx(x, G.h - 0.04, -3.6));
    B.add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), mTube, mtx(x - 0.05, G.h - 0.09, -3.6, Math.PI / 2, 0, 0));
    B.add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), mTube, mtx(x + 0.05, G.h - 0.09, -3.6, Math.PI / 2, 0, 0));
  }

  B.build(world);

  // ---------- fake contact shadows & light pools ----------
  const shadowTex = radialTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  const blob = (x, z, w, d, y = 0.02, op = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: op }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 1; world.add(m);
  };
  for (const tx of [-6.5, -2.2, 2.2, 6.5]) blob(tx, 32.5, 2.6, 5.4);
  for (const s of L.stands) blob(s.x, s.z, 1.7, 1.7, 0.011);
  blob(-1.65, G.z0 + 0.4, 5.4, 1.4); blob(3.6, G.z0 + 0.45, 1.8, 1.1); blob(G.x1 - 0.32, -2.1, 1.0, 3.0);
  const poolTex = radialTex('rgba(255,190,110,0.5)', 'rgba(255,190,110,0)');
  for (const [x, z] of [[-7, L.street.z0 + 0.9], [7, L.street.z1 - 0.9]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); world.add(m);
  }

  // ---------- lights ----------
  const lights = { shadowCasters: [] };
  const hemi = new THREE.HemisphereLight(0x5a6aa0, 0x1a1510, 0.4); world.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb2ff, 0.5); moon.position.set(-20, 30, 25); world.add(moon);
  // garage: one shadowed spot (main) + soft fill point
  const gSpot = new THREE.SpotLight(0xf2f5ff, 34, 14, 1.25, 0.9, 1.6);
  gSpot.position.set(0, G.h - 0.12, -3.2); gSpot.target.position.set(0, 0, -3.8); world.add(gSpot, gSpot.target);
  lights.shadowCasters.push(gSpot);
  const gFill = new THREE.PointLight(0xe8eeff, 3, 9, 1.6); gFill.position.set(0, 2.4, -1.5); world.add(gFill);
  // street lamps
  const s1 = new THREE.PointLight(0xffb060, 40, 22, 1.5); s1.position.set(-7, 5.6, L.street.z0 + 0.9); world.add(s1);
  const s2 = new THREE.PointLight(0xffb060, 40, 22, 1.5); s2.position.set(7, 5.6, L.street.z1 - 0.9); world.add(s2);
  // pizzeria dining
  const d1 = new THREE.PointLight(0xfff0d8, 22, 16, 1.4); d1.position.set(-4, Pz.h - 0.4, 30); world.add(d1);
  const d2 = new THREE.PointLight(0xfff0d8, 22, 16, 1.4); d2.position.set(4, Pz.h - 0.4, 34); world.add(d2);
  dyn.push((t) => { // a dying fluorescent flicker
    const f = Math.sin(t * 37) * Math.sin(t * 13.3) > 0.85 ? 0.25 : 1; d2.intensity = 22 * f;
  });
  // stage spotlight (shadowed) + coloured wash
  const stSpot = new THREE.SpotLight(0xfff4e6, 120, 20, 0.85, 0.6, 1.4);
  stSpot.position.set(0, Pz.h - 0.8, St.z0 - 1.6); stSpot.target.position.set(0, St.h, St.z0 + 2.6); world.add(stSpot, stSpot.target);
  lights.shadowCasters.push(stSpot);
  const wash = new THREE.PointLight(0xc070ff, 10, 10, 1.5); wash.position.set(0, Pz.h - 0.6, St.z1 - 1.2); world.add(wash);
  dyn.push((t) => { wash.color.setHSL(0.78 + Math.sin(t * 0.4) * 0.08, 0.8, 0.6); });

  for (const l of lights.shadowCasters) {
    l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.02; l.shadow.radius = 4;
    l.shadow.camera.near = 0.3; l.shadow.camera.far = 14;
  }

  // ---------- floor height & collision ----------
  function floorY(x, z) {
    if (x > St.x0 && x < St.x1 && z >= St.z0 && z < St.z1) return St.h;
    if (Math.abs(x) < St.stairX && z > St.stairZ0 && z < St.z0) return St.h * (z - St.stairZ0) / (St.z0 - St.stairZ0);
    if (x > Pz.x0 && x < pcx + 1.6 && z > pcz0 && z < pcz1) return 0.35;
    return 0;
  }
  // world bounds
  solid(-60, -40, 60, -39); solid(-60, 79, 60, 80); solid(-61, -40, -60, 80); solid(60, -40, 61, 80);

  return {
    group: world, colliders, floorY, lights, dyn,
    anchors: {
      terminal: { pos: new THREE.Vector3(G.x0 + 0.07, 1.78, dz), rotY: Math.PI / 2, w: 1.7, h: 1.05 },
      board: { pos: new THREE.Vector3(2.55, 2.3, G.z0 + 0.04), rotY: 0, w: 2.6, h: 1.05 },
      stage: St, stands: L.stands,
    },
    update(t) { for (const f of dyn) f(t); },
  };
}

// Push a circle (player) out of all AABB colliders. Returns corrected x,z.
export function collide(colliders, x, z, r = 0.28) {
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      const cx = Math.max(c.x0, Math.min(x, c.x1)), cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = (r - d) / d; x += dx * push; z += dz * push; }
        else { // inside: push out along the shortest axis
          const l = x - c.x0 + r, rr = c.x1 - x + r, f = z - c.z0 + r, b = c.z1 - z + r;
          const m = Math.min(l, rr, f, b);
          if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === f) z = c.z0 - r; else z = c.z1 + r;
        }
      }
    }
  }
  return [x, z];
}
