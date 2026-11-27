// FNAF Morphs: audio. The springlock sound (the snap/crunch and the laugh) is all in the supplied mp3.
let ctx = null, master = null, laughBuf = null, analyser = null, tdata = null, laughLevel = 0, laughSrc = null, laughGain = null;

export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; tdata = new Uint8Array(analyser.fftSize);
    fetch('./models/springlock-failure.mp3').then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { laughBuf = buf; }).catch(e => console.warn('laugh mp3 failed', e));
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// Plays the springlock mp3 (snap + laugh, skipping its silent start), fading out after `seconds`.
export function playLaugh(delay = 0, seconds = 10, offset = 1.2) {
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

// A short metal "thunk" for a hook biting into the wall.
export function playStab() {
  if (!ctx) return;
  const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * 0.08), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / n * 9);
  const src = ctx.createBufferSource(); src.buffer = b; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.7; src.connect(lp).connect(g).connect(master); src.start(t);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
  og.gain.setValueAtTime(0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(og).connect(master); o.start(t); o.stop(t + 0.13);
  const p = ctx.createOscillator(), pg = ctx.createGain(); p.frequency.value = 2300; pg.gain.setValueAtTime(0.12, t); pg.gain.exponentialRampToValueAtTime(0.0005, t + 0.15); p.connect(pg).connect(master); p.start(t); p.stop(t + 0.16);
}

// 8-bit style blips for the Chica's Party minigame. notes: [[freqHz, seconds], ...] played one after another.
export function blips(notes, type = 'square', vol = 0.16) {
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const [f, d] of notes) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d * 0.95); o.connect(g).connect(master); o.start(t); o.stop(t + d);
    t += d;
  }
}
