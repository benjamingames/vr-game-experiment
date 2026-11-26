// FNAF Morphs: the in-VR menu panel (opened with the 3-lines button) and the wrist button itself.
import * as THREE from 'three';
import { MORPH_DEFS } from './morph.js';

const W = 1024, H = 840;
const font = (w, s) => `${w} ${s}px "Arial Black", system-ui, sans-serif`;

export class Menu {
  constructor(scene, handlers) {
    this.h = handlers; this.visible = false; this.hover = -1;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * H / W), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: false }));
    this.mesh.renderOrder = 50; this.mesh.visible = false; scene.add(this.mesh);
    this.state = { morph: null, timer: true, mirror: false, mask: false, hasMask: false, remaining: 0, status: '' };
    this.buttons = [];
    this.layout();
    this.draw();
  }
  layout() {
    const b = [];
    const n = MORPH_DEFS.length + 1, cw = Math.min(130, Math.floor((W - 72 - 8 * (n - 1)) / n)), step = cw + 8;
    MORPH_DEFS.forEach((d, i) => b.push({ id: 'morph:' + d.id, x: 36 + i * step, y: 150, w: cw, h: 190, kind: 'card', def: d }));
    b.push({ id: 'morph:none', x: 36 + MORPH_DEFS.length * step, y: 150, w: cw, h: 190, kind: 'card', def: { label: 'No morph', color: '#556', icon: '?' } });
    b.push({ id: 'timer', x: 36, y: 400, w: 300, h: 78, kind: 'btn' });
    b.push({ id: 'springlock', x: 356, y: 400, w: 300, h: 78, kind: 'btn', label: 'Springlock NOW' });
    b.push({ id: 'mirror', x: 676, y: 400, w: 312, h: 78, kind: 'btn' });
    b.push({ id: 'calibrate', x: 36, y: 498, w: 300, h: 78, kind: 'btn', label: 'Recalibrate height' });
    b.push({ id: 'spawn', x: 356, y: 498, w: 300, h: 78, kind: 'btn', label: 'Back to start' });
    b.push({ id: 'close', x: 676, y: 498, w: 312, h: 78, kind: 'btn', label: 'Close menu' });
    b.push({ id: 'mask', x: 36, y: 596, w: 620, h: 78, kind: 'btn', show: () => this.state.hasMask });
    this.buttons = b;
  }
  set(k, v) { if (this.state[k] !== v) { this.state[k] = v; this.dirty = true; } }
  draw() {
    const g = this.canvas.getContext('2d'), s = this.state;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,16,0.93)'; rr(g, 0, 0, W, H, 34); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ff9a3c'; rr(g, 4, 4, W - 8, H - 8, 32); g.stroke();
    g.fillStyle = '#ff9a3c'; g.font = font(900, 56); g.textAlign = 'left'; g.fillText('FNAF MORPHS', 36, 84);
    g.fillStyle = '#9fb0c2'; g.font = font(700, 24); g.fillText('Pick a morph to wear. Point a controller and pull the trigger.', 38, 126);
    this.buttons.forEach((b, i) => {
      if (b.show && !b.show()) return;
      const hot = i === this.hover;
      if (b.kind === 'card') {
        const sel = (b.id === 'morph:none' && !s.morph) || b.id === 'morph:' + s.morph;
        g.fillStyle = hot ? '#2b3445' : '#171d29'; rr(g, b.x, b.y, b.w, b.h, 20); g.fill();
        g.lineWidth = sel ? 7 : 3; g.strokeStyle = sel ? '#35d0ff' : (hot ? '#ff9a3c' : '#3a4354'); rr(g, b.x, b.y, b.w, b.h, 20); g.stroke();
        g.fillStyle = b.def.color; g.beginPath(); g.arc(b.x + b.w / 2, b.y + 64, 40, 0, 7); g.fill();
        g.fillStyle = '#0c0f16'; g.font = font(900, 38); g.textAlign = 'center'; g.fillText(b.def.icon || '', b.x + b.w / 2, b.y + 78);
        g.fillStyle = '#f2efe6'; g.font = font(800, Math.max(11, Math.min(21, Math.floor((b.w - 8) / (b.def.label.length * 0.58))))); g.fillText(b.def.label, b.x + b.w / 2, b.y + 142);
        if (sel) { g.fillStyle = '#35d0ff'; g.font = font(800, 16); g.fillText('WEARING', b.x + b.w / 2, b.y + 170); }
        g.textAlign = 'left';
      } else {
        const label = b.id === 'timer' ? 'Springlock timer: ' + (s.timer ? 'ON' : 'OFF') : b.id === 'mirror' ? 'Mirror: ' + (s.mirror ? 'ON' : 'OFF') : b.id === 'mask' ? 'Springtrap mask: ' + (s.mask ? 'OPEN (pull down on it to close)' : 'CLOSED (pull up on your head)') : b.label;
        const on = (b.id === 'timer' && s.timer) || (b.id === 'mirror' && s.mirror) || (b.id === 'mask' && s.mask);
        g.fillStyle = hot ? '#ff9a3c' : on ? '#1f4d3a' : '#202838'; rr(g, b.x, b.y, b.w, b.h, 16); g.fill();
        g.fillStyle = hot ? '#1a1206' : '#f2efe6'; g.font = font(800, 25); g.textAlign = 'center'; g.fillText(label, b.x + b.w / 2, b.y + 49); g.textAlign = 'left';
      }
    });
    g.fillStyle = '#f2efe6'; g.font = font(800, 28); g.textAlign = 'left';
    g.fillText(s.status, 38, 722);
    g.fillStyle = '#9fb0c2'; g.font = font(600, 21);
    g.fillText('Open this menu any time with the ≡ button on your left hand (or the Y button).', 38, 770);
    g.fillText('Left stick walks • right stick turns • GRIP on a wall: Foxy climbs', 38, 802);
    this.tex.needsUpdate = true; this.dirty = false;
  }
  open(headPos, headQuat) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    this.mesh.position.copy(headPos).addScaledVector(f, 1.15); this.mesh.position.y = headPos.y - 0.12;
    this.mesh.lookAt(headPos.x, this.mesh.position.y, headPos.z);
    this.mesh.visible = this.visible = true; this.dirty = true;
  }
  close() { this.mesh.visible = this.visible = false; this.hover = -1; }
  toggle(headPos, headQuat) { this.visible ? this.close() : this.open(headPos, headQuat); }
  // returns the button index under a ray, or -1; also the hit distance
  hit(ray) {
    if (!this.visible) return { i: -1, dist: 0 };
    const h = ray.intersectObject(this.mesh, false)[0]; if (!h || !h.uv) return { i: -1, dist: 0 };
    const x = h.uv.x * W, y = (1 - h.uv.y) * H;
    return { i: this.buttons.findIndex(b => (!b.show || b.show()) && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h), dist: h.distance };
  }
  setHover(i) { if (i !== this.hover) { this.hover = i; this.dirty = true; } }
  press(i) { const b = this.buttons[i]; if (b) this.h.onButton(b.id); }
  tick() { if (this.dirty && this.visible) this.draw(); }
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// The little "3 lines" button floating above the left hand. It also shows the springlock countdown.
export class WristButton {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = 128; this.canvas.height = 176;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075 * 176 / 128), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: false }));
    this.mesh.renderOrder = 60; this.text = null; this.hot = false;
    this.draw('');
  }
  draw(text, hot = false) {
    if (text === this.text && hot === this.hot) return; this.text = text; this.hot = hot;
    const g = this.canvas.getContext('2d'); g.clearRect(0, 0, 128, 176);
    g.fillStyle = hot ? '#ff9a3c' : 'rgba(10,12,18,0.92)'; rr(g, 4, 4, 120, 168, 22); g.fill(); g.lineWidth = 5; g.strokeStyle = '#ff9a3c'; rr(g, 4, 4, 120, 168, 22); g.stroke();
    g.fillStyle = hot ? '#1a1206' : '#f2efe6';
    for (let i = 0; i < 3; i++) { rr(g, 28, 28 + i * 24, 72, 12, 6); g.fill(); }
    g.font = font(800, 30); g.textAlign = 'center'; g.fillStyle = hot ? '#1a1206' : '#ffb35c'; g.fillText(text, 64, 148);
    this.tex.needsUpdate = true;
  }
}
