// Animatronic Repair Shop: main game (rendering, player, VR + desktop input, gameplay, UI).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, collide, L } from './world.js';
import { ANIMATRONICS, loadAnimatronic, loadCupcake, REGION_LABEL } from './animatronics.js';
import { sfx, initAudio } from './audio.js';
import * as T from './textures.js';
import { makeTool, makeHand } from './props.js';

const Q = new URLSearchParams(location.search);
const isQuest = /OculusBrowser|Quest|Pacific/i.test(navigator.userAgent);
const quality = Q.get('quality') || (isQuest ? 'low' : 'high');

// ---------------- economy ----------------
const VALUE = [
  { v: 1, cost: 0 }, { v: 2, cost: 8 }, { v: 3, cost: 20 }, { v: 5, cost: 45 }, { v: 8, cost: 90 },
  { v: 12, cost: 170 }, { v: 20, cost: 300 }, { v: 35, cost: 520 }, { v: 60, cost: 900 }, { v: 100, cost: 1500 },
];
const TOOLS = [
  { name: 'Screwdriver', time: 3.0, cost: 0 }, { name: 'Wrench Set', time: 2.0, cost: 12 },
  { name: 'Power Drill', time: 1.1, cost: 40 }, { name: 'Impact Driver', time: 0.55, cost: 110 },
  { name: 'Robo-Arm', time: 0.12, cost: 300 },
];
const BAG = [{ n: 2, cost: 0 }, { n: 3, cost: 10 }, { n: 4, cost: 30 }, { n: 6, cost: 75 }, { n: 8, cost: 160 }];
const SHOES = [{ s: 2.6, cost: 0 }, { s: 3.2, cost: 6 }, { s: 3.9, cost: 20 }, { s: 4.7, cost: 50 }, { s: 5.6, cost: 120 }];
const UPGRADES = [
  { key: 'value', title: 'Part Value', levels: VALUE, show: l => `$${l.v} per part` },
  { key: 'tool', title: 'Tools', levels: TOOLS, show: l => `${l.name} (${l.time}s)` },
  { key: 'bag', title: 'Parts Bag', levels: BAG, show: l => `carry ${l.n} parts` },
  { key: 'shoes', title: 'Sneakers', levels: SHOES, show: l => `${l.s} m/s` },
];

const SAVE_KEY = 'fnaf-repair-save-v1';
const fresh = () => ({ money: 0, round: 1, up: { value: 0, tool: 0, bag: 0, shoes: 0 }, installed: [], bag: [], earned: 0 });
let state = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.up) state = Object.assign(fresh(), s); } catch {}
if (Q.has('reset')) state = fresh();
if (Q.has('money')) state.money = +Q.get('money');
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} };
const partValue = () => VALUE[state.up.value].v;
const tool = () => TOOLS[state.up.tool];
const bagSize = () => BAG[state.up.bag].n;

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = quality === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.getElementById('stage').appendChild(renderer.domElement);
T.setMaxAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070912, 0.012);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 600);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
camera.position.set(0, 1.65, 0);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------------- HTML UI ----------------
const $ = id => document.getElementById(id);
const ui = {
  menu: $('menu'), status: $('loadStatus'), play: $('playBtn'), vr: $('vrBtn'), resetBtn: $('resetBtn'), vrNote: $('vrNote'),
  hud: $('hud'), money: $('hMoney'), bag: $('hBag'), tool: $('hTool'), prompt: $('prompt'), toast: $('toast'), cross: $('cross'), bar: $('bar'), barFill: $('barFill'),
};
const setStatus = t => { ui.status.textContent = t; };

// ---------------- world ----------------
setStatus('Painting textures...');
await new Promise(r => setTimeout(r, 30));
const world = buildWorld(scene, quality);
for (const l of world.lights.shadowCasters) l.castShadow = renderer.shadowMap.enabled;

// ---------------- animatronics & parts ----------------
const stands = {};   // id -> { def, group, parts[], label }
const parts = [];    // all parts
const partById = {};
// Hologram material for missing parts: fresnel rim glow + faint scanlines.
function holo(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vY = wp.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; uniform float time; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float rim = pow(f, 2.5);
        float scan = 0.75 + 0.25 * sin(vY * 140.0 - time * 3.0);
        gl_FragColor = vec4(color * (rim * 0.9 + 0.04) * scan * strength, 1.0); }`,
  });
}
const ghostMat = holo(0x3fb6ff, 0.6);
const ghostReady = holo(0xffa630, 1.2);

function makeGhost(group) {
  const g = new THREE.Group();
  group.traverse(o => { if (o.isMesh) { const m = new THREE.Mesh(o.geometry, ghostMat); m.position.copy(o.position); m.renderOrder = 2; g.add(m); } });
  return g;
}

for (let i = 0; i < ANIMATRONICS.length; i++) {
  const def = ANIMATRONICS[i];
  setStatus(`Loading ${def.name}...`);
  const a = await loadAnimatronic(def);
  const sg = new THREE.Group(); sg.position.copy(L.stands[i]); sg.name = 'stand:' + def.id; scene.add(sg);
  const st = { def, group: sg, parts: [], index: i };
  stands[def.id] = st;
  for (const p of a.parts) {
    p.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const part = { ...p, standId: def.id, name: `${def.name.split(' ')[0]}'s ${p.label}`, state: 'stage' };
    part.ghost = makeGhost(p.group); part.ghost.position.copy(p.slot); sg.add(part.ghost);
    st.parts.push(part); parts.push(part); partById[part.id] = part;
    part.radius = Math.max(0.14, Math.max(p.size.x, p.size.y, p.size.z) * 0.42);
  }
  if (def.id === 'chica') {
    setStatus('Loading Mr. Cupcake...');
    const c = await loadCupcake(0.3);
    const arm = a.parts.find(p => p.region === 'armL');
    const slot = arm.tip.clone().add(new THREE.Vector3(-0.01, 0.17, 0.07));
    c.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const part = { id: 'chica:cupcake', owner: 'chica', region: 'cupcake', label: REGION_LABEL.cupcake, group: c.group, slot, size: c.size, localBox: c.localBox,
      standId: 'chica', name: 'Mr. Cupcake', state: 'stage' };
    part.ghost = makeGhost(c.group); part.ghost.position.copy(slot); sg.add(part.ghost);
    part.radius = 0.16;
    st.parts.push(part); parts.push(part); partById[part.id] = part;
  }
}

