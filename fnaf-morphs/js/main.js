// FNAF Morphs: a VR-only game. Wear an animatronic in the FNAF 1 pizzeria.
// Renderer + VR input + menu + the springlock timer. The suit itself lives in morph.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NavGrid } from './nav.js';
import { Morph, MORPH_DEFS, loadMorphAsset, FAIL, reflectPos, reflectQuat } from './morph.js';
import { Menu, WristButton } from './ui.js';
import * as A from './audio.js';

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
// prefetch the morph models while the player reads the menu
MORPH_DEFS.forEach(d => loadMorphAsset(d).catch(e => console.warn('load failed', d.id, e)));

// ---------------- state ----------------
const S = {
  morph: null, morphId: null, mirrorMorph: null,
  inVR: false, locked: false, timerOn: true, lockT: 0, failing: false, eyeHeight: 1.6, speed: 0,
  mirror: { on: false, P: new THREE.Vector3(), N: new THREE.Vector3(0, 0, 1), group: null },
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
  killMirrorClone();
  if (id === 'none') { setStatus('You are not wearing a morph.'); return; }
  const def = MORPH_DEFS.find(d => d.id === id); setStatus('Loading ' + def.label + '...');
  const gltf = await loadMorphAsset(def);
  const m = new Morph(def, gltf); scene.add(m.root);
  m.calibrate(S.eyeHeight); m.showHead(S.third && !S.inVR);
  S.morph = m; S.morphId = id; S.lockT = 0; S.failing = false;
  menu.set('morph', id);
  if (S.mirror.on) makeMirrorClone();
  setStatus('');
}
function calibrate() {
  const h = S.inVR ? headPose().eye.y - rig.position.y : 1.6;
  S.eyeHeight = THREE.MathUtils.clamp(h, 1.2, 2.0);
  S.morph?.calibrate(S.eyeHeight); S.mirrorMorph?.calibrate(S.eyeHeight);
  setStatus('Height set to ' + S.eyeHeight.toFixed(2) + ' m.');
}
function setStatus(t) { menu.set('status', t); S.statusText = t; }

function triggerSpringlock() {
  if (!S.morph || S.failing) return;
  S.failing = true; S.lockT = 0;
  A.playLaugh(FAIL.laughDelay, FAIL.laugh);
  S.morph.startFail(); S.mirrorMorph?.startFail();
  for (const c of ctls) buzz(c, 1, 140);
}

function killMirrorClone() { if (S.mirrorMorph) { scene.remove(S.mirrorMorph.root); S.mirrorMorph = null; } }
function placeMirror() {
  const { eye, quat } = headPose(); const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat); f.y = 0; f.normalize();
  const M = S.mirror; M.P.copy(eye).addScaledVector(f, 2.2); M.P.y = rig.position.y; M.N.copy(f).negate();
  if (!M.group) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.y = 1.2; g.add(glass);
    const fm = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.7, roughness: 0.4 });
    for (const [w, h, x, y] of [[1.62, 0.06, 0, 2.38], [1.62, 0.06, 0, 0.03], [0.06, 2.4, -0.78, 1.2], [0.06, 2.4, 0.78, 1.2]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), fm); b.position.set(x, y, 0); g.add(b); }
    M.group = g; scene.add(g);
  }
  M.group.visible = true; M.group.position.copy(M.P); M.group.lookAt(M.P.x + M.N.x, M.P.y, M.P.z + M.N.z);
}
function makeMirrorClone() {
  killMirrorClone(); if (!S.morph) return;
  loadMorphAsset(S.morph.def).then(g => { if (!S.mirror.on || !S.morph) return; const m = new Morph(S.morph.def, g); m.calibrate(S.eyeHeight); m.showHead(true); scene.add(m.root); S.mirrorMorph = m; });
}
function setMirror(on) {
  S.mirror.on = on; menu.set('mirror', on);
  if (on) { placeMirror(); makeMirrorClone(); } else { if (S.mirror.group) S.mirror.group.visible = false; killMirrorClone(); }
}

function onMenuButton(id) {
  A.sfxClick();
  if (id.startsWith('morph:')) selectMorph(id.slice(6));
  else if (id === 'timer') { S.timerOn = !S.timerOn; S.lockT = 0; menu.set('timer', S.timerOn); }
  else if (id === 'springlock') { if (S.morph) { menu.close(); triggerSpringlock(); } else setStatus('Put on Spring Bonnie or Springtrap first.'); }
  else if (id === 'mirror') setMirror(!S.mirror.on);
  else if (id === 'calibrate') calibrate();
  else if (id === 'spawn') { rig.position.copy(SPAWN); setStatus('Back at the start.'); }
  else if (id === 'close') menu.close();
}
menu.set('timer', true);

// ---------------- movement ----------------
function snapTurn(a) {
  camera.getWorldPosition(tmpV); rig.rotation.y += a; rig.updateMatrixWorld(true); camera.getWorldPosition(tmpV2);
  rig.position.x += tmpV.x - tmpV2.x; rig.position.z += tmpV.z - tmpV2.z;
}
let snapReady = true, lastX = 0, lastZ = 0, wristCool = 0;
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
    const [ax, az] = nav.move(hx, hz, nx, nz, 0.22);
    rig.position.x += ax - hx; rig.position.z += az - hz; hx = ax; hz = az;
  } else if (nav.hit(hx, hz, 0.22)) {   // pushed into a wall by room-scale walking: nudge back out
    const [ax, az] = nav.move(lastX, lastZ, hx, hz, 0.22); rig.position.x += ax - hx; rig.position.z += az - hz; hx = ax; hz = az;
  }
  S.speed += (Math.min(6, Math.hypot(hx - lastX, hz - lastZ) / Math.max(dt, 1e-4)) - S.speed) * Math.min(1, dt * 8);
  lastX = hx; lastZ = hz;
  const fy = nav.floorAt(hx, hz); rig.position.y += (fy - rig.position.y) * Math.min(1, dt * 12);
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
  if (S.morph && S.timerOn) { const r = Math.max(0, Math.ceil(LOCK_AT - S.lockT)); timerText = S.failing ? '!!!' : Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0'); }
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
function gripPose(ctl) { if (!ctl?.connected) return null; const pos = new THREE.Vector3(), q = new THREE.Quaternion(); ctl.grip.getWorldPosition(pos); ctl.grip.getWorldQuaternion(q); return { pos, quat: q }; }

function tick(dt) {
  stepPlayer(dt);
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
    const Lg = gripPose(side('left')), Rg = gripPose(side('right'));
    S.morph.update(dt, drive(eye, quat, Lg, Rg));
    if (S.mirrorMorph && S.mirror.on) {
      const { P, N } = S.mirror;
      const m = S.mirrorMorph, mq = r => r ? { pos: reflectPos(r.pos, P, N), quat: reflectQuat(r.quat, N) } : null;
      // a mirror image swaps left and right: your right hand is the reflection's left hand
      m.update(dt, drive(reflectPos(eye, P, N), reflectQuat(quat, N), mq(Rg), mq(Lg)));
    }
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
window.fm = { scene, rig, camera, nav, S, menu, selectMorph, triggerSpringlock, setMirror, toggleMenu, tick, headPose, calibrate,
  step(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) { placeDesktopCamera(); tick(dt); } } };
if (DEBUG) {
  if (Q.has('start')) startDesktop();
  if (Q.has('yaw')) S.yaw = +Q.get('yaw');
  if (Q.has('pitch')) S.pitch = +Q.get('pitch');
  if (Q.has('morph')) await selectMorph(Q.get('morph'));
  if (Q.get('mirror') === '1') setMirror(true);
}
