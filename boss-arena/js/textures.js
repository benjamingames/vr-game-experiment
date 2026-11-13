// Boss Arena: procedural textures (everything is painted on canvases, no image files).
import * as THREE from 'three';

let aniso = 4;
export const setAniso = n => { aniso = n; };

export function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function tex(c, { srgb = true, wrap = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// ---- diamond-plate tread tile (used as a bump map, 1 tile = 1 metre) ----
export function treadTile() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#303030'; g.fillRect(0, 0, S, S);
  const cell = S / 8;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    for (const [ox, oy, ang] of [[0.25, 0.25, Math.PI / 4], [0.75, 0.75, -Math.PI / 4]]) {
      g.save();
      g.translate((i + ox) * cell, (j + oy) * cell); g.rotate(ang);
      const grad = g.createLinearGradient(-cell * 0.34, 0, cell * 0.34, 0);
      grad.addColorStop(0, '#9a9a9a'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#8a8a8a');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, 0, cell * 0.36, cell * 0.11, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  return tex(c, { srgb: false, wrap: true });
}

// ---- the stage top, painted as a plan view (canvas x,y == world x,z) ----
// Returns the colour map and an emissive map that carries all the glowing lines.
export function stageTop(R, spawnPads, size = 2048) {
  const c = canvas(size, size), g = c.getContext('2d'), rnd = rng(7);
  const e = canvas(1024, 1024), eg = e.getContext('2d');
  const cx = size / 2, k = size / (2 * R), ek = 1024 / (2 * R);
  const P = (r, a) => [cx + Math.sin(a) * r * k, cx - Math.cos(a) * r * k];

  const bg = g.createRadialGradient(cx, cx, 0, cx, cx, R * k);
  bg.addColorStop(0, '#6b727c'); bg.addColorStop(0.7, '#5c636d'); bg.addColorStop(1, '#4a5058');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);

  // brushed concentric finish
  for (let i = 0; i < 1100; i++) {
    const r = rnd() * R * k, a0 = rnd() * 6.28;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.05})` : `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath(); g.arc(cx, cx, r, a0, a0 + 0.8 + rnd() * 3); g.stroke();
  }
  // panel seams: radial every 22.5 degrees, concentric rings
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x1 + 2, y1 + 2); g.stroke();
  };
  for (let n = 0; n < 16; n++) { const a = n * Math.PI / 8; const [x0, y0] = P(4.3, a), [x1, y1] = P(R - 0.05, a); seam(x0, y0, x1, y1); }
  const rings = [4.3, 8, 11.6, 14.3];
  for (const r of rings) {
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, r * k, 0, 6.283); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.beginPath(); g.arc(cx + 2, cx + 2, r * k, 0, 6.283); g.stroke();
    // rivets in two rows
    for (const off of [-0.16, 0.16]) {
      const rr = r + off, n = Math.round(2 * Math.PI * rr / 0.42);
      for (let i = 0; i < n; i++) {
        const [x, y] = P(rr, (i + (off > 0 ? 0.5 : 0)) / n * Math.PI * 2);
        g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x + 1, y + 1, 3.2, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(210,214,220,.85)'; g.beginPath(); g.arc(x, y, 2.6, 0, 6.3); g.fill();
      }
    }
  }
  // hazard ring (black base + skewed yellow stripes)
  const hz0 = 12.5, hz1 = 13.3;
  g.fillStyle = '#15171b'; g.beginPath(); g.arc(cx, cx, hz1 * k, 0, 6.283); g.arc(cx, cx, hz0 * k, 0, 6.283, true); g.fill();
  const N = 88, d = Math.PI * 2 / N;
  g.fillStyle = '#e8b81a';
  for (let n = 0; n < N; n++) {
    const a0 = n * d, a1 = a0 + d * 0.5, sk = d * 0.55;
    g.beginPath();
    g.moveTo(...P(hz0, a0)); g.lineTo(...P(hz1, a0 + sk)); g.lineTo(...P(hz1, a1 + sk)); g.lineTo(...P(hz0, a1)); g.closePath(); g.fill();
  }
  // centre emblem
  g.fillStyle = '#1a1e25'; g.beginPath(); g.arc(cx, cx, 4.2 * k, 0, 6.283); g.fill();
  g.strokeStyle = '#0c0e12'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cx, 4.2 * k, 0, 6.283); g.stroke();
  const star = (ctx, kk, c0, r0, r1, fill, stroke, lw) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const rr = i % 2 ? r0 : r1; const a = i * Math.PI / 8; ctx.lineTo(c0 + Math.sin(a) * rr * kk, c0 - Math.cos(a) * rr * kk); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  star(g, k, cx, 1.55, 3.8, '#ff7a1a', '#3a1a05', 5);
  g.fillStyle = '#1a1e25'; g.beginPath(); g.arc(cx, cx, 1.15 * k, 0, 6.283); g.fill();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cx, 0.8 * k, 0, 6.283); g.stroke();
  // boss spawn pads
  for (const p of spawnPads) {
    const x = cx + p.x * k, y = cx + p.z * k;
    g.fillStyle = '#23272e'; g.beginPath(); g.arc(x, y, 1.25 * k, 0, 6.283); g.fill();
    g.strokeStyle = '#0c0e12'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 1.25 * k, 0, 6.283); g.stroke();
  }
  // scuffs and scratches
  for (let i = 0; i < 700; i++) {
    const r = (2 + rnd() * (R - 2.5)) * k, a0 = rnd() * 6.28;
    g.strokeStyle = rnd() < 0.7 ? `rgba(225,230,238,${0.04 + rnd() * 0.1})` : `rgba(20,20,24,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath(); g.arc(cx, cx, r, a0, a0 + 0.01 + rnd() * 0.08); g.stroke();
  }

  // ---- emissive: all the glowing lines ----
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 1024, 1024);
  const ec = 512;
  eg.shadowBlur = 14;
  eg.shadowColor = '#35d0ff'; eg.strokeStyle = '#35d0ff'; eg.lineWidth = 5;
  eg.beginPath(); eg.arc(ec, ec, 4.2 * ek, 0, 6.283); eg.stroke();
  eg.lineWidth = 3; eg.beginPath(); eg.arc(ec, ec, 8.0 * ek, 0, 6.283); eg.stroke();
  eg.beginPath(); eg.arc(ec, ec, 11.6 * ek, 0, 6.283); eg.stroke();
  eg.shadowColor = '#ff9a3c'; star(eg, ek, ec, 1.55, 3.8, null, '#ff9a3c', 4);
  eg.beginPath(); eg.arc(ec, ec, 0.8 * ek, 0, 6.283); eg.stroke();
  eg.shadowColor = '#ff3b3b'; eg.strokeStyle = '#ff3b3b';
  for (const p of spawnPads) {
    eg.lineWidth = 4; eg.beginPath(); eg.arc(ec + p.x * ek, ec + p.z * ek, 1.2 * ek, 0, 6.283); eg.stroke();
    eg.lineWidth = 2; eg.beginPath(); eg.arc(ec + p.x * ek, ec + p.z * ek, 0.85 * ek, 0, 6.283); eg.stroke();
  }
  return { map: tex(c), emissive: tex(e) };
}

export function hazardStripes() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e8b81a';
  for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 64, 256); g.lineTo(i * 64 + 32, 256); g.lineTo(i * 64 + 288, 0); g.lineTo(i * 64 + 256, 0); g.closePath(); g.fill(); }
  const t = tex(c, { wrap: true }); return t;
}

export function steelPanel() {
  const c = canvas(512, 512), g = c.getContext('2d'), rnd = rng(11);
  g.fillStyle = '#2b3037'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 40, 1); }
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(2, 2, 508, 508);
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1; g.strokeRect(5, 5, 502, 502);
  return tex(c, { wrap: true });
}

export function bleacherTex() {
  const c = canvas(256, 256), g = c.getContext('2d'), rnd = rng(23);
  g.fillStyle = '#2d3550'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`; g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 20, 1); }
  for (let x = 0; x < 256; x += 64) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 3, 256); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 3, 0, 1, 256); }
  return tex(c, { wrap: true });
}

