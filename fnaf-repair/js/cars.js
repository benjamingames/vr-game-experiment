// Traffic on the night street. Each car is 5 merged meshes (paint, glass, dark trim,
// lamps, headlight pool), so a handful of cars costs very few draw calls.
// Cars are axis-aligned along X; hit tests are simple 2D boxes against the player.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L } from './world.js';

const HALF_LEN = 2.25, HALF_WID = 0.92, PLAYER_R = 0.3;

// ---- small geometry helpers (everything ends up non-indexed with position/normal/uv/color) ----
function prep(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (color) {
    const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return g;
}
function quad(p0, p1, p2, p3) { // 4 points (counter-clockwise seen from the front)
  const g = new THREE.BufferGeometry();
  const v = [p0, p1, p2, p0, p2, p3].flatMap(p => p);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}
function sideShape(pts, z, flip) { // flat polygon in the XY plane at depth z, facing +z (or -z when flip)
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(sh);
  if (flip) g.scale(1, 1, -1), g.index && flipWinding(g);
  g.translate(0, 0, z);
  return g;
}
function flipWinding(g) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } g.computeVertexNormals(); }
function extrudeProfile(pts, depth, bevel) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}
function box(w, h, d, x, y, z, color) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return prep(g, color); }

// ---- car body types (side profiles, forward = +X) ----
const TYPES = {
  sedan: {
    body: [[-2.2, 0.28], [2.2, 0.28], [2.22, 0.55], [1.9, 0.76], [1.0, 0.82], [-1.3, 0.82], [-2.0, 0.78], [-2.2, 0.6]],
    cabin: [[-1.3, 0.8], [1.05, 0.8], [0.45, 1.4], [-0.85, 1.4]], cabinW: 1.62,
    side: [[[-0.1, 0.9], [0.907, 0.9], [0.48, 1.33], [-0.1, 1.33]], [[-1.178, 0.9], [-0.2, 0.9], [-0.2, 1.33], [-0.864, 1.33]]],
    wind: [[0.99, 0.88], [0.5, 1.33]], rear: [[-1.2, 0.88], [-0.8, 1.33]],
  },
  hatch: {
    body: [[-2.0, 0.28], [2.0, 0.28], [2.02, 0.55], [1.75, 0.74], [0.95, 0.8], [-1.9, 0.8], [-2.0, 0.6]],
    cabin: [[-1.9, 0.78], [0.95, 0.78], [0.35, 1.42], [-1.7, 1.42]], cabinW: 1.62,
    side: [[[-0.1, 0.9], [0.86, 0.9], [0.42, 1.35], [-0.1, 1.35]], [[-1.8, 0.9], [-0.2, 0.9], [-0.2, 1.35], [-1.62, 1.35]]],
    wind: [[0.9, 0.88], [0.42, 1.35]], rear: null,
  },
  van: {
    body: [[-2.25, 0.28], [2.25, 0.28], [2.27, 0.55], [2.0, 0.72], [1.35, 0.8], [-2.25, 0.8]],
    cabin: [[-2.25, 0.78], [1.35, 0.78], [1.1, 1.85], [-2.25, 1.85]], cabinW: 1.7,
    side: [[[0.25, 1.0], [1.28, 1.0], [1.05, 1.72], [0.25, 1.72]]],
    wind: [[1.32, 0.98], [1.1, 1.74]], rear: null,
  },
};
const PAINTS = [0xb5191f, 0x1f4aa8, 0xd9d4c4, 0x1c1c20, 0x2f7d46, 0xd4a017, 0x6d6f76, 0x7a2a8c, 0xc85a1c];