// stand labels (little floor signs)
function drawLabel(st) {
  const done = st.parts.filter(p => p.state === 'installed').length, all = st.parts.length;
  const c = st.labelCanvas, x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#16181c'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = st.def.color; x.fillRect(0, 0, 18, c.height);
  x.fillStyle = '#f2efe6'; x.font = 'bold 54px "Barlow Condensed", Arial Narrow, sans-serif'; x.textBaseline = 'middle';
  x.fillText(st.def.name.toUpperCase(), 40, 50);
  x.font = 'bold 44px "Barlow Condensed", Arial Narrow, sans-serif';
  x.fillStyle = done === all ? '#5be37d' : '#ffb347';
  x.fillText(done === all ? 'FIXED!' : `${done} / ${all} PARTS`, 40, 118);
  x.fillStyle = '#333'; x.fillRect(300, 100, 200, 34); x.fillStyle = done === all ? '#5be37d' : '#ffb347'; x.fillRect(300, 100, 200 * done / all, 34);
  st.labelTex.needsUpdate = true;
}
for (const id in stands) {
  const st = stands[id];
  st.labelCanvas = document.createElement('canvas'); st.labelCanvas.width = 512; st.labelCanvas.height = 160;
  st.labelTex = T.canvasTex(st.labelCanvas);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), new THREE.MeshBasicMaterial({ map: st.labelTex, toneMapped: false }));
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), new THREE.MeshStandardMaterial({ color: 0x333438, metalness: 0.6, roughness: 0.4 }));
  post.position.set(0, 0.16, 0.85); m.position.set(0, 0.38, 0.86); m.rotation.x = -0.6;
  st.group.add(m, post);
  drawLabel(st);
}

// ---------------- shop terminal + money board ----------------
function screenMesh(anchor, cw, ch) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const tex = T.canvasTex(c);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(anchor.w + 0.08, anchor.h + 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.35, metalness: 0.3 }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(anchor.w, anchor.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  const g = new THREE.Group(); g.position.copy(anchor.pos); g.rotation.y = anchor.rotY;
  frame.position.z = -0.03; m.position.z = 0.002; g.add(frame, m); scene.add(g);
  return { canvas: c, ctx: c.getContext('2d'), tex, mesh: m, group: g };
}
const shop = screenMesh(world.anchors.terminal, 1280, 792);
const board = screenMesh(world.anchors.board, 1300, 525);
shop.buttons = [];

function drawShop(hover = -1) {
  const { ctx: x, canvas: c } = shop; const W = c.width, H = c.height;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#10151d'); g.addColorStop(1, '#070a0f'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ffb347'; x.font = 'bold 66px "Barlow Condensed", Arial Narrow, sans-serif'; x.textBaseline = 'middle';
  x.fillText('UPGRADE SHOP', 40, 62);
  x.textAlign = 'right'; x.fillStyle = '#5be37d'; x.fillText('$' + state.money.toLocaleString(), W - 40, 62); x.textAlign = 'left';
  x.fillStyle = '#2a3340'; x.fillRect(40, 108, W - 80, 3);
  shop.buttons = [];
  UPGRADES.forEach((u, i) => {
    const y = 140 + i * 158, lvl = state.up[u.key], cur = u.levels[lvl], next = u.levels[lvl + 1];
    x.fillStyle = '#161d27'; x.fillRect(40, y, W - 80, 138);
    x.fillStyle = '#f2efe6'; x.font = 'bold 50px "Barlow Condensed", Arial Narrow, sans-serif'; x.fillText(u.title, 66, y + 40);
    x.fillStyle = '#9fb0c2'; x.font = '34px Barlow, Arial, sans-serif'; x.fillText('Now: ' + u.show(cur), 66, y + 98);
    for (let k = 0; k < u.levels.length; k++) { x.fillStyle = k <= lvl ? '#ffb347' : '#2c3644'; x.fillRect(560 + k * 30, y + 28, 22, 22); }
    if (next) {
      x.fillStyle = '#c9d4e0'; x.font = '34px Barlow, Arial, sans-serif'; x.fillText('Next: ' + u.show(next), 560, y + 98);
      const bx = W - 320, by = y + 22, bw = 260, bh = 94; const can = state.money >= next.cost;
      x.fillStyle = hover === i ? (can ? '#ffd27a' : '#5a3a3a') : (can ? '#ffb347' : '#3a2f2f');
      x.fillRect(bx, by, bw, bh);
      x.fillStyle = can ? '#1a1206' : '#9a8080'; x.font = 'bold 50px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'center';
      x.fillText('BUY $' + next.cost.toLocaleString(), bx + bw / 2, by + bh / 2 + 2); x.textAlign = 'left';
      shop.buttons.push({ i, x0: bx / W, x1: (bx + bw) / W, y0: by / H, y1: (by + bh) / H });
    } else {
      x.fillStyle = '#5be37d'; x.font = 'bold 50px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'right'; x.fillText('MAXED', W - 70, y + 70); x.textAlign = 'left';
    }
  });
  shop.tex.needsUpdate = true;
}
function drawBoard() {
  const { ctx: x, canvas: c } = board; const W = c.width, H = c.height;
  x.fillStyle = '#0b0d10'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#5be37d'; x.font = 'bold 120px "Barlow Condensed", Arial Narrow, sans-serif'; x.textBaseline = 'middle';
  x.fillText('$' + state.money.toLocaleString(), 40, 90);
  x.fillStyle = '#ffb347'; x.font = 'bold 54px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'right';
  x.fillText('ROUND ' + state.round, W - 40, 70);
  x.fillStyle = '#9fb0c2'; x.font = '36px Barlow, Arial, sans-serif'; x.fillText(`$${partValue()} per part  •  ${tool().name}`, W - 40, 125); x.textAlign = 'left';
  Object.values(stands).forEach((st, i) => {
    const y = 200 + i * 80, done = st.parts.filter(p => p.state === 'installed').length, all = st.parts.length;
    x.fillStyle = '#f2efe6'; x.font = 'bold 50px "Barlow Condensed", Arial Narrow, sans-serif'; x.fillText(st.def.name, 40, y + 28);
    x.fillStyle = '#232a33'; x.fillRect(420, y + 6, 700, 44);
    x.fillStyle = done === all ? '#5be37d' : st.def.color; x.fillRect(420, y + 6, 700 * done / all, 44);
    x.fillStyle = '#f2efe6'; x.textAlign = 'right'; x.fillText(`${done}/${all}`, W - 40, y + 28); x.textAlign = 'left';
  });
  board.tex.needsUpdate = true;
}

