import { createComponent, Types } from '@iwsdk/core';

/** Anything with this gets put back at its starting spot on reset. */
export const Resettable = createComponent('Resettable', {
  home: { type: Types.Vec3, default: [0, 0, 0] },
});

/** Pointing at this with the controller ray and pulling the trigger resets the room. */
export const ResetButton = createComponent('ResetButton', {});
