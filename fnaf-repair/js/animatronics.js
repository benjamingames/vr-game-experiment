// Loads the animatronic models and cuts each one into separate "broken parts".
// Rigged models are cut along their skeleton (each triangle follows its strongest bone);
// unrigged models (Chica) are cut by where each piece sits on the body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// R15-style split (like a Roblox R15 avatar): 15 parts per animatronic. A part whose
// piece of the model is too small to be worth a pickup is merged into its neighbour,
// so an animatronic can end up with fewer than 15.
export const REGIONS = ['head', 'torsoU', 'torsoL', 'armLU', 'armLL', 'handL', 'armRU', 'armRL', 'handR', 'legLU', 'legLL', 'footL', 'legRU', 'legRL', 'footR'];
export const REGION_LABEL = {
  head: 'Head', torsoU: 'Upper Torso', torsoL: 'Lower Torso',
  armLU: 'Left Upper Arm', armLL: 'Left Lower Arm', handL: 'Left Hand',
  armRU: 'Right Upper Arm', armRL: 'Right Lower Arm', handR: 'Right Hand',
  legLU: 'Left Upper Leg', legLL: 'Left Lower Leg', footL: 'Left Foot',
  legRU: 'Right Upper Leg', legRL: 'Right Lower Leg', footR: 'Right Foot',
  cupcake: 'Mr. Cupcake',
};
// How the six coarse regions are cut along their long axis (fractions from the top).
const SPLITS = {
  torso: { names: ['torsoU', 'torsoL'], cuts: [0.55] },
  armL: { names: ['armLU', 'armLL', 'handL'], cuts: [0.4, 0.8] },
  armR: { names: ['armRU', 'armRL', 'handR'], cuts: [0.4, 0.8] },
  legL: { names: ['legLU', 'legLL', 'footL'], cuts: [0.42, 0.86] },
  legR: { names: ['legRU', 'legRL', 'footR'], cuts: [0.42, 0.86] },
};
// Merge a too-small part into the one above it on the same limb.
const MERGE_INTO = { torsoL: 'torsoU', armLL: 'armLU', handL: 'armLL', armRL: 'armRU', handR: 'armRL', legLL: 'legLU', footL: 'legLL', legRL: 'legRU', footR: 'legRL' };
const MERGE_ORDER = ['handL', 'handR', 'footL', 'footR', 'armLL', 'armRL', 'legLL', 'legRL', 'torsoL'];

// Cut each coarse region (head/torso/arms/legs) into R15-style sub-parts along its long axis.
function subdivideRegions(pieces) {
  const cent = [];     // { p, t, c }
  const byRegion = {};
  for (const p of pieces) {
    for (let t = 0; t < p.triCount; t++) {
      const c = new THREE.Vector3();
      for (let k = 0; k < 3; k++) { const i = p.index ? p.index[t*3+k] : t*3+k; c.x += p.P[i*3]; c.y += p.P[i*3+1]; c.z += p.P[i*3+2]; }
      c.divideScalar(3);
      const e = { p, t, c }; (byRegion[p.triRegion[t]] ||= []).push(e);
    }
  }
  for (const base in SPLITS) {
    const list = byRegion[base]; if (!list || list.length < 4) continue;
    const { names, cuts } = SPLITS[base];
    const sorted = list.slice().sort((a, b) => b.c.y - a.c.y);
    const n = Math.max(1, Math.floor(sorted.length * 0.12));
    const top = new THREE.Vector3(), bot = new THREE.Vector3();
    for (let i = 0; i < n; i++) { top.add(sorted[i].c); bot.add(sorted[sorted.length - 1 - i].c); }
    top.divideScalar(n); bot.divideScalar(n);
    const axis = bot.clone().sub(top); const len = axis.length();
    if (len < 1e-4) { for (const e of list) e.p.triRegion[e.t] = names[0]; continue; }
    axis.divideScalar(len);
    // use the real extent of the projection so the cuts land on the limb itself
    let lo = Infinity, hi = -Infinity;
    const proj = list.map(e => e.c.clone().sub(top).dot(axis));
    for (const v of proj) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    list.forEach((e, i) => {
      const f = (proj[i] - lo) / Math.max(1e-6, hi - lo);
      let k = 0; while (k < cuts.length && f >= cuts[k]) k++;
      e.p.triRegion[e.t] = names[k];
    });
  }
  // merge tiny sub-parts into their neighbour
  let total = 0; for (const p of pieces) total += p.triCount;
  const minTris = Math.max(40, total * 0.006);
  for (const name of MERGE_ORDER) {
    let count = 0; for (const p of pieces) for (let t = 0; t < p.triCount; t++) if (p.triRegion[t] === name) count++;
    if (count > 0 && count < minTris) for (const p of pieces) for (let t = 0; t < p.triCount; t++) if (p.triRegion[t] === name) p.triRegion[t] = MERGE_INTO[name];
  }
}