// ---------------- stage scatter ----------------
const St = world.anchors.stage;
const _box = new THREE.Box3(), _m4 = new THREE.Matrix4();
function placeOnStage(part) {
  const r = () => Math.random();
  const g = part.group;
  const lying = part.size.y > Math.max(part.size.x, part.size.z) * 1.4 && part.region !== 'head';
  g.rotation.set(lying ? Math.PI / 2 * (r() > 0.5 ? 1 : -1) : (r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3, 'YXZ');
  // find a free spot
  let x, z, tries = 0;
  do {
    x = St.x0 + 1.8 + r() * (St.x1 - St.x0 - 3.6); z = St.z0 + 0.5 + r() * (St.z1 - St.z0 - 1.2);
    tries++;
  } while (tries < 40 && parts.some(o => o !== part && o.state === 'stage' && o.group.parent && o.group.position.distanceTo(new THREE.Vector3(x, o.group.position.y, z)) < (o.radius + part.radius) * 0.9));
  g.updateMatrix();
  _m4.makeRotationFromEuler(g.rotation);
  _box.copy(part.localBox).applyMatrix4(_m4);
  g.position.set(x, St.h - _box.min.y + 0.004, z);
  scene.add(g);
}
function applyState() {
  const inst = new Set(state.installed), inBag = new Set(state.bag);
  for (const p of parts) {
    if (inst.has(p.id)) { p.state = 'installed'; attachToStand(p); }
    else if (inBag.has(p.id)) { p.state = 'bag'; p.group.removeFromParent(); p.ghost.visible = true; }
    else { p.state = 'stage'; p.ghost.visible = true; placeOnStage(p); }
  }
  for (const id in stands) drawLabel(stands[id]);
  refreshGhosts(); drawShop(); drawBoard(); updateHud();
}
function attachToStand(p) {
  const st = stands[p.standId];
  p.group.rotation.set(0, 0, 0); p.group.scale.setScalar(1); p.group.position.copy(p.slot);
  st.group.add(p.group); p.ghost.visible = false;
}
function refreshGhosts() {
  const inBag = new Set(state.bag);
  for (const p of parts) p.ghost.traverse(o => { if (o.isMesh) o.material = inBag.has(p.id) ? ghostReady : ghostMat; });
}

// ---------------- effects: floating text, sparks, confetti ----------------
const floaters = [];
function floatText(text, pos, color = '#5be37d', size = 0.24) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.font = 'bold 92px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(text, 256, 64); x.fillStyle = color; x.fillText(text, 256, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.canvasTex(c), transparent: true, depthTest: false, toneMapped: false }));
  s.scale.set(size * 4, size, 1); s.position.copy(pos); s.renderOrder = 10; scene.add(s);
  floaters.push({ s, t: 0 });
}
function makePoints(n, size, additive = true) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts);
  return { pts, n, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
}
const sparks = makePoints(160, 0.025);
const confetti = makePoints(400, 0.05, false);
function emit(sys, pos, count, speed, colorFn, up = 1) {
  const P = sys.pts.geometry.attributes.position.array, C = sys.pts.geometry.attributes.color.array;
  for (let k = 0; k < count; k++) {
    const i = sys.next; sys.next = (sys.next + 1) % sys.n;
    P[i*3] = pos.x; P[i*3+1] = pos.y; P[i*3+2] = pos.z;
    sys.vel[i*3] = (Math.random() - 0.5) * speed; sys.vel[i*3+1] = Math.random() * speed * up; sys.vel[i*3+2] = (Math.random() - 0.5) * speed;
    const c = colorFn(); C[i*3] = c[0]; C[i*3+1] = c[1]; C[i*3+2] = c[2];
    sys.life[i] = 1;
  }
}
function stepPoints(sys, dt, grav, drag, fade) {
  const P = sys.pts.geometry.attributes.position.array;
  for (let i = 0; i < sys.n; i++) {
    if (sys.life[i] <= 0) { P[i*3+1] = -999; continue; }
    sys.life[i] -= dt * fade;
    sys.vel[i*3+1] -= grav * dt;
    for (let a = 0; a < 3; a++) { sys.vel[i*3+a] *= (1 - drag * dt); P[i*3+a] += sys.vel[i*3+a] * dt; }
    if (P[i*3+1] < 0.01) { P[i*3+1] = 0.01; sys.vel[i*3+1] *= -0.3; sys.vel[i*3] *= 0.5; sys.vel[i*3+2] *= 0.5; }
  }
  sys.pts.geometry.attributes.position.needsUpdate = true; sys.pts.geometry.attributes.color.needsUpdate = true;
}
const confettiColors = [[1, .25, .4], [.25, .55, 1], [1, .85, .2], [.3, .9, .5], [1, 1, 1]];

