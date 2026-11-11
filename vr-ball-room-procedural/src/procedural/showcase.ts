/**
 * The Gallery: a second room, reached through the door on the main room's back wall, built to
 * show what generated environments can look like. All of its fixed scenery is made of boxes fed
 * through the GPU light bake (bake.ts), so it has real soft sky light from the window wall and
 * skylight slot, area light from lamp panels and LED strips, bounced sunlight and ambient
 * occlusion. Curved props (plants, vases, material spheres) are lit by the room's reflection probe.
 *
 * Layout is in local metres (x right, z toward the window wall), offset by ORIGIN in the world.
 */
import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LocomotionEnvironment,
  LocomotionSystem,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  BoxGeometry as PlainBox,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
  World,
  createSystem,
} from '@iwsdk/core';
import { BoxOpts, LightBake } from './bake.js';
import { artTexture, buildPlant, vase } from './decor.js';
import { EnvZone, procEnv } from './env.js';
import { deskSet, floorLamp, officeChair, screenImage, sofaCushions } from './furniture.js';
import { fabric, glossFloor, marble, oak, plaster, rug } from './materials.js';
import { QUALITY } from './quality.js';

export const GALLERY_ORIGIN = new Vector3(-300, 0, 0);
const OX = GALLERY_ORIGIN.x;
const OZ = GALLERY_ORIGIN.z;
const HALF_X = 4.5;
const HALF_Z = 3.5;
const H = 3.3;
/** Where you arrive in the gallery, and where the door back sends you (main-room coordinates). */
const ARRIVE = new Vector3(OX - 3, 0, OZ - 2.3);
const RETURN = new Vector3(0, 0, 0.9);

type V3 = [number, number, number];
const bake = new LightBake();

const zone: EnvZone = {
  probe: new Vector3(OX - 0.6, 1.75, OZ + 0.2),
  boxMin: new Vector3(OX - HALF_X, 0, OZ - HALF_Z),
  boxMax: new Vector3(OX + HALF_X, H, OZ + HALF_Z),
  lightTarget: new Vector3(OX, 0, OZ + 0.5),
  shadowHalf: 8.5,
};

function flat(color: number, roughness: number, extra: Partial<MeshStandardMaterial> = {}) {
  const m = new MeshStandardMaterial({ color: new Color(color), roughness });
  Object.assign(m, extra);
  return m;
}

function glow(color: number, intensity: number) {
  return new MeshStandardMaterial({
    color: new Color(0x111111),
    emissive: new Color(color),
    emissiveIntensity: intensity,
    roughness: 0.6,
  });
}

function signTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#17181b';
  x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#f1e6cf';
  x.font = '600 62px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 68);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A panelled oak door with frame, handle and a brass-lettered sign above it. Faces +Z locally. */
function buildDoor(label: string): Group {
  const g = new Group();
  const wood = oak('#000000', '#9b7a55', 1, 2, 0.5);
  const frame = flat(0x26272b, 0.55);
  const brass = new MeshStandardMaterial({ color: new Color(0xc9a04e), metalness: 1, roughness: 0.25 });
  const add = (geo: PlainBox | CylinderGeometry, m: Material, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new PlainBox(0.92, 2.1, 0.045), wood, 0, 1.05, 0.03);
  for (const y of [0.55, 1.55]) add(new PlainBox(0.66, y < 1 ? 0.7 : 0.86, 0.012), wood, 0, y, 0.058);
  add(new PlainBox(0.07, 2.2, 0.09), frame, -0.495, 1.1, 0.045);
  add(new PlainBox(0.07, 2.2, 0.09), frame, 0.495, 1.1, 0.045);
  add(new PlainBox(1.06, 0.07, 0.09), frame, 0, 2.165, 0.045);
  const lever = add(new CylinderGeometry(0.009, 0.009, 0.13, 16), brass, 0.3, 1.02, 0.1);
  lever.rotation.z = Math.PI / 2;
  const rose = add(new CylinderGeometry(0.026, 0.026, 0.012, 24), brass, 0.36, 1.02, 0.062);
  rose.rotation.x = Math.PI / 2;
  const sign = new Mesh(new PlaneGeometry(0.62, 0.155), new MeshStandardMaterial({ map: signTexture(label), roughness: 0.6 }));
  sign.position.set(0, 2.36, 0.012);
  g.add(sign);
  return g;
}

