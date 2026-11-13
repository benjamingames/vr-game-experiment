// All sounds are synthesised with WebAudio (no audio files).
let ctx = null, master = null, hum = null, drill = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
}

function env(g, t, a, d, peak) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  env(g, t, 0.005, dur, vol); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.2, when = 0, filterFreq = 2000, q = 1) {
  if (!ctx) return; const t = ctx.currentTime + when;
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.003, dur, vol); s.connect(f).connect(g).connect(master); s.start(t);
}

export const sfx = {
  pickup() { tone(520, 0.12, 'triangle', 0.25); tone(780, 0.18, 'triangle', 0.22, 0.07); noise(0.08, 0.15, 0, 3000, 2); },
  full() { tone(180, 0.25, 'square', 0.12); tone(140, 0.3, 'square', 0.12, 0.12); },
  cash() { // cash register: drawer clunk + bell
    noise(0.06, 0.3, 0, 800, 1); tone(1318, 0.5, 'sine', 0.22, 0.05); tone(1976, 0.6, 'sine', 0.14, 0.05); tone(2637, 0.4, 'sine', 0.08, 0.07);
  },
  click() { tone(900, 0.05, 'square', 0.1); },
  buy() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.07)); },
  deny() { tone(220, 0.15, 'sawtooth', 0.12); tone(196, 0.2, 'sawtooth', 0.12, 0.1); },
  clunk() { noise(0.15, 0.35, 0, 300, 0.8); tone(90, 0.2, 'sine', 0.3, 0, 0.5); },
  complete() { // little music-box fanfare
    const notes = [659, 784, 880, 1046, 880, 1046, 1318];
    notes.forEach((f, i) => { tone(f, 0.35, 'triangle', 0.18, i * 0.13); tone(f * 2, 0.25, 'sine', 0.05, i * 0.13); });
  },
  roundUp() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.4, 'square', 0.08, i * 0.1)); },
  step() { noise(0.05, 0.05, 0, 400 + Math.random() * 200, 1.5); },
  // continuous tool sound while assembling (style 0 screwdriver .. 4 robot)
  toolStart(style) {
    if (!ctx || drill) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = style >= 2 ? 'sawtooth' : 'square'; o.frequency.value = [6, 9, 140, 210, 320][style] || 140;
    f.type = 'lowpass'; f.frequency.value = style >= 2 ? 2400 : 900;
    g.gain.value = style >= 2 ? 0.07 : 0.05;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = style >= 2 ? 18 : 5; lg.gain.value = style >= 2 ? 20 : 4;
    lfo.connect(lg).connect(o.frequency);
    o.connect(f).connect(g).connect(master); o.start(); lfo.start();
    drill = { o, g, lfo };
    if (style < 2) drill.tick = setInterval(() => noise(0.03, 0.18, 0, 2500, 3), 140);
  },
  toolStop() { if (!drill) return; const t = ctx.currentTime; drill.g.gain.setTargetAtTime(0, t, 0.03); drill.o.stop(t + 0.2); drill.lfo.stop(t + 0.2); clearInterval(drill.tick); drill = null; },
  // fluorescent hum + distant ambience
  startAmbience() {
    if (!ctx || hum) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 120;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0.012;
    o.connect(f).connect(g).connect(master); o.start(); hum = { o, g };
  },
  setHum(v) { if (hum) hum.g.gain.setTargetAtTime(v, ctx.currentTime, 0.3); },
};