// ---------------- HUD / toasts ----------------
let toastTimer = 0;
function toast(msg, secs = 3) { ui.toast.textContent = msg; ui.toast.classList.add('on'); toastTimer = secs; vrToast(msg, secs); }
function updateHud() {
  ui.money.textContent = '$' + state.money.toLocaleString();
  ui.tool.textContent = tool().name;
  ui.bag.innerHTML = `<b>Bag ${state.bag.length}/${bagSize()}</b>` + (state.bag.length ? state.bag.map(id => `<span>${partById[id].name}</span>`).join('') : '<span class="dim">empty</span>');
  drawWrist();
}

// ---------------- VR: controllers, hands, wrist panel, toast panel ----------------
const controllers = [];
const ctrlRay = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(c, grip);
  const line = new THREE.Line(ctrlRay, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  line.scale.z = 3; c.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
  dot.visible = false; scene.add(dot);
  const ctl = { i, c, grip, line, dot, hand: null, gamepad: null, side: null, trigger: false, squeeze: false, aim: null, toolMesh: null };
  c.addEventListener('connected', e => {
    ctl.gamepad = e.data.gamepad; ctl.side = e.data.handedness;
    if (!ctl.hand) { ctl.hand = makeHand(ctl.side === 'left'); grip.add(ctl.hand); }
    if (ctl.side === 'left') grip.add(wrist.mesh);
  });
  c.addEventListener('disconnected', () => { ctl.gamepad = null; });
  c.addEventListener('selectstart', () => { ctl.trigger = true; actionStart(ctl); });
  c.addEventListener('selectend', () => { ctl.trigger = false; actionEnd(ctl); });
  c.addEventListener('squeezestart', () => { ctl.squeeze = true; grabTouch(ctl); });
  c.addEventListener('squeezeend', () => { ctl.squeeze = false; actionEnd(ctl); });
  controllers.push(ctl);
}
const wrist = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 360;
  const tex = T.canvasTex(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.12), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
  mesh.position.set(0.02, 0.05, 0.08); mesh.rotation.set(-1.1, 0, 0.35);
  return { c, ctx: c.getContext('2d'), tex, mesh };
})();
function drawWrist() {
  const { ctx: x, c } = wrist;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(10,12,16,.88)'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#5be37d'; x.font = 'bold 74px "Barlow Condensed", Arial Narrow, sans-serif'; x.textBaseline = 'top';
  x.fillText('$' + state.money.toLocaleString(), 20, 10);
  x.fillStyle = '#ffb347'; x.font = 'bold 34px Barlow, Arial, sans-serif'; x.textAlign = 'right'; x.fillText(tool().name, c.width - 20, 30); x.textAlign = 'left';
  x.fillStyle = '#f2efe6'; x.font = 'bold 34px Barlow, Arial, sans-serif'; x.fillText(`BAG ${state.bag.length}/${bagSize()}`, 20, 100);
  x.font = '30px Barlow, Arial, sans-serif'; x.fillStyle = '#c9d4e0';
  state.bag.slice(0, 6).forEach((id, k) => x.fillText('• ' + partById[id].name, 20, 145 + k * 35));
  wrist.tex.needsUpdate = true;
}
const vrToastPanel = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const tex = T.canvasTex(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.14), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  mesh.position.set(0, -0.32, -1.1); mesh.renderOrder = 20; mesh.visible = false; camera.add(mesh);
  return { c, ctx: c.getContext('2d'), tex, mesh, t: 0 };
})();
function vrToast(msg, secs) {
  const { ctx: x, c } = vrToastPanel; x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(10,12,16,.85)'; x.beginPath(); x.roundRect(4, 4, c.width - 8, c.height - 8, 30); x.fill();
  x.fillStyle = '#f2efe6'; x.font = 'bold 50px Barlow, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let s = msg; while (x.measureText(s).width > c.width - 60 && s.length > 4) s = s.slice(0, -2);
  x.fillText(s === msg ? s : s + '…', c.width / 2, c.height / 2);
  vrToastPanel.tex.needsUpdate = true; vrToastPanel.t = secs; vrToastPanel.mesh.visible = renderer.xr.isPresenting;
}
// VR prompt over the aimed object
const vrPrompt = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const tex = T.canvasTex(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(0.8, 0.1, 1); s.renderOrder = 15; s.visible = false; scene.add(s);
  return { c, ctx: c.getContext('2d'), tex, s, text: '' };
})();
function setVrPrompt(text, pos) {
  if (!text || !renderer.xr.isPresenting) { vrPrompt.s.visible = false; return; }
  if (text !== vrPrompt.text) {
    const { ctx: x, c } = vrPrompt; x.clearRect(0, 0, c.width, c.height);
    x.font = 'bold 54px Barlow, Arial, sans-serif'; const w = Math.min(c.width - 8, x.measureText(text).width + 60);
    x.fillStyle = 'rgba(10,12,16,.82)'; x.beginPath(); x.roundRect((c.width - w) / 2, 8, w, 112, 24); x.fill();
    x.fillStyle = '#ffd27a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, 66);
    vrPrompt.tex.needsUpdate = true; vrPrompt.text = text;
  }
  vrPrompt.s.position.copy(pos); vrPrompt.s.visible = true;
}

