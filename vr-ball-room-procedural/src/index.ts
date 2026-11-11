import { LocomotionSystem, TurningMethod, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import {
  buildRoom,
  CloudSystem,
  DartSystem,
  DesktopFirstPersonSystem,
  RCCarSystem,
  ResetSystem,
  SettingsAndHandsSystem,
  StretchyFaceSystem,
  ToyStationsSystem,
} from './room.js';
import { MazeSystem } from './maze.js';
import { ProcEnvSystem, procEnv } from './procedural/env.js';
import { ShowcaseSystem } from './procedural/showcase.js';
import { QUALITY, setQualityTier } from './procedural/quality.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  const locomotion = world.getSystem(LocomotionSystem);
  if (locomotion) {
    locomotion.config.slidingSpeed.value = 3.0;
    locomotion.config.comfortAssist.value = 0;
    locomotion.config.turningMethod.value = TurningMethod.SmoothTurn;
    locomotion.config.turningSpeed.value = 120;
  }

  world.registerSystem(DesktopFirstPersonSystem);
  world.registerSystem(CloudSystem);
  world.registerSystem(DartSystem);
  world.registerSystem(RCCarSystem);
  world.registerSystem(StretchyFaceSystem);
  world.registerSystem(ToyStationsSystem);
  world.registerSystem(SettingsAndHandsSystem);
  world.registerSystem(ResetSystem);
  world.registerSystem(MazeSystem);
  world.registerSystem(ProcEnvSystem);
  world.registerSystem(ShowcaseSystem);
  buildRoom(world);
  // Graphics quality switch (bottom-left). Textures are generated at startup, so it reloads.
  const qBtn = document.createElement('button');
  qBtn.textContent = `Graphics: ${QUALITY.high ? 'High' : 'Low'}${QUALITY.forced ? '' : ' (auto)'}`;
  qBtn.title = 'Click to switch between High (desktop / PC VR) and Low (standalone headset)';
  qBtn.style.cssText =
    'position:fixed;left:14px;bottom:14px;z-index:20;padding:7px 12px;border-radius:9px;' +
    'border:1px solid #38bdf8;background:rgba(15,23,42,.82);color:#e2e8f0;font:600 12px system-ui;cursor:pointer';
  qBtn.onclick = () => setQualityTier(QUALITY.high ? 'low' : 'high');
  document.body.appendChild(qBtn);

  // Debug / screenshot helpers: ?dbg=night,monke&look=pitch,yaw&pos=x,y,z
  const settings = world.getSystem(SettingsAndHandsSystem) as unknown as {
    applyTimeOfDay(night: boolean): void;
    applyMapMode(monke: boolean): void;
  };
  Object.assign(window, { __world: world, __settings: settings });
  const desktop = world.getSystem(DesktopFirstPersonSystem);
  const q = new URLSearchParams(location.search);
  const dbg = q.get('dbg') ?? '';
  const nums = (k: string) => (q.get(k) ?? '').split(',').map(Number).filter((n) => !isNaN(n));
  if (dbg || q.has('look') || q.has('pos')) {
    setTimeout(() => {
      if (dbg.includes('monke')) settings.applyMapMode(true);
      if (dbg.includes('night')) settings.applyTimeOfDay(true);
      const look = nums('look');
      const pos = nums('pos');
      setInterval(() => {
        if (pos.length === 3) {
          world.player.position.set(pos[0], pos[1], pos[2]);
          (locomotion as unknown as { setPlayerPosition?: (p: unknown) => void })?.setPlayerPosition?.(
            world.player.position,
          );
        }
        if (look.length === 2) Object.assign(desktop ?? {}, { pitch: look[0], yaw: look[1] });
      }, 30);
      const errs: string[] = [];
      if (dbg.includes('info')) {
        window.addEventListener('error', (e) => errs.push(String(e.message).slice(0, 160)));
        const ce = console.error.bind(console);
        console.error = (...args: unknown[]) => {
          errs.push(args.map(String).join(' ').slice(0, 160));
          ce(...args);
        };
        setInterval(() => {
          let out = '';
          world.scene.traverse((o) => {
            const l = o as unknown as { isDirectionalLight?: boolean; intensity: number; castShadow: boolean; position: { toArray(): number[] }; target: { position: { toArray(): number[] } }; shadow: { camera: { left: number; far: number } } };
            if (l.isDirectionalLight) out += JSON.stringify({ i: l.intensity, cs: l.castShadow, p: l.position.toArray().map((v) => +v.toFixed(1)), t: l.target.position.toArray().map((v) => +v.toFixed(1)), half: l.shadow.camera.left, far: l.shadow.camera.far, vis: o.visible });
          });
          const pe = world.getSystem(ProcEnvSystem) as unknown as { frames: number; settle: number };
          document.title =
            'DBG ' + out + ' fog=' + !!world.scene.fog +
            ' player=' + world.player.position.toArray().map((v) => +v.toFixed(1)) +
            ` env:frames=${pe?.frames},settle=${pe?.settle},dirty=${procEnv.dirty},zone=${!!procEnv.zone}` +
            ' errs=' + errs.slice(0, 3).join(' | ');
        }, 200);
      }
    }, 300);
  }
});
