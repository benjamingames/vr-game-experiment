// Boss Arena: tiny WebAudio helpers (crowd murmur with cheers, punch whoosh, gate rumble). No audio files.
let ctx = null, master = null, crowd = null;

function noiseBuffer(seconds, brown = true) {
  const len = ctx.sampleRate * seconds, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.03 * w) / 1.03; d[i] = last * 3.2; } else d[i] = w; }
  return b;
}

export function initAudio() {
  if (ctx) { ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.45;
  const g = ctx.createGain(); g.gain.value = 0.35;
  src.connect(bp); bp.connect(g); g.connect(master); src.start();
  crowd = { g, bp };
  setInterval(() => cheer(), 9000);
}
export function cheer() {
  if (!ctx) return; const t = ctx.currentTime;
  crowd.g.gain.cancelScheduledValues(t); crowd.g.gain.setValueAtTime(crowd.g.gain.value, t);
  crowd.g.gain.linearRampToValueAtTime(0.95, t + 0.5); crowd.g.gain.linearRampToValueAtTime(0.35, t + 3.2);
  crowd.bp.frequency.setValueAtTime(700, t); crowd.bp.frequency.linearRampToValueAtTime(1200, t + 0.6); crowd.bp.frequency.linearRampToValueAtTime(700, t + 3);
}
function burst(freq0, freq1, dur, vol, type = 'bandpass', q = 1.2) {
  if (!ctx) return; const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(1, false);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq0, t); f.frequency.exponentialRampToValueAtTime(freq1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}
export const sfx = {
  whoosh() { burst(500, 2400, 0.18, 0.5); },
  thud() { burst(260, 60, 0.22, 0.9, 'lowpass', 0.7); },
  gate() {
    burst(120, 40, 1.6, 0.8, 'lowpass', 0.8);
    if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(42, t + 1.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.7);
  },
  cheer,
};