// ---------------- desktop tool view-model ----------------
let viewTool = null, viewToolLevel = -1;
function refreshViewTool() {
  if (viewToolLevel === state.up.tool) return;
  viewToolLevel = state.up.tool;
  if (viewTool) camera.remove(viewTool);
  viewTool = makeTool(state.up.tool);
  viewTool.position.set(0.3, -0.27, -0.55); viewTool.rotation.set(0.1, -0.3, 0); viewTool.scale.setScalar(0.85);
  viewTool.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.depthTest = true; } });
  camera.add(viewTool);
  for (const ctl of controllers) { if (ctl.toolMesh) ctl.grip.remove(ctl.toolMesh); ctl.toolMesh = null; }
}

// ---------------- targeting ----------------
const ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _tmp = new THREE.Vector3(), _sph = new THREE.Sphere();
const STAND_CENTER = new THREE.Vector3();
function aimFrom(origin, dir, maxPart = 3.5) {
  // parts on the stage
  let best = null, bestD = Infinity;
  ray.set(origin, dir);
  for (const p of parts) {
    if (p.state !== 'stage' || !p.group.parent) continue;
    _sph.set(p.group.position, p.radius);
    const hit = ray.ray.intersectSphere(_sph, _tmp);
    if (hit) { const d = hit.distanceTo(origin); if (d < bestD && d < maxPart) { bestD = d; best = { type: 'part', part: p, point: hit.clone(), dist: d }; } }
  }
  // stands
  for (const id in stands) {
    const st = stands[id]; STAND_CENTER.copy(st.group.position).setY(1.0);
    _sph.set(STAND_CENTER, 0.75);
    const hit = ray.ray.intersectSphere(_sph, _tmp);
    if (hit) { const d = hit.distanceTo(origin); if (d < bestD && d < 4.5) { bestD = d; best = { type: 'stand', stand: st, point: hit.clone(), dist: d }; } }
  }
  // shop screen
  const h = ray.intersectObject(shop.mesh, false)[0];
  if (h && h.distance < 5 && h.distance < bestD) {
    const btn = shop.buttons.find(b => h.uv.x >= b.x0 && h.uv.x <= b.x1 && (1 - h.uv.y) >= b.y0 && (1 - h.uv.y) <= b.y1);
    best = { type: 'shop', button: btn, point: h.point.clone(), dist: h.distance };
  }
  return best;
}
function neededPartFor(st) { return state.bag.map(id => partById[id]).find(p => p.standId === st.def.id); }
function describe(aim) {
  if (!aim) return '';
  if (aim.type === 'part') return state.bag.length >= bagSize() ? 'Bag full! Take parts to your garage' : `Pick up ${aim.part.name}`;
  if (aim.type === 'stand') {
    const st = aim.stand, need = neededPartFor(st);
    if (st.parts.every(p => p.state === 'installed')) return `${st.def.name} is fixed!`;
    if (need) return `Hold to install ${need.label} (${tool().name} ${tool().time}s)`;
    return `No ${st.def.name.split(' ')[0]} parts in your bag — get them at Freddy's stage`;
  }
  if (aim.type === 'shop') {
    if (!aim.button) return 'Upgrade shop';
    const u = UPGRADES[aim.button.i], next = u.levels[state.up[u.key] + 1];
    return state.money >= next.cost ? `Buy ${u.title}: ${u.show(next)}` : `Need $${next.cost} for ${u.title}`;
  }
  return '';
}

