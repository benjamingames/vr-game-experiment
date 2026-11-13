// Boss Arena: main (renderer, VR + desktop input, the Minecraft player, bosses, UI).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildArena } from './arena.js';
import { Steve, makeBlockHand, loadGLB } from './steve.js';
import { Boss } from './boss.js';
import { sfx, initAudio } from './audio.js';
import * as T from './textures.js';

const Q = new URLSearchParams(location.search);
const isQuest = /OculusBrowser|Quest|Pacific/i.test(navigator.userAgent);
const quality = Q.get('quality') || (isQuest ? 'low' : 'high');
const $ = id => document.getElementById(id);
const ui = { menu: $('menu'), hud: $('hud'), vr: $('vrBtn'), play: $('playBtn'), note: $('vrNote'), status: $('loadStatus'), toast: $('toast'), stage: $('stage') };

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
ui.stage.appendChild(renderer.domElement);
T.setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080c18, 0.0075);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------------- world + characters ----------------
const arena = buildArena(scene, { quality });

// ---------------- models (the player + the two bosses) ----------------
ui.status.textContent = 'Loading characters...';
const prog = {}; const upd = k => e => { if (e.total) { prog[k] = e.loaded / e.total; ui.status.textContent = 'Loading characters... ' + Math.round(Object.values(prog).reduce((x, y) => x + y, 0) / 2 * 100) + '%'; } };
const [springG, demoG] = await Promise.all([
  loadGLB('./models/springtrap.glb', upd('b')), loadGLB('./models/demogorgon.glb', upd('c')),
]);
const hero = new Steve({ height: 1.8, yawOffset: +(Q.get('steveyaw') ?? 0) }); scene.add(hero.root);

// bosses wait on two of the red spawn pads, facing the middle
const spots = arena.bossSpots;
const bosses = [
  new Boss(springG, { name: 'SPRINGTRAP', height: 2.3, yawOffset: +(Q.get('springyaw') ?? 0), speed: 2.3, reach: 2.4, idle: 'idle', walk: 'walk', run: 'run', runDist: 8, attack: ['swing', 'bow', 'miss'], home: spots[4] }),
  new Boss(demoG, { name: 'THE DEMOGORGON', height: 2.1, yawOffset: +(Q.get('demoyaw') ?? 0), speed: 2.6, reach: 2.2, idle: 'idle', walk: 'walkHuntRT', attack: ['swing', 'miss'], home: spots[0] }),
];
for (const b of bosses) { scene.add(b.root, b.label); }
arena.pad.on = false;
let hunting = false;
function toggleHunt() {
  hunting = !hunting; for (const b of bosses) b.setHunting(hunting);
  toast(hunting ? 'The bosses are hunting you! (B to call them off)' : 'The bosses head back to their pads.', 3);
  if (hunting) sfx.cheer();
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// controls board standing near the start
{
  const c = T.canvas(640, 360), g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,.86)'; g.fillRect(0, 0, 640, 360);
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 6; g.strokeRect(8, 8, 624, 344);
  g.fillStyle = '#ffd27a'; g.font = '700 46px "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillText('CONTROLS', 320, 66);
  g.font = '600 29px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#e8eef5';
  ['VR:  left stick move  |  right stick turn', 'VR:  swing your fists  |  A = gates  |  B = hunt', 'PC:  WASD move  |  Shift run  |  mouse look', 'PC:  click / F punch  |  right-click block', 'PC:  E wave  T flex  H ouch  C cheer', 'PC:  V first / third person  G gates  B hunt']
    .forEach((l, i) => g.fillText(l, 36, 124 + i * 40));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: T.tex(c), toneMapped: false }));
  board.position.set(3.6, 1.55, 9.2); board.rotation.y = -0.25; scene.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x20242b, metalness: 0.8, roughness: 0.5 })); post.position.set(3.6, 0.8, 9.15); scene.add(post);
}

// ---------------- player ----------------
const P = { x: 0, z: 10.5, yaw: 0, pitch: -0.1, face: Math.PI, third: Q.get('view') !== 'first', run: false };
if (Q.has('pos')) { const [x, z] = Q.get('pos').split(',').map(Number); P.x = x; P.z = z; }
if (Q.has('look')) { const [a, b] = Q.get('look').split(',').map(Number); P.yaw = a; P.pitch = b; }
const DBG_CAM = Q.has('cam') ? Q.get('cam').split(',').map(Number) : null;   // debug: fixed camera x,y,z
let playing = false, locked = false, lastX = P.x, lastZ = P.z, spdS = 0, snapReady = true;
const keys = {};

