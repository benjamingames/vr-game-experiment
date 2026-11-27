// FNAF Morphs: a VR-only game. Wear an animatronic in the FNAF 1 pizzeria.
// Renderer + VR input + menu + the springlock timer. The suit itself lives in morph.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NavGrid } from './nav.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Morph, MORPH_DEFS, loadMorphAsset, FAIL } from './morph.js';
import { Menu, WristButton } from './ui.js';
import * as A from './audio.js';
import { SecurityCams } from './cams.js';
import { ChicasParty, MG_ORIGIN, makeDeskProps } from './minigame.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');                       // desktop preview for developers; the game itself is VR only
const LOCK_AT = +(Q.get('lockat') || 90);           // seconds after putting a springlock morph on (1 minute 30)
const $ = id => document.getElementById(id);
const ui = { menu: $('menu'), vr: $('vrBtn'), dbgBtn: $('dbgBtn'), note: $('vrNote'), status: $('loadStatus'), stage: $('stage'), dbg: $('dbg') };

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
ui.stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080c);
scene.fog = new THREE.Fog(0x07080c, 10, 34);
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a3340, 1.9));
const sun = new THREE.DirectionalLight(0xffe2b8, 1.1); sun.position.set(-3, 6, 4); scene.add(sun);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------------- the map ----------------
ui.status.textContent = 'Loading the pizzeria...';
const mapG = await new GLTFLoader().loadAsync('./models/map.glb', e => { if (e.total) ui.status.textContent = 'Loading the pizzeria... ' + Math.round(e.loaded / e.total * 100) + '%'; });
const map = mapG.scene; scene.add(map);
map.traverse(o => { if (o.isMesh && o.material) { o.material.side = THREE.FrontSide; if (o.material.map) o.material.map.anisotropy = 4; } });
const nav = new NavGrid(map, { cell: 0.1, floorY: 0 });
const SPAWN = (() => { const [x, z] = Q.has('pos') ? Q.get('pos').split(',').map(Number) : [-2.1, -10.9]; return new THREE.Vector3(x, nav.floorAt(x, z), z); })();
rig.position.copy(SPAWN);

// ---------------- state ----------------
const S = {
  morph: null, morphId: null,
  inVR: false, locked: false, timerOn: true, lockT: 0, failing: false, eyeHeight: 1.6, speed: 0,
  mirror: { on: false, obj: null },
  yaw: Math.PI, pitch: 0, third: Q.get('view') === 'third',
};
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const keys = {};

