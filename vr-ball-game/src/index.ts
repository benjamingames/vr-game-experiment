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
  buildRoom(world);

  // Dev-only handles for scripted testing (emulator / console); stripped from production builds.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __world: world,
      __settings: world.getSystem(SettingsAndHandsSystem),
    });
  }
});