// ---------------- actions ----------------
let installing = null; // { part, ctl, t, from }
function actionStart(ctl) {
  initAudio();
  const aim = ctl ? ctl.aim : deskAim;
  if (!aim) return;
  if (aim.type === 'part') pickUp(aim.part, ctl);
  else if (aim.type === 'stand') startInstall(aim.stand, ctl);
  else if (aim.type === 'shop' && aim.button) buy(aim.button.i);
}
function actionEnd(ctl) { if (installing && installing.ctl === ctl) cancelInstall(); }
function grabTouch(ctl) {
  // grab a part your hand is touching
  const hp = ctl.grip.getWorldPosition(new THREE.Vector3());
  let best = null, bd = Infinity;
  for (const p of parts) {
    if (p.state !== 'stage' || !p.group.parent) continue;
    const d = p.group.position.distanceTo(hp) - p.radius;
    if (d < 0.15 && d < bd) { bd = d; best = p; }
  }
  if (best) pickUp(best, ctl);
  else if (ctl.aim) actionStart(ctl);
}
function pickUp(p, ctl) {
  if (state.bag.length >= bagSize()) { sfx.full(); toast(`Your bag is full (${bagSize()}). Bring parts to the garage, or buy a bigger bag.`); pulse(ctl, 0.6, 120); return; }
  p.state = 'bag'; state.bag.push(p.id);
  // fly to the hand / camera, then vanish
  const target = ctl ? ctl.grip : camera;
  flyers.push({ obj: p.group, from: p.group.position.clone(), target, t: 0, dur: 0.25 });
  sfx.pickup(); pulse(ctl, 0.5, 60);
  floatText(p.name, p.group.position.clone().add(new THREE.Vector3(0, 0.45, 0)), '#ffd27a', 0.2);
  refreshGhosts(); updateHud(); save();
  if (state.bag.length >= bagSize()) toast('Bag full! Head back to your garage across the street.');
}
const flyers = [];
function startInstall(st, ctl) {
  if (st.parts.every(p => p.state === 'installed')) return;
  const p = neededPartFor(st);
  if (!p) { sfx.deny(); toast(`You have no ${st.def.name.split(' ')[0]} parts. Grab them off the stage at Freddy's!`); return; }
  const from = (ctl ? ctl.grip : camera).getWorldPosition(new THREE.Vector3());
  if (!ctl) from.add(new THREE.Vector3(0, -0.3, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())));
  st.group.worldToLocal(from);
  p.group.position.copy(from); p.group.rotation.set(0, 0, 0); p.group.scale.setScalar(1);
  st.group.add(p.group);
  installing = { part: p, st, ctl, t: 0, from };
  p.state = 'installing';
  sfx.toolStart(state.up.tool);
  if (ctl) {
    if (!ctl.toolMesh) { ctl.toolMesh = makeTool(state.up.tool); ctl.toolMesh.rotation.x = -0.6; ctl.toolMesh.position.set(0, -0.02, -0.04); }
    ctl.grip.add(ctl.toolMesh); ctl.toolMesh.visible = true;
  }
}
function cancelInstall() {
  const { part, ctl } = installing;
  part.group.removeFromParent(); part.state = 'bag';
  sfx.toolStop(); if (ctl && ctl.toolMesh) ctl.toolMesh.visible = false;
  installing = null;
}
function finishInstall() {
  const { part, st, ctl } = installing;
  installing = null; sfx.toolStop(); if (ctl && ctl.toolMesh) ctl.toolMesh.visible = false;
  state.bag.splice(state.bag.indexOf(part.id), 1);
  state.installed.push(part.id); part.state = 'installed';
  attachToStand(part);
  const pay = partValue(); state.money += pay; state.earned += pay;
  const wp = st.group.localToWorld(part.slot.clone());
  floatText('+$' + pay, wp.clone().add(new THREE.Vector3(0, 0.3, 0.3)));
  emit(sparks, wp, 40, 2.5, () => [1, 0.7 + Math.random() * 0.3, 0.3]);
  sfx.clunk(); setTimeout(() => sfx.cash(), 120); pulse(ctl, 1, 100);
  if (st.parts.every(p => p.state === 'installed')) {
    const bonus = pay * 5; state.money += bonus; state.earned += bonus;
    setTimeout(() => {
      sfx.complete(); floatText(`${st.def.name} FIXED! +$${bonus}`, st.group.position.clone().add(new THREE.Vector3(0, 2.4, 0.2)), '#ffd27a', 0.3);
      emit(confetti, st.group.position.clone().add(new THREE.Vector3(0, 2.2, 0.3)), 160, 3.5, () => confettiColors[Math.floor(Math.random() * 5)], 1.2);
    }, 350);
    if (Object.values(stands).every(s => s.parts.every(p => p.state === 'installed'))) setTimeout(roundComplete, 2500);
  }
  drawLabel(st); refreshGhosts(); drawShop(); drawBoard(); updateHud(); save();
}
function roundComplete() {
  const bonus = 10 * state.round * partValue();
  state.money += bonus; state.earned += bonus;
  sfx.roundUp();
  toast(`All animatronics fixed! Round bonus +$${bonus}. The truck takes them back to Freddy's...`, 6);
  for (const id in stands) emit(confetti, stands[id].group.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 90, 4, () => confettiColors[Math.floor(Math.random() * 5)], 1.2);
  drawBoard(); drawShop(); updateHud(); save();
  setTimeout(() => {
    state.round++; state.installed = [];
    for (const p of parts) if (p.state === 'installed') { p.group.removeFromParent(); }
    applyState(); save();
    toast(`Round ${state.round}: oh no, they all broke down again! Go get the parts from the stage.`, 6);
  }, 7000);
}
function buy(i) {
  const u = UPGRADES[i], lvl = state.up[u.key], next = u.levels[lvl + 1];
  if (!next) return;
  if (state.money < next.cost) { sfx.deny(); toast(`You need $${next.cost} for that.`); return; }
  state.money -= next.cost; state.up[u.key]++;
  sfx.buy(); toast(`Bought ${u.title}: ${u.show(next)}`);
  refreshViewTool(); refreshGhosts(); drawShop(); drawBoard(); updateHud(); save();
}
function pulse(ctl, v, ms) { try { ctl?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch {} }

// ---------------- desktop input ----------------
const keys = {};
let yaw = Math.PI * 0, pitch = -0.05, locked = false, playing = false, deskAim = null, mouseDown = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && playing && !e.repeat) { mouseDown = true; actionStart(null); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') { mouseDown = false; actionEnd(null); } });
renderer.domElement.addEventListener('mousedown', e => {
  if (!playing || renderer.xr.isPresenting) return;
  if (!locked) { renderer.domElement.requestPointerLock(); return; }
  if (e.button === 0) { mouseDown = true; actionStart(null); }
});
addEventListener('mouseup', e => { if (e.button === 0 && mouseDown) { mouseDown = false; actionEnd(null); } });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  ui.cross.style.display = locked ? 'block' : 'none';
  $('clickHint').style.display = playing && !locked && !renderer.xr.isPresenting ? 'block' : 'none';
});
addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022; pitch = Math.max(-1.45, Math.min(1.45, pitch));
});