// Character definitions. rot: extra Y rotation (radians) so the model faces +Z.
// height: final standing height in metres.
export const ANIMATRONICS = [
  { id: 'freddy', name: 'Freddy Fazbear', file: 'models/freddy.glb', height: 2.0, rotY: 0, color: '#8a5a2b',
    pose: { arms: [['L_Shoulder_jnt', 'L_Elbow_jnt'], ['R_Shoulder_jnt', 'R_Elbow_jnt']] } },
  { id: 'bonnie', name: 'Bonnie', file: 'models/bonnie.glb', height: 2.05, rotY: 0, color: '#5a4fb0',
    pose: { arms: [['j_l_arm_02', 'j_l_arm_01'], ['j_r_arm_02', 'j_r_arm_01']] } },
  { id: 'chica', name: 'Chica', file: 'models/chica.glb', height: 1.95, rotY: 0, color: '#e8c33a',
    spatial: { neck: 0.735, hip: 0.4, arm: 0.115 } },
  { id: 'foxy', name: 'Foxy', file: 'models/foxy.glb', height: 2.05, rotY: 0, color: '#b0402c',
    pose: { arms: [['L_Shoulder_jnt', 'L_Elbow_jnt'], ['R_Shoulder_jnt', 'R_Elbow_jnt']] } },
];

function regionFromBoneName(n) {
  const s = n.toLowerCase();
  const left = /(^|[_\s.])l[_\s.]|^l_|_l_|left/.test(s);
  const right = /(^|[_\s.])r[_\s.]|^r_|_r_|right/.test(s);
  if (/head|neck|jaw|eye|lid|ear|brow|hat|hair|patch/.test(s)) return 'head';
  if (/shoulder(?!pad)|elbow|wrist|arm|hand|thumb|index|middle|pinky|ring|prop|finger/.test(s)) {
    if (left) return 'armL'; if (right) return 'armR';
  }
  if (/leg|knee|ankle|foot|toe|thigh|calf/.test(s)) {
    if (left) return 'legL'; if (right) return 'legR';
  }
  return 'torso';
}

// Fingers and other unsided bones take the region of the nearest sided ancestor.
function boneRegionOf(bone) {
  if (bone.userData.region) return bone.userData.region;
  let r = regionFromBoneName(bone.name);
  if (r === 'torso' && /thumb|index|middle|pinky|ring|finger|hand/i.test(bone.name)) {
    let p = bone.parent;
    while (p && p.isBone) { const pr = regionFromBoneName(p.name); if (pr !== 'torso') { r = pr; break; } p = p.parent; }
  }
  bone.userData.region = r; return r;
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _skin = new THREE.Matrix4(), _tmp = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

// Returns { positions, normals } in the model-root space, with skinning applied.
function bakeMesh(mesh, toRoot) {
  const g = mesh.geometry;
  const pos = g.attributes.position, nor = g.attributes.normal;
  const count = pos.count;
  const P = new Float32Array(count * 3), N = new Float32Array(count * 3);
  const world = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
  const skinned = mesh.isSkinnedMesh;
  let si, sw, bm;
  if (skinned) {
    mesh.skeleton.update();
    si = g.attributes.skinIndex; sw = g.attributes.skinWeight; bm = mesh.skeleton.boneMatrices;
  }
  const worldNM = new THREE.Matrix3().getNormalMatrix(world);
  for (let i = 0; i < count; i++) {
    _v.fromBufferAttribute(pos, i);
    if (nor) _n.fromBufferAttribute(nor, i); else _n.set(0, 1, 0);
    if (skinned) {
      _skin.set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (w === 0) continue;
        const b = si.getComponent(i, k);
        _tmp.fromArray(bm, b * 16);
        const e = _skin.elements, t = _tmp.elements;
        for (let q = 0; q < 16; q++) e[q] += t[q] * w;
      }
      _m.multiplyMatrices(mesh.bindMatrixInverse, _skin).multiply(mesh.bindMatrix);
      _m.premultiply(world);
      _v.applyMatrix4(_m);
      _nm.getNormalMatrix(_m); _n.applyMatrix3(_nm).normalize();
    } else {
      _v.applyMatrix4(world);
      _n.applyMatrix3(worldNM).normalize();
    }
    P[i*3] = _v.x; P[i*3+1] = _v.y; P[i*3+2] = _v.z;
    N[i*3] = _n.x; N[i*3+1] = _n.y; N[i*3+2] = _n.z;
  }
  return { P, N };
}