// VR controllers with boxing gloves
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(c, grip);
  const ctl = { i, c, grip, gamepad: null, side: null, glove: null, prev: new THREE.Vector3(), cool: 0, aPrev: false };
  c.addEventListener('connected', e => {
    ctl.gamepad = e.data.gamepad; ctl.side = e.data.handedness;
    if (!ctl.glove) { ctl.glove = makeBlockHand(); grip.add(ctl.glove); }
  });
  c.addEventListener('disconnected', () => { ctl.gamepad = null; });
  controllers.push(ctl);
}
function pulse(ctl, v = 0.5, ms = 40) { const a = ctl.gamepad?.hapticActuators?.[0]; a?.pulse?.(v, ms); }

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!playing) return;
  if (e.code === 'KeyF') punch();
  if (e.code === 'KeyE') hero.play('wave');
  if (e.code === 'KeyT') hero.play('taunt');
  if (e.code === 'KeyH') { hero.play('hurt'); sfx.thud(); }
  if (e.code === 'KeyC') { hero.play('cheer'); sfx.cheer(); }
  if (e.code === 'KeyG') toggleGates();
  if (e.code === 'KeyB') toggleHunt();
  if (e.code === 'KeyV') { P.third = !P.third; toast(P.third ? 'Third person' : 'First person'); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousemove', e => {
  if (!locked || renderer.xr.isPresenting) return;
  P.yaw -= e.movementX * 0.0024; P.pitch = Math.max(-1.25, Math.min(1.25, P.pitch - e.movementY * 0.0024));
});
addEventListener('mousedown', e => {
  if (!playing || !locked) return;
  if (e.button === 0) punch(); if (e.button === 2) hero.setHold('block');
});
addEventListener('mouseup', e => { if (e.button === 2) hero.setHold(null); });
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; $('clickHint').style.display = playing && !locked && !renderer.xr.isPresenting ? 'block' : 'none'; });
renderer.domElement.addEventListener('click', () => { if (playing && !locked && !renderer.xr.isPresenting) renderer.domElement.requestPointerLock(); });

function punch() { hero.play('punch'); sfx.whoosh(); }
function toggleGates() { arena.state.open = !arena.state.open; arena.setAllGates(arena.state.open); sfx.gate(); toast(arena.state.open ? 'Gates opening...' : 'Gates closing...'); }
let toastTimer = 0;
function toast(msg, secs = 2.2) { ui.toast.textContent = msg; ui.toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('on'), secs * 1000); }

const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };

function stepPlayer(dt) {
  const vr = renderer.xr.isPresenting;
  let mx = 0, mz = 0, fwdYaw = P.yaw, headX, headZ, headY = 1.62;
  if (vr) {
    camera.getWorldQuaternion(_q); const f = _v.set(0, 0, -1).applyQuaternion(_q); fwdYaw = Math.atan2(-f.x, -f.z);
    for (const ctl of controllers) {
      const gp = ctl.gamepad; if (!gp || gp.axes.length < 4) continue;
      const ax = gp.axes[2], ay = gp.axes[3];
      if (ctl.side === 'left' || (ctl.side !== 'right' && ctl.i === 0)) { if (Math.hypot(ax, ay) > 0.15) { mx += ax; mz += ay; } }
      else {
        if (Math.abs(ax) > 0.7 && snapReady) { snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); snapReady = false; }
        if (Math.abs(ax) < 0.3) snapReady = true;
        const a = !!gp.buttons[4]?.pressed; if (a && !ctl.aPrev) toggleGates(); ctl.aPrev = a;
        const bb = !!gp.buttons[5]?.pressed; if (bb && !ctl.bPrev) toggleHunt(); ctl.bPrev = bb;
      }
    }
    camera.getWorldPosition(_v); headX = _v.x; headZ = _v.z; headY = _v.y;
  } else {
    if (playing) {
      if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    }
    headX = P.x; headZ = P.z;
  }
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    const sp = vr ? 3.0 : (keys.ShiftLeft || keys.ShiftRight ? 5.2 : 2.7);
    const k = Math.min(1, len) / len * sp * dt, s = Math.sin(fwdYaw), c = Math.cos(fwdYaw);
    const dx = (mx * c + mz * s) * k, dz = (-mx * s + mz * c) * k;
    const [nx, nz] = arena.collide(headX + dx, headZ + dz, 0.3);
    if (vr) { rig.position.x += nx - headX; rig.position.z += nz - headZ; headX = nx; headZ = nz; } else { P.x = nx; P.z = nz; headX = nx; headZ = nz; }
    if (!vr && P.third) P.face = lerpAngle(P.face, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
  } else if (!vr) { [P.x, P.z] = arena.collide(P.x, P.z, 0.3); headX = P.x; headZ = P.z; }
  else { const [nx, nz] = arena.collide(headX, headZ, 0.3); rig.position.x += nx - headX; rig.position.z += nz - headZ; headX = nx; headZ = nz; }

  // measured speed drives the walk / run animation
  const inst = Math.hypot(headX - lastX, headZ - lastZ) / Math.max(dt, 1e-4); lastX = headX; lastZ = headZ;
  spdS += (Math.min(inst, 8) - spdS) * Math.min(1, dt * 10);

  // avatar
  const aiming = hero.once || hero.hold;
  if (vr || !P.third || aiming) P.face = lerpAngle(P.face, fwdYaw + Math.PI, vr ? 1 : 1 - Math.exp(-dt * 16));
  if (vr) {
    const sc = Math.max(0.78, Math.min(1.3, headY / 1.62)); hero.root.scale.setScalar(sc);
    hero.root.position.set(headX - Math.sin(P.face) * 0.1, 0, headZ - Math.cos(P.face) * 0.1);
  } else { hero.root.scale.setScalar(1); hero.root.position.set(P.x, 0, P.z); }
  hero.root.rotation.y = P.face;
  hero.setFirstPerson(vr || !P.third); hero.setArmsVisible(!vr && (P.third || !!aiming || !!hero.once));

  // desktop camera
  if (!vr) {
    camera.rotation.set(P.pitch, P.yaw, 0);
    const cy = Math.cos(P.pitch), f3 = _v.set(-Math.sin(P.yaw) * cy, Math.sin(P.pitch), -Math.cos(P.yaw) * cy);
    if (P.third) {
      camera.position.set(P.x, 1.5, P.z).addScaledVector(f3, -3.2);
      camera.position.x += Math.cos(P.yaw) * 0.5; camera.position.z -= Math.sin(P.yaw) * 0.5;
      camera.position.y = Math.max(0.3, camera.position.y);
    } else camera.position.set(P.x - Math.sin(P.yaw) * 0.1, 1.62, P.z - Math.cos(P.yaw) * 0.1);
  }
  if (!vr && DBG_CAM) camera.position.set(...DBG_CAM);
  // VR punch whoosh / haptics from glove speed
  if (vr) for (const ctl of controllers) {
    ctl.grip.getWorldPosition(_v); const v = _v.distanceTo(ctl.prev) / Math.max(dt, 1e-4); ctl.prev.copy(_v); ctl.cool -= dt;
    if (v > 3.2 && ctl.cool <= 0) { sfx.whoosh(); pulse(ctl, 0.35, 30); ctl.cool = 0.35; }
  }
}
function snapTurn(a) {
  camera.getWorldPosition(_v);
  rig.position.sub(_v).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(_v);
  rig.rotation.y += a;
}

