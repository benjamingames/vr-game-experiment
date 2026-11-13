// Boss Arena: the map. A big circular metal stage, a fence ring with four gates, tiered stands
// full of smiley-face balls, truss lights and a jumbotron. Floor level is y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

export const R = 15;            // stage radius
export const FENCE_R = 16.6;    // fence ring radius
const GATE_HALF_W = 2.9;        // half width of a gate opening (m)
const GATE_HALF = Math.asin(GATE_HALF_W / FENCE_R);
const BLEACH_R0 = 19.5, TREAD = 2.4, ROWS = 7, RISE = 0.9;

// world angle phi: 0 = north (-Z), pi/2 = east (+X), pi = south (+Z)
const pol = (r, phi, y = 0) => new THREE.Vector3(Math.sin(phi) * r, y, -Math.cos(phi) * r);

// ---------- geometry helpers ----------
function sector(rIn, rOut, y, a0, a1, seg, uvs) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * i / seg;
    for (const r of [rIn, rOut]) { const p = pol(r, a, y); pos.push(p.x, p.y, p.z); nor.push(0, 1, 0); uv.push(a * (rIn + rOut) / 2 / uvs, r / uvs); }
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1); }
  }
  return geo(pos, nor, uv, idx);
}
function wall(r, y0, y1, a0, a1, seg, inward, uvs) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * i / seg;
    for (const y of [y0, y1]) { const p = pol(r, a, y); pos.push(p.x, p.y, p.z); const n = pol(1, a); nor.push(inward ? -n.x : n.x, 0, inward ? -n.z : n.z); uv.push(a * r / uvs, y / uvs); }
    if (i < seg) { const b = i * 2; if (inward) idx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1); else idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
  }
  return geo(pos, nor, uv, idx);
}
function geo(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
class ArcCurve extends THREE.Curve {
  constructor(r, a0, a1, y) { super(); this.r = r; this.a0 = a0; this.a1 = a1; this.y = y; }
  getPoint(t, out = new THREE.Vector3()) { return out.copy(pol(this.r, this.a0 + (this.a1 - this.a0) * t, this.y)); }
}

export function buildArena(scene, { quality = 'high' } = {}) {
  const low = quality === 'low';
  const root = new THREE.Group(); scene.add(root);
  const gateAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const gateNames = ['GATE  N', 'GATE  E', 'GATE  S', 'GATE  W'];

  // boss spawn pads: six around the stage, facing the middle
  const bossSpots = [];
  for (let i = 0; i < 6; i++) {
    const phi = Math.PI / 6 + i * Math.PI / 3 + Math.PI / 6 * 0;
    const p = pol(9.2, phi + Math.PI / 6);
    bossSpots.push({ x: p.x, z: p.z, facing: Math.atan2(-p.x, -p.z) });
  }

  // ---------- materials ----------
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, metalness: 0.95, roughness: 0.32 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.85, roughness: 0.48 });
  const panel = new THREE.MeshStandardMaterial({ map: T.steelPanel(), metalness: 0.8, roughness: 0.5 });
  panel.map.repeat.set(3, 1);
  const hazard = new THREE.MeshStandardMaterial({ map: T.hazardStripes(), metalness: 0.4, roughness: 0.55 });
  const top = T.stageTop(R, bossSpots);
  const tread = T.treadTile(); tread.repeat.set(30, 30);
  const stageMat = new THREE.MeshStandardMaterial({
    map: top.map, emissive: 0xffffff, emissiveMap: top.emissive, emissiveIntensity: 1.5,
    bumpMap: tread, bumpScale: 1.6, metalness: 0.88, roughness: 0.36,
  });
  const glowMats = {
    cyan: new THREE.MeshBasicMaterial({ color: 0x35d0ff, toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffa23a, toneMapped: false }),
    white: new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }),
  };

  // ---------- ground, outer wall, sky ----------
  const conc = T.concreteTex(); conc.repeat.set(16, 16);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(46, 64), new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.2; root.add(ground);

  const outer = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 26, 96, 1, true), new THREE.MeshStandardMaterial({ map: T.steelPanel(), color: 0x6c7480, side: THREE.BackSide, metalness: 0.6, roughness: 0.6 }));
  outer.material.map.repeat.set(40, 3); outer.position.y = 11.8; root.add(outer);
  for (const [y, c] of [[7.2, glowMats.cyan], [16.5, glowMats.amber]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(44.7, 0.14, 6, 128), c); t.rotation.x = Math.PI / 2; t.position.y = y; root.add(t); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(45, 0.6, 8, 96), darkSteel); rim.rotation.x = Math.PI / 2; rim.position.y = 24.8; root.add(rim);

  // night sky: dark dome + stars
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, vertexColors: true }));
  { const p = sky.geometry.attributes.position, col = new Float32Array(p.count * 3), c1 = new THREE.Color(0x02030a), c2 = new THREE.Color(0x101a3a);
    for (let i = 0; i < p.count; i++) { const k = Math.pow(Math.max(0, 1 - Math.abs(p.getY(i)) / 300), 2.5); const c = c1.clone().lerp(c2, k); col.set([c.r, c.g, c.b], i * 3); }
    sky.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  root.add(sky);
  { const n = 500, pts = new Float32Array(n * 3), rnd = T.rng(5);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, e = 0.12 + rnd() * 1.3, r = 280; pts.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }))); }

  // ---------- the stage ----------
  const stageTopMesh = new THREE.Mesh(new THREE.CircleGeometry(R, 128), stageMat);
  stageTopMesh.rotation.x = -Math.PI / 2; root.add(stageTopMesh);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.7, 1.2, 96, 1, true), panel); body.position.y = -0.6; root.add(body);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.1, 8, 128), steel); lip.rotation.x = Math.PI / 2; lip.position.y = -0.02; root.add(lip);
  const edgeGlow = new THREE.Mesh(new THREE.RingGeometry(14.45, 14.7, 128), glowMats.cyan);
  edgeGlow.rotation.x = -Math.PI / 2; edgeGlow.position.y = 0.012; root.add(edgeGlow);
  const hazardBand = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.72, R + 0.72, 0.18, 96, 1, true), hazard); hazardBand.position.y = -1.1; hazard.map.repeat.set(48, 1); root.add(hazardBand);

  // ---------- fence ring ----------
  const rails = [];
  for (let s = 0; s < 4; s++) {
    const a0 = gateAngles[s] + GATE_HALF + 0.012, a1 = gateAngles[s] + Math.PI / 2 - GATE_HALF - 0.012;
    for (const y of [0.22, 1.6, 3.05]) rails.push(new THREE.TubeGeometry(new ArcCurve(FENCE_R, a0, a1, y), 40, y > 3 ? 0.09 : 0.065, 8, false));
  }
  root.add(new THREE.Mesh(mergeGeometries(rails), steel));
  { const bars = [];
    const m = new THREE.Matrix4();
    const per = 0.2, inst = [];
    for (let s = 0; s < 4; s++) {
      const a0 = gateAngles[s] + GATE_HALF + 0.03, a1 = gateAngles[s] + Math.PI / 2 - GATE_HALF - 0.03, n = Math.floor((a1 - a0) * FENCE_R / per);
      for (let i = 0; i <= n; i++) inst.push(a0 + (a1 - a0) * i / n);
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.038, 0.038, 3.1, 6), darkSteel, inst.length);
    inst.forEach((a, i) => { const p = pol(FENCE_R, a, 1.58); m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); });
    root.add(im);
    // heavier posts every 15 degrees
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 3.4, 0.34), panel, 20); let pi = 0;
    for (let s = 0; s < 4; s++) for (let k = 1; k <= 4; k++) { const a = gateAngles[s] + k * Math.PI / 10; if (pi >= 20) break; if (Math.abs(a - (gateAngles[s] + Math.PI / 2)) < GATE_HALF * 1.5) continue; const p = pol(FENCE_R, a, 1.7); m.makeRotationY(-a); m.setPosition(p); posts.setMatrixAt(pi++, m); }
    posts.count = pi; root.add(posts); }

  // ---------- gates + tunnels ----------
  const gates = [];
  const doorBarGeo = new THREE.CylinderGeometry(0.035, 0.035, 3.0, 6);
  gateAngles.forEach((phi, gi) => {
    const g = new THREE.Group(); g.position.copy(pol(FENCE_R, phi)); g.rotation.y = -phi; root.add(g);   // local +x tangent, -z outward
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 0.7), panel); post.position.set(sx * (GATE_HALF_W + 0.3), 2.1, 0); g.add(post);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.1, 0.74), hazard); stripe.position.set(sx * (GATE_HALF_W + 0.3), 0.55, 0); g.add(stripe);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glowMats.amber); lamp.position.set(sx * (GATE_HALF_W + 0.3), 4.4, 0); g.add(lamp);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W * 2 + 1.2, 0.7, 0.8), panel); beam.position.y = 3.95; g.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: T.gateSign(gateNames[gi]), toneMapped: false })); sign.position.set(0, 3.95, 0.41); sign.rotation.y = 0; g.add(sign);
    const doors = [];
    for (const sx of [-1, 1]) {
      const d = new THREE.Group(); d.position.set(sx * GATE_HALF_W / 2, 0, 0.05);
      for (const y of [0.18, 1.7, 3.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W, 0.14, 0.14), steel); r.position.y = y; d.add(r); }
      for (const side of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.25, 0.14), steel); r.position.set(side * (GATE_HALF_W / 2 - 0.07), 1.7, 0); d.add(r); }
      const n = 7; for (let i = 0; i < n; i++) { const b = new THREE.Mesh(doorBarGeo, darkSteel); b.position.set(-GATE_HALF_W / 2 + (i + 0.5) * GATE_HALF_W / n, 1.7, 0); d.add(b); }
      const kick = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W - 0.1, 0.5, 0.16), hazard); kick.position.y = 0.45; d.add(kick);
      d.userData.closedX = d.position.x; d.userData.dir = sx; g.add(d); doors.push(d);
    }
    // tunnel through the stands
    const tl = 26, tz = -0.6 - tl / 2;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W * 2, 0.2, tl), darkSteel); floor.position.set(0, -0.1, tz); g.add(floor);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, tl), panel); w.position.set(sx * (GATE_HALF_W + 0.25), 3.2, tz); g.add(w); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF_W * 2 + 1, 0.4, tl), darkSteel); roof.position.set(0, 4.5, tz); g.add(roof);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.3), glowMats.white); l.position.set(0, 4.27, -3 - i * 4.8); g.add(l); }
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(GATE_HALF_W * 2, 4.4), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false })); portal.position.set(0, 2.2, -0.6 - tl + 0.1); portal.rotation.y = 0; g.add(portal);
    gates.push({ group: g, doors, k: 0, target: 0, phi });
  });

  // ---------- stands (bleachers) ----------
  const bleachTex = T.bleacherTex(); bleachTex.repeat.set(1, 1);
  const treadMat = new THREE.MeshStandardMaterial({ map: bleachTex, metalness: 0.55, roughness: 0.55 });
  const riserMat = new THREE.MeshStandardMaterial({ color: 0x191d27, metalness: 0.7, roughness: 0.6 });
  const tops = [], risers = [];
  const gap = GATE_HALF * 1.45;
  for (let s = 0; s < 4; s++) {
    const a0 = gateAngles[s] + gap, a1 = gateAngles[s] + Math.PI / 2 - gap, seg = low ? 14 : 28;
    for (let i = 0; i < ROWS; i++) {
      const r0 = BLEACH_R0 + i * TREAD, y = 0.4 + i * RISE, yPrev = i === 0 ? -1.2 : y - RISE;
      tops.push(sector(r0, r0 + TREAD, y, a0, a1, seg, 2.5));
      risers.push(wall(r0, yPrev, y, a0, a1, seg, true, 2.5));
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(tops), treadMat), new THREE.Mesh(mergeGeometries(risers), riserMat));
  { // railing above the first row
    const rl = []; for (let s = 0; s < 4; s++) rl.push(new THREE.TubeGeometry(new ArcCurve(BLEACH_R0 - 0.2, gateAngles[s] + gap, gateAngles[s] + Math.PI / 2 - gap, 1.4), 40, 0.05, 6, false));
    root.add(new THREE.Mesh(mergeGeometries(rl), steel)); }

  // ---------- the audience: little balls with smiley faces ----------
  const faceMap = T.faceTex();
  const ballGeo = new THREE.SphereGeometry(0.34, low ? 10 : 16, low ? 8 : 12);
  const ballMat = new THREE.MeshStandardMaterial({ map: faceMap, roughness: 0.5, metalness: 0.0 });
  const spots = [], rnd = T.rng(99), spacing = low ? 0.95 : 0.78, lines = low ? 1 : 2;
  const palette = [0xffd23f, 0xff8a3d, 0xff5d8f, 0x5ec8ff, 0x7df08a, 0xb48cff, 0xfff27a, 0xff6b6b, 0x62e6d0, 0xffffff];
  for (let s = 0; s < 4; s++) {
    const a0 = gateAngles[s] + gap + 0.012, a1 = gateAngles[s] + Math.PI / 2 - gap - 0.012;
    for (let i = 0; i < ROWS; i++) for (let l = 0; l < lines; l++) {
      const r = BLEACH_R0 + i * TREAD + (lines === 1 ? 1.15 : 0.75 + l * 0.9), y = 0.4 + i * RISE + 0.34;
      const n = Math.floor((a1 - a0) * r / spacing);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.045) continue;                                     // a few empty seats
        const a = a0 + (a1 - a0) * (k + (l ? 0.5 : 0)) / n;
        spots.push({ a, r, y, ph: rnd() * 6.28, row: i, col: palette[(rnd() * palette.length) | 0] });
      }
    }
  }
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  spots.forEach((s, i) => {
    const p = pol(s.r, s.a, s.y);
    const face = Math.atan2(-p.x, -p.z) + (rnd() - 0.5) * 0.5;           // look toward the stage
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), face);
    m4.compose(p, q, sc); balls.setMatrixAt(i, m4);
    s.baseY = s.y; s.idx = i; balls.setColorAt(i, col.setHex(s.col));
  });
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage); balls.frustumCulled = false; root.add(balls);
  const bm = balls.instanceMatrix.array;

  // ---------- lights: truss ring, spotlights with beams ----------
  const truss = new THREE.Mesh(new THREE.TorusGeometry(26, 0.35, 8, 96), darkSteel); truss.rotation.x = Math.PI / 2; truss.position.y = 23; root.add(truss);
  const truss2 = new THREE.Mesh(new THREE.TorusGeometry(26, 0.12, 6, 96), glowMats.cyan); truss2.rotation.x = Math.PI / 2; truss2.position.y = 22.55; root.add(truss2);
  const lamps = [];
  for (let i = 0; i < 12; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.8, 10), darkSteel); h.position.copy(pol(26, i * Math.PI / 6, 22.4)); root.add(h);
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), glowMats.white); l.rotation.x = Math.PI / 2; l.position.copy(h.position).add(new THREE.Vector3(0, -0.41, 0)); root.add(l); lamps.push(h); }
  const hemi = new THREE.HemisphereLight(0x8fa4ff, 0x30241c, 0.9); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xdfe8ff, 0.6); sun.position.set(6, 30, 8); root.add(sun);
  const beamColors = [0x58b4ff, 0xff7a3a, 0xc07bff, 0x6dffb0];
  const spotsL = [], beams = [];
  const beamGeo = new THREE.ConeGeometry(2.6, 30, low ? 14 : 24, 1, true); beamGeo.translate(0, -15, 0); beamGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const sl = new THREE.SpotLight(beamColors[i], 1400, 70, 0.34, 0.55, 2);
    sl.position.copy(pol(24, i * Math.PI / 2 + Math.PI / 4, 22)); sl.target.position.set(0, 0, 0); root.add(sl, sl.target); spotsL.push(sl);
    const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: beamColors[i], transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    b.position.copy(sl.position); root.add(b); beams.push(b);
  }
  const centreLight = new THREE.PointLight(0xfff0d8, 300, 60, 2); centreLight.position.set(0, 12, 0); root.add(centreLight);

  // ---------- jumbotron ----------
  const jumbo = new THREE.Group(); jumbo.position.y = 15.5; root.add(jumbo);
  jumbo.add(new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.8, 9.4), darkSteel));
  const faces = [T.screenTex('BOSS ARENA', 'ROUND 1  -  FIGHT!'), T.screenTex('REPAIR  KO', 'BIG  BOSSES  INCOMING', '#ff7a3a')];
  [[0, 0, 4.72, 0], [4.72, 0, 0, Math.PI / 2], [0, 0, -4.72, Math.PI], [-4.72, 0, 0, -Math.PI / 2]].forEach(([x, y, z, ry], i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.4), new THREE.MeshBasicMaterial({ map: faces[i % 2], toneMapped: false })); s.position.set(x, y, z); s.rotation.y = ry; jumbo.add(s); });
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 12, 6), darkSteel); c.position.set(x, 8.4, z); jumbo.add(c); }

  // ---------- gameplay helpers ----------
  const MAX_R = FENCE_R - 0.8, pad = { x: 0, z: 5.6, r: 1.0 };
  function collide(x, z, r = 0) {
    let d = Math.hypot(x, z);
    if (d > MAX_R) { x *= MAX_R / d; z *= MAX_R / d; }
    if (pad.on) { const dx = x - pad.x, dz = z - pad.z, dd = Math.hypot(dx, dz), lim = pad.r + 0.3 + r; if (dd < lim && dd > 0.0001) { x = pad.x + dx / dd * lim; z = pad.z + dz / dd * lim; } }
    return [x, z];
  }
  function setGate(i, open) { gates[i].target = open ? 1 : 0; }
  function setAllGates(open) { gates.forEach((_, i) => setGate(i, open)); }
  const state = { open: false };
  function update(t, dt) {
    // spotlights sweep around the stage
    spotsL.forEach((sl, i) => {
      const a = t * 0.35 + i * Math.PI / 2, rr = 6 + Math.sin(t * 0.5 + i) * 3;
      sl.target.position.set(Math.sin(a) * rr, 0, -Math.cos(a) * rr); sl.target.updateMatrixWorld();
      beams[i].lookAt(sl.target.position);
    });
    // gates slide
    for (const g of gates) {
      g.k += Math.sign(g.target - g.k) * Math.min(Math.abs(g.target - g.k), dt * 0.7);
      const e = g.k * g.k * (3 - 2 * g.k);
      for (const d of g.doors) d.position.x = d.userData.closedX + d.userData.dir * e * (GATE_HALF_W - 0.15);
    }
    // the crowd bounces; a cheer wave runs round the stands
    const cheer = 0.5 + 0.5 * Math.sin(t * 0.4);
    for (const s of spots) {
      const wave = Math.max(0, Math.sin(s.a * 5 - t * 2.2 + s.row * 0.5));
      const hop = Math.max(0, Math.sin(t * (3 + (s.ph % 2)) + s.ph)) * 0.05 + wave * wave * (0.12 + cheer * 0.2);
      bm[s.idx * 16 + 13] = s.baseY + hop;
    }
    balls.instanceMatrix.needsUpdate = true;
  }

  return { root, R, FENCE_R, gates, bossSpots, pad, collide, setGate, setAllGates, update, edgeGlow, glowMats, spotsL, state,
    floorY: () => 0, ballCount: spots.length };
}