// Lower T-posed arms into a natural standing pose by rotating each upper-arm bone in world space.
function poseArms(scene, pose) {
  const bones = {}; scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const find = pre => Object.values(bones).find(b => b.name.startsWith(pre));
  for (const [upper, lower, side] of pose.arms) {
    const a = find(upper), b = find(lower);
    if (!a || !b) { console.warn('pose: bone not found', upper, lower); continue; }
    scene.updateMatrixWorld(true);
    const pa = a.getWorldPosition(new THREE.Vector3()), pb = b.getWorldPosition(new THREE.Vector3());
    const dir = pb.clone().sub(pa).normalize();
    const drop = pose.drop ?? 1.15; // radians below horizontal
    const target = new THREE.Vector3(Math.sign(dir.x) * Math.cos(drop), -Math.sin(drop), pose.forward ?? 0.12).normalize();
    const qDelta = new THREE.Quaternion().setFromUnitVectors(dir, target);
    const qWorld = a.getWorldQuaternion(new THREE.Quaternion());
    const qParent = a.parent.getWorldQuaternion(new THREE.Quaternion());
    a.quaternion.copy(qParent.invert().multiply(qDelta.multiply(qWorld)));
  }
  scene.updateMatrixWorld(true);
}

function dominantBone(si, sw, i) {
  let best = 0, bw = -1;
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
  return best;
}

