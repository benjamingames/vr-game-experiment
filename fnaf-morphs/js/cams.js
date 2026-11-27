// Security cameras for the office: a wall monitor + a button panel on the desk.
// CAM 1 = the show stage, CAM 2 = wherever you set it (SET CAM 2 takes your current head spot and direction), CAM 3 = inside the office.
// The feed is a real second render of the pizzeria into a small texture, drawn through a "static" shader (noise, scan lines, rolling, tearing).
import * as THREE from 'three';
import * as A from './audio.js';

const RT_W = 320, RT_H = 240;
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FRAG = `
precision highp float;
varying vec2 vUv; uniform sampler2D uMap, uHud; uniform float uTime, uNoise, uOn, uBlink;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float roll = step(0.985, h(vec2(floor(uTime * 3.0), 1.0))) * fract(uTime * 2.0);           // occasional vertical roll
  uv.y = fract(uv.y + roll * 0.4);
  float band = smoothstep(0.0, 0.03, abs(fract(uv.y * 1.0 - uTime * 0.25) - 0.5) - 0.46);      // a thin tearing band that crawls up
  float tear = (1.0 - band) * (h(vec2(floor(uTime * 24.0), floor(uv.y * 40.0))) - 0.5) * 0.06;
  uv.x += tear + (h(vec2(floor(uTime * 30.0), floor(uv.y * 120.0))) - 0.5) * 0.004 * (0.4 + uNoise * 3.0);
  vec3 c = texture2D(uMap, uv).rgb;
  float g = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(vec3(g), c, 0.35) * vec3(0.82, 1.0, 0.9);    // washed out, slightly green
  c *= 0.82 + 0.18 * sin(vUv.y * 3.14159 * 200.0);                                              // scan lines
  float n = h(vUv * vec2(RT_W, RT_H) + fract(uTime) * 91.7);
  c = c * 2.4 + (n - 0.5) * 0.1;                                                              // the pizzeria is dark: lift it, add a little grain
  c = mix(c, vec3(n), clamp(uNoise + (1.0 - uOn), 0.0, 1.0));                                   // full static when switching cameras / no signal
  vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 1.5;                                               // vignette
  vec4 hud = texture2D(uHud, vUv); c = mix(c, hud.rgb, hud.a * (0.9 + 0.1 * n));
  c += (uBlink > 0.5 ? 1.0 : 0.0) * (1.0 - smoothstep(0.012, 0.016, length((vUv - vec2(0.9, 0.92)) * vec2(1.33, 1.0)))) * vec3(1.0, 0.1, 0.1);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`.replace(/RT_W/g, RT_W.toFixed(1)).replace(/RT_H/g, RT_H.toFixed(1));