export function buildShowcase(world: World) {
  const root = new Group();
  root.name = 'gallery';
  const b = bake.builder();
  const P = (x: number, y: number, z: number): V3 => [x + OX, y, z + OZ];
  const B = (m: Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}) =>
    b.box(m, P(x0, y0, z0), P(x1, y1, z1), o);

  // ---- Materials (with the average colour the bake uses for bounced light) ----
  const wall = plaster(1, 1);
  wall.color.setHex(0xd9d3c8);
  wall.normalScale.set(0.45, 0.45);
  const wallO: BoxOpts = { albedo: [0.7, 0.67, 0.62], uv: [2.2, 2.2] };
  const ceil = plaster(1, 1);
  ceil.color.setHex(0xf2efe9);
  ceil.normalScale.set(0.2, 0.2);
  const ceilO: BoxOpts = { albedo: [0.86, 0.85, 0.82], uv: [2.2, 2.2] };
  const floor = oak('#000000', '#dcc09a', 1, 1, 0.38, 6);
  floor.normalScale.set(1.5, 1.5);
  glossFloor(floor);
  const floorO: BoxOpts = { albedo: [0.5, 0.38, 0.25], uv: [1.2, 2.4] };
  const timber = oak('#000000', '#c3a078', 1, 1, 0.55);
  const timberO: BoxOpts = { albedo: [0.55, 0.43, 0.3], uv: [0.5, 1.4] };
  const dark = flat(0x1b1c1f, 0.55);
  const darkO: BoxOpts = { albedo: [0.03, 0.03, 0.035] };
  const felt = flat(0x0b0b0c, 1);
  const cream = flat(0xe4ded2, 0.5);
  const creamO: BoxOpts = { albedo: [0.76, 0.73, 0.67] };
  const linen = fabric(0xcfc9be);
  const linenO: BoxOpts = { albedo: [0.62, 0.6, 0.56], uv: [0.55, 0.55] };
  const charcoal = fabric(0x3a3b3f);
  const stone = marble();
  const stoneO: BoxOpts = { albedo: [0.8, 0.79, 0.77], uv: [1.4, 1.4] };
  const wool = rug();
  const slat = flat(0xc9c6bf, 0.5);
  const deck = plaster(1, 1);
  deck.color.setHex(0x8f8b84);
  const panel = glow(0xfff1dc, 5);
  const led = glow(0xffc98c, 7);
  const screen = glow(0xa9c4ff, 0.5);
  const shade = glow(0xffd9a6, 3.2);
  const fine = QUALITY.high;

  // ---- Shell ------------------------------------------------------------------
  B(floor, -4.7, -0.2, -3.7, 4.7, 0, 3.7, floorO);
  // Ceiling with a skylight slot (x -3..3, z 0.2..0.7)
  B(ceil, -4.7, H, -3.7, 4.7, H + 0.2, 0.2, ceilO);
  B(ceil, -4.7, H, 0.7, 4.7, H + 0.2, 3.7, ceilO);
  B(ceil, -4.7, H, 0.2, -3, H + 0.2, 0.7, ceilO);
  B(ceil, 3, H, 0.2, 4.7, H + 0.2, 0.7, ceilO);
  // Side walls
  B(wall, -4.7, 0, -3.7, -4.5, H, 3.7, wallO);
  B(wall, 4.5, 0, -3.7, 4.7, H, 3.7, wallO);
  // Back wall (-Z) with the doorway at x -3.5..-2.5
  B(wall, -4.5, 0, -3.7, -3.5, H, -3.5, wallO);
  B(wall, -2.5, 0, -3.7, 4.5, H, -3.5, wallO);
  B(wall, -3.5, 2.2, -3.7, -2.5, H, -3.5, wallO);
  B(dark, -3.6, 0, -3.72, -2.4, 2.25, -3.66, darkO);
  // Window wall (+Z): sill, head, piers, mullions
  B(wall, -4.5, 0, 3.5, 4.5, 0.45, 3.7, wallO);
  B(wall, -4.5, 2.95, 3.5, 4.5, H, 3.7, wallO);
  B(wall, -4.5, 0.45, 3.5, -3.8, 2.95, 3.7, wallO);
  B(wall, 3.8, 0.45, 3.5, 4.5, 2.95, 3.7, wallO);
  for (const x of [-1.9, 0, 1.9]) B(dark, x - 0.03, 0.45, 3.56, x + 0.03, 2.95, 3.64, darkO);
  B(dark, -3.8, 0.45, 3.56, 3.8, 0.49, 3.64, darkO);
  B(dark, -3.8, 2.91, 3.56, 3.8, 2.95, 3.64, darkO);
  // Skirting
  B(cream, -4.5, 0, -3.5, -3.56, 0.09, -3.485, creamO);
  B(cream, -2.44, 0, -3.5, -2.2, 0.09, -3.485, creamO);
  B(cream, -4.5, 0, -3.485, -4.485, 0.09, 3.5, creamO);
  B(cream, 4.485, 0, -3.5, 4.5, 0.09, 3.5, creamO);
  B(cream, -4.485, 0, 3.485, 4.485, 0.09, 3.5, creamO);
  // Terrace outside the window, with a parapet that hides the horizon
  B(deck, -4.7, -0.2, 3.7, 4.7, -0.02, 7.2, { albedo: [0.42, 0.41, 0.39], uv: [2, 2], spacing: 0.3 });
  B(deck, -4.7, -0.02, 7.0, 4.7, 1.0, 7.2, { albedo: [0.42, 0.41, 0.39], uv: [2, 2], spacing: 0.3 });

  // ---- Relief: dropped ceiling border with a light cove, and panel mouldings on the walls ----
  const dropY = H - 0.16;
  B(ceil, -4.5, dropY, -3.5, 4.5, H, -3.08, ceilO);
  B(ceil, -4.5, dropY, 3.08, 4.5, H, 3.5, ceilO);
  B(ceil, -4.5, dropY, -3.08, -4.08, H, 3.08, ceilO);
  B(ceil, 4.08, dropY, -3.08, 4.5, H, 3.08, ceilO);
  const cove: BoxOpts = { emissive: [16, 12.5, 8], albedo: [0, 0, 0] };
  B(led, -4.06, dropY + 0.07, -3.075, 4.06, dropY + 0.085, -3.06, cove);
  B(led, -4.06, dropY + 0.07, 3.06, 4.06, dropY + 0.085, 3.075, cove);
  B(led, -4.075, dropY + 0.07, -3.06, -4.06, dropY + 0.085, 3.06, cove);
  B(led, 4.06, dropY + 0.07, -3.06, 4.075, dropY + 0.085, 3.06, cove);
  // Raised picture-frame mouldings: [wall x, inward sign, z0, z1, y0, y1]
  const mould: Array<[number, number, number, number, number, number]> = [
    [-4.5, 1, -3.3, -1.55, 0.3, 2.85],
    [-4.5, 1, -1.47, -0.62, 0.3, 2.85],
    [-4.5, 1, -0.54, 0.16, 0.3, 2.85],
    [4.5, -1, -3.3, -1.2, 0.3, 2.85],
    [4.5, -1, -1.1, -0.2, 0.3, 2.85],
    [4.5, -1, -0.1, 0.66, 0.3, 2.85],
  ];
  const mw = 0.034;
  const md = 0.016;
  for (const [wx, sgn, z0, z1, y0, y1] of mould) {
    const xa = sgn > 0 ? wx : wx - md;
    const xb = sgn > 0 ? wx + md : wx;
    B(wall, xa, y0, z0, xb, y0 + mw, z1, wallO);
    B(wall, xa, y1 - mw, z0, xb, y1, z1, wallO);
    B(wall, xa, y0 + mw, z0, xb, y1 - mw, z0 + mw, wallO);
    B(wall, xa, y0 + mw, z1 - mw, xb, y1 - mw, z1, wallO);
  }
  // Shadow gap: a dark recess line where the walls meet the dropped ceiling
  B(dark, -4.5, dropY - 0.012, -3.5, -4.488, dropY, 3.5, { ...darkO, noOcclude: true });
  B(dark, 4.488, dropY - 0.012, -3.5, 4.5, dropY, 3.5, { ...darkO, noOcclude: true });

  // ---- Venetian blind over the left two window bays ---------------------------
  const pitch = fine ? 0.045 : 0.09;
  for (let y = 0.52; y < 2.9; y += pitch) {
    B(slat, -3.79, y, 3.4, -0.04, y + 0.003, 3.435, { albedo: [0.7, 0.69, 0.66], spacing: 0.25 });
  }
  B(slat, -3.8, 2.9, 3.39, -0.03, 2.94, 3.45, { albedo: [0.7, 0.69, 0.66], spacing: 0.25 });

  // ---- Slatted oak feature wall with a felt backing and an LED cove ------------
  B(felt, -2.2, 0.09, -3.5, 4.3, 3.02, -3.492, { albedo: [0.01, 0.01, 0.01], spacing: 0.4 });
  const sp = fine ? 0.055 : 0.11;
  for (let x = -2.2; x < 4.27; x += sp) {
    B(timber, x, 0.09, -3.492, x + sp * 0.55, 3.0, -3.455, { ...timberO, spacing: fine ? 0.09 : 0.3 });
  }
  B(led, -2.2, 3.0, -3.492, 4.3, 3.014, -3.47, { emissive: [26, 19, 11], albedo: [0, 0, 0] });
  B(dark, -2.2, 3.014, -3.5, 4.3, 3.05, -3.44, darkO);

  // ---- Lighting fixtures ------------------------------------------------------
  for (const x of [-2.6, 2.2]) {
    B(panel, x - 0.45, H - 0.012, -1.65, x + 0.45, H, -0.75, { emissive: [9, 8.3, 7.2], albedo: [0, 0, 0] });
    B(dark, x - 0.48, H - 0.02, -1.68, x + 0.48, H - 0.012, -1.65, darkO);
  }
  // Linear pendant over the desk
  B(dark, -3.45, 2.08, 1.29, -1.75, 2.12, 1.35, darkO);
  B(led, -3.43, 2.072, 1.3, -1.77, 2.08, 1.34, { emissive: [22, 18, 12], albedo: [0, 0, 0] });
  for (const x of [-3.2, -2.0]) B(dark, x - 0.002, 2.12, 1.318, x + 0.002, H, 1.322, { ...darkO, noOcclude: true });

  // ---- Desk (black top, cabinet one side, fluted blade the other) --------------
  // Black-stained ash top: open grain under a satin lacquer, so it catches the window instead of reading as a void
  B(oak('#000000', '#4a4540', 1, 1, 0.34), -3.7, 0.73, 0.9, -1.5, 0.77, 1.75, { albedo: [0.07, 0.065, 0.06], uv: [1.4, 1.4] });
  B(cream, -3.64, 0.03, 0.96, -2.86, 0.72, 1.7, creamO);
  B(dark, -3.62, 0, 0.98, -2.88, 0.03, 1.68, darkO);
  B(dark, -3.26, 0.05, 0.955, -3.254, 0.7, 0.96, darkO);
  B(dark, -1.63, 0, 0.95, -1.585, 0.73, 1.7, darkO);
  for (let z = 0.955; z < 1.69; z += 0.05) B(dark, -1.585, 0, z, -1.565, 0.73, z + 0.028, darkO);
  // Monitor, keyboard, papers, books
  B(dark, -3.0, 0.94, 1.52, -2.22, 1.42, 1.545, darkO);
  B(screen, -2.985, 0.955, 1.516, -2.235, 1.405, 1.52, { emissive: [0.9, 1.1, 1.5], albedo: [0, 0, 0] });
  B(slat, -2.84, 0.77, 1.14, -2.4, 0.781, 1.28, { albedo: [0.7, 0.7, 0.7] });
  B(cream, -2.2, 0.77, 1.1, -1.96, 0.7715, 1.42, creamO);
  B(cream, -2.16, 0.7715, 1.08, -1.92, 0.773, 1.4, creamO);
  // Desk chair, monitor stand and desk accessories: modelled pieces, baked with the room
  const props = new Group();
  const chair = officeChair();
  chair.position.set(OX - 2.6, 0, OZ + 0.52);
  chair.rotation.y = 0.35;
  props.add(chair);
  bake.addOccluder(P(-2.86, 0.42, 0.28), P(-2.34, 0.55, 0.78), [0.05, 0.05, 0.05], [0, 0, 0]);
  bake.addOccluder(P(-2.84, 0.58, 0.22), P(-2.36, 1.1, 0.3), [0.05, 0.05, 0.05], [0, 0, 0]);
  const display = screenImage(0.75, 0.45);
  display.rotation.y = Math.PI;
  display.position.set(OX - 2.61, 1.18, OZ + 1.5155);
  root.add(display);
  const desk = deskSet();
  desk.position.set(OX - 2.61, 0.77, OZ + 1.5);
  props.add(desk);

  // ---- Wall shelves on the left wall, with books ------------------------------
  const bookMats = [0xe9e4d8, 0x2b2c30, 0x8a6a4a, 0x6f7f72, 0xb9a48a, 0x1f2a36, 0x7a3b32].map((c) => flat(c, 0.75));
  let s = 4242;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (const y of [1.25, 1.7, 2.15, 2.6]) {
    B(timber, -4.5, y, 0.25, -4.22, y + 0.036, 3.05, { ...timberO, turn: true });
    B(led, -4.49, y - 0.008, 0.28, -4.47, y, 3.02, { emissive: [20, 15, 9], albedo: [0, 0, 0] });
    let z = 0.32 + rnd() * 0.2;
    while (z < 2.9) {
      if (rnd() < 0.62) {
        const n = 3 + Math.floor(rnd() * 6);
        for (let i = 0; i < n && z < 2.95; i++) {
          const w = 0.02 + rnd() * 0.03;
          const hgt = 0.17 + rnd() * 0.1;
          const dep = 0.14 + rnd() * 0.06;
          const m = bookMats[Math.floor(rnd() * bookMats.length)];
          const c = m.color;
          B(m, -4.495, y + 0.036, z, -4.495 + dep, y + 0.036 + hgt, z + w, { albedo: [c.r, c.g, c.b], spacing: 0.3 });
          z += w + 0.002;
        }
        z += 0.05 + rnd() * 0.2;
      } else {
        const v = vase(Math.floor(rnd() * 3));
        v.position.set(OX - 4.37, y + 0.036, OZ + z + 0.09);
        root.add(v);
        bake.addOccluder(P(-4.43, y + 0.036, z + 0.03), P(-4.31, y + 0.2, z + 0.15), [0.3, 0.3, 0.3], [0, 0, 0]);
        z += 0.3 + rnd() * 0.25;
      }
    }
  }
  // Framed canvases
  const hang = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed: number, alongZ: boolean) => {
    const t = artTexture(seed);
    t.wrapS = t.wrapT = RepeatWrapping;
    const w = alongZ ? z1 - z0 : x1 - x0;
    const u0 = alongZ ? z0 + OZ : x0 + OX;
    t.offset.set(-u0 / w, -y0 / (y1 - y0));
    const art = new MeshStandardMaterial({ map: t, roughness: 0.92 });
    B(art, x0, y0, z0, x1, y1, z1, { albedo: [0.6, 0.57, 0.5], uv: [w, y1 - y0] });
    const f = 0.025;
    const d = (x1 - x0) * 0.6;
    if (alongZ) B(dark, x0 > 0 ? x1 - d : x0, y0 - f, z0 - f, x0 > 0 ? x1 : x0 + d, y1 + f, z1 + f, darkO);
    else B(dark, x0 - f, y0 - f, z0, x1 + f, y1 + f, z0 + (z1 - z0) * 0.6, darkO);
  };
  hang(-4.5, 1.0, -2.75, -4.465, 2.35, -1.75, 11, true);
  hang(-4.5, 1.25, -1.35, -4.465, 2.1, -0.75, 23, true);
  hang(4.465, 1.0, -2.9, 4.5, 2.4, -1.5, 37, true);

  // ---- Lounge: rug, sofa, marble table, floor lamp ------------------------------
  B(wool, 0.4, 0, -2.5, 4.1, 0.012, 0.5, { albedo: [0.42, 0.42, 0.41], uv: [3.7, 3.0] });
  const sofaX0 = 1.0;
  const sofaX1 = 3.7;
  B(dark, sofaX0 + 0.05, 0.012, -3.25, sofaX1 - 0.05, 0.1, -2.2, darkO);
  B(linen, sofaX0, 0.1, -3.3, sofaX1, 0.4, -2.15, linenO);
  const cushions = sofaCushions(sofaX0, sofaX1, -3.3, -2.15, 0xcfc9be);
  cushions.position.set(OX, 0, OZ);
  props.add(cushions);
  bake.addOccluder(P(sofaX0, 0.4, -3.3), P(sofaX1, 0.56, -2.2), [0.6, 0.58, 0.54], [0, 0, 0]);
  bake.addOccluder(P(sofaX0, 0.56, -3.3), P(sofaX1, 0.95, -3.05), [0.6, 0.58, 0.54], [0, 0, 0]);
  // Coffee table: honed marble on two blades
  B(stone, 1.55, 0.36, -1.6, 3.15, 0.4, -0.85, stoneO);
  B(dark, 1.75, 0.012, -1.55, 1.79, 0.36, -0.9, darkO);
  B(dark, 2.91, 0.012, -1.55, 2.95, 0.36, -0.9, darkO);
  B(bookMats[2], 1.8, 0.4, -1.4, 2.08, 0.43, -1.2, { albedo: [0.4, 0.3, 0.2] });
  B(bookMats[0], 1.82, 0.43, -1.39, 2.06, 0.455, -1.21, creamO);
  const bowl = vase(2);
  bowl.position.set(OX + 2.65, 0.4, OZ - 1.2);
  bowl.scale.setScalar(1.5);
  root.add(bowl);
  // Floor lamp: modelled, with its shade registered as an area light for the bake
  const lamp = floorLamp();
  lamp.position.set(OX + 0.67, 0, OZ - 2.85);
  props.add(lamp);
  bake.addOccluder(P(0.5, 1.41, -3.02), P(0.84, 1.71, -2.68), [0, 0, 0], [4.2, 3.3, 2.2]);
  bake.addOccluder(P(0.53, 0, -2.99), P(0.81, 0.03, -2.71), [0.05, 0.04, 0.03], [0, 0, 0]);

  // ---- Material bench: a plinth of spheres under a picture light ----------------
  B(wall, 3.85, 0, 0.75, 4.4, 0.86, 3.1, wallO);
  B(stone, 3.82, 0.86, 0.72, 4.43, 0.9, 3.13, stoneO);
  B(led, 4.46, 2.02, 0.8, 4.485, 2.035, 3.05, { emissive: [24, 20, 14], albedo: [0, 0, 0] });
  B(dark, 4.44, 2.035, 0.78, 4.5, 2.06, 3.07, darkO);
  const spheres: MeshStandardMaterial[] = [
    new MeshStandardMaterial({ color: new Color(0xffc56b), metalness: 1, roughness: 0.12 }),
    new MeshPhysicalMaterial({ color: new Color(0x8a0f12), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 }),
    new MeshPhysicalMaterial({
      color: new Color(0xeaf6ff),
      roughness: 0.02,
      metalness: 0,
      transmission: fine ? 1 : 0,
      thickness: 0.25,
      ior: 1.5,
      transparent: !fine,
      opacity: fine ? 1 : 0.3,
    }),
    new MeshStandardMaterial({ color: new Color(0xc47a52), metalness: 1, roughness: 0.38 }),
    new MeshPhysicalMaterial({ color: new Color(0x1d3a2c), roughness: 0.9, sheen: 1, sheenRoughness: 0.4, sheenColor: new Color(0x7fd0a0) }),
  ];
  spheres.forEach((m, i) => {
    const z = 1.05 + i * 0.45;
    const ball = new Mesh(new SphereGeometry(0.15, 64, 40), m);
    ball.position.set(OX + 4.12, 0.9 + 0.15, OZ + z);
    ball.castShadow = ball.receiveShadow = true;
    root.add(ball);
    bake.addOccluder(P(4.03, 0.91, z - 0.09), P(4.21, 1.15, z + 0.09), [0.3, 0.3, 0.3], [0, 0, 0]);
  });

  // ---- Plants -------------------------------------------------------------------
  const plants: Array<[number, number, number, boolean]> = [
    [4.05, -2.55, 1.9, true],
    [-4.0, 3.0, 1.6, false],
    [0.4, 3.05, 1.1, true],
    [-2.5, 5.6, 2.2, false],
    [2.8, 5.9, 2.0, false],
  ];
  plants.forEach(([x, z, h, chrome], i) => {
    const p = buildPlant(h, 500 + i * 13, chrome);
    p.position.set(OX + x, z > 3.6 ? -0.02 : 0, OZ + z);
    root.add(p);
    bake.addOccluder(P(x - 0.17, 0, z - 0.17), P(x + 0.17, 0.34, z + 0.17), [0.2, 0.2, 0.2], [0, 0, 0]);
    const cr = h * 0.2;
    bake.addOccluder(P(x - cr, h * 0.5, z - cr), P(x + cr, h * 0.95, z + cr), [0.1, 0.2, 0.06], [0, 0, 0]);
  });

  // ---- Glass (not part of the bake: it should not block sky light) -----------------
  const glass = new MeshPhysicalMaterial({
    color: new Color(0xdcefff),
    roughness: 0.02,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 1.4,
    depthWrite: false,
    side: DoubleSide,
  });
  const pane = new Mesh(new PlaneGeometry(7.6, 2.5), glass);
  pane.position.set(OX, 1.7, OZ + 3.6);
  const roofPane = new Mesh(new PlaneGeometry(6, 0.5), glass);
  roofPane.rotation.x = Math.PI / 2;
  roofPane.position.set(OX, H + 0.19, OZ + 0.45);
  root.add(pane, roofPane);

  // ---- Doors: the way back here, and the way in from the main room -----------------
  const back = buildDoor('BALL ROOM');
  back.position.set(OX - 3, 0, OZ - 3.655);
  root.add(back);
  const entry = buildDoor('GALLERY');
  entry.position.set(0, 0, 2.985);
  entry.rotation.y = Math.PI;
  procEnv.roomGroup.add(entry);

  root.add(props);
  bake.bakeObject(props);
  root.add(...b.meshes());
  world.createTransformEntity(root);

  // ---- Walk collision: simple invisible boxes --------------------------------------
  const solids: Array<[number, number, number, number, number, number]> = [
    [-4.7, -0.2, -3.7, 4.7, 0, 3.7],
    [-4.7, 0, -3.7, -4.5, H, 3.7],
    [4.5, 0, -3.7, 4.7, H, 3.7],
    [-4.7, 0, -3.7, 4.7, H, -3.5],
    [-4.7, 0, 3.4, 4.7, H, 3.7],
    [sofaX0, 0, -3.3, sofaX1, 0.9, -2.15],
    [1.55, 0, -1.6, 3.15, 0.4, -0.85],
    [-3.7, 0, 0.9, -1.5, 0.77, 1.75],
    [3.82, 0, 0.72, 4.43, 0.9, 3.13],
  ];
  const proxies = new Group();
  proxies.visible = false;
  for (const [x0, y0, z0, x1, y1, z1] of solids) {
    const m = new Mesh(new PlainBox(x1 - x0, y1 - y0, z1 - z0));
    m.position.set(OX + (x0 + x1) / 2, (y0 + y1) / 2, OZ + (z0 + z1) / 2);
    proxies.add(m);
  }
  world.createTransformEntity(proxies).addComponent(LocomotionEnvironment);
}

