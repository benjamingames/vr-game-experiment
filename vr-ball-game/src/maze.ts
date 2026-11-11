import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Entity,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  LocomotionEnvironment,
  LocomotionSystem,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
  World,
  createSystem,
} from '@iwsdk/core';

// =============================================================================
// THE CAKE MAZE
//
// A doorway in the far wall of the main room leads into a dark, spooky maze that
// lives far away from the room (so it never overlaps the room or the Monke map).
// Walk through it, survive a few lite jumpscares, and reach the cake at the end.
// Stand on the cake picture for ~3 seconds and the floor drops out, dropping you
// into a glitchy "beneath the game" chamber with a pad that takes you home.
// =============================================================================

// ---- Tweak these to play around ---------------------------------------------
const MAZE = {
  n: 7, // maze is n x n cells
  cell: 2.4, // meters per cell (corridor width + one wall)
  wall: 0.24, // wall thickness
  height: 2.6, // wall height
  ox: 300, // maze center X (far from the room & Monke map)
  oz: 0, // maze center Z
  seed: 20261110, // same seed = same maze every time
};
const UNDER = { y: -30, half: 9, wallH: 5 }; // "beneath the game" chamber
const DOOR = { x: -1.7, z: -3.0 }; // doorway on the far (-Z) wall of the main room
const CAKE_STAND_SECONDS = 3; // how long you can stand on the cake before the floor drops
const HORROR = {
  fogColor: 0x07030c,
  fogDensityMaze: 0.085,
  fogDensityUnder: 0.04,
  hemiIntensity: 0.45, // ambient fill inside the maze (global light is dimmed to this)
  hemiSky: 0x3a4272,
  hemiGround: 0x120a14,
  lanternIntensity: 5.5, // the dim glow that follows your head
  lampIntensity: 8, // flickering ceiling lamps
};
const POOL_SIZE = 3; // how many ceiling lamps actually emit light at once (perf)
// ----------------------------------------------------------------------------

/** Lets room.ts tell the maze whether the main room is currently shown (not Monke Map). */
export const mazeHooks = {
  isRoomActive: (): boolean => true,
};

// ---- Small helpers ----------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat = false,
): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  draw(g, w, h);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  return tex;
}

function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---- Sound (tiny synth, no assets) -------------------------------------------
let actx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let droneGain: GainNode | null = null;
let droneOscs: OscillatorNode[] = [];

function ac(): AudioContext | null {
  try {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    if (!actx) {
      actx = new C();
      master = actx.createGain();
      master.gain.value = 0.55;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

function tone(
  f0: number,
  f1: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 > 0 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(
  dur: number,
  gain: number,
  filter: BiquadFilterType,
  f0: number,
  f1: number,
  delay = 0,
) {
  const c = ac();
  if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(f0, t);
  if (f1 > 0 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const sfx = {
  door() {
    tone(110, 190, 0.9, 'sawtooth', 0.06);
    noiseBurst(0.9, 0.08, 'bandpass', 400, 900);
  },
  thud() {
    tone(90, 35, 0.5, 'sine', 0.55);
    noiseBurst(0.3, 0.3, 'lowpass', 300, 120);
  },
  creak() {
    tone(70, 120, 0.9, 'sawtooth', 0.05);
    tone(73, 128, 0.9, 'triangle', 0.05);
  },
  sting() {
    noiseBurst(0.5, 0.3, 'bandpass', 3200, 500);
    tone(880, 220, 0.45, 'sawtooth', 0.16);
    tone(932, 233, 0.45, 'sawtooth', 0.16);
  },
  whisper() {
    noiseBurst(1.3, 0.1, 'bandpass', 2600, 3600);
  },
  hiss() {
    noiseBurst(0.9, 0.16, 'highpass', 4200, 5200);
  },
  crack() {
    noiseBurst(0.25, 0.35, 'highpass', 2000, 3000);
    tone(200, 60, 0.2, 'square', 0.1);
  },
  bang() {
    this.thud();
    this.crack();
  },
  whoosh() {
    noiseBurst(2.8, 0.22, 'bandpass', 2400, 180);
    tone(500, 60, 2.6, 'sine', 0.08);
  },
  chime() {
    tone(523.25, 0, 1.4, 'sine', 0.1);
    tone(622.25, 0, 1.6, 'sine', 0.08, 0.15);
    tone(784, 0, 1.8, 'sine', 0.06, 0.3);
  },
  droneStart() {
    const c = ac();
    if (!c || !master || droneGain) return;
    droneGain = c.createGain();
    droneGain.gain.setValueAtTime(0.0001, c.currentTime);
    droneGain.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    droneGain.connect(lp);
    lp.connect(master);
    droneOscs = [55, 58.6, 82.4].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(droneGain as GainNode);
      o.start();
      return o;
    });
  },
  droneStop() {
    const c = actx;
    if (!c || !droneGain) return;
    const g = droneGain;
    const oscs = droneOscs;
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
    window.setTimeout(() => {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          // already stopped
        }
      });
      g.disconnect();
    }, 1000);
    droneGain = null;
    droneOscs = [];
  },
};

// ---- Maze generation ----------------------------------------------------------
// Directions in grid space. Row index grows toward -Z (so the start row is at +Z,
// right behind a player who just walked in through the door facing -Z).
const DIRS = [
  { dr: 0, dc: 1, dx: 1, dz: 0 }, // 0: east
  { dr: 0, dc: -1, dx: -1, dz: 0 }, // 1: west
  { dr: 1, dc: 0, dx: 0, dz: -1 }, // 2: "south" (forward, -Z)
  { dr: -1, dc: 0, dx: 0, dz: 1 }, // 3: "north" (back, +Z)
];
const OPP = [1, 0, 3, 2];

type OpenGrid = boolean[][][];

function generateMaze(n: number, rng: () => number, startC: number): OpenGrid {
  const open: OpenGrid = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => [false, false, false, false]),
  );
  const seen = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const stack: Array<[number, number]> = [[0, startC]];
  seen[0][startC] = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nr = r + DIRS[d].dr;
      const nc = c + DIRS[d].dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && !seen[nr][nc]) options.push(d);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rng() * options.length)];
    const nr = r + DIRS[d].dr;
    const nc = c + DIRS[d].dc;
    open[r][c][d] = true;
    open[nr][nc][OPP[d]] = true;
    seen[nr][nc] = true;
    stack.push([nr, nc]);
  }
  return open;
}

function corridorRun(open: OpenGrid, r: number, c: number, d: number): number {
  let run = 0;
  let rr = r;
  let cc = c;
  while (open[rr][cc][d]) {
    rr += DIRS[d].dr;
    cc += DIRS[d].dc;
    run++;
  }
  return run;
}

interface BoxDef {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Merges many boxes into one geometry (one draw call, one locomotion environment). */
function mergeBoxes(boxes: BoxDef[], tile: number): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const b of boxes) {
    const g = new BoxGeometry(b.sx, b.sy, b.sz);
    g.translate(b.cx, b.cy, b.cz);
    const p = g.getAttribute('position');
    const nm = g.getAttribute('normal');
    const ind = g.getIndex() as NonNullable<BufferGeometry['index']>;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      pos.push(x, y, z);
      nor.push(nm.getX(i), nm.getY(i), nm.getZ(i));
      // World-space UVs so textures never stretch on long merged walls
      if (Math.abs(nm.getX(i)) > 0.5) uv.push(z / tile, y / tile);
      else if (Math.abs(nm.getY(i)) > 0.5) uv.push(x / tile, z / tile);
      else uv.push(x / tile, y / tile);
    }
    for (let i = 0; i < ind.count; i++) idx.push(ind.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// ---- Procedural textures ------------------------------------------------------
function makeWallTexture(): CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#656b5e';
      g.fillRect(0, 0, w, h);
      // faded wallpaper stripes
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(x, 0, 14, h);
      }
      // grime speckle
      for (let i = 0; i < 2600; i++) {
        const a = Math.random() * 0.12;
        g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // damp stains
      for (let i = 0; i < 7; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 30 + Math.random() * 60;
        const grd = g.createRadialGradient(x, y, 2, x, y, r);
        grd.addColorStop(0, 'rgba(10,18,8,0.4)');
        grd.addColorStop(1, 'rgba(10,18,8,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    true,
  );
}

function makeFloorTexture(): CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, w, h) => {
      const s = w / 4;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          g.fillStyle = (i + j) % 2 ? '#37332f' : '#46413c';
          g.fillRect(i * s, j * s, s, s);
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, h);
        g.moveTo(0, i * s);
        g.lineTo(w, i * s);
        g.stroke();
      }
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    },
    true,
  );
}