function buildType(t) {
  const half = HALF_WID;
  const paint = [], glass = [], dark = [], lamp = [];
  // lower body + cabin (body coloured)
  paint.push(prep(extrudeProfile(t.body, half * 2, 0.07)));
  const cabin = extrudeProfile(t.cabin, t.cabinW, 0.06); paint.push(prep(cabin));
  // glass: side windows both sides, windshield, rear window
  const cw = t.cabinW / 2 + 0.065;
  for (const poly of t.side) { glass.push(prep(sideShape(poly, cw, false))); glass.push(prep(sideShape(poly, -cw, true))); }
  const [wb, wt] = t.wind, gz = cw - 0.1;
  glass.push(prep(quad([wb[0] + 0.012, wb[1], gz], [wb[0] + 0.012, wb[1], -gz], [wt[0] + 0.012, wt[1], -gz + 0.08], [wt[0] + 0.012, wt[1], gz - 0.08])));
  if (t.rear) { const [rb, rt] = t.rear; glass.push(prep(quad([rb[0] - 0.012, rb[1], -gz], [rb[0] - 0.012, rb[1], gz], [rt[0] - 0.012, rt[1], gz - 0.08], [rt[0] - 0.012, rt[1], -gz + 0.08]))); }
  // wheels, bumpers, grille, plates
  const front = Math.max(...t.body.map(p => p[0])), back = Math.min(...t.body.map(p => p[0]));
  for (const wx of [front - 0.85, back + 0.8]) for (const wz of [-half + 0.08, half - 0.08]) {
    const w = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18); w.rotateX(Math.PI / 2); w.translate(wx, 0.34, wz); dark.push(prep(w));
    const hub = new THREE.CylinderGeometry(0.19, 0.19, 0.27, 12); hub.rotateX(Math.PI / 2); hub.translate(wx, 0.34, wz); lamp.push(prep(hub, 0x8a8e96));
  }
  dark.push(box(0.16, 0.2, half * 2 + 0.04, front + 0.02, 0.38, 0, 0));
  dark.push(box(0.16, 0.2, half * 2 + 0.04, back - 0.02, 0.38, 0, 0));
  dark.push(box(0.03, 0.14, 0.9, front + 0.1, 0.58, 0, 0)); // grille
  // lamps (vertex-coloured, unlit so they glow)
  for (const s of [-1, 1]) {
    lamp.push(box(0.08, 0.1, 0.34, front + 0.04, 0.64, s * 0.62, 0xfff2c8));
    lamp.push(box(0.08, 0.09, 0.3, back - 0.04, 0.66, s * 0.64, 0xff2a1a));
  }
  const lampHeight = lamp.map(g => g); // (kept separate from the glow pool on purpose)
  return {
    paint: mergeGeometries(paint), glass: mergeGeometries(glass), dark: mergeGeometries(dark), lamp: mergeGeometries(lampHeight),
    front, back,
  };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(0, 64, 4, 0, 64, 250); g.addColorStop(0, 'rgba(255,238,190,0.85)'); g.addColorStop(0.35, 'rgba(255,225,160,0.25)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 54); x.lineTo(256, 0); x.lineTo(256, 128); x.lineTo(0, 74); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createCars(scene, { sfx } = {}) {
  const group = new THREE.Group(); group.name = 'traffic'; scene.add(group);
  const types = {}; for (const k in TYPES) types[k] = buildType(TYPES[k]);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.08, metalness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.7, metalness: 0.2 });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.8 });
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const paints = PAINTS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.55 }));

  const zMid = (L.street.z0 + L.street.z1) / 2;
  const lanes = [{ z: zMid - 2, dir: 1, timer: 1.0 }, { z: zMid + 2, dir: -1, timer: 3.0 }];
  const EDGE = 64;
  const pool = [];
  const typeNames = Object.keys(TYPES);
  for (let i = 0; i < 8; i++) {
    const tn = typeNames[i % typeNames.length], T = types[tn];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(T.paint, paints[i % paints.length]), new THREE.Mesh(T.glass, glassMat), new THREE.Mesh(T.dark, darkMat), new THREE.Mesh(T.lamp, lampMat));
    const glow = new THREE.Mesh(glowGeo, glowMat); glow.scale.set(7, 1, 4); glow.position.set(T.front + 3.4, 0.04, 0); glow.renderOrder = 3; g.add(glow);
    g.visible = false; group.add(g);
    pool.push({ g, active: false, lane: null, x: 0, speed: 0, honked: false });
  }

  function spawn(lane) {
    const car = pool.find(c => !c.active); if (!car) return;
    car.active = true; car.lane = lane; car.honked = false;
    car.x = -lane.dir * EDGE; car.speed = 9 + Math.random() * 7;
    car.g.visible = true;
    car.g.position.set(car.x, 0, lane.z); car.g.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    car.g.children[0].material = paints[Math.floor(Math.random() * paints.length)];
  }

  return {
    group,
    // px,pz: player's head position. Returns { dir, speed } if a car hit the player this frame.
    update(dt, px, pz) {
      for (const lane of lanes) {
        lane.timer -= dt;
        if (lane.timer <= 0) { lane.timer = 2.8 + Math.random() * 4.5; spawn(lane); }
      }
      let hit = null;
      for (const c of pool) {
        if (!c.active) continue;
        // slow down behind a leader in the same lane
        let v = c.speed;
        for (const o of pool) if (o !== c && o.active && o.lane === c.lane) {
          const gap = (o.x - c.x) * c.lane.dir;
          if (gap > 0 && gap < 11) v = Math.min(v, o.speed * Math.max(0.2, (gap - 5.5) / 5.5));
        }
        c.x += c.lane.dir * v * dt;
        c.g.position.x = c.x;
        if (Math.abs(c.x) > EDGE + 4) { c.active = false; c.g.visible = false; continue; }
        const dx = px - c.x, dz = pz - c.lane.z;
        // honk when it is about to run you over
        if (!c.honked && Math.abs(dz) < HALF_WID + 1.2 && dx * c.lane.dir > 0 && dx * c.lane.dir < 16) { c.honked = true; sfx?.horn(); }
        if (!hit && Math.abs(dx) < HALF_LEN + PLAYER_R && Math.abs(dz) < HALF_WID + PLAYER_R) hit = { dir: c.lane.dir, speed: v, car: c };
      }
      return hit;
    },
  };
}
