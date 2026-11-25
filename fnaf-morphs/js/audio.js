// FNAF Morphs: audio. The springlock "snap" is synthesised here; the laugh is the supplied mp3.
let ctx = null, master = null, laughBuf = null, crunchBuf = null, analyser = null, tdata = null, laughLevel = 0, laughSrc = null, laughGain = null;

export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; tdata = new Uint8Array(analyser.fftSize);
    fetch('./models/springlock-crunch.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { crunchBuf = buf; }).catch(e => console.warn('crunch mp3 failed', e));
    fetch('./models/springlock-failure.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { laughBuf = buf; }).catch(e => console.warn('laugh mp3 failed', e));
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(sec) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// One metal snap: a hard click, two ringing metal pings, a low thud and a short spring "boing".
function snapOne(when, gain = 1, pitch = 1) {
  const t = ctx.currentTime + when;
  const nb = ctx.createBufferSource(); nb.buffer = noiseBuffer(0.06);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500 * pitch;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(gain * 1.1, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  nb.connect(hp).connect(ng).connect(master); nb.start(t);
  for (const [f, dec, g] of [[1900 * pitch, 0.18, 0.35], [3150 * pitch, 0.12, 0.22], [880 * pitch, 0.26, 0.2]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(gain * g, t); g2.gain.exponentialRampToValueAtTime(0.0008, t + dec);
    o.connect(g2).connect(master); o.start(t); o.stop(t + dec + 0.02);
  }
  const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(140, t); th.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  const tg = ctx.createGain(); tg.gain.setValueAtTime(gain * 0.9, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  th.connect(tg).connect(master); th.start(t); th.stop(t + 0.16);
  const sp = ctx.createOscillator(); sp.type = 'triangle'; sp.frequency.setValueAtTime(520 * pitch, t + 0.01); sp.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.3);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 70; lfo.connect(lg).connect(sp.frequency);
  const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(gain * 0.16, t + 0.015); sg.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
  sp.connect(sg).connect(master); sp.start(t); lfo.start(t); sp.stop(t + 0.34); lfo.stop(t + 0.34);
}

// The springlock failure: a loud, fast CRUNCH (models/springlock-crunch.mp3), layered twice a hair apart so it hits harder.
export function playSnap() {
  if (!ctx) return;
  if (!crunchBuf) { snapOne(0, 1, 1); return; }          // fallback synth click if the file is not decoded yet
  for (const [delay, gain, rate] of [[0, 1, 1], [0.03, 0.7, 0.9]]) {
    const src = ctx.createBufferSource(); src.buffer = crunchBuf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain; src.connect(g).connect(master); src.start(ctx.currentTime + delay);
  }
}

// Plays the laugh from the mp3 (skipping its silent start), fading out after `seconds`.
export function playLaugh(delay = 0.55, seconds = 10, offset = 1.2) {
  if (!ctx || !laughBuf) return false;
  stopLaugh();
  const src = ctx.createBufferSource(); src.buffer = laughBuf;
  const g = ctx.createGain(); const t0 = ctx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.08);
  g.gain.setValueAtTime(1, t0 + seconds - 1.5); g.gain.linearRampToValueAtTime(0.0001, t0 + seconds);
  src.connect(g); g.connect(master); g.connect(analyser);
  src.start(t0, offset, seconds + 0.2); laughSrc = src; laughGain = g;
  return true;
}
export function stopLaugh() { try { laughSrc?.stop(); } catch { /* already stopped */ } laughSrc = null; }

// 0..1 loudness of the laugh right now (drives the jaw and the body shake).
export function laughAmount(dt) {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(tdata);
  let s = 0; for (let i = 0; i < tdata.length; i++) { const v = (tdata[i] - 128) / 128; s += v * v; }
  const rms = Math.sqrt(s / tdata.length), target = Math.min(1, rms * 4.2);
  laughLevel += (target - laughLevel) * Math.min(1, dt * 18);
  return laughLevel;
}
export const laughReady = () => !!laughBuf;
export const sfxClick = () => { if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 660; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); o.connect(g).connect(master); o.start(t); o.stop(t + 0.06); };
export const isRunning = () => !!ctx && ctx.state === 'running';