// ---------------- controllers ----------------
const ctls = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(c, grip);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff9a3c }));
  line.scale.z = 2; line.visible = false; line.renderOrder = 70; line.material.depthTest = false; c.add(line);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.visible = false; dot.renderOrder = 71; scene.add(dot);
  const ctl = { i, c, grip, line, dot, gamepad: null, side: null, connected: false, trigPrev: false, yPrev: false, hoverPrev: -1 };
  c.addEventListener('connected', e => { ctl.gamepad = e.data.gamepad; ctl.side = e.data.handedness; ctl.connected = true; });
  c.addEventListener('disconnected', () => { ctl.gamepad = null; ctl.connected = false; });
  ctls.push(ctl);
}
const side = s => ctls.find(c => c.side === s && c.connected);
const buzz = (ctl, v = 0.4, ms = 30) => { try { ctl.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch { /* no haptics */ } };

// ---------------- menu + wrist button ----------------
const menu = new Menu(scene, { onButton: onMenuButton });
const wrist = new WristButton(); scene.add(wrist.mesh);
const raycaster = new THREE.Raycaster();

function headPose() {
  if (S.inVR || !DEBUG) { camera.getWorldPosition(tmpV); camera.getWorldQuaternion(tmpQ); return { eye: tmpV.clone(), quat: tmpQ.clone() }; }
  // desktop preview: the "head" is the rig, the camera may be orbiting behind it in third-person view
  return { eye: new THREE.Vector3(rig.position.x, rig.position.y + 1.6, rig.position.z), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ')) };
}

async function selectMorph(id) {
  if (S.morph) { scene.remove(S.morph.root); S.morph = null; S.morphId = null; }
  if (id === 'none') { setStatus('You are not wearing a morph.'); return; }
  const def = MORPH_DEFS.find(d => d.id === id); setStatus('Loading ' + def.label + '...');
  const gltf = await loadMorphAsset(def);
  const m = new Morph(def, gltf); scene.add(m.root);
  m.calibrate(S.eyeHeight); m.showHead(S.third && !S.inVR);
  setStatus(def.climb ? 'Hold GRIP with a hand on a wall to stab in and climb!' : '');
  S.morph = m; S.morphId = id; S.lockT = 0; S.failing = false;
  menu.set('morph', id); menu.set('hasMask', !!m.mask); menu.set('mask', false);
  if (m.mask) setStatus('Hold GRIP next to your head and pull up to open the mask.');
}
function calibrate() {
  const h = S.inVR ? headPose().eye.y - rig.position.y : 1.6;
  S.eyeHeight = THREE.MathUtils.clamp(h, 1.2, 2.0);
  S.morph?.calibrate(S.eyeHeight);
  setStatus('Height set to ' + S.eyeHeight.toFixed(2) + ' m.');
}
function setStatus(t) { menu.set('status', t); S.statusText = t; }

function triggerSpringlock() {
  if (!S.morph || S.failing) return;
  S.failing = true; S.lockT = 0;
  A.playLaugh(FAIL.laughDelay, FAIL.laugh);
  S.morph.startFail();
  for (const c of ctls) buzz(c, 1, 140);
}

// ---------------- mirrors (real planar reflections) ----------------
// head meshes live on layer 5 so you never see the inside of your own head, but every mirror does
function makeMirror(w, h, texW = 768) {
  const g = new THREE.Group();
  const r = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: texW, textureHeight: Math.round(texW * h / w), color: 0xc9d3dd, clipBias: 0.003, multisample: 2 });
  r.camera.layers.enable(5); r.position.y = h / 2 + 0.2; g.add(r);
  const fm = new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.6, roughness: 0.45 }), t = 0.08;
  for (const [bw, bh, x, y] of [[w + t * 2, t, 0, h + 0.2 + t / 2], [w + t * 2, t, 0, 0.2 - t / 2], [t, h + t * 2, -w / 2 - t / 2, h / 2 + 0.2], [t, h + t * 2, w / 2 + t / 2, h / 2 + 0.2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), fm); b.position.set(x, y, -0.02); g.add(b); }
  scene.add(g); return g;
}
// the permanent one: on the back wall of the show stage, facing the dining room
const STAGE_MIRROR = (() => {
  const x = -0.1; let wz = -13.2;
  for (let z = -11.8; z > -14.2; z -= 0.05) { const k = nav.cellAt(x, z); if (k < 0 || nav.blocked[k] || nav.floor[k] < -1e8) { wz = z + 0.05; break; } }
  const g = makeMirror(3.2, 2.0), fy = nav.floorAt(x, wz + 0.6);
  g.position.set(x, fy + 0.35, wz + 0.04); return g;
})();
// the portable one (menu button): appears 2 m in front of you
function setMirror(on) {
  S.mirror.on = on; menu.set('mirror', on);
  if (!S.mirror.obj) S.mirror.obj = makeMirror(1.5, 2.2, 512);
  const g = S.mirror.obj; g.visible = on;
  if (on) {
    const { eye, quat } = headPose(); const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat); f.y = 0; f.normalize();
    g.position.set(eye.x + f.x * 2.0, rig.position.y, eye.z + f.z * 2.0); g.lookAt(eye.x, g.position.y, eye.z);
  }
}

function onMenuButton(id) {
  A.sfxClick();
  if (id.startsWith('morph:')) selectMorph(id.slice(6));
  else if (id === 'timer') { S.timerOn = !S.timerOn; S.lockT = 0; menu.set('timer', S.timerOn); }
  else if (id === 'springlock') { if (S.morph) { menu.close(); triggerSpringlock(); } else setStatus('Put on Spring Bonnie or Springtrap first.'); }
  else if (id === 'mirror') setMirror(!S.mirror.on);
  else if (id === 'mask') { if (S.morph?.mask) { const v = S.morph.mask.target < 0.5 ? 1 : 0; S.morph.setMask(v); menu.set('mask', !!v); } }
  else if (id === 'calibrate') calibrate();
  else if (id === 'spawn') { if (S.mg) { leaveMinigame(false); return; } rig.position.copy(SPAWN); setStatus('Back at the start.'); }
  else if (id === 'close') menu.close();
}
menu.set('timer', true);

