// Boss Arena: boss controller. Wraps a skinned GLB with its own animation clips.
// States: idle (standing on its pad), hunt (walks at the player and swings), return (walks back to its pad).
import * as THREE from 'three';
import * as T from './textures.js';
import { fitHeight } from './steve.js';

const angDiff = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class Boss {
  // cfg: { name, height, yawOffset, speed, idle, walk, run?, attack:[clips], home:{x,z,facing} }
  constructor(gltf, cfg) {
    this.cfg = cfg; this.name = cfg.name;
    this.root = new THREE.Group();
    const model = gltf.scene, pivot = new THREE.Group(); pivot.rotation.y = cfg.yawOffset || 0; pivot.add(model); this.root.add(pivot);
    this.fit = fitHeight(model, this.root, cfg.height);
    model.traverse(o => {
      if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.side = THREE.DoubleSide; o.material.metalness = Math.min(o.material.metalness ?? 0, 0.35); o.material.envMapIntensity = 1.4; } }
    });
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {}; for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.current = null; this.state = 'idle'; this.atk = 0; this.cool = 0; this.attackIdx = 0; this.speedNow = 0;
    this.home = cfg.home;
    this.root.position.set(this.home.x, 0, this.home.z); this.root.rotation.y = this.home.facing;
    // contact shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.shadowBlobTex(), transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.014; sh.scale.set(cfg.height * 0.8, cfg.height * 0.8, 1); sh.renderOrder = 1; this.root.add(sh);
    // name tag
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.425), new THREE.MeshBasicMaterial({ map: T.labelTex(cfg.name), transparent: true, toneMapped: false, depthWrite: false }));
    this.label.position.set(this.home.x, cfg.height + 0.45, this.home.z);
    this.play(cfg.idle);
  }

  play(name, { once = false, fade = 0.25 } = {}) {
    const a = this.actions[name]; if (!a) { console.warn('missing clip', name); return null; }
    if (this.current === a && !once) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    a.play(); this.current = a; return a;
  }
  setHunting(on) { this.state = on ? 'hunt' : 'return'; }

  update(dt, target, arena) {
    const c = this.cfg, pos = this.root.position;
    let want = null, speed = 0;
    if (this.state === 'hunt') {
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
      want = Math.atan2(dx, dz);
      if (this.atk > 0) { this.atk -= dt; if (this.atk <= 0) { this.cool = 0.5; } }
      else if (d < c.reach) {
        if (this.cool > 0) { this.cool -= dt; if (this.current !== this.actions[c.idle]) this.play(c.idle); }
        else { const clip = c.attack[this.attackIdx++ % c.attack.length]; const a = this.play(clip, { once: true, fade: 0.12 }); this.atk = a ? a.getClip().duration : 0.5; }
      } else {
        speed = c.speed * (c.run && d > c.runDist ? 1.8 : 1);
        const clip = c.run && d > c.runDist ? c.run : c.walk; if (this.current !== this.actions[clip]) this.play(clip);
        this.cool = Math.max(0, this.cool - dt);
      }
      if (this.atk > 0) speed = 0;
    } else if (this.state === 'return') {
      const dx = this.home.x - pos.x, dz = this.home.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 0.25) { want = Math.atan2(dx, dz); speed = c.speed; if (this.current !== this.actions[c.walk]) this.play(c.walk); }
      else { this.state = 'idle'; this.play(c.idle); }
    } else { want = this.home.facing; if (this.current !== this.actions[c.idle]) this.play(c.idle); }
    if (want !== null) { const turn = angDiff(this.root.rotation.y, want); this.root.rotation.y += turn * Math.min(1, dt * (this.state === 'idle' ? 2 : 5)); }
    if (speed > 0) {
      const f = this.root.rotation.y, nx = pos.x + Math.sin(f) * speed * dt, nz = pos.z + Math.cos(f) * speed * dt;
      const [cx, cz] = arena.collide(nx, nz, 0.3); pos.x = cx; pos.z = cz;
    }
    this.mixer.update(dt);
    this.label.position.set(pos.x, c.height + 0.45, pos.z);
  }
}