function makeCheckerTexture(): CanvasTexture {
  // The classic "missing texture" look: magenta + black
  return canvasTex(
    128,
    128,
    (g, w, h) => {
      const s = w / 2;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#000000' : '#ff00e6';
          g.fillRect(i * s, j * s, s, s);
        }
      }
    },
    true,
  );
}

function makeTextTexture(
  lines: string[],
  w: number,
  h: number,
  color: string,
  glow: string,
  drips: boolean,
  bg?: string,
): CanvasTexture {
  return canvasTex(w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    } else {
      g.clearRect(0, 0, w, h);
    }
    let size = Math.min(h / (lines.length + 0.6), 110);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // shrink until the widest line fits
    for (;;) {
      g.font = `bold ${size}px "Courier New", monospace`;
      const widest = Math.max(...lines.map((l) => g.measureText(l).width));
      if (widest <= w - 70 || size < 18) break;
      size -= 4;
    }
    const lineH = size * 1.12;
    const y0 = h / 2 - ((lines.length - 1) * lineH) / 2;
    g.shadowColor = glow;
    g.shadowBlur = 18;
    g.fillStyle = color;
    lines.forEach((l, i) => g.fillText(l, w / 2, y0 + i * lineH));
    g.shadowBlur = 0;
    if (drips) {
      g.fillStyle = color;
      for (let i = 0; i < 9; i++) {
        const x = 60 + Math.random() * (w - 120);
        const y = y0 + (lines.length - 1) * lineH + size * 0.45;
        g.fillRect(x, y, 3 + Math.random() * 3, 10 + Math.random() * (h * 0.18));
      }
    }
  });
}