// ---------------- movement ----------------
function snapTurn(a) {
  camera.getWorldPosition(tmpV); rig.rotation.y += a; rig.updateMatrixWorld(true); camera.getWorldPosition(tmpV2);
  rig.position.x += tmpV.x - tmpV2.x; rig.position.z += tmpV.z - tmpV2.z;
}
let snapReady = true, lastX = SPAWN.x, lastZ = SPAWN.z, wristCool = 0;
function stepPlayer(dt) {
  let mx = 0, mz = 0, fwdYaw = 0;
  const vr = S.inVR;
  if (vr) {
    camera.getWorldQuaternion(tmpQ); const f = tmpV.set(0, 0, -1).applyQuaternion(tmpQ); fwdYaw = Math.atan2(-f.x, -f.z);
    const L = side('left'), R = side('right');
    if (L?.gamepad && L.gamepad.axes.length >= 4) { const ax = L.gamepad.axes[2], ay = L.gamepad.axes[3]; if (Math.hypot(ax, ay) > 0.15) { mx = ax; mz = ay; } }
    if (R?.gamepad && R.gamepad.axes.length >= 4) {
      const ax = R.gamepad.axes[2];
      if (Math.abs(ax) > 0.7 && snapReady) { snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); snapReady = false; }
      if (Math.abs(ax) < 0.3) snapReady = true;
    }
    camera.getWorldPosition(tmpV); var hx = tmpV.x, hz = tmpV.z;
  } else if (DEBUG) {
    if (keys.KeyW) mz -= 1; if (keys.KeyS) mz += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    fwdYaw = S.yaw; hx = rig.position.x; hz = rig.position.z;
  } else { hx = rig.position.x; hz = rig.position.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    const sp = keys.ShiftLeft ? 3.8 : 2.2, k = Math.min(1, len) / len * sp * dt, s = Math.sin(fwdYaw), c = Math.cos(fwdYaw);
    const nx = hx + (mx * c + mz * s) * k, nz = hz + (-mx * s + mz * c) * k;
    const [ax, az] = S.mg ? MG.move(hx, hz, nx, nz) : nav.move(hx, hz, nx, nz, 0.22);
    rig.position.x += ax - hx; rig.position.z += az - hz; hx = ax; hz = az;
  } else if (S.mg) { const [ax, az] = MG.move(hx, hz, hx, hz); rig.position.x += ax - hx; rig.position.z += az - hz; hx = ax; hz = az;
  } else if (nav.hit(hx, hz, 0.22)) {   // pushed into a wall by room-scale walking: nudge back out
    const [ax, az] = nav.move(lastX, lastZ, hx, hz, 0.22); rig.position.x += ax - hx; rig.position.z += az - hz; hx = ax; hz = az;
  }
  S.speed += (Math.min(6, Math.hypot(hx - lastX, hz - lastZ) / Math.max(dt, 1e-4)) - S.speed) * Math.min(1, dt * 8);
  lastX = hx; lastZ = hz;
}