export class SecurityCams {
  // hideForRender: objects that must not appear while the cam is being rendered (mirrors, the screen itself)
  constructor(scene, renderer, hideForRender = []) {
    this.scene = scene; this.renderer = renderer; this.hide = hideForRender;
    this.cam = 0;                                                // 0 = off, 1/2/3
    this.rt = new THREE.WebGLRenderTarget(RT_W, RT_H, { type: THREE.UnsignedByteType }); this.rt.texture.minFilter = THREE.LinearFilter;
    this.view = new THREE.PerspectiveCamera(70, RT_W / RT_H, 0.05, 80); this.view.layers.enable(5);   // layer 5 = your own head, so you can see yourself on camera
    this.spots = {
      1: { pos: new THREE.Vector3(0.2, 2.3, -8.3), look: new THREE.Vector3(0.2, 1.6, -13.0), name: 'SHOW STAGE' },
      2: { pos: new THREE.Vector3(2.6, 2.3, -4.5), look: new THREE.Vector3(-0.5, 1.0, -8.5), name: 'DINING AREA' },
      3: { pos: new THREE.Vector3(0.7, 2.3, 0.6), look: new THREE.Vector3(-1.1, 1.3, -1.6), name: 'OFFICE' },
    };
    this.hudCanvas = document.createElement('canvas'); this.hudCanvas.width = RT_W; this.hudCanvas.height = RT_H;
    this.hudTex = new THREE.CanvasTexture(this.hudCanvas); this.hudTex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, toneMapped: false,
      uniforms: { uMap: { value: this.rt.texture }, uHud: { value: this.hudTex }, uTime: { value: 0 }, uNoise: { value: 1 }, uOn: { value: 0 }, uBlink: { value: 0 } } });
    this.noise = 1; this.t = 0; this.acc = 0; this.pressCool = 0;
    this.buildMonitor(); this.buildPanel(); this.drawHud(); this.drawPanel();
  }
  buildMonitor() {
    const g = new THREE.Group(), frame = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.84, 0.08), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.735), this.mat); this.screen.position.z = 0.045;
    g.add(frame, this.screen); g.position.set(-0.05, 2.0, -1.9); this.monitor = g; this.scene.add(g); this.hide.push(this.screen);
  }
  buildPanel() {
    this.panel = new THREE.Group(); this.panel.position.set(0.45, 0.78, -1.22); this.panel.rotation.x = -0.5;
    this.pCanvas = document.createElement('canvas'); this.pCanvas.width = 600; this.pCanvas.height = 160;
    this.pTex = new THREE.CanvasTexture(this.pCanvas); this.pTex.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.18), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 })); body.position.y = -0.011;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.176), new THREE.MeshBasicMaterial({ map: this.pTex })); face.rotation.x = -Math.PI / 2; face.position.y = 0.0006;
    this.panel.add(body, face); this.scene.add(this.panel);
    this.buttons = ['1', '2', '3', 'SET 2', 'OFF'].map((label, i) => ({ label, id: i < 3 ? i + 1 : i === 3 ? 'set' : 'off', x: -0.255 + i * 0.1275, z: 0.0 }));
    this.btnMeshes = this.buttons.map(b => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.016, 20), new THREE.MeshStandardMaterial({ color: b.id === 'off' ? 0xaa2222 : b.id === 'set' ? 0xc79a14 : 0x2a6fd6, roughness: 0.4 })); m.position.set(b.x, 0.008, b.z); this.panel.add(m); return m; });
  }
  drawPanel() {
    const g = this.pCanvas.getContext('2d'); g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 600, 160); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#8fd0ff'; g.font = 'bold 22px monospace'; g.fillText('SECURITY CAMERAS', 300, 20);
    this.buttons.forEach((b, i) => { const x = (b.x + 0.33) / 0.66 * 600, on = b.id === this.cam; g.fillStyle = on ? '#4dff88' : '#ddd'; g.font = 'bold 24px monospace'; g.fillText(b.label === '1' || b.label === '2' || b.label === '3' ? 'CAM ' + b.label : b.label, x, 142); });
    this.pTex.needsUpdate = true;
  }
  drawHud() {
    const g = this.hudCanvas.getContext('2d'); g.clearRect(0, 0, RT_W, RT_H); g.textBaseline = 'top';
    g.font = 'bold 18px monospace'; g.fillStyle = '#e8ffe8';
    if (!this.cam) { g.textAlign = 'center'; g.font = 'bold 26px monospace'; g.fillText('NO SIGNAL', RT_W / 2, RT_H / 2 - 12); }
    else { g.textAlign = 'left'; g.fillText('CAM ' + this.cam, 12, 10); g.fillText(this.spots[this.cam].name, 12, 32); g.textAlign = 'right'; g.fillText(this.cam === 2 && this.custom ? 'CUSTOM' : 'LIVE', RT_W - 44, 10); }
    this.hudTex.needsUpdate = true;
  }
  select(i) { this.cam = i; this.noise = 1; this.drawHud(); this.drawPanel(); A.blips([[300, 0.05], [220, 0.08]], 'sawtooth', 0.1); this.acc = 1; }
  setCam2(pos, quat) {   // wherever you want it: this spot + the direction you are looking
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    this.spots[2].pos.copy(pos).add(new THREE.Vector3(0, 0.1, 0)); this.spots[2].look.copy(pos).addScaledVector(dir, 5); this.spots[2].name = 'YOUR SPOT'; this.custom = true;
    this.select(2); A.blips([[880, 0.05], [1320, 0.08]], 'square', 0.12);
  }
  press(b, head, quat) {
    if (b.id === 'off') this.select(0); else if (b.id === 'set') this.setCam2(head, quat); else this.select(b.id);
  }
  // hands: array of world positions. head/quat: the player's head (for SET 2)
  update(dt, hands, head, quat) {
    this.t += dt; this.pressCool -= dt; this.noise = Math.max(0, this.noise - dt * 1.8);
    const u = this.mat.uniforms; u.uTime.value = this.t; u.uNoise.value = this.noise; u.uOn.value = this.cam ? 1 : 0; u.uBlink.value = this.cam && ((this.t * 1.5) | 0) % 2 ? 1 : 0;
    // button presses
    this.panel.updateMatrixWorld(true);
    this.btnMeshes.forEach((m, i) => {
      const w = m.getWorldPosition(new THREE.Vector3()); w.y += 0.03;
      const near = hands.some(h => h.distanceTo(w) < 0.055);
      m.position.y = near ? 0.002 : 0.008;
      if (near && this.pressCool <= 0) { this.pressCool = 0.5; this.press(this.buttons[i], head, quat); }
    });
    // live render (only when a camera is on, ~15 fps, and only if you can see the monitor: you are in the office)
    this.acc += dt;
    if (this.cam && this.acc > 1 / 15 && head.distanceTo(this.monitor.position) < 6) { this.acc = 0; this.render(); }
  }
  render() {
    const r = this.renderer, s = this.spots[this.cam];
    this.view.position.copy(s.pos); this.view.lookAt(s.look); this.view.updateMatrixWorld(true);
    const saved = this.hide.map(o => o.visible); this.hide.forEach(o => { o.visible = false; });
    const xr = r.xr.enabled, rt = r.getRenderTarget(), shadow = r.shadowMap.autoUpdate; r.xr.enabled = false; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt); r.clear(); r.render(this.scene, this.view);
    r.setRenderTarget(rt); r.xr.enabled = xr; r.shadowMap.autoUpdate = shadow;
    this.hide.forEach((o, i) => { o.visible = saved[i]; });
  }
}