function drawCakePad(): HTMLCanvasElement {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#17130f';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // Pad (1.8m square in the middle of the 2.4m cell)
  roundRectPath(g, 128, 128, 768, 768, 44);
  g.fillStyle = '#f6ecd6';
  g.fill();
  g.lineWidth = 20;
  g.strokeStyle = '#b3202a';
  g.stroke();
  g.setLineDash([6, 22]);
  g.lineWidth = 8;
  g.strokeStyle = '#e8a0a6';
  roundRectPath(g, 168, 168, 688, 688, 30);
  g.stroke();
  g.setLineDash([]);

  g.textAlign = 'center';
  g.fillStyle = '#c0262d';
  g.font = 'bold 118px "Trebuchet MS", Arial, sans-serif';
  g.fillText('CAKE!', 512, 262);

  // plate
  g.fillStyle = '#d9d4c7';
  g.strokeStyle = '#9c968a';
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(512, 770, 310, 52, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // bottom sponge
  g.fillStyle = '#6b3a1f';
  roundRectPath(g, 282, 600, 460, 160, 18);
  g.fill();
  // cream filling
  g.fillStyle = '#fff5e1';
  g.fillRect(282, 556, 460, 44);
  // top sponge
  g.fillStyle = '#7d4626';
  roundRectPath(g, 316, 450, 392, 106, 14);
  g.fill();
  // pink frosting with drips
  g.fillStyle = '#ff8fb3';
  roundRectPath(g, 296, 410, 432, 70, 30);
  g.fill();
  for (let i = 0; i < 7; i++) {
    const x = 330 + i * 60;
    const len = 30 + ((i * 37) % 50);
    g.beginPath();
    g.ellipse(x, 470 + len / 2, 16, len / 2 + 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // sprinkles
  const sprinkle = ['#ffd23f', '#4fb3ff', '#7bed9f', '#ffffff'];
  for (let i = 0; i < 26; i++) {
    g.fillStyle = sprinkle[i % sprinkle.length];
    g.fillRect(320 + ((i * 53) % 390), 420 + ((i * 29) % 42), 14, 5);
  }
  // candles + flames
  [420, 512, 604].forEach((x, i) => {
    g.fillStyle = i === 1 ? '#ff5d73' : '#4fb3ff';
    g.fillRect(x - 13, 344, 26, 72);
    g.fillStyle = '#ffffff';
    for (let s = 0; s < 3; s++) g.fillRect(x - 13, 356 + s * 20, 26, 7);
    g.fillStyle = '#ff9f1c';
    g.beginPath();
    g.ellipse(x, 316, 15, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffe66d';
    g.beginPath();
    g.ellipse(x, 322, 8, 17, 0, 0, Math.PI * 2);
    g.fill();
  });

  g.fillStyle = '#b3202a';
  g.font = 'bold 54px "Trebuchet MS", Arial, sans-serif';
  g.fillText('STAND HERE', 512, 868);
  return cv;
}

function makeCrackTexture(): CanvasTexture {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.95)';
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      let x = w / 2;
      let y = h / 2;
      let a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      g.lineWidth = 4 + Math.random() * 3;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        a += (Math.random() - 0.5) * 0.9;
        const l = 22 + Math.random() * 34;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function makeEyeTexture(): CanvasTexture {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,60,40,0.95)');
    grd.addColorStop(0.45, 'rgba(255,30,20,0.5)');
    grd.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd9c8';
    g.beginPath();
    g.ellipse(w / 2, h / 2, 58, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#120000';
    g.beginPath();
    g.ellipse(w / 2, h / 2, 9, 20, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function makeGhostFaceTexture(): CanvasTexture {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(190,255,235,0.55)');
    glow.addColorStop(1, 'rgba(190,255,235,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9f5ee';
    g.beginPath();
    g.ellipse(w / 2, h / 2, 150, 200, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05080a';
    g.beginPath();
    g.ellipse(w / 2 - 62, h / 2 - 50, 34, 56, -0.1, 0, Math.PI * 2);
    g.ellipse(w / 2 + 62, h / 2 - 50, 34, 56, 0.1, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(w / 2, h / 2 + 95, 44, 70, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function makeVoidDoorTexture(): CanvasTexture {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    // receding frames to fake a dark hallway
    for (let i = 0; i < 9; i++) {
      const inset = 14 + i * 12;
      const a = 0.05 + i * 0.012;
      g.strokeStyle = `rgba(150,25,20,${a})`;
      g.lineWidth = 3;
      g.strokeRect(inset, inset * 1.6, w - inset * 2, h - inset * 2.2);
    }
    const grd = g.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, h * 0.5);
    grd.addColorStop(0, 'rgba(110,10,10,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

function makeGlowDecalTexture(r: number, gC: number, b: number): CanvasTexture {
  return canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grd.addColorStop(0, `rgba(${r},${gC},${b},0.55)`);
    grd.addColorStop(1, `rgba(${r},${gC},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

// ---- Shared state built once by buildMaze() -------------------------------------
interface Lamp {
  pos: Vector3;
  color: Color;
  mat: MeshBasicMaterial;
  seed: number;
}

type ScareKind = 'flicker' | 'shadow' | 'eyes' | 'face' | 'bang';

interface Scare {
  kind: ScareKind;
  r: number;
  c: number;
  x: number;
  z: number;
  fired: boolean;
  eyes?: Group;
}

interface MazeRefs {
  wallMesh: Mesh;
  doorGroup: Group;
  doorSignMat: MeshBasicMaterial;
  startX: number;
  startZ: number;
  exitX: number;
  exitZ: number;
  open: OpenGrid;
  scares: Scare[];
  lamps: Lamp[];
  poolLights: PointLight[];
  lantern: PointLight;
  overlay: Mesh;
  overlayMat: MeshBasicMaterial;
  figure: Group;
  face: Mesh;
  faceMat: MeshBasicMaterial;
  trapEntity: Entity;
  trapMesh: Mesh;
  leafL: Group;
  leafR: Group;
  crackMat: MeshBasicMaterial;
  padGroup: Group;
  returnPad: { x: number; z: number };
  returnBeam: Mesh;
  returnBeamMat: MeshBasicMaterial;
}

let refs: MazeRefs | null = null;

function cellX(c: number): number {
  return MAZE.ox + (c - (MAZE.n - 1) / 2) * MAZE.cell;
}
function cellZ(r: number): number {
  return MAZE.oz + ((MAZE.n - 1) / 2 - r) * MAZE.cell;
}

// ---- Building --------------------------------------------------------------------
export function buildMaze(world: World) {
  const { n, cell, wall, height: H, ox, oz } = MAZE;
  const rng = mulberry32(MAZE.seed);
  const startC = Math.floor(n / 2);
  const open = generateMaze(n, rng, startC);

  // Distances from the start (BFS) -> exit is the farthest cell
  const dist = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  const parent: Array<Array<[number, number] | null>> = Array.from({ length: n }, () =>
    new Array<[number, number] | null>(n).fill(null),
  );
  const queue: Array<[number, number]> = [[0, startC]];
  dist[0][startC] = 0;
  let exitR = 0;
  let exitC = startC;
  for (let qi = 0; qi < queue.length; qi++) {
    const [r, c] = queue[qi];
    if (dist[r][c] > dist[exitR][exitC]) {
      exitR = r;
      exitC = c;
    }
    for (let d = 0; d < 4; d++) {
      if (!open[r][c][d]) continue;
      const nr = r + DIRS[d].dr;
      const nc = c + DIRS[d].dc;
      if (dist[nr][nc] >= 0) continue;
      dist[nr][nc] = dist[r][c] + 1;
      parent[nr][nc] = [r, c];
      queue.push([nr, nc]);
    }
  }
  const maxDist = Math.max(1, dist[exitR][exitC]);
  const path: Array<[number, number]> = [];
  for (let cur: [number, number] | null = [exitR, exitC]; cur; cur = parent[cur[0]][cur[1]]) {
    path.unshift(cur);
  }

  const startX = cellX(startC);
  const startZ = cellZ(0);
  const exitX = cellX(exitC);
  const exitZ = cellZ(exitR);

  // --- Materials
  const wallMat = new MeshStandardMaterial({
    map: makeWallTexture(),
    color: 0xffffff,
    roughness: 0.95,
  });
  const floorMat = new MeshStandardMaterial({
    map: makeFloorTexture(),
    color: 0xffffff,
    roughness: 0.75,
  });
  const ceilMat = new MeshStandardMaterial({ color: 0x14110f, roughness: 1 });
  const woodMat = new MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 });

  const decor = new Group(); // all non-collidable maze decoration lives here
  decor.name = 'maze-decor';

  // --- Walls (merged runs -> one mesh -> one locomotion environment)
  const boxes: BoxDef[] = [];
  for (let h = 0; h <= n; h++) {
    let runStart = -1;
    for (let c = 0; c <= n; c++) {
      const has = c < n && (h === 0 || h === n || !open[h - 1][c][2]);
      if (has && runStart < 0) runStart = c;
      if (!has && runStart >= 0) {
        const x0 = cellX(runStart) - cell / 2 - wall / 2;
        const x1 = cellX(c - 1) + cell / 2 + wall / 2;
        boxes.push({
          cx: (x0 + x1) / 2,
          cy: H / 2,
          cz: oz + (n / 2 - h) * cell,
          sx: x1 - x0,
          sy: H,
          sz: wall,
        });
        runStart = -1;
      }
    }
  }
  for (let v = 0; v <= n; v++) {
    let runStart = -1;
    for (let r = 0; r <= n; r++) {
      const has = r < n && (v === 0 || v === n || !open[r][v - 1][0]);
      if (has && runStart < 0) runStart = r;
      if (!has && runStart >= 0) {
        const zTop = cellZ(runStart) + cell / 2 + wall / 2;
        const zBot = cellZ(r - 1) - cell / 2 - wall / 2;
        boxes.push({
          cx: ox + (v - n / 2) * cell,
          cy: H / 2,
          cz: (zTop + zBot) / 2,
          sx: wall,
          sy: H,
          sz: zTop - zBot,
        });
        runStart = -1;
      }
    }
  }
  const wallMesh = new Mesh(mergeBoxes(boxes, cell), wallMat);
  wallMesh.name = 'maze-walls';
  world.createTransformEntity(wallMesh).addComponent(LocomotionEnvironment);

  // --- Floor with a hole where the exit cell is (the exit cell gets its own trap floor)
  const fx0 = ox - (n * cell) / 2 - wall / 2;
  const fx1 = ox + (n * cell) / 2 + wall / 2;
  const floorBoxes: BoxDef[] = [];
  const rowTop = (r: number) => cellZ(r) + cell / 2 + (r === 0 ? wall / 2 : 0);
  const rowBot = (r: number) => cellZ(r) - cell / 2 - (r === n - 1 ? wall / 2 : 0);
  const addFloor = (xa: number, xb: number, za: number, zb: number) => {
    // za > zb (top edge z, bottom edge z)
    floorBoxes.push({
      cx: (xa + xb) / 2,
      cy: -0.15,
      cz: (za + zb) / 2,
      sx: xb - xa,
      sy: 0.3,
      sz: za - zb,
    });
  };
  if (exitR > 0) addFloor(fx0, fx1, rowTop(0), rowBot(exitR - 1));
  if (exitR < n - 1) addFloor(fx0, fx1, rowTop(exitR + 1), rowBot(n - 1));
  const holeXa = cellX(exitC) - cell / 2;
  const holeXb = cellX(exitC) + cell / 2;
  if (exitC > 0) addFloor(fx0, holeXa, rowTop(exitR), rowBot(exitR));
  if (exitC < n - 1) addFloor(holeXb, fx1, rowTop(exitR), rowBot(exitR));
  const floorMesh = new Mesh(mergeBoxes(floorBoxes, cell), floorMat);
  floorMesh.name = 'maze-floor';
  world.createTransformEntity(floorMesh).addComponent(LocomotionEnvironment);

  // --- Ceiling (not walkable)
  const ceil = new Mesh(new BoxGeometry(n * cell + wall, 0.2, n * cell + wall), ceilMat);
  ceil.position.set(ox, H + 0.1, oz);
  decor.add(ceil);

  // --- The trap floor in the exit cell (walkable until the cake drops)
  const trapMesh = new Mesh(new BoxGeometry(cell, 0.3, cell), floorMat);
  trapMesh.position.set(exitX, -0.15, exitZ);
  trapMesh.name = 'maze-trap-floor';
  const trapEntity = world.createTransformEntity(trapMesh);
  trapEntity.addComponent(LocomotionEnvironment);

  // Cake picture on two hinged leaves that swing down when the floor drops
  const padCanvas = drawCakePad();
  const halfTex = (sx: number) => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 1024;
    (cv.getContext('2d') as CanvasRenderingContext2D).drawImage(padCanvas, sx, 0, 512, 1024, 0, 0, 512, 1024);
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    return t;
  };
  const leafSide = new MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 });
  const makeLeaf = (sx: number, hingeSign: number) => {
    const topMat = new MeshStandardMaterial({ map: halfTex(sx), roughness: 0.7 });
    const geo = new BoxGeometry(cell / 2, 0.2, cell);
    const m = new Mesh(geo, [leafSide, leafSide, topMat, leafSide, leafSide, leafSide]);
    m.position.set(-hingeSign * (cell / 4), -0.088, 0); // top face sits 1.2cm above the floor
    const pivot = new Group();
    pivot.position.set(exitX + hingeSign * (cell / 2), 0, exitZ);
    pivot.add(m);
    return pivot;
  };
  const leafL = makeLeaf(0, -1); // hinge on the left edge, leaf extends toward +X
  const leafR = makeLeaf(512, 1); // hinge on the right edge, leaf extends toward -X
  const padGroup = new Group();
  padGroup.add(leafL, leafR);
  decor.add(padGroup);

  const crackMat = new MeshBasicMaterial({
    map: makeCrackTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const cracks = new Mesh(new PlaneGeometry(1.9, 1.9), crackMat);
  cracks.rotation.x = -Math.PI / 2;
  cracks.position.set(exitX, 0.0135, exitZ);
  decor.add(cracks);

  // --- Lamps (bulbs on the ceiling; only the nearest few actually emit light)
  const lamps: Lamp[] = [];
  const lampColors = [0xffb25a, 0xffb25a, 0xffb25a, 0x8cff6a, 0xff3a2a];
  const bulbGeo = new SphereGeometry(0.075, 12, 8);
  const cordGeo = new CylinderGeometry(0.012, 0.012, 0.25, 6);
  const addLamp = (x: number, y: number, z: number, hex: number) => {
    const mat = new MeshBasicMaterial({ color: hex });
    const bulb = new Mesh(bulbGeo, mat);
    bulb.position.set(x, y, z);
    decor.add(bulb);
    const cord = new Mesh(cordGeo, woodMat);
    cord.position.set(x, y + 0.17, z);
    decor.add(cord);
    lamps.push({ pos: new Vector3(x, y, z), color: new Color(hex), mat, seed: rng() * 100 });
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const isExit = r === exitR && c === exitC;
      if (isExit) {
        addLamp(cellX(c), H - 0.35, cellZ(r), 0xffd9a0); // warm light on the cake
      } else if ((r + c) % 2 === 0 && rng() > 0.25) {
        addLamp(
          cellX(c),
          H - 0.2,
          cellZ(r),
          lampColors[Math.floor(rng() * lampColors.length)],
        );
      }
    }
  }

  // --- Wall messages about the cake
  const usedWalls = new Set<string>();
  const hasWall = (r: number, c: number, d: number) => !open[r][c][d];
  const msgEarly = [
    "THERE'S CAKE AT THE END",
    'WE BAKED YOU A CAKE',
    'FOLLOW THE CAKE',
    'THE CAKE IS REAL',
    'CAKE. THIS WAY. PROBABLY.',
  ];
  const msgMid = [
    'KEEP GOING. CAKE.',
    "YOU'RE SO CLOSE TO THE CAKE",
    "DON'T STOP NOW. CAKE.",
    "IT'S CHOCOLATE. WE PROMISE.",
    "DON'T LOOK BACK",
    'THE CAKE IS WAITING',
  ];
  const msgLate = [
    'ALMOST THERE. CAKE.',
    'THE CAKE IS RIGHT AHEAD',
    'STAND ON THE CAKE',
    "YOU'VE EARNED IT. CAKE.",
    'SO MUCH CAKE',
  ];
  const msgGeo = new PlaneGeometry(1.7, 0.5);
  const placeOnWall = (obj: Object3D, r: number, c: number, d: number, y: number, inset: number) => {
    const off = cell / 2 - wall / 2 - inset;
    obj.position.set(cellX(c) + DIRS[d].dx * off, y, cellZ(r) + DIRS[d].dz * off);
    // plane normal (+Z) must face the cell center, i.e. direction -dir
    obj.rotation.y = Math.atan2(-DIRS[d].dx, -DIRS[d].dz);
  };
  const addMessage = (r: number, c: number, d: number, text: string, red: boolean) => {
    usedWalls.add(`${r},${c},${d}`);
    const tex = makeTextTexture(
      text.split('\n'),
      768,
      224,
      red ? '#c4141c' : '#e9e0c8',
      red ? '#ff2a2a' : '#6a5a40',
      red,
    );
    const m = new Mesh(
      msgGeo,
      new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.88, depthWrite: false }),
    );
    placeOnWall(m, r, c, d, 1.35 + rng() * 0.5, 0.012);
    decor.add(m);
  };

  // first message: right in front of you when you arrive
  {
    const order = [2, 0, 1];
    const d = order.find((k) => hasWall(0, startC, k));
    if (d !== undefined) addMessage(0, startC, d, "THERE'S CAKE\nAT THE END", false);
  }
  const cellsShuffled: Array<[number, number]> = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cellsShuffled.push([r, c]);
  for (let i = cellsShuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cellsShuffled[i], cellsShuffled[j]] = [cellsShuffled[j], cellsShuffled[i]];
  }
  let placed = 0;
  for (const [r, c] of cellsShuffled) {
    if (placed >= 20) break;
    if (r === 0 && c === startC) continue;
    const sides = [0, 1, 2, 3].filter((d) => hasWall(r, c, d) && !usedWalls.has(`${r},${c},${d}`));
    if (!sides.length) continue;
    const d = sides[Math.floor(rng() * sides.length)];
    const p = dist[r][c] / maxDist;
    const tier = p < 0.34 ? msgEarly : p < 0.7 ? msgMid : msgLate;
    const text = tier[Math.floor(rng() * tier.length)];
    addMessage(r, c, d, text, rng() < 0.5);
    placed++;
  }
  // a big one right by the cake
  {
    const d = [0, 1, 2, 3].find((k) => hasWall(exitR, exitC, k) && !usedWalls.has(`${exitR},${exitC},${k}`));
    if (d !== undefined) addMessage(exitR, exitC, d, 'THE CAKE\nIS HERE', false);
  }

  // --- Jumpscare triggers spread along the solution path
  const scares: Scare[] = [];
  const kinds: ScareKind[] = ['flicker', 'shadow', 'eyes', 'face', 'bang'];
  const fractions = [0.2, 0.38, 0.55, 0.72, 0.88];
  const eyeTex = makeEyeTexture();
  let lastIdx = 0;
  kinds.forEach((kind, i) => {
    let idx = Math.round((path.length - 1) * fractions[i]);
    idx = Math.max(idx, lastIdx + 1);
    idx = Math.min(idx, path.length - 2);
    lastIdx = idx;
    const [r, c] = path[Math.max(1, idx)];
    const s: Scare = { kind, r, c, x: cellX(c), z: cellZ(r), fired: false };
    if (kind === 'eyes') {
      const d = [0, 1, 2, 3].find((k) => hasWall(r, c, k) && !usedWalls.has(`${r},${c},${k}`));
      if (d !== undefined) {
        usedWalls.add(`${r},${c},${d}`);
        const eg = new Group();
        const eyeMat = new MeshBasicMaterial({
          map: eyeTex,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        });
        const eyeGeo = new PlaneGeometry(0.34, 0.17);
        const e1 = new Mesh(eyeGeo, eyeMat);
        const e2 = new Mesh(eyeGeo, eyeMat);
        e1.position.set(-0.24, 0, 0);
        e2.position.set(0.24, 0, 0);
        eg.add(e1, e2);
        placeOnWall(eg, r, c, d, 1.65, 0.02);
        eg.scale.y = 0.001;
        eg.visible = false;
        decor.add(eg);
        s.eyes = eg;
      }
    }
    scares.push(s);
  });

  // --- Return door in the start cell (walk back into it to leave the maze)
  const retDoor = new Group();
  {
    const dz = startZ + cell / 2 - wall / 2 - 0.02;
    retDoor.position.set(startX, 0, dz);
    retDoor.rotation.y = Math.PI; // face -Z, into the maze
    const postGeo = new BoxGeometry(0.12, 2.1, 0.12);
    const l = new Mesh(postGeo, woodMat);
    l.position.set(-0.55, 1.05, 0);
    const r2 = new Mesh(postGeo, woodMat);
    r2.position.set(0.55, 1.05, 0);
    const top = new Mesh(new BoxGeometry(1.22, 0.12, 0.12), woodMat);
    top.position.set(0, 2.1, 0);
    const panel = new Mesh(
      new PlaneGeometry(1.0, 2.04),
      new MeshStandardMaterial({ color: 0x1b140f, roughness: 0.8 }),
    );
    panel.position.set(0, 1.02, 0.01);
    const sign = new Mesh(
      new PlaneGeometry(0.7, 0.2),
      new MeshBasicMaterial({
        map: makeTextTexture(['EXIT'], 256, 80, '#58ff9a', '#0cff6a', false, '#04100a'),
      }),
    );
    sign.position.set(0, 2.32, 0.02);
    retDoor.add(l, r2, top, panel, sign);
    decor.add(retDoor);
  }

  world.createTransformEntity(decor);

  // --- Lights (created once; toggled on only while inside the maze)
  const lightsGroup = new Group();
  const poolLights: PointLight[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const pl = new PointLight(0xffb25a, 0, 10, 2);
    pl.visible = false;
    lightsGroup.add(pl);
    poolLights.push(pl);
  }
  const lantern = new PointLight(0xffd9a8, 0, 9, 2);
  lantern.visible = false;
  lightsGroup.add(lantern);
  world.createTransformEntity(lightsGroup);

  // --- Fullscreen fade / flash overlay (positioned in front of the head each frame)
  const overlayMat = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: DoubleSide,
  });
  const overlay = new Mesh(new PlaneGeometry(1.8, 1.8), overlayMat);
  overlay.renderOrder = 9999;
  overlay.frustumCulled = false;
  overlay.visible = false;
  world.createTransformEntity(overlay);

  // --- Jumpscare actors
  const figure = new Group();
  {
    const bodyMat = new MeshStandardMaterial({ color: 0x0b0b10, roughness: 1 });
    const leg = new CylinderGeometry(0.09, 0.07, 0.95, 8);
    const l1 = new Mesh(leg, bodyMat);
    l1.position.set(-0.12, 0.48, 0);
    const l2 = new Mesh(leg, bodyMat);
    l2.position.set(0.12, 0.48, 0);
    const torso = new Mesh(new BoxGeometry(0.46, 0.8, 0.24), bodyMat);
    torso.position.set(0, 1.35, 0);
    const head = new Mesh(new SphereGeometry(0.17, 14, 10), bodyMat);
    head.position.set(0, 1.98, 0);
    const arm = new CylinderGeometry(0.045, 0.035, 1.05, 6);
    const a1 = new Mesh(arm, bodyMat);
    a1.position.set(-0.32, 1.2, 0.08);
    a1.rotation.z = 0.12;
    const a2 = new Mesh(arm, bodyMat);
    a2.position.set(0.32, 1.2, 0.08);
    a2.rotation.z = -0.12;
    const eyeMat = new MeshBasicMaterial({ color: 0xf2fff6, fog: false });
    const eyeGeo = new SphereGeometry(0.028, 8, 6);
    const e1 = new Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.07, 2.0, 0.15);
    const e2 = new Mesh(eyeGeo, eyeMat);
    e2.position.set(0.07, 2.0, 0.15);
    figure.add(l1, l2, torso, head, a1, a2, e1, e2);
    figure.visible = false;
    world.createTransformEntity(figure);
  }
  const faceMat = new MeshBasicMaterial({
    map: makeGhostFaceTexture(),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const face = new Mesh(new PlaneGeometry(1.2, 1.2), faceMat);
  face.visible = false;
  world.createTransformEntity(face);

  // --- "Beneath the game" chamber (reached by falling through the cake)
  const ux = ox;
  const uz = oz;
  const uy = UNDER.y;
  const checker = makeCheckerTexture();
  const checkMat = new MeshBasicMaterial({ map: checker, color: 0x8a8a8a });
  const uFloor = new Mesh(
    mergeBoxes(
      [{ cx: ux, cy: uy - 0.2, cz: uz, sx: UNDER.half * 2 + 0.8, sy: 0.4, sz: UNDER.half * 2 + 0.8 }],
      2,
    ),
    checkMat,
  );
  world.createTransformEntity(uFloor).addComponent(LocomotionEnvironment);
  const uh = UNDER.half;
  const uw = UNDER.wallH;
  const uWalls = new Mesh(
    mergeBoxes(
      [
        { cx: ux, cy: uy + uw / 2, cz: uz - uh - 0.2, sx: uh * 2 + 0.8, sy: uw, sz: 0.4 },
        { cx: ux, cy: uy + uw / 2, cz: uz + uh + 0.2, sx: uh * 2 + 0.8, sy: uw, sz: 0.4 },
        { cx: ux - uh - 0.2, cy: uy + uw / 2, cz: uz, sx: 0.4, sy: uw, sz: uh * 2 },
        { cx: ux + uh + 0.2, cy: uy + uw / 2, cz: uz, sx: 0.4, sy: uw, sz: uh * 2 },
      ],
      2,
    ),
    checkMat,
  );
  world.createTransformEntity(uWalls).addComponent(LocomotionEnvironment);

  const under = new Group();
  const wallSign = (lines: string[], x: number, y: number, z: number, ry: number, color: string, glow: string) => {
    const s = new Mesh(
      new PlaneGeometry(2.6, 0.9),
      new MeshBasicMaterial({
        map: makeTextTexture(lines, 768, 256, color, glow, false, '#000000'),
      }),
    );
    s.position.set(x, y, z);
    s.rotation.y = ry;
    under.add(s);
  };
  const wy = uy + 2.2;
  wallSign(['OUT OF BOUNDS'], ux, wy, uz - uh + 0.01, 0, '#ff4d4d', '#ff0000');
  wallSign(["YOU SHOULDN'T", 'BE DOWN HERE'], ux - uh + 0.01, wy, uz, Math.PI / 2, '#e9e0c8', '#6a5a40');
  wallSign(['MISSING TEXTURE:', 'cake.png'], ux + uh - 0.01, wy, uz, -Math.PI / 2, '#ff66ee', '#ff00e6');
  wallSign(['NO CAKE', 'DOWN HERE'], ux, wy, uz + uh - 0.01, Math.PI, '#e9e0c8', '#6a5a40');

  // sad little cake on a table
  {
    const tx = ux + 3.2;
    const tz = uz;
    const table = new Mesh(new BoxGeometry(1.0, 0.75, 1.0), new MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.8 }));
    table.position.set(tx, uy + 0.375, tz);
    under.add(table);
    const plate = new Mesh(new CylinderGeometry(0.3, 0.3, 0.02, 24), new MeshStandardMaterial({ color: 0xddd8cc }));
    plate.position.set(tx, uy + 0.76, tz);
    under.add(plate);
    const sponge = new Mesh(new CylinderGeometry(0.2, 0.2, 0.12, 24), new MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.9 }));
    sponge.position.set(tx, uy + 0.83, tz);
    under.add(sponge);
    const icing = new Mesh(new CylinderGeometry(0.205, 0.205, 0.04, 24), new MeshStandardMaterial({ color: 0xff8fb3, roughness: 0.6 }));
    icing.position.set(tx, uy + 0.9, tz);
    under.add(icing);
    const candle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.1, 8), new MeshStandardMaterial({ color: 0x4fb3ff }));
    candle.position.set(tx, uy + 0.97, tz);
    under.add(candle);
    const flame = new Mesh(new SphereGeometry(0.02, 8, 6), new MeshBasicMaterial({ color: 0xffd23f }));
    flame.position.set(tx, uy + 1.04, tz);
    under.add(flame);
    wallSign(['THE CAKE', 'WAS A LIE'], tx, uy + 1.9, tz, Math.PI / 2, '#ffd23f', '#ff9f1c');
  }

  // the way back
  const retPad = new Mesh(
    new CylinderGeometry(0.9, 0.9, 0.06, 40),
    new MeshBasicMaterial({ color: 0x2bff88 }),
  );
  retPad.position.set(ux, uy + 0.03, uz);
  under.add(retPad);
  const retRing = new Mesh(
    new CylinderGeometry(1.05, 1.05, 0.03, 40),
    new MeshBasicMaterial({ color: 0x0b5a33 }),
  );
  retRing.position.set(ux, uy + 0.015, uz);
  under.add(retRing);
  const beamMat = new MeshBasicMaterial({
    color: 0x2bff88,
    transparent: true,
    opacity: 0.18,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const beam = new Mesh(new CylinderGeometry(0.85, 0.85, 3.6, 32, 1, true), beamMat);
  beam.position.set(ux, uy + 1.8, uz);
  under.add(beam);
  wallSign(['WAY BACK'], ux, uy + 3.0, uz, 0, '#58ff9a', '#0cff6a');
  addLamp(ux, uy + 3.6, uz, 0x2bff88);
  addLamp(ux - 6, uy + 3.6, uz - 6, 0xff00e6);
  addLamp(ux + 6, uy + 3.6, uz + 6, 0xff00e6);
  addLamp(ux + 3.2, uy + 2.4, uz, 0xffb25a);
  world.createTransformEntity(under);

  const doorway = buildDoorway(world);
  refs = {
    wallMesh,
    doorGroup: doorway.group,
    doorSignMat: doorway.signMat,
    startX,
    startZ,
    exitX,
    exitZ,
    open,
    scares,
    lamps,
    poolLights,
    lantern,
    overlay,
    overlayMat,
    figure,
    face,
    faceMat,
    trapEntity,
    trapMesh,
    leafL,
    leafR,
    crackMat,
    padGroup,
    returnPad: { x: ux, z: uz },
    returnBeam: beam,
    returnBeamMat: beamMat,
  };
}

/** The spooky doorway on the far wall of the main room. */
function buildDoorway(world: World): { group: Group; signMat: MeshBasicMaterial } {
  const g = new Group();
  g.name = 'maze-doorway';
  g.position.set(DOOR.x, 0, DOOR.z);
  const wood = new MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55 });
  const post = new BoxGeometry(0.14, 2.24, 0.18);
  const pl = new Mesh(post, wood);
  pl.position.set(-0.57, 1.12, 0.06);
  const pr = new Mesh(post, wood);
  pr.position.set(0.57, 1.12, 0.06);
  const lintel = new Mesh(new BoxGeometry(1.28, 0.14, 0.18), wood);
  lintel.position.set(0, 2.17, 0.06);
  const voidPlane = new Mesh(
    new PlaneGeometry(1.0, 2.1),
    new MeshBasicMaterial({ map: makeVoidDoorTexture(), fog: false }),
  );
  voidPlane.position.set(0, 1.05, 0.03);
  const glow = new Mesh(
    new PlaneGeometry(2.0, 2.0),
    new MeshBasicMaterial({
      map: makeGlowDecalTexture(255, 30, 20),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.006, 0.85);
  const signMat = new MeshBasicMaterial({
    map: makeTextTexture(['THE MAZE'], 384, 96, '#d11a1a', '#ff2a2a', false, '#0a0303'),
    transparent: true,
  });
  const sign = new Mesh(new PlaneGeometry(0.9, 0.225), signMat);
  sign.position.set(0, 2.42, 0.08);
  g.add(pl, pr, lintel, voidPlane, glow, sign);
  world.createTransformEntity(g);
  return { group: g, signMat };
}

// ---- The system ------------------------------------------------------------------
interface Timer {
  t: number;
  fn: () => void;
}

export class MazeSystem extends createSystem({}) {
  private head = new Vector3();
  private dir = new Vector3();
  private camQuat = new Quaternion();
  private tmp = new Vector3();
  private ray = new Raycaster();
  private time = 0;

  private horror = false;
  private falling = false;
  private fallVel = 0;
  private cooldown = 0;

  // saved global state to restore when leaving the maze
  private dirLight: DirectionalLight | null = null;
  private hemiLight: HemisphereLight | null = null;
  private saved = { dirI: 1, hemiI: 1, hemiSky: new Color(), hemiGround: new Color() };
  private savedFog: Scene['fog'] = null;

  // effects
  private fadeAlpha = 0;
  private fadeRate = 0;
  private timers: Timer[] = [];
  private lightMul = 1;
  private blackout = 0;
  private burst = 0;
  private bulbsOn = true;
  private taken = new Uint8Array(0);

  // jumpscares
  private shadowT = -1;
  private shadowDir = new Vector3();
  private shadowD0 = 3;
  private faceT = -1;
  private faceDir = new Vector3();
  private faceD = 1.6;
  private eyesT = -1;
  private eyesGroup: Group | null = null;

  // cake trap
  private standTime = 0;
  private creaked = false;
  private cracked = false;
  private trapOpen = false;
  private leafAngle = 0;

  // underworld pad
  private padTime = 0;

  init() {
    if (refs) this.taken = new Uint8Array(refs.lamps.length);
  }

  // --- helpers -----------------------------------------------------------------
  private loco() {
    return this.world.getSystem(LocomotionSystem) as unknown as
      | {
          setPlayerPosition?: (p: Vector3) => void;
          removeEnvironmentFromEngine?: (e: Entity) => void;
        }
      | undefined;
  }

  private placeRig(x: number, y: number, z: number) {
    this.tmp.set(x, y, z);
    this.head.add(this.tmp).sub(this.player.position); // keep cached head in sync
    this.player.position.copy(this.tmp);
    this.loco()?.setPlayerPosition?.(this.tmp);
  }

  /** Teleport so the player's HEAD ends up at (x, z) on the floor level y. */
  private placeHead(x: number, y: number, z: number) {
    const offX = this.head.x - this.player.position.x;
    const offZ = this.head.z - this.player.position.z;
    this.placeRig(x - offX, y, z - offZ);
  }

  private fade(hex: number, alpha: number, seconds: number) {
    if (!refs) return;
    refs.overlayMat.color.setHex(hex);
    this.fadeAlpha = alpha;
    this.fadeRate = alpha / Math.max(0.05, seconds);
  }

  private later(seconds: number, fn: () => void) {
    this.timers.push({ t: seconds, fn });
  }

  private findLights() {
    if (this.dirLight && this.hemiLight) return;
    this.scene.traverse((o: Object3D) => {
      if (!this.dirLight && (o as DirectionalLight).isDirectionalLight) {
        this.dirLight = o as DirectionalLight;
      } else if (!this.hemiLight && (o as HemisphereLight).isHemisphereLight) {
        this.hemiLight = o as HemisphereLight;
      }
    });
  }

  private setHorror(on: boolean) {
    if (!refs || this.horror === on) return;
    this.horror = on;
    this.findLights();
    if (on) {
      if (this.dirLight) this.saved.dirI = this.dirLight.intensity;
      if (this.hemiLight) {
        this.saved.hemiI = this.hemiLight.intensity;
        this.saved.hemiSky.copy(this.hemiLight.color);
        this.saved.hemiGround.copy(this.hemiLight.groundColor);
      }
      this.savedFog = this.scene.fog;
      this.scene.fog = new FogExp2(HORROR.fogColor, HORROR.fogDensityMaze);
      refs.poolLights.forEach((l) => (l.visible = true));
      refs.lantern.visible = true;
      sfx.droneStart();
    } else {
      if (this.dirLight) this.dirLight.intensity = this.saved.dirI;
      if (this.hemiLight) {
        this.hemiLight.intensity = this.saved.hemiI;
        this.hemiLight.color.copy(this.saved.hemiSky);
        this.hemiLight.groundColor.copy(this.saved.hemiGround);
      }
      this.scene.fog = this.savedFog;
      refs.poolLights.forEach((l) => {
        l.visible = false;
        l.intensity = 0;
      });
      refs.lantern.visible = false;
      refs.lantern.intensity = 0;
      refs.figure.visible = false;
      refs.face.visible = false;
      sfx.droneStop();
      this.shadowT = this.faceT = this.eyesT = -1;
      this.blackout = 0;
      this.lightMul = 1;
      this.timers.length = 0;
    }
  }

  private resetMaze() {
    if (!refs) return;
    refs.scares.forEach((s) => {
      s.fired = false;
      if (s.eyes) {
        s.eyes.visible = false;
        s.eyes.scale.y = 0.001;
      }
    });
    this.shadowT = this.faceT = this.eyesT = -1;
    refs.figure.visible = false;
    refs.face.visible = false;
    this.blackout = 0;
    this.burst = 0;
    this.standTime = 0;
    this.creaked = false;
    this.cracked = false;
    this.trapOpen = false;
    this.leafAngle = 0;
    this.padTime = 0;
    refs.leafL.rotation.z = 0;
    refs.leafR.rotation.z = 0;
    refs.crackMat.opacity = 0;
    refs.trapMesh.visible = true;
    if (!refs.trapEntity.hasComponent(LocomotionEnvironment)) {
      refs.trapEntity.addComponent(LocomotionEnvironment);
    }
  }

  // --- transitions -----------------------------------------------------------------
  private enterMaze() {
    if (!refs) return;
    this.resetMaze();
    this.cooldown = 2;
    this.placeHead(refs.startX, 0, refs.startZ);
    this.fade(0x000000, 1, 1.8);
    sfx.door();
  }

  private leaveToRoom() {
    this.cooldown = 2.5;
    this.falling = false;
    this.placeRig(0, 0, 0.6); // same spot the room's own spawn uses
    this.fade(0x000000, 1, 1.4);
    sfx.door();
  }

  private dropTrap() {
    if (!refs || this.trapOpen) return;
    this.trapOpen = true;
    const loco = this.loco();
    if (refs.trapEntity.hasComponent(LocomotionEnvironment)) {
      loco?.removeEnvironmentFromEngine?.(refs.trapEntity);
      refs.trapEntity.removeComponent(LocomotionEnvironment);
    }
    refs.trapMesh.visible = false;
    refs.crackMat.opacity = 0;
    this.falling = true;
    this.fallVel = 0;
    sfx.crack();
    sfx.whoosh();
  }

  // --- jumpscares ------------------------------------------------------------------
  /** Distance from the head to the nearest maze wall along a flat direction (capped at maxD). */
  private freeDist(dx: number, dz: number, maxD: number): number {
    if (!refs) return maxD;
    this.tmp.set(this.head.x, 1.0, this.head.z);
    this.dir.set(dx, 0, dz).normalize();
    this.ray.set(this.tmp, this.dir);
    this.ray.far = maxD;
    const hits = this.ray.intersectObject(refs.wallMesh, false);
    return hits.length ? hits[0].distance : maxD;
  }

  /**
   * Aims a scare straight ahead of where the player is looking when there is room
   * (so it is actually seen); otherwise falls back to the best open corridor.
   */
  private aimScare(s: Scare, out: Vector3, minFree: number, maxD: number, standoff: number): number {
    this.camera.getWorldDirection(this.dir);
    let gx = this.dir.x;
    let gz = this.dir.z;
    const gl = Math.hypot(gx, gz);
    if (gl > 0.2) {
      gx /= gl;
      gz /= gl;
      const free = this.freeDist(gx, gz, maxD + standoff);
      if (free >= minFree) {
        out.set(gx, 0, gz);
        return Math.min(maxD, free - standoff);
      }
    }
    return this.pickScareDir(s, out);
  }

  /** Picks the open corridor direction that lets a scare appear in clear space. */
  private pickScareDir(s: Scare, out: Vector3): number {
    if (!refs) return 1.6;
    this.camera.getWorldDirection(this.dir);
    let gx = this.dir.x;
    let gz = this.dir.z;
    const gl = Math.hypot(gx, gz) || 1;
    gx /= gl;
    gz /= gl;
    let bestD = 0;
    let bestScore = -1e9;
    let bestDist = 1.6;
    for (let d = 0; d < 4; d++) {
      const run = corridorRun(refs.open, s.r, s.c, d);
      const dist = Math.min(3.4, run * MAZE.cell + MAZE.cell / 2 - 0.55);
      if (dist < 1.6) continue;
      const score = DIRS[d].dx * gx + DIRS[d].dz * gz + 0.2 * Math.min(run, 3);
      if (score > bestScore) {
        bestScore = score;
        bestD = d;
        bestDist = dist;
      }
    }
    out.set(DIRS[bestD].dx, 0, DIRS[bestD].dz);
    return bestDist;
  }

  private fireScare(s: Scare) {
    if (!refs) return;
    s.fired = true;
    switch (s.kind) {
      case 'flicker':
        this.blackout = 1.6;
        sfx.thud();
        this.later(0.9, () => sfx.creak());
        this.later(1.6, () => {
          this.burst = 0.7;
          sfx.whisper();
        });
        break;
      case 'bang':
        this.blackout = 0.8;
        sfx.bang();
        this.later(0.8, () => {
          this.burst = 1.1;
        });
        break;
      case 'shadow':
        this.shadowD0 = this.aimScare(s, this.shadowDir, 1.9, 3.2, 0.3);
        this.shadowT = 0;
        refs.figure.visible = true;
        sfx.creak();
        break;
      case 'face':
        this.faceD = Math.max(0.7, this.aimScare(s, this.faceDir, 1.0, 1.6, 0.25));
        this.faceT = 0;
        refs.face.visible = true;
        break;
      case 'eyes':
        if (s.eyes) {
          this.eyesGroup = s.eyes;
          this.eyesT = 0;
          s.eyes.visible = true;
          sfx.hiss();
        }
        break;
    }
  }

  private updateScares(dt: number) {
    if (!refs) return;
    const R = refs;

    // shadow figure: stands at the end of the corridor, then lunges and pops away
    if (this.shadowT >= 0) {
      this.shadowT += dt;
      const t = this.shadowT;
      let d = this.shadowD0;
      if (t > 0.9) {
        const k = Math.min(1, (t - 0.9) / 0.35);
        d = this.shadowD0 + (1.2 - this.shadowD0) * k * k;
      }
      R.figure.position.set(
        this.head.x + this.shadowDir.x * d,
        0,
        this.head.z + this.shadowDir.z * d,
      );
      R.figure.rotation.y = Math.atan2(this.head.x - R.figure.position.x, this.head.z - R.figure.position.z);
      if (t >= 1.25) {
        R.figure.visible = false;
        this.shadowT = -1;
        sfx.sting();
        this.fade(0xffffff, 0.55, 0.35);
      }
    }

    // ghost face: pops up in front of you for a split second
    if (this.faceT >= 0) {
      this.faceT += dt;
      const t = this.faceT;
      const k = Math.min(1, t / 0.12);
      const s = 0.35 + 0.95 * k;
      R.face.scale.set(s, s, s);
      R.face.position.set(
        this.head.x + this.faceDir.x * this.faceD,
        1.5,
        this.head.z + this.faceDir.z * this.faceD,
      );
      R.face.rotation.y = Math.atan2(this.head.x - R.face.position.x, this.head.z - R.face.position.z);
      if (this.faceT - dt < 0.0001) {
        sfx.sting();
        this.fade(0xffffff, 0.5, 0.3);
      }
      if (t > 0.5) {
        R.face.visible = false;
        this.faceT = -1;
      }
    }

    // glowing eyes in the wall: blink open, stare, blink shut
    if (this.eyesT >= 0 && this.eyesGroup) {
      this.eyesT += dt;
      const t = this.eyesT;
      let sy = 1;
      if (t < 0.25) sy = Math.max(0.001, t / 0.25);
      else if (t > 1.9) sy = Math.max(0.001, 1 - (t - 1.9) / 0.2);
      this.eyesGroup.scale.y = sy;
      if (t > 2.1) {
        this.eyesGroup.visible = false;
        this.eyesGroup = null;
        this.eyesT = -1;
      }
    }
  }

  // --- lights ----------------------------------------------------------------------
  private updateLighting(dt: number, underChamber: boolean) {
    if (!refs) return;
    const R = refs;

    if (this.dirLight) this.dirLight.intensity = 0;
    if (this.hemiLight) {
      this.hemiLight.intensity = HORROR.hemiIntensity * (this.blackout > 0 ? 0.15 : 1);
      this.hemiLight.color.setHex(HORROR.hemiSky);
      this.hemiLight.groundColor.setHex(HORROR.hemiGround);
    }
    const fog = this.scene.fog as FogExp2 | null;
    if (fog && fog.isFogExp2) {
      fog.density = underChamber ? HORROR.fogDensityUnder : HORROR.fogDensityMaze;
    }

    // blackout / burst
    let mul = 1;
    if (this.blackout > 0) {
      this.blackout = Math.max(0, this.blackout - dt);
      // a few dying flickers at the start of the blackout
      mul = this.blackout > 1.2 ? (Math.sin(this.time * 60) > 0 ? 0.5 : 0) : 0;
    } else if (this.burst > 0) {
      this.burst = Math.max(0, this.burst - dt);
      mul = Math.sin(this.time * 45) > -0.2 ? 1 : 0.1;
    }
    this.lightMul = mul;
    const nowOn = mul > 0.05;
    if (nowOn !== this.bulbsOn) {
      this.bulbsOn = nowOn;
      for (const l of R.lamps) l.mat.color.setHex(nowOn ? l.color.getHex() : 0x050505);
    }

    // head lantern
    R.lantern.position.set(this.head.x, this.head.y + 0.1, this.head.z);
    R.lantern.intensity = HORROR.lanternIntensity * mul * (0.93 + 0.07 * Math.sin(this.time * 9));

    // assign the pooled lights to the nearest lamps
    this.taken.fill(0);
    for (let k = 0; k < R.poolLights.length; k++) {
      let best = -1;
      let bestD = 1e12;
      for (let i = 0; i < R.lamps.length; i++) {
        if (this.taken[i]) continue;
        const p = R.lamps[i].pos;
        const dx = p.x - this.head.x;
        const dy = p.y - this.head.y;
        const dz = p.z - this.head.z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      const light = R.poolLights[k];
      if (best < 0) {
        light.intensity = 0;
        continue;
      }
      this.taken[best] = 1;
      const lamp = R.lamps[best];
      light.position.copy(lamp.pos);
      light.color.copy(lamp.color);
      const s = lamp.seed;
      let flick = 0.8 + 0.2 * Math.sin(this.time * 13 + s) * Math.sin(this.time * 7.3 + s * 2);
      if (Math.sin(this.time * 1.7 + s * 5) > 0.93) flick *= 0.15; // occasional dropout
      light.intensity = HORROR.lampIntensity * mul * flick;
    }
  }

  // --- per-frame -------------------------------------------------------------------
  update(delta: number) {
    if (!refs) return;
    const R = refs;
    const dt = Math.min(Math.max(delta, 0.001), 0.05);
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    this.camera.getWorldPosition(this.head);
    this.step(dt, R);
    this.updateOverlay(dt, R);
  }

  private updateOverlay(dt: number, R: MazeRefs) {
    // fade / flash overlay in front of the eyes
    if (this.fadeAlpha > 0.002) {
      this.fadeAlpha = Math.max(0, this.fadeAlpha - this.fadeRate * dt);
      R.overlayMat.opacity = this.fadeAlpha;
      this.camera.getWorldDirection(this.dir);
      this.camera.getWorldQuaternion(this.camQuat);
      R.overlay.position.copy(this.head).addScaledVector(this.dir, 0.25);
      R.overlay.quaternion.copy(this.camQuat);
      R.overlay.visible = true;
    } else if (R.overlay.visible) {
      R.overlay.visible = false;
    }
  }

  private step(dt: number, R: MazeRefs) {
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }

    // which zone is the player in?
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.position.y;
    const insideZone = Math.abs(px - MAZE.ox) < 16 && Math.abs(pz - MAZE.oz) < 16;

    // the doorway in the main room
    const roomActive = mazeHooks.isRoomActive();
    R.doorGroup.visible = roomActive;
    if (roomActive) {
      let o = 0.7 + 0.3 * Math.sin(this.time * 17) * Math.sin(this.time * 5.3);
      if (Math.sin(this.time * 2.3) > 0.96) o = 0.12;
      R.doorSignMat.opacity = o;
    }

    if (!insideZone && !this.falling) {
      if (this.horror) this.setHorror(false);
      if (
        roomActive &&
        this.cooldown <= 0 &&
        Math.abs(this.head.x - DOOR.x) < 0.5 &&
        this.head.z < DOOR.z + 0.6 &&
        this.head.y > 0.5
      ) {
        this.enterMaze();
      }
      return;
    }

    if (!this.horror) this.setHorror(true);

    // swing the trap leaves open
    if (this.trapOpen && this.leafAngle < Math.PI / 2 + 0.15) {
      this.leafAngle += dt * 4.5;
      R.leafL.rotation.z = -this.leafAngle;
      R.leafR.rotation.z = this.leafAngle;
    }

    // falling through the cake
    if (this.falling) {
      this.fallVel = Math.min(this.fallVel + 12 * dt, 15);
      const y = Math.max(UNDER.y, py - this.fallVel * dt);
      this.tmp.set(px, y, pz);
      this.player.position.copy(this.tmp);
      this.loco()?.setPlayerPosition?.(this.tmp);
      if (y <= UNDER.y) {
        this.falling = false;
        this.padTime = 0;
        sfx.thud();
        this.later(0.4, () => sfx.chime());
        this.fade(0x000000, 1, 1.4);
      }
      this.updateLighting(dt, py < -5);
      return;
    }

    const underChamber = py < UNDER.y + 10;
    this.updateLighting(dt, underChamber);

    if (underChamber) {
      // step on the glowing pad for a second to go home
      R.returnBeamMat.opacity = 0.14 + 0.06 * Math.sin(this.time * 3);
      const onPad =
        Math.abs(this.head.x - R.returnPad.x) < 0.8 && Math.abs(this.head.z - R.returnPad.z) < 0.8;
      this.padTime = onPad ? this.padTime + dt : Math.max(0, this.padTime - dt * 2);
      if (this.padTime > 1.0 && this.cooldown <= 0) {
        this.padTime = 0;
        this.leaveToRoom();
      }
      return;
    }

    // ---- inside the maze ----
    // walk back into the EXIT door to leave
    if (
      this.cooldown <= 0 &&
      Math.abs(this.head.x - R.startX) < 0.6 &&
      this.head.z > R.startZ + 0.7
    ) {
      this.leaveToRoom();
      return;
    }

    // jumpscare triggers
    for (const s of R.scares) {
      if (!s.fired && Math.abs(this.head.x - s.x) < 1.0 && Math.abs(this.head.z - s.z) < 1.0) {
        this.fireScare(s);
      }
    }
    this.updateScares(dt);

    // the cake: stand on it and the floor gives way
    if (!this.trapOpen) {
      const onCake =
        Math.abs(this.head.x - R.exitX) < 0.9 && Math.abs(this.head.z - R.exitZ) < 0.9 && py < 0.4;
      this.standTime = onCake ? this.standTime + dt : Math.max(0, this.standTime - dt * 2);
      const prog = Math.min(1, this.standTime / CAKE_STAND_SECONDS);
      // creaking, shaking and cracking build up the longer you stay
      R.crackMat.opacity = Math.max(0, (prog - 0.35) / 0.65);
      const shake = prog > 0.3 ? (prog - 0.3) * 0.012 : 0;
      R.padGroup.position.y = Math.sin(this.time * 55) * shake;
      if (!this.creaked && this.standTime > CAKE_STAND_SECONDS * 0.33) {
        this.creaked = true;
        sfx.creak();
      }
      if (!this.cracked && this.standTime > CAKE_STAND_SECONDS * 0.7) {
        this.cracked = true;
        sfx.crack();
      }
      if (!onCake && this.standTime < 0.05) {
        this.creaked = false;
        this.cracked = false;
      }
      if (this.standTime >= CAKE_STAND_SECONDS) {
        R.padGroup.position.y = 0;
        this.dropTrap();
      }
    }
  }
}
