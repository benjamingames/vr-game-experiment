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

/** Drivable RC car state. */
export const RCCar = createComponent('RCCar', {
  speed: { type: Types.Float32, default: 0 },
  throttle: { type: Types.Float32, default: 0.6 }, // 0.2 (low) to 1.0 (max)
});

/** The handheld/tabletop remote control body for the RC car. */
export const RCRemote = createComponent('RCRemote', {});

/** Interactive button or throttle bar segment mounted on the RC remote control. */
export const RCControl = createComponent('RCControl', {
  action: { type: Types.Int8, default: 0 }, // 1=Left, 2=Right, 3=Gas, 4=Brake, 5=Thr-, 6=Thr+, 11..15=ThrLevel 1..5
  localOffset: { type: Types.Vec3, default: [0, 0, 0] },
});

/** A grabbable, pullable part of the floating stretchy face that snaps back elastically on reset. */
export const FacePart = createComponent('FacePart', {
  partId: { type: Types.Int8, default: 0 },
  snapping: { type: Types.Boolean, default: false },
  baseRadius: { type: Types.Float32, default: 0.04 },
  home: { type: Types.Vec3, default: [0, 0, 0] },
  vel: { type: Types.Vec3, default: [0, 0, 0] },
});

/** Floating button next to the stretchy head that triggers an elastic wobble snap-back. */
export const FaceResetButton = createComponent('FaceResetButton', {});