// Load a model, normalise it (feet on y=0, centred, facing +Z, given height), bake and cut.
export async function loadAnimatronic(def) {
  const gltf = await loader.loadAsync(def.file);
  const scene = gltf.scene;
  scene.rotation.y = def.rotY || 0;
  scene.updateMatrixWorld(true);
  if (def.pose) poseArms(scene, def.pose);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const s = def.height / size.y;
  const toRoot = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));

  // Collect baked pieces: { geo attrs, material, triRegion[] }
  const pieces = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    const { P, N } = bakeMesh(o, toRoot);
    const g = o.geometry;
    const index = g.index ? g.index.array : null;
    const triCount = index ? index.length / 3 : g.attributes.position.count / 3;
    const piece = { mesh: o, P, N, index, triCount, triRegion: new Array(triCount) };
    if (o.isSkinnedMesh) {
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const boneRegion = o.skeleton.bones.map(b => boneRegionOf(b));
      for (let t = 0; t < triCount; t++) {
        const counts = {};
        for (let k = 0; k < 3; k++) {
          const vi = index ? index[t*3+k] : t*3+k;
          const r = boneRegion[dominantBone(si, sw, vi)];
          counts[r] = (counts[r] || 0) + 1;
        }
        let r = 'torso', c = 0; for (const k in counts) if (counts[k] > c) { c = counts[k]; r = k; }
        piece.triRegion[t] = r;
      }
    } else {
      piece.spatial = true;
    }
    pieces.push(piece);
  });

  // Spatial classification for unrigged pieces: each connected chunk of triangles
  // (the original separate objects) is assigned by where its centre sits on the body.
  const H = def.height;
  const sp = def.spatial || { neck: 0.74, hip: 0.45, arm: 0.2 };
  for (const p of pieces) {
    if (!p.spatial) continue;
    const nv = p.P.length / 3;
    const parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const vi = (t, k) => p.index ? p.index[t*3+k] : t*3+k;
    for (let t = 0; t < p.triCount; t++) {
      const a = find(vi(t,0)), b = find(vi(t,1)), c = find(vi(t,2));
      parent[b] = a; parent[find(c)] = a;
    }
    const comps = new Map();
    for (let t = 0; t < p.triCount; t++) {
      const root = find(vi(t,0));
      let c = comps.get(root);
      if (!c) { c = { box: new THREE.Box3(), tris: [] }; comps.set(root, c); }
      c.tris.push(t);
      for (let k = 0; k < 3; k++) { const i = vi(t,k); c.box.expandByPoint(_v.set(p.P[i*3], p.P[i*3+1], p.P[i*3+2])); }
    }
    for (const c of comps.values()) {
      const ctr = c.box.getCenter(new THREE.Vector3());
      let r;
      if (ctr.y > sp.neck * H) r = 'head';
      else if (ctr.y > sp.hip * H && Math.abs(ctr.x) > sp.arm * H) r = ctr.x > 0 ? 'armL' : 'armR';
      else if (ctr.y < sp.hip * H && Math.abs(ctr.x) > 0.02) r = ctr.x > 0 ? 'legL' : 'legR';
      else r = 'torso';
      if (globalThis.__dbgComps) console.log(def.id, r, ctr.toArray().map(v => v.toFixed(2)).join(','), c.box.getSize(new THREE.Vector3()).toArray().map(v => v.toFixed(2)).join(','));
      for (const t of c.tris) p.triRegion[t] = r;
    }
  }

  subdivideRegions(pieces);

  // Build part groups.
  const parts = {};
  for (const r of REGIONS) parts[r] = { region: r, meshes: [], box: new THREE.Box3() };
  for (const p of pieces) {
    const g = p.mesh.geometry;
    const geoBase = new THREE.BufferGeometry();
    geoBase.setAttribute('position', new THREE.BufferAttribute(p.P, 3));
    geoBase.setAttribute('normal', new THREE.BufferAttribute(p.N, 3));
    for (const name of ['uv', 'uv1', 'color']) if (g.attributes[name]) geoBase.setAttribute(name, g.attributes[name]);
    const byRegion = {};
    for (let t = 0; t < p.triCount; t++) {
      const r = p.triRegion[t];
      (byRegion[r] ||= []).push(p.index ? p.index[t*3] : t*3, p.index ? p.index[t*3+1] : t*3+1, p.index ? p.index[t*3+2] : t*3+2);
    }
    for (const r in byRegion) {
      const geo = new THREE.BufferGeometry();
      // share the big arrays between parts instead of copying them
      for (const name in geoBase.attributes) geo.setAttribute(name, geoBase.attributes[name]);
      const idx = byRegion[r];
      const maxI = p.P.length / 3;
      geo.setIndex(new THREE.BufferAttribute(maxI > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
      const mats = Array.isArray(p.mesh.material) ? p.mesh.material[0] : p.mesh.material;
      const mat = mats;
      if (mat.map) mat.map.anisotropy = 4;
      const m = new THREE.Mesh(geo, mat);
      for (const i of idx) parts[r].box.expandByPoint(_v.set(p.P[i*3], p.P[i*3+1], p.P[i*3+2]));
      parts[r].meshes.push(m);
    }
  }

  const out = [];
  for (const r of REGIONS) {
    const pr = parts[r];
    if (!pr.meshes.length) continue;
    const center = pr.box.getCenter(new THREE.Vector3());
    // "tip": average of the part's lowest vertices (for arms this is the hand)
    const tip = new THREE.Vector3(); let tc = 0;
    for (const m of pr.meshes) {
      const P = m.geometry.attributes.position.array, idx = m.geometry.index.array;
      for (let k = 0; k < idx.length; k += 3) { const i = idx[k]; if (P[i*3+1] < pr.box.min.y + 0.08) { tip.x += P[i*3]; tip.y += P[i*3+1]; tip.z += P[i*3+2]; tc++; } }
    }
    if (tc) tip.divideScalar(tc); else tip.copy(center);
    const group = new THREE.Group();
    group.name = def.id + ':' + r;
    for (const m of pr.meshes) { m.position.copy(center).negate(); group.add(m); m.geometry.boundingSphere = null; }
    // tight bounding spheres per part (computed from the part's own box)
    const radius = pr.box.getSize(new THREE.Vector3()).length() / 2;
    for (const m of pr.meshes) m.geometry.boundingSphere = new THREE.Sphere(center.clone(), radius);
    out.push({ id: def.id + ':' + r, owner: def.id, region: r, label: REGION_LABEL[r], group, slot: center.clone(),
      tip, size: pr.box.getSize(new THREE.Vector3()), localBox: pr.box.clone().translate(center.clone().negate()) });
  }
  return { def, parts: out, scale: s };
}

// Mr. Cupcake: one solid part.
export async function loadCupcake(height = 0.32) {
  const gltf = await loader.loadAsync('models/cupcake.glb');
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  const toRoot = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2));
  const group = new THREE.Group(); group.name = 'cupcake';
  const pbox = new THREE.Box3();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const { P, N } = bakeMesh(o, toRoot);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    for (const name of ['uv', 'uv1']) if (o.geometry.attributes[name]) geo.setAttribute(name, o.geometry.attributes[name]);
    if (o.geometry.index) geo.setIndex(o.geometry.index);
    geo.computeBoundingSphere();
    for (let i = 0; i < P.length; i += 3) pbox.expandByPoint(_v.set(P[i], P[i+1], P[i+2]));
    group.add(new THREE.Mesh(geo, o.material));
  });
  return { group, size: pbox.getSize(new THREE.Vector3()), localBox: pbox };
}
