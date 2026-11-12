/**
 * Lario, the stretchy head: an original character built in code. A shaped skull with a jaw, eye
 * sockets and a neck in a knitted roll collar; wet eyes with fibrous hazel irises; a ribbed teal
 * beanie with a pom-pom; auburn hair. Every pullable feature (nose, cheeks, lips, beanie, ears,
 * eyelids with brows, chin) is its own mesh so room.ts can make it grabbable and elastic.
 * The head faces -Z and is about twice life size; all parts are centred on their own origin.
 */
import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';
import { fabric, skin } from './materials.js';
import { QUALITY } from './quality.js';
import { fbm3 } from './textures.js';

export const LARIO = {
  skin: 0xe9bd9e,
  rosy: 0xe6b193,
  lips: 0xb9665f,
  hair: 0x7a3f1c,
  beanie: 0x1f7a78,
};

const seg = (n: number) => (QUALITY.high ? n : Math.max(8, Math.round(n / 2)));

function part<T extends Mesh>(parent: Mesh | Group, m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  m.castShadow = true;
  m.raycast = () => {};
  parent.add(m);
  return m;
}

let hairMat: MeshStandardMaterial | null = null;
/** Hair: fine strands painted as streaks, with a soft sheen. */
function hair(): MeshStandardMaterial {
  if (hairMat) return hairMat;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#8a4a22';
  x.fillRect(0, 0, 256, 256);
  let s = 31;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const v = r();
    x.strokeStyle = v > 0.6 ? `rgba(196,120,60,${0.25 + r() * 0.3})` : `rgba(48,20,6,${0.25 + r() * 0.35})`;
    x.lineWidth = 0.6 + r() * 1.2;
    const px = r() * 256;
    const py = r() * 256;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + (r() - 0.5) * 10, py + 20, px + (r() - 0.5) * 14, py + 44, px + (r() - 0.5) * 18, py + 70);
    x.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = 1000;
  tex.repeat.set(3, 2);
  hairMat = new MeshPhysicalMaterial({ map: tex, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new Color(0xd08a50) });
  return hairMat;
}

/** Skull, jaw and eye sockets in one skin surface, with back hair, sideburns, eyes, mouth, neck and collar attached. */
export function larioHead(): Mesh {
  const R = 0.22;
  const g = new SphereGeometry(R, seg(72), seg(56));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) / R;
    let y = p.getY(i) / R;
    let z = p.getZ(i) / R;
    x *= 0.96;
    y *= y > 0 ? 1.08 : 1.1;
    if (y < 0) {
      // Jaw: narrows toward the chin, squarer at the angle of the jaw
      const t = -y;
      x *= 1 - 0.3 * t * t;
      z *= 1 - 0.1 * t * t;
    }
    if (z < 0) {
      z *= 0.94;
      // Eye sockets and the hollow under each cheekbone
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * 0.34, y - 0.19);
        z += 0.085 * Math.exp(-(d * d) / 0.03);
        const d2 = Math.hypot(x - s * 0.5, y + 0.42);
        z += 0.03 * Math.exp(-(d2 * d2) / 0.05);
      }
      // Brow ridge
      z -= 0.03 * Math.exp(-((y - 0.42) * (y - 0.42)) / 0.012) * Math.exp(-(x * x) / 0.35);
    }
    p.setXYZ(i, x * R, y * R, z * R);
  }
  g.computeVertexNormals();
  const head = new Mesh(g, skin(LARIO.skin));
  head.castShadow = true;

  // Hair showing below the beanie at the back and sides
  const back = part(head, new Mesh(new SphereGeometry(0.224, seg(40), seg(28)), hair()), 0, 0.02, 0.055);
  back.scale.set(0.95, 0.92, 0.95);
  for (const s of [-1, 1]) {
    const burn = part(head, new Mesh(new SphereGeometry(0.05, seg(20), seg(14)), hair()), s * 0.196, -0.005, -0.045);
    burn.scale.set(0.32, 1.25, 0.6);
    head.add(larioEye(s));
  }
  // Mouth interior with a row of teeth; the lips are a separate pullable part in front of it
  const mouth = part(head, new Mesh(new SphereGeometry(0.046, seg(20), seg(14)), new MeshStandardMaterial({ color: new Color(0x3a0f12), roughness: 0.5 })), 0, -0.125, -0.184);
  mouth.scale.set(1.25, 0.42, 0.5);
  mouth.castShadow = false;
  const enamel = new MeshPhysicalMaterial({ color: new Color(0xf3eee2), roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  for (let i = -3; i <= 3; i++) {
    const tooth = part(head, new Mesh(new SphereGeometry(0.0085, 12, 10), enamel), i * 0.0145, -0.117 - Math.abs(i) * 0.0012, -0.204 + Math.abs(i) * 0.0025);
    tooth.scale.set(0.85, 1.15, 0.55);
    tooth.castShadow = false;
  }
  // Neck and a knitted roll collar
  const lathe = (pts: Array<[number, number]>, n = 48) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg(n));
  part(head, new Mesh(lathe([[0.112, -0.16], [0.102, -0.11], [0.098, -0.05], [0.1, 0]]), skin(LARIO.skin)), 0, -0.19, 0.035);
  const collar = part(head, new Mesh(ribbed(new TorusGeometry(0.108, 0.03, seg(16), seg(96)), 40, 0.0035), fabric(LARIO.beanie)), 0, -0.325, 0.035);
  collar.rotation.x = Math.PI / 2;
  return head;
}

