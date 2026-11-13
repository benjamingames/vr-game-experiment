// Hand-held props built from primitives: the five repair tools and the VR hands.
// Tools point along -Z (tip forward), handle at the origin. A child named 'spin' rotates while working.
import * as THREE from 'three';

const std = (color, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const steel = std(0xc8ccd2, 0.25, 1), black = std(0x18181a, 0.6), rubber = std(0x222224, 0.9);

function cyl(r1, r2, len, mat, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat); m.rotation.x = Math.PI / 2; return m; }
function box(w, h, d, mat, r = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); return m; }

export function makeTool(level) {
  const g = new THREE.Group();
  if (level === 0) { // screwdriver
    const handle = cyl(0.016, 0.014, 0.11, std(0xd8281c, 0.35)); handle.position.z = 0.02; g.add(handle);
    for (let i = 0; i < 6; i++) { const rib = box(0.004, 0.035, 0.09, black); const a = i / 6 * Math.PI * 2; rib.position.set(Math.cos(a) * 0.016, Math.sin(a) * 0.016, 0.02); rib.rotation.z = a; g.add(rib); }
    const spin = new THREE.Group(); spin.name = 'spin'; g.add(spin);
    const shaft = cyl(0.0035, 0.0035, 0.13, steel, 8); shaft.position.z = -0.1; spin.add(shaft);
    const tip = box(0.009, 0.0015, 0.02, steel); tip.position.z = -0.17; spin.add(tip);
  } else if (level === 1) { // wrench + socket
    const bar = box(0.022, 0.008, 0.2, steel); bar.position.z = -0.03; g.add(bar);
    const grip = box(0.026, 0.012, 0.09, rubber); grip.position.z = 0.03; g.add(grip);
    const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = -0.13; g.add(spin);
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 8, 16), steel); spin.add(head);
    const sock = cyl(0.012, 0.012, 0.03, steel); sock.position.z = -0.015; spin.add(sock);
  } else if (level === 2 || level === 3) { // power drill / impact driver
    const col = level === 2 ? 0xe2a51c : 0x1f5fb8;
    const body = box(0.05, 0.065, 0.16, std(col, 0.4)); body.position.set(0, 0.05, -0.03); g.add(body);
    const nose = cyl(0.026, 0.03, 0.04, black); nose.position.set(0, 0.05, -0.13); g.add(nose);
    const handle = box(0.038, 0.11, 0.045, black); handle.position.set(0, -0.02, 0.03); handle.rotation.x = 0.25; g.add(handle);
    const batt = box(0.06, 0.035, 0.08, std(0x111111, 0.5)); batt.position.set(0, -0.085, 0.045); g.add(batt);
    const trig = box(0.012, 0.025, 0.014, rubber); trig.position.set(0, 0.008, -0.002); g.add(trig);
    const spin = new THREE.Group(); spin.name = 'spin'; spin.position.set(0, 0.05, -0.15); g.add(spin);
    const chuck = cyl(0.016, 0.012, 0.035, level === 2 ? black : steel); chuck.position.z = -0.015; spin.add(chuck);
    const bit = cyl(0.003, 0.003, 0.06, steel, 6); bit.position.z = -0.06; spin.add(bit);
    for (let i = 0; i < 3; i++) { const v = box(0.003, 0.03, 0.006, std(0x333333)); v.position.set(0.026, 0.06 - i * 0.01, 0.02 + i * 0.012); g.add(v); }
  } else { // robo-arm gauntlet
    const glow = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x38d8ff, emissiveIntensity: 3 });
    const shell = std(0xd9dde2, 0.3, 0.6);
    const cuff = cyl(0.045, 0.05, 0.12, shell); cuff.position.z = 0.04; g.add(cuff);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.006, 8, 24), glow); ring.position.z = -0.02; g.add(ring);
    const arm = cyl(0.025, 0.03, 0.1, black); arm.position.z = -0.08; g.add(arm);
    const spin = new THREE.Group(); spin.name = 'spin'; spin.position.z = -0.14; g.add(spin);
    for (let i = 0; i < 3; i++) {
      const claw = box(0.01, 0.01, 0.06, shell); const a = i / 3 * Math.PI * 2;
      claw.position.set(Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.02); claw.rotation.set(Math.sin(a) * 0.4, -Math.cos(a) * 0.4, 0); spin.add(claw);
    }
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), glow); spin.add(lens);
  }
  return g;
}

// Simple gloved hand (fist-ish) for VR controllers
export function makeHand(left) {
  const g = new THREE.Group();
  const skin = std(0xece6dc, 0.7);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), skin);
  palm.position.set(0, -0.01, 0.03); palm.rotation.x = -0.4; g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 4, 8), skin);
    f.position.set(-0.027 + i * 0.018, -0.022, -0.02); f.rotation.x = 1.2; g.add(f);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 8), skin);
  th.position.set(left ? 0.04 : -0.04, 0.0, 0.0); th.rotation.set(0.6, 0, left ? -0.6 : 0.6); g.add(th);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.04, 16), std(0x2a2a2e, 0.8));
  cuff.rotation.x = Math.PI / 2 - 0.4; cuff.position.set(0, 0.0, 0.085); g.add(cuff);
  return g;
}