// ---------------- player movement ----------------
const player = { pos: L.spawn.clone(), vy: 0, stepAcc: 0 };
rig.position.copy(player.pos);
yaw = 0; // look toward the stands (-z)
if (Q.has('pos')) { const [x, y, z] = Q.get('pos').split(',').map(Number); player.pos.set(x, y, z); }
if (Q.has('look')) { const [a, b] = Q.get('look').split(',').map(Number); yaw = a; pitch = b; }
rig.position.copy(player.pos);
let snapReady = true;

function movePlayer(dt) {
  const speed = SHOES[state.up.shoes].s;
  let mx = 0, mz = 0, fwdYaw = yaw;
  if (renderer.xr.isPresenting) {
    const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ); fwdYaw = Math.atan2(-fwd.x, -fwd.z);
    for (const ctl of controllers) {
      const gp = ctl.gamepad; if (!gp || gp.axes.length < 4) continue;
      const ax = gp.axes[2], ay = gp.axes[3];
      if (ctl.side === 'left' || (ctl.side !== 'right' && ctl.i === 0)) {
        if (Math.hypot(ax, ay) > 0.15) { mx += ax; mz += ay; }
      } else {
        if (Math.abs(ax) > 0.7 && snapReady) { snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); snapReady = false; }
        if (Math.abs(ax) < 0.3) snapReady = true;
      }
    }
  } else if (playing) {
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  }
  const len = Math.hypot(mx, mz);
  // head position in world (VR) or rig position (desktop)
  const head = renderer.xr.isPresenting ? camera.getWorldPosition(new THREE.Vector3()) : rig.position.clone();
  if (len > 0.01) {
    const k = Math.min(1, len) / len * speed * (keys.ShiftLeft ? 1.35 : 1) * dt;
    const s = Math.sin(fwdYaw), c = Math.cos(fwdYaw);
    const dx = (mx * c + mz * s) * k, dz = (-mx * s + mz * c) * k;
    const [nx, nz] = collide(world.colliders, head.x + dx, head.z + dz);
    rig.position.x += nx - head.x; rig.position.z += nz - head.z;
    player.stepAcc += Math.hypot(nx - head.x, nz - head.z);
    if (player.stepAcc > 0.7) { player.stepAcc = 0; sfx.step(); }
  } else if (!renderer.xr.isPresenting) {
    const [nx, nz] = collide(world.colliders, head.x, head.z); rig.position.x = nx; rig.position.z = nz;
  }
  const hp = renderer.xr.isPresenting ? camera.getWorldPosition(new THREE.Vector3()) : rig.position;
  const fy = world.floorY(hp.x, hp.z);
  rig.position.y += (fy - rig.position.y) * Math.min(1, dt * 12);
  if (!renderer.xr.isPresenting) { rig.rotation.y = yaw; camera.rotation.set(pitch, 0, 0); }
}
function snapTurn(a) {
  const head = camera.getWorldPosition(new THREE.Vector3());
  rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(head);
  rig.rotation.y += a;
}