// ---------------- Foxy: stab a hook into a wall and climb ----------------
// Hold GRIP with a hand against a tall wall: the hook bites in and that hand stays pinned there. Pull with your arms and the whole
// player moves the opposite way, so you haul yourself up (either hand, or both). Let go and you drop (with a little throw).
const climb = { L: null, R: null, vy: 0, air: false, climbing: false, vel: new THREE.Vector3(), fake: null };
function handState(sd) {
  if (climb.fake) { const f = climb.fake[sd]; return { pos: rig.localToWorld(f.local.clone()), squeeze: f.squeeze, fake: true }; }
  const ctl = side(sd === 'L' ? 'left' : 'right'); if (!ctl) return null;
  const p = gripPose(ctl), tp = S.morph?.triggerPos?.(sd, new THREE.Vector3()); return { pos: tp || p.pos, squeeze: !!ctl.gamepad?.buttons[1]?.pressed, ctl };
}
function stepClimb(dt) {
  const can = !!S.morph?.def.climb;
  const head = headPose().eye;
  let n = 0, dx = 0, dy = 0, dz = 0, ceil = 6;
  for (const sd of ['L', 'R']) {
    const h = can ? handState(sd) : null;
    if (!h || !h.squeeze) { climb[sd] = null; continue; }
    if (!climb[sd]) {                                   // hand closed: stab if a tall wall is right there
      const w = nav.wallNear(h.pos.x, h.pos.y, h.pos.z, 0.22);
      if (w && h.pos.y > nav.floorAt(h.pos.x, h.pos.z) + 0.15) { climb[sd] = { p: h.pos.clone(), top: w.top }; A.playStab(); if (h.ctl) buzz(h.ctl, 1, 90); }
      continue;
    }
    dx += climb[sd].p.x - h.pos.x; dy += climb[sd].p.y - h.pos.y; dz += climb[sd].p.z - h.pos.z; ceil = Math.min(ceil, climb[sd].top + 0.4); n++;
  }
  if (n) {
    dx /= n; dy /= n; dz /= n;
    const [ax, az] = nav.move(head.x, head.z, head.x + dx, head.z + dz, 0.2);
    rig.position.x += ax - head.x; rig.position.z += az - head.z;
    const floor = nav.floorAt(ax, az), ny = THREE.MathUtils.clamp(rig.position.y + dy, floor, ceil);
    climb.vel.lerp(tmpV.set(0, (ny - rig.position.y) / Math.max(dt, 1e-4), 0), Math.min(1, dt * 12));
    rig.position.y = ny; climb.climbing = true; climb.air = false; climb.vy = 0;
  } else {
    if (climb.climbing) { climb.climbing = false; climb.air = true; climb.vy = THREE.MathUtils.clamp(climb.vel.y * 0.6, -2, 3); }
    const fy = nav.floorAt(head.x, head.z);
    if (climb.air) { climb.vy -= 9.8 * dt; rig.position.y += climb.vy * dt; if (rig.position.y <= fy) { rig.position.y = fy; climb.air = false; climb.vy = 0; } }
    else rig.position.y += (fy - rig.position.y) * Math.min(1, dt * 12);
  }
  S.climbing = climb.climbing;
}

// ---------------- Springtrap mask: grab next to your head (grip) and pull up / down ----------------
const maskGrab = { L: null, R: null };
function stepMask(dt) {
  const m = S.morph?.mask; if (!m) { maskGrab.L = maskGrab.R = null; return; }
  const eye = headPose().eye;
  for (const sd of ['L', 'R']) {
    const h = handState(sd);
    if (!h || !h.squeeze) { if (maskGrab[sd]) { const v = m.target >= 0.5 ? 1 : 0; S.morph.setMask(v); menu.set('mask', !!v); maskGrab[sd] = null; } continue; }
    if (!maskGrab[sd]) {
      if (h.pos.distanceTo(tmpV.copy(eye).add(tmpV2.set(0, 0.05, 0))) < 0.34) { maskGrab[sd] = { y: h.pos.y, a: m.target }; if (h.ctl) buzz(h.ctl, 0.5, 40); }
      continue;
    }
    S.morph.setMask(maskGrab[sd].a + (h.pos.y - maskGrab[sd].y) / 0.22);
  }
}

