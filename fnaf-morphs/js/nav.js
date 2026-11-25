// FNAF Morphs: a 2D walkability grid baked from the map's triangles.
// Walls / furniture (steep triangles between knee and head height) block; upward-facing triangles near the floor give the floor height.
import * as THREE from 'three';

export class NavGrid {
  constructor(root, { cell = 0.1, floorY = 0, minBlock = 0.3, maxBlock = 1.8, maxStep = 0.45 } = {}) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    this.cell = cell; this.x0 = box.min.x - 1; this.z0 = box.min.z - 1;
    this.w = Math.ceil((box.max.x - box.min.x + 2) / cell); this.h = Math.ceil((box.max.z - box.min.z + 2) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.floor = new Float32Array(this.w * this.h).fill(-1e9);
    this.floorY = floorY; this.maxStep = maxStep;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const step = cell * 0.7;
    root.traverse(m => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, mw = m.matrixWorld;
      const count = idx ? idx.count : pos.count;
      for (let i = 0; i < count; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(mw); b.fromBufferAttribute(pos, ib).applyMatrix4(mw); c.fromBufferAttribute(pos, ic).applyMatrix4(mw);
        e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
        const len = n.length(); if (len < 1e-9) continue;
        const ny = n.y / len, ymin = Math.min(a.y, b.y, c.y), ymax = Math.max(a.y, b.y, c.y);
        let mode = 0;
        if (Math.abs(ny) < 0.6) { if (ymax >= floorY + minBlock && ymin <= floorY + maxBlock) mode = 1; }
        else if (ny > 0 && (a.y + b.y + c.y) / 3 <= floorY + maxStep && (a.y + b.y + c.y) / 3 >= floorY - 0.6) mode = 2;
        if (!mode) continue;
        const n1 = Math.max(1, Math.ceil(e1.length() / step)), n2 = Math.max(1, Math.ceil(e2.length() / step));
        for (let p = 0; p <= n1; p++) {
          const u = p / n1, m2 = Math.max(1, Math.ceil(n2 * (1 - u)));
          for (let q = 0; q <= m2; q++) {
            const v = (q / m2) * (1 - u);
            const x = a.x + e1.x * u + e2.x * v, z = a.z + e1.z * u + e2.z * v;
            const ix = Math.floor((x - this.x0) / cell), iz = Math.floor((z - this.z0) / cell);
            if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
            const k = iz * this.w + ix;
            if (mode === 1) this.blocked[k] = 1;
            else { const y = a.y + e1.y * u + e2.y * v; if (y > this.floor[k]) this.floor[k] = y; }
          }
        }
      }
    });
  }
  cellAt(x, z) { const ix = Math.floor((x - this.x0) / this.cell), iz = Math.floor((z - this.z0) / this.cell); return (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) ? -1 : iz * this.w + ix; }
  // Is a disc of radius r at (x, z) inside a wall / furniture / outside the building?
  hit(x, z, r) {
    const c = this.cell;
    for (let dz = -r; dz <= r + 1e-6; dz += c * 0.9) for (let dx = -r; dx <= r + 1e-6; dx += c * 0.9) {
      if (dx * dx + dz * dz > r * r * 1.05) continue;
      const k = this.cellAt(x + dx, z + dz);
      if (k < 0 || this.blocked[k]) return true;
      if (this.floor[k] < -1e8) return true; // no floor here: outside the map
    }
    return false;
  }
  // Slide along walls. Returns the new [x, z].
  move(x, z, nx, nz, r = 0.22) {
    if (!this.hit(nx, nz, r)) return [nx, nz];
    if (!this.hit(nx, z, r)) return [nx, z];
    if (!this.hit(x, nz, r)) return [x, nz];
    return [x, z];
  }
  floorAt(x, z) { const k = this.cellAt(x, z); return k >= 0 && this.floor[k] > -1e8 ? this.floor[k] : this.floorY; }
  // Debug: a canvas picture of the grid.
  toCanvas() {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h; const g = cv.getContext('2d'), im = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) { const f = this.floor[i] > -1e8; im.data[i * 4] = this.blocked[i] ? 255 : 0; im.data[i * 4 + 1] = f ? 120 + Math.min(100, Math.max(0, this.floor[i] * 200)) : 0; im.data[i * 4 + 2] = f ? 40 : 0; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); return cv;
  }
}