// ---------------- XR session ----------------
async function enterVR() {
  initAudio();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    await renderer.xr.setSession(session);
  } catch (e) { ui.note.textContent = 'Could not start VR: ' + e.message; }
}
renderer.xr.addEventListener('sessionstart', () => {
  ui.menu.hidden = true; ui.hud.hidden = true; playing = true;
  rig.position.set(P.x, 0, P.z); rig.rotation.set(0, P.yaw, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  lastX = P.x; lastZ = P.z;
});
renderer.xr.addEventListener('sessionend', () => {
  camera.getWorldPosition(_v); P.x = _v.x; P.z = _v.z; rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); ui.hud.hidden = false;
});

// ---------------- main loop ----------------
const clock = new THREE.Clock(); let t = 0;
const dbg = { paused: false };
function tick(dt) {
  stepPlayer(dt); arena.update(t, dt); hero.update(dt, spdS);
  const tp = { x: lastX, z: lastZ }; camera.getWorldPosition(_v);
  for (const b of bosses) { b.update(dt, tp, arena); b.label.rotation.y = Math.atan2(_v.x - b.root.position.x, _v.z - b.root.position.z); }
}
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (!dbg.paused) tick(dt);
  renderer.render(scene, camera);
});

// ---------------- menu ----------------
ui.status.textContent = 'Ready. Character models by their Sketchfab authors (see credits below).';
ui.play.disabled = false;
ui.play.onclick = () => {
  initAudio(); ui.menu.hidden = true; ui.hud.hidden = false; playing = true; renderer.domElement.requestPointerLock();
  toast('Click to look around. G opens the gates.', 4);
};
if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
  ui.vr.disabled = false; ui.vr.onclick = enterVR; ui.note.textContent = 'Headset ready: press Enter VR.';
} else ui.note.innerHTML = 'No VR headset found: <b>Play on PC</b> works with mouse + keyboard. Open this page in the Meta Quest Browser to play in VR.';
if (Q.has('autoplay')) { ui.menu.hidden = true; ui.hud.hidden = false; playing = true; }

// test hooks
window.boss = { arena, hero, bosses, toggleHunt, P, scene, camera, renderer, toggleGates, punch, dbg,
  // debug: advance the simulation by `sec` seconds in 1/60 steps (used with dbg.paused for screenshots)
  step(sec) { for (let i = 0; i < sec * 60; i++) { t += 1 / 60; tick(1 / 60); } },
  info() { return { ...renderer.info.render, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, balls: arena.ballCount }; } };