// ---------------- XR session ----------------
async function enterVR() {
  initAudio();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(session);
  } catch (e) { ui.vrNote.textContent = 'Could not start VR: ' + e.message; }
}
renderer.xr.addEventListener('sessionstart', () => {
  ui.menu.hidden = true; ui.hud.hidden = true; playing = true; sfx.startAmbience();
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  rig.rotation.y = yaw;
  if (renderer.shadowMap.enabled) setShadows(false);
  if (viewTool) viewTool.visible = false;
  toast('Left stick: move • Right stick: turn • Trigger: grab / hold to install', 6);
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 1.65, 0); ui.hud.hidden = false; vrToastPanel.mesh.visible = false; vrPrompt.s.visible = false;
  if (quality === 'high') setShadows(true);
  if (viewTool) viewTool.visible = true;
  for (const ctl of controllers) { ctl.dot.visible = false; }
});
function setShadows(on) {
  renderer.shadowMap.enabled = on;
  for (const l of world.lights.shadowCasters) l.castShadow = on;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let t = 0;
const fwdV = new THREE.Vector3();
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  movePlayer(dt);
  world.update(t);

  // targeting
  let promptText = '';
  if (renderer.xr.isPresenting) {
    for (const ctl of controllers) {
      if (!ctl.gamepad) { ctl.aim = null; ctl.dot.visible = false; continue; }
      ctl.c.getWorldPosition(_o); _d.set(0, 0, -1).applyQuaternion(ctl.c.getWorldQuaternion(new THREE.Quaternion()));
      ctl.aim = aimFrom(_o, _d);
      ctl.line.scale.z = ctl.aim ? ctl.aim.dist : 3;
      ctl.line.material.color.set(ctl.aim ? 0xffb347 : 0xffffff);
      ctl.dot.visible = !!ctl.aim; if (ctl.aim) ctl.dot.position.copy(ctl.aim.point);
      if (ctl.aim && ctl.side !== 'left') { promptText = describe(ctl.aim); setVrPrompt(promptText, ctl.aim.point.clone().add(new THREE.Vector3(0, 0.25, 0))); }
    }
    if (!controllers.some(c => c.aim && c.side !== 'left')) {
      const l = controllers.find(c => c.aim);
      if (l) setVrPrompt(describe(l.aim), l.aim.point.clone().add(new THREE.Vector3(0, 0.25, 0))); else setVrPrompt('');
    }
  } else if (playing) {
    camera.getWorldPosition(_o); camera.getWorldDirection(_d);
    deskAim = aimFrom(_o, _d);
    promptText = describe(deskAim);
    ui.prompt.textContent = promptText ? (locked ? (deskAim.type === 'stand' ? '[Hold click / E] ' : '[Click / E] ') : '') + promptText : '';
    ui.cross.classList.toggle('hot', !!deskAim);
    // shop hover
    const hv = deskAim && deskAim.type === 'shop' && deskAim.button ? deskAim.button.i : -1;
    if (hv !== shop.hover) { shop.hover = hv; drawShop(hv); }
  }

  // installing
  if (installing) {
    const aimNow = installing.ctl ? installing.ctl.aim : deskAim;
    if (!aimNow || aimNow.type !== 'stand' || aimNow.stand !== installing.st) cancelInstall();
    else {
      installing.t += dt / tool().time;
      const p = installing.part, k = Math.min(1, installing.t);
      const e = 1 - Math.pow(1 - k, 3);
      p.group.position.lerpVectors(installing.from, p.slot, e);
      p.group.rotation.y = (1 - e) * 1.2;
      if (Math.random() < dt * 30) emit(sparks, installing.st.group.localToWorld(p.slot.clone()), 3, 1.5, () => [1, 0.6 + Math.random() * 0.4, 0.2]);
      const tm = installing.ctl ? installing.ctl.toolMesh : viewTool;
      if (tm) { const spin = tm.getObjectByName('spin'); if (spin) spin.rotation.z += dt * (state.up.tool >= 2 ? 40 : 8); tm.position.x += Math.sin(t * 60) * 0.0006; }
      ui.bar.hidden = renderer.xr.isPresenting; ui.barFill.style.width = (k * 100) + '%';
      if (renderer.xr.isPresenting) pulse(installing.ctl, 0.15, 20);
      if (installing.t >= 1) finishInstall();
    }
  } else ui.bar.hidden = true;

  // flyers (picked-up parts zipping to your hand)
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt / f.dur;
    const tp = f.target.getWorldPosition(new THREE.Vector3());
    f.obj.position.lerpVectors(f.from, tp, Math.min(1, f.t));
    f.obj.scale.setScalar(Math.max(0.05, 1 - f.t));
    if (f.t >= 1) { f.obj.removeFromParent(); f.obj.scale.setScalar(1); flyers.splice(i, 1); }
  }
  // floaters
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt; f.s.position.y += dt * 0.35; f.s.material.opacity = Math.min(1, 2.5 - f.t);
    if (f.t > 2.5) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); floaters.splice(i, 1); }
  }
  stepPoints(sparks, dt, 6, 1, 1.6);
  stepPoints(confetti, dt, 1.2, 2.2, 0.25);
  ghostReady.uniforms.strength.value = 1.0 + Math.sin(t * 5) * 0.4; ghostReady.uniforms.time.value = ghostMat.uniforms.time.value = t;

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('on'); }
  if (vrToastPanel.t > 0) { vrToastPanel.t -= dt; if (vrToastPanel.t <= 0) vrToastPanel.mesh.visible = false; }
  // fluorescent hum louder in the garage
  const hp = rig.position, hum = hp.z < 0.5 && hp.z > -8 ? 0.014 : hp.z > 24 ? 0.01 : 0.0;
  if (hum !== lastHum) { sfx.setHum(hum); lastHum = hum; }

  renderer.render(scene, camera);
  frameCount++;
  if (frameCount === 3) window.__ready = true;
}
let frameCount = 0, lastHum = -1;

// ---------------- start ----------------
refreshViewTool();
applyState();
document.fonts?.ready.then(() => { for (const id in stands) drawLabel(stands[id]); drawShop(); drawBoard(); drawWrist(); });
setStatus('Ready.');
ui.play.disabled = false;
ui.play.onclick = () => { initAudio(); sfx.startAmbience(); ui.menu.hidden = true; ui.hud.hidden = false; playing = true; renderer.domElement.requestPointerLock(); toast('Your animatronics are broken! Cross the street to Freddy\'s and grab the parts off the stage.', 6); };
ui.resetBtn.onclick = () => { if (confirm('Erase your money, upgrades and progress?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
  ui.vr.disabled = false; ui.vr.onclick = enterVR; ui.vrNote.textContent = 'Headset ready: press Enter VR.';
} else ui.vrNote.innerHTML = 'No VR headset found: <b>Play on PC</b> works with mouse + keyboard. Open this page in the Meta Quest Browser to play in VR.';
if (Q.has('autoplay')) { ui.menu.hidden = true; ui.hud.hidden = false; playing = true; }
renderer.setAnimationLoop(frame);

// test hooks
window.game = { state, parts, stands, buy, applyState, pickUp, actionStart, actionEnd, get aim() { return deskAim; }, get installing() { return installing; },
  info() { return { ...renderer.info.render, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length }; },
  view(x, z, a, b) { rig.position.set(x, world.floorY(x, z), z); yaw = a; pitch = b; }, finishAll() { for (const p of parts) if (p.state !== 'installed') { state.bag = [p.id]; p.state = 'bag'; installing = { part: p, st: stands[p.standId], ctl: null, t: 1, from: p.slot.clone() }; stands[p.standId].group.add(p.group); finishInstall(); } } };