// ---------------- VR menu interaction ----------------
function stepMenuInput(dt) {
  const head = headPose();
  wristCool -= dt;
  // wrist button hangs above the left hand and always faces the head
  const L = side('left'), R = side('right');
  wrist.mesh.visible = !!L && S.inVR;
  if (L) {
    L.grip.getWorldPosition(tmpV); L.grip.getWorldQuaternion(tmpQ);
    wrist.mesh.position.copy(tmpV).add(tmpV2.set(0, 0.11, 0.02).applyQuaternion(tmpQ));
    wrist.mesh.lookAt(head.eye);
  }
  let timerText = '';
  if (S.morph?.def.springlock && S.timerOn) { const r = Math.max(0, Math.ceil(LOCK_AT - S.lockT)); timerText = S.failing ? '!!!' : Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); }
  // poke it with the right hand, or point + trigger
  let near = false;
  if (R && wrist.mesh.visible) { R.grip.getWorldPosition(tmpV2); near = tmpV2.distanceTo(wrist.mesh.position) < 0.07; if (near && wristCool <= 0) { toggleMenu(); wristCool = 0.8; buzz(R, 0.5, 40); } }
  wrist.draw(timerText, near);
  // Y button on the left controller also opens the menu
  if (L?.gamepad) { const y = !!L.gamepad.buttons[5]?.pressed; if (y && !L.yPrev) toggleMenu(); L.yPrev = y; }
  // rays
  for (const ctl of ctls) {
    if (!ctl.connected) { ctl.line.visible = false; ctl.dot.visible = false; continue; }
    ctl.c.getWorldPosition(tmpV); ctl.c.getWorldQuaternion(tmpQ);
    raycaster.ray.origin.copy(tmpV); raycaster.ray.direction.set(0, 0, -1).applyQuaternion(tmpQ);
    const trig = !!ctl.gamepad?.buttons[0]?.pressed, edge = trig && !ctl.trigPrev; ctl.trigPrev = trig;
    let hit = { i: -1, dist: 0 };
    if (menu.visible) hit = menu.hit(raycaster);
    ctl.line.visible = menu.visible; ctl.line.scale.z = hit.i >= 0 || hit.dist ? hit.dist : 1.5;
    ctl.dot.visible = hit.dist > 0; if (hit.dist) ctl.dot.position.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, hit.dist);
    if (menu.visible && hit.i !== ctl.hoverPrev) { if (hit.i >= 0) buzz(ctl, 0.2, 15); ctl.hoverPrev = hit.i; }
    if (menu.visible) { menu.setHover(hit.i); if (edge && hit.i >= 0) { menu.press(hit.i); buzz(ctl, 0.6, 40); } }
    else if (edge && wrist.mesh.visible) { const w = raycaster.intersectObject(wrist.mesh, false)[0]; if (w && w.distance < 2) toggleMenu(); }
  }
  menu.tick();
}
function toggleMenu() { const h = headPose(); if (!menu.visible) { menu.set('status', S.statusText || ''); } menu.toggle(h.eye, h.quat); }

// ---------------- per-frame update ----------------
let fakeT = 0;
function drive(eye, quat, Lg, Rg, mirrored) {
  return { eye, headQuat: quat, L: Lg, R: Rg, speed: S.speed, laugh: S.laughLevel || 0 };
}
function handPose(sd) { if (climb.fake) { const h = handState(sd); return { pos: h.pos, quat: rig.quaternion.clone() }; } return gripPose(side(sd === 'L' ? 'left' : 'right')); }
function gripPose(ctl) { if (!ctl?.connected) return null; const pos = new THREE.Vector3(), q = new THREE.Quaternion(); ctl.grip.getWorldPosition(pos); ctl.grip.getWorldQuaternion(q); return { pos, quat: q }; }