/** Knit ribs: pushes vertices in and out around the ring axis (the torus / cap axis is local Z or Y). */
function ribbed<T extends BufferGeometry>(g: T, ribs: number, depth: number, axisY = false): T {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const a = axisY ? p.getZ(i) : p.getY(i);
    const ang = Math.atan2(a, x);
    const r = Math.hypot(x, a) || 1;
    const k = 1 + (depth * Math.sin(ang * ribs)) / r;
    if (axisY) {
      p.setX(i, x * k);
      p.setZ(i, a * k);
    } else {
      p.setX(i, x * k);
      p.setY(i, a * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

let irisTex: CanvasTexture | null = null;
function irisTexture(): CanvasTexture {
  if (irisTex) return irisTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(128, 128, 30, 128, 128, 126);
  grad.addColorStop(0, '#a8742c');
  grad.addColorStop(0.45, '#6f7f3a');
  grad.addColorStop(0.86, '#3f5a34');
  grad.addColorStop(1, '#1b2618');
  x.fillStyle = grad;
  x.beginPath();
  x.arc(128, 128, 126, 0, Math.PI * 2);
  x.fill();
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2;
    const r0 = 40 + r() * 20;
    const r1 = 80 + r() * 44;
    x.strokeStyle = r() > 0.5 ? `rgba(226,200,130,${0.12 + r() * 0.25})` : `rgba(30,40,20,${0.12 + r() * 0.25})`;
    x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    x.lineTo(128 + Math.cos(a + (r() - 0.5) * 0.08) * r1, 128 + Math.sin(a + (r() - 0.5) * 0.08) * r1);
    x.stroke();
  }
  x.fillStyle = '#050505';
  x.beginPath();
  x.arc(128, 128, 44, 0, Math.PI * 2);
  x.fill();
  irisTex = new CanvasTexture(c);
  irisTex.colorSpace = SRGBColorSpace;
  return irisTex;
}

/** One eye: wet white, fibrous iris and a clear cornea that catches the light. */
function larioEye(side: number): Group {
  const g = new Group();
  g.position.set(side * 0.075, 0.04, -0.168);
  const white = new MeshPhysicalMaterial({ color: new Color(0xf2ece4), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 });
  const ball = part(g, new Mesh(new SphereGeometry(0.043, seg(32), seg(24)), white), 0, 0, 0);
  ball.scale.z = 0.8;
  const iris = part(g, new Mesh(new CircleGeometry(0.0215, seg(40)), new MeshStandardMaterial({ map: irisTexture(), roughness: 0.35 })), 0, 0, -0.0338);
  iris.rotation.y = Math.PI;
  iris.castShadow = false;
  const cornea = part(
    g,
    new Mesh(
      new SphereGeometry(0.0245, seg(28), seg(18)),
      new MeshPhysicalMaterial({ color: new Color(0xffffff), roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    ),
    0,
    0,
    -0.03,
  );
  cornea.scale.z = 0.42;
  cornea.castShadow = false;
  return g;
}

/** Nose: tip, bridge running up to the brow, flared wings and nostrils. */
export function larioNose(): Mesh {
  const m = skin(LARIO.rosy);
  const tipG = new SphereGeometry(0.034, seg(28), seg(20));
  tipG.scale(1, 0.86, 1);
  const tip = new Mesh(tipG, m);
  const bridge = part(tip, new Mesh(new CylinderGeometry(0.015, 0.027, 0.12, seg(20), 1), m), 0, 0.055, 0.028);
  bridge.rotation.x = -0.42;
  const dark = new MeshStandardMaterial({ color: new Color(0x4a2018), roughness: 0.8 });
  for (const s of [-1, 1]) {
    const wing = part(tip, new Mesh(new SphereGeometry(0.02, seg(20), seg(14)), m), s * 0.027, -0.008, 0.018);
    wing.scale.set(1, 0.8, 1.1);
    const nostril = part(tip, new Mesh(new SphereGeometry(0.0095, 12, 10), dark), s * 0.017, -0.027, 0.006);
    nostril.scale.set(1.2, 0.5, 1);
    nostril.castShadow = false;
  }
  return tip;
}

/** Soft cheek mound. */
export function larioCheek(): Mesh {
  const g = new SphereGeometry(0.058, seg(26), seg(20));
  g.scale(1.05, 0.9, 0.55);
  return new Mesh(g, skin(LARIO.rosy));
}

/** Lips: a two-lobed upper lip with a bow, a fuller lower lip. */
export function larioLips(): Mesh {
  const m = new MeshPhysicalMaterial({ color: new Color(LARIO.lips), roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const lowG = new SphereGeometry(0.04, seg(26), seg(18));
  lowG.scale(1.3, 0.4, 0.62);
  const low = new Mesh(lowG, m);
  for (const s of [-1, 1]) {
    const up = part(low, new Mesh(new SphereGeometry(0.031, seg(22), seg(16)), m), s * 0.021, 0.021, 0.002);
    up.scale.set(1.35, 0.38, 0.6);
    up.rotation.z = s * -0.14;
    const corner = part(low, new Mesh(new SphereGeometry(0.01, 12, 10), m), s * 0.052, 0.012, 0.012);
    corner.scale.set(1.2, 0.7, 0.8);
  }
  return low;
}

/** Ribbed knit beanie pushed back on the head, with a folded cuff and a woolly pom-pom. */
export function larioBeanie(): Mesh {
  const tilt = 0.35;
  const knit = fabric(LARIO.beanie);
  const cap = ribbed(new SphereGeometry(0.238, seg(120), seg(28), 0, Math.PI * 2, 0, Math.PI * 0.56), 46, 0.0045, true);
  cap.scale(1.04, 0.95, 1.08);
  cap.rotateX(tilt);
  const beanie = new Mesh(cap, knit);
  const cuffG = ribbed(new TorusGeometry(0.236, 0.022, seg(14), seg(120)), 46, 0.004);
  cuffG.scale(1.04, 1.08, 1.5);
  cuffG.rotateX(Math.PI / 2);
  cuffG.translate(0, -0.04, 0);
  cuffG.rotateX(tilt);
  part(beanie, new Mesh(cuffG, knit), 0, 0, 0);
  // Pom-pom: a ball roughened into tufts
  const pomG = new SphereGeometry(0.052, seg(36), seg(26));
  const pp = pomG.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    const z = pp.getZ(i);
    const k = 1 + (fbm3(x * 90, y * 90, z * 90, 2, 3) - 0.5) * 0.5;
    pp.setXYZ(i, x * k, y * k, z * k);
  }
  pomG.computeVertexNormals();
  part(beanie, new Mesh(pomG, fabric(0xece4d2)), 0, 0.235 * Math.cos(tilt), 0.235 * Math.sin(tilt));
  return beanie;
}

/** Ear: shell, rolled helix rim, shaded bowl and lobe. */
export function larioEar(side: number): Mesh {
  const m = skin(LARIO.skin);
  const g = new SphereGeometry(0.058, seg(24), seg(18));
  g.scale(0.3, 1.15, 0.8);
  const ear = new Mesh(g, m);
  const rimG = new TorusGeometry(0.046, 0.011, seg(10), seg(28), 4.3);
  rimG.rotateZ(-0.55);
  rimG.scale(0.82, 1.22, 1);
  const rim = part(ear, new Mesh(rimG, m), side * 0.012, 0.004, 0);
  rim.rotation.y = side * Math.PI / 2;
  const bowl = part(ear, new Mesh(new SphereGeometry(0.026, seg(16), seg(12)), skin(0xc98a70)), side * 0.014, 0.004, -0.004);
  bowl.scale.set(0.3, 1.1, 0.8);
  bowl.castShadow = false;
  const lobe = part(ear, new Mesh(new SphereGeometry(0.02, seg(16), seg(12)), m), side * 0.008, -0.056, -0.004);
  lobe.scale.set(0.55, 1, 0.9);
  return ear;
}

/** Upper eyelid with a lash line and an eyebrow made of individual hairs. */
export function larioEyelid(side: number): Mesh {
  const g = new SphereGeometry(0.048, seg(24), seg(16));
  g.scale(1.12, 0.5, 0.85);
  const lid = new Mesh(g, skin(LARIO.rosy));
  const lash = part(lid, new Mesh(new TorusGeometry(0.041, 0.0026, 6, seg(24), Math.PI), new MeshStandardMaterial({ color: new Color(0x1c0f08), roughness: 0.6 })), 0, -0.036, -0.03);
  lash.scale.set(1.05, 0.62, 1);
  lash.castShadow = false;
  const strand = new CylinderGeometry(0.0016, 0.0034, 0.03, 5);
  const hm = hair();
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const x = side * (-0.045 + t * 0.09);
    const y = 0.026 + Math.sin(t * Math.PI) * 0.012 - t * 0.004;
    for (const row of [0, 1]) {
      const h = part(lid, new Mesh(strand, hm), x, y + row * 0.006, -0.03 - Math.sin(t * Math.PI) * 0.008);
      h.rotation.z = side * (-1.15 - t * 0.3 + row * 0.18);
      h.rotation.x = -0.2;
      h.castShadow = false;
    }
  }
  return lid;
}

/** Chin. */
export function larioChin(): Mesh {
  const g = new SphereGeometry(0.056, seg(26), seg(20));
  g.scale(1.15, 0.72, 0.8);
  return new Mesh(g, skin(LARIO.skin));
}
