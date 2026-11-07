import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { buildRoom, DartSystem, RCCarSystem, ResetSystem } from './room.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(DartSystem);
  world.registerSystem(RCCarSystem);
  world.registerSystem(ResetSystem);
  buildRoom(world);
});