export function concreteTex() {
  const c = canvas(512, 512), g = c.getContext('2d'), rnd = rng(31);
  g.fillStyle = '#1b1e24'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { const v = (rnd() * 40) | 0; g.fillStyle = `rgba(${v + 30},${v + 32},${v + 38},.35)`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3); }
  return tex(c, { wrap: true });
}

// A ball-audience face: white background (tinted per instance), dark eyes + smile, centred on u=0.25 (the +Z side).
export function faceTex() {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const fx = W * 0.25, ey = H * 0.42;
  g.fillStyle = '#16120f';
  for (const dx of [-26, 26]) { g.beginPath(); g.ellipse(fx + dx, ey, 8, 15, 0, 0, 6.283); g.fill(); }
  g.fillStyle = '#ffffff';
  for (const dx of [-26, 26]) { g.beginPath(); g.arc(fx + dx + 2, ey - 5, 3.2, 0, 6.283); g.fill(); }
  g.strokeStyle = '#16120f'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(fx, ey + 14, 38, 0.28 * Math.PI, 0.72 * Math.PI); g.stroke();
  g.fillStyle = 'rgba(255,90,110,.45)';
  for (const dx of [-52, 52]) { g.beginPath(); g.ellipse(fx + dx, ey + 22, 12, 7, 0, 0, 6.283); g.fill(); }
  return tex(c);
}

export function screenTex(title, sub, accent = '#35d0ff') {
  const c = canvas(1024, 512), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 512); bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#1b0d0a');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(14, 14, 996, 484);
  g.fillStyle = '#ff7a1a'; g.font = '700 150px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff7a1a'; g.shadowBlur = 30; g.fillText(title, 512, 200);
  g.shadowColor = accent; g.fillStyle = accent; g.font = '600 64px "Arial Black", sans-serif'; g.fillText(sub, 512, 360);
  return tex(c);
}

export function gateSign(label) {
  const c = canvas(512, 128), g = c.getContext('2d');
  g.fillStyle = '#0d1016'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#ff9a3c'; g.font = '700 84px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff7a1a'; g.shadowBlur = 16; g.fillText(label, 256, 68);
  return tex(c);
}

export function labelTex(text, w = 512, h = 128) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,.78)';
  const r = 26; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
  g.fillStyle = '#ffd27a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 58; g.font = `700 ${size}px "Arial Black", system-ui, sans-serif`;
  while (g.measureText(text).width > w - 50 && size > 20) { size -= 2; g.font = `700 ${size}px "Arial Black", system-ui, sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 3);
  return tex(c);
}

export function visorTex() {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  g.shadowColor = '#4df0ff'; g.shadowBlur = 14; g.fillStyle = '#7ff6ff';
  for (const x of [84, 172]) { g.beginPath(); g.ellipse(x, 56, 15, 24, 0, 0, 6.283); g.fill(); }
  g.strokeStyle = '#7ff6ff'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(128, 70, 30, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke();
  return tex(c);
}

export function shadowBlobTex() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