/** Runs the light bake, moves the player through the two doors and switches the lighting zone. */
export class ShowcaseSystem extends createSystem({}) {
  private pos = new Vector3();
  private cooldown = 1;
  private inside = false;
  private night: boolean | null = null;
  private fast = new URLSearchParams(location.search).get('dbg')?.includes('bakefast') ?? false;
  private wantStart = new URLSearchParams(location.search).get('dbg')?.includes('gallery') ?? false;

  private teleport(to: Vector3) {
    const loco = this.world.getSystem(LocomotionSystem) as unknown as {
      setPlayerPosition?: (p: Vector3) => void;
    };
    this.player.position.copy(to);
    loco?.setPlayerPosition?.(to);
    this.cooldown = 1.2;
  }

  update(delta: number) {
    // Light bake: configure for the time of day, then accumulate a pass per frame
    if (procEnv.sunReady && this.night !== procEnv.night) {
      this.night = procEnv.night;
      const n = procEnv.night;
      bake.sunDir.copy(procEnv.sunDir);
      bake.sunE.set(n ? 0.22 : 3.0, n ? 0.27 : 2.8, n ? 0.42 : 2.5);
      bake.skyZenith.set(n ? 0.006 : 0.85, n ? 0.01 : 1.2, n ? 0.025 : 1.9);
      bake.skyHorizon.set(n ? 0.012 : 1.9, n ? 0.018 : 2.1, n ? 0.04 : 2.4);
      bake.ground.set(n ? 0.004 : 0.55, n ? 0.005 : 0.55, n ? 0.008 : 0.5);
      bake.ambient.set(n ? 0.2 : 0.9, n ? 0.16 : 0.85, n ? 0.12 : 0.78);
      bake.emissiveScale = n ? 1 : 0.55;
      bake.gain = n ? 1.5 : 1.7;
      bake.restart();
    }
    if (this.night !== null && !bake.done) {
      // One pass per frame keeps the frame rate up; ?dbg=bakefast finishes it quickly for screenshots
      for (let i = 0; i < (this.fast ? 24 : 1) && !bake.done; i++) bake.update(this.renderer);
      if (bake.done && this.inside) procEnv.dirty = true; // refresh the reflection probe
    }

    this.player.getWorldPosition(this.pos);
    const lx = this.pos.x - GALLERY_ORIGIN.x;
    const lz = this.pos.z - GALLERY_ORIGIN.z;
    const inside = Math.abs(lx) < 6 && Math.abs(lz) < 9 && !procEnv.monke;
    if (inside !== this.inside) {
      this.inside = inside;
      procEnv.setZone(inside ? zone : null);
    }

    this.cooldown -= delta;
    if (this.wantStart && this.night !== null) {
      this.wantStart = false;
      this.teleport(ARRIVE);
      return;
    }
    if (this.cooldown > 0 || procEnv.monke) return;
    if (inside) {
      if (lz < -2.9 && Math.abs(lx + 3) < 0.5) this.teleport(RETURN);
    } else if (Math.abs(this.pos.x) < 0.5 && this.pos.z > 2.35 && this.pos.z < 3.2 && Math.abs(this.pos.y) < 1) {
      this.teleport(ARRIVE);
    }
  }
}
