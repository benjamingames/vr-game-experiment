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

/** A 3D cloud that drifts across the sky above the arched ceiling windows. */
export const SkyCloud = createComponent('SkyCloud', {
  speed: { type: Types.Float32, default: 0.45 },
  baseY: { type: Types.Float32, default: 5.2 },
  phase: { type: Types.Float32, default: 0 },
});

/** Tag on any ball (table balls, basketball, bowling ball) that can score in the basketball hoop. */
export const HoopBall = createComponent('HoopBall', {
  prevY: { type: Types.Float32, default: 0 },
  cooldown: { type: Types.Float32, default: 0 },
});

/** Visual LED pip on the basketball scoreboard or whack-a-mole scoreboard. */
export const ScorePip = createComponent('ScorePip', {
  station: { type: Types.Int8, default: 0 }, // 1=Basketball, 2=WhackAMole
  index: { type: Types.Int8, default: 0 },
});

/** A musical bar on the 8-note rainbow xylophone. */
export const XylophoneBar = createComponent('XylophoneBar', {
  noteIndex: { type: Types.Int8, default: 0 },
  freq: { type: Types.Float32, default: 261.63 },
  baseY: { type: Types.Float32, default: 0.85 },
  flashTimer: { type: Types.Float32, default: 0 },
  hitCooldown: { type: Types.Float32, default: 0 },
});

/** A handheld mallet/hammer that can strike xylophone bars, moles, and the carnival striker. */
export const ToyMallet = createComponent('ToyMallet', {});

/** A pop-up mole in the Whack-a-Mole arcade station. */
export const Mole = createComponent('Mole', {
  slotIndex: { type: Types.Int8, default: 0 },
  state: { type: Types.Int8, default: 0 }, // 0=hidden, 1=up, 2=whacked
  timer: { type: Types.Float32, default: 1.5 },
  baseY: { type: Types.Float32, default: 0.72 },
});

/** Spring-mounted boxing reflex punching bag & carnival striker puck. */
export const ReflexBag = createComponent('ReflexBag', {
  tiltX: { type: Types.Float32, default: 0 },
  tiltZ: { type: Types.Float32, default: 0 },
  velX: { type: Types.Float32, default: 0 },
  velZ: { type: Types.Float32, default: 0 },
  hitCooldown: { type: Types.Float32, default: 0 },
});

/** Carnival High-Striker target pad and rising puck that rings the top bell. */
export const CarnivalStriker = createComponent('CarnivalStriker', {
  puckY: { type: Types.Float32, default: 0.35 },
  puckVel: { type: Types.Float32, default: 0 },
  bellFlash: { type: Types.Float32, default: 0 },
});

/** Floating VR Settings Menu panel toggled by the 3-lines menu button. */
export const SettingsMenu = createComponent('SettingsMenu', {
  open: { type: Types.Boolean, default: false },
});

/** Interactive button on the VR Settings Menu or 3-lines menu launcher button. */
export const SettingsButton = createComponent('SettingsButton', {
  // 0=ToggleMenu, 1=Daytime, 2=Nighttime, 3=GirlHands, 4=BoyHands
  action: { type: Types.Int8, default: 0 },
});

