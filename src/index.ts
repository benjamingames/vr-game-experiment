import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { buildRoom, ResetSystem } from './room.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ResetSystem);
  buildRoom(world);
});