// ---------------- Chica's Party minigame ----------------
const MG = new ChicasParty(scene);
S.mg = false;
const deskProps = makeDeskProps(scene, 0.77, await new GLTFLoader().loadAsync('./models/mrcupcake.glb'));
let mgSaved = null, mgCool = 2;
function rawHand(sd) {
  if (climb.fake) { const f = climb.fake[sd]; return { pos: rig.localToWorld(f.local.clone()), grab: !!f.squeeze }; }
  const ctl = side(sd === 'L' ? 'left' : 'right'); if (!ctl) return null; const gp = gripPose(ctl); if (!gp) return null;
  const b = ctl.gamepad?.buttons; return { pos: gp.pos, grab: !!(b?.[0]?.pressed || b?.[1]?.pressed) };
}
function stepDeskProps(dt) {
  mgCool -= dt;
  if (mgCool > 0 || !(S.inVR || S.desktop)) return;
  const head = headPose().eye, hands = ['L', 'R'].map(rawHand).filter(Boolean);
  for (const d of deskProps) {
    const c = d.m.position.clone(); c.y += 0.14; const dh = head.distanceTo(c) < 0.45, dhand = hands.some(h => h.pos.distanceTo(c) < 0.22);
    if (dh || dhand) { enterMinigame(d.name); return; }
  }
}
function enterMinigame(who) {
  mgSaved = { pos: rig.position.clone(), yaw: rig.rotation.y, bg: scene.background, fog: scene.fog, third: S.third };
  menu.close(); S.mg = true; map.visible = false; STAGE_MIRROR.visible = false; if (S.mirror.obj) S.mirror.obj.visible = false;
  scene.background = new THREE.Color(0x2a1650); scene.fog = null;
  // stand on your side of the wall, facing it
  camera.getWorldPosition(tmpV); camera.getWorldQuaternion(tmpQ); const f = tmpV2.set(0, 0, -1).applyQuaternion(tmpQ), yaw = Math.atan2(-f.x, -f.z);
  rig.rotation.y -= yaw; rig.updateMatrixWorld(true); camera.getWorldPosition(tmpV2);
  rig.position.x += MG_ORIGIN.x - tmpV2.x; rig.position.z += MG_ORIGIN.z + 0.9 - tmpV2.z; rig.position.y = MG_ORIGIN.y;
  lastX = MG_ORIGIN.x; lastZ = MG_ORIGIN.z + 0.9; climb.vy = 0; climb.vel.set(0, 0, 0);
  MG.onExit = won => leaveMinigame(won); MG.start();
  setStatus(who + ' invited you to Chica\'s Party! Feed 10 kids. (Menu > Back to start leaves.)');
}
function leaveMinigame(won) {
  if (!S.mg) return; S.mg = false; MG.stop(); map.visible = true; STAGE_MIRROR.visible = true; if (S.mirror.obj) S.mirror.obj.visible = S.mirror.on;
  scene.background = mgSaved.bg; scene.fog = mgSaved.fog; rig.rotation.y = mgSaved.yaw; rig.position.copy(mgSaved.pos); rig.updateMatrixWorld(true);
  lastX = rig.position.x; lastZ = rig.position.z; mgCool = 3;
  setStatus(won ? 'You won Chica\'s Party! The kids loved the cupcakes.' : 'Back in the pizzeria.');
}
// ---------------- security cameras (wall monitor + button panel on the desk) ----------------
const cams = new SecurityCams(scene, renderer, []);
function stepCams(dt) {
  cams.hide = [cams.screen, STAGE_MIRROR, ...(S.mirror.obj ? [S.mirror.obj] : [])];
  const hp = headPose();
  cams.update(dt, ['L', 'R'].map(rawHand).filter(Boolean).map(h => h.pos), hp.eye, hp.quat);
}
function stepMinigame(dt) {
  rig.updateMatrixWorld(true);
  MG.update(dt, { L: rawHand('L'), R: rawHand('R') });
}

function tick(dt) {
  stepPlayer(dt);
  if (!S.mg) { stepClimb(dt); stepMask(dt); stepDeskProps(dt); stepCams(dt); } else stepMinigame(dt);
  rig.updateMatrixWorld(true);
  stepMenuInput(dt);
  // springlock countdown
  if (S.morph && S.morph.def.springlock && S.timerOn && !S.failing) { S.lockT += dt; if (S.lockT >= LOCK_AT) triggerSpringlock(); }
  if (S.failing && !S.morph?.failing) { S.failing = false; S.lockT = 0; }
  // laugh loudness: real audio when it is playing, otherwise a stand-in so the animation still moves in the desktop preview
  const ft = S.morph?.fail?.t;
  S.laughLevel = ft === undefined ? 0 : (A.isRunning() ? A.laughAmount(dt) : (ft > FAIL.laughDelay && ft < FAIL.laughDelay + FAIL.laugh ? 0.35 + 0.65 * Math.abs(Math.sin(ft * 6.5)) : 0));
  if (S.morph) {
    const { eye, quat } = headPose();
    const Lg = handPose('L'), Rg = handPose('R');
    S.morph.update(dt, drive(eye, quat, Lg, Rg));
  }
}

