import { createComponent, Types } from '@iwsdk/core';

/** Anything with this gets put back at its starting spot on reset. */
export const Resettable = createComponent('Resettable', {
  home: { type: Types.Vec3, default: [0, 0, 0] },
});

/** Pointing at this with the controller ray and pulling the trigger resets the room. */
export const ResetButton = createComponent('ResetButton', {});

/** A throwable dart that sticks when it hits the wall dartboard target. */
export const Dart = createComponent('Dart', {
  stuck: { type: Types.Boolean, default: false },
  armed: { type: Types.Boolean, default: true },
  wasGrabbed: { type: Types.Boolean, default: false },
  launchFrames: { type: Types.Int8, default: 0 },
  prevPos: { type: Types.Vec3, default: [0, 0, 0] },
  handVel: { type: Types.Vec3, default: [0, 0, 0] },
  launchVel: { type: Types.Vec3, default: [0, 0, 0] },
  stuckPos: { type: Types.Vec3, default: [0, 0, 0] },
  stuckQuat: { type: Types.Vec4, default: [0, 0, 0, 1] },
});