// ---------------- desktop preview (debug only) ----------------
if (DEBUG) {
  ui.dbg.style.display = 'block';
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyM') toggleMenu();
    if (e.code === 'KeyL') triggerSpringlock();
    if (e.code === 'Digit1') selectMorph('springbonnie'); if (e.code === 'Digit2') selectMorph('springtrap'); if (e.code === 'Digit0') selectMorph('none');
    if (e.code === 'KeyR') setMirror(!S.mirror.on);
    if (e.code === 'KeyV') { S.third = !S.third; S.morph?.showHead(S.third); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('mousemove', e => { if (!S.locked) return; S.yaw -= e.movementX * 0.0024; S.pitch = THREE.MathUtils.clamp(S.pitch - e.movementY * 0.0024, -1.4, 1.4); });
  document.addEventListener('pointerlockchange', () => { S.locked = document.pointerLockElement === renderer.domElement; });
  renderer.domElement.addEventListener('click', e => {
    if (!S.locked && !menu.visible) { renderer.domElement.requestPointerLock(); return; }
    if (menu.visible) { const r = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); const h = menu.hit(raycaster); if (h.i >= 0) menu.press(h.i); }
  });
  ui.dbgBtn.hidden = false;
  ui.dbgBtn.onclick = () => { A.initAudio(); startDesktop(); };
}
function placeDesktopCamera() {
  camera.rotation.set(S.pitch, 0, 0); rig.rotation.y = S.yaw;
  if (S.third) { camera.position.set(0.7, 1.55, -2.6); camera.rotation.set(-0.08, Math.PI + 0.25, 0); } else camera.position.set(0, 1.6, 0);
  if (Q.has('cam')) { rig.updateMatrixWorld(true); const c = Q.get('cam').split(',').map(Number); camera.position.copy(rig.worldToLocal(new THREE.Vector3(c[0], c[1], c[2]))); if (Q.has('camlook')) { const l = Q.get('camlook').split(',').map(Number); camera.lookAt(l[0], l[1], l[2]); } }
}
function startDesktop() { ui.menu.hidden = true; S.desktop = true; if (Q.get('menu') !== '0') setTimeout(() => toggleMenu(), 50); }

// ---------------- VR session ----------------
const xr = navigator.xr;
let vrOK = false;
if (xr) { try { vrOK = await xr.isSessionSupported('immersive-vr'); } catch { vrOK = false; } }
ui.status.textContent = '';
if (vrOK) { ui.vr.disabled = false; ui.note.innerHTML = 'Ready. Put the headset on and press <b>Enter VR</b>.'; }
else ui.note.innerHTML = '<b>FNAF Morphs only works in VR.</b> Open this page in the Meta Quest Browser.';
ui.vr.addEventListener('click', async () => {
  A.initAudio();
  try {
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(session);
  } catch (e) { ui.note.textContent = 'Could not start VR: ' + e.message; }
});
renderer.xr.addEventListener('sessionstart', () => {
  S.inVR = true; ui.menu.hidden = true; rig.rotation.set(0, Math.PI, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  rig.position.copy(SPAWN);
  setTimeout(() => { calibrate(); setStatus(''); if (!menu.visible) toggleMenu(); }, 900);
});
renderer.xr.addEventListener('sessionend', () => { S.inVR = false; menu.close(); ui.menu.hidden = false; A.stopLaugh(); });

// ---------------- loop ----------------
let last = performance.now(), hudT = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fakeT += dt;
  if (!S.inVR && !S.desktop) { renderer.render(scene, camera); return; }
  if (!S.inVR) placeDesktopCamera();
  tick(dt);
  if (DEBUG && (hudT += dt) > 0.5) { hudT = 0; ui.dbg.textContent = `pos ${rig.position.x.toFixed(1)}, ${rig.position.z.toFixed(1)}  morph ${S.morphId || '-'}  lock ${S.lockT.toFixed(0)}s${S.failing ? ' FAILING' : ''}`; }
  renderer.render(scene, camera);
});

// scripted starts for screenshots / tests (?debug=1&morph=springtrap&mirror=1&fail=2)
window.fm = { scene, rig, camera, nav, S, menu, climb, STAGE_MIRROR, MG, deskProps, cams, enterMinigame, leaveMinigame, setStatus, selectMorph, triggerSpringlock, setMirror, toggleMenu, tick, headPose, calibrate,
  step(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) { placeDesktopCamera(); tick(dt); } } };
if (DEBUG) {
  if (Q.has('start')) startDesktop();
  if (Q.has('yaw')) S.yaw = +Q.get('yaw');
  if (Q.has('pitch')) S.pitch = +Q.get('pitch');
  if (Q.has('morph')) await selectMorph(Q.get('morph'));
  if (Q.get('mirror') === '1') setMirror(true);
  if (Q.get('mg') === '1') setTimeout(() => enterMinigame('Test'), 300);
}
