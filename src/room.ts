import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DistanceGrabbable,
  Entity,
  Grabbed,
  InputComponent,
  LocomotionEnvironment,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  OneHandGrabbable,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  Pressed,
  Quaternion,
  RayInteractable,
  RepeatWrapping,
  SphereGeometry,
  Vector3,
  World,
  createSystem,
} from '@iwsdk/core';
import {
  Dart,
  FacePart,
  FaceResetButton,
  RCCar,
  RCControl,
  RCRemote,
  ResetButton,
  Resettable,
  SkyCloud,
} from './ball-components.js';

// ---- Tweak these to play around -------------------------------------------
const ROOM = { width: 6, depth: 6, height: 3 }; // meters; player starts at the center
const ARCH_PEAK_HEIGHT = 4.35; // apex of the great-room arched ceiling
const BALL_RADIUS = 0.07;
const BALL_BOUNCE = 0.6; // 0 = dead, 1 = superball
const BALL_COLORS = [0xff4d4d, 0x4da6ff, 0xffd24d];
const DART_COLORS = [0xff3b30, 0x34c759, 0x007aff, 0xaf52de];
const DART_LENGTH = 0.18;
const DART_WIDTH = 0.036;
const DART_FLIGHT_GRAVITY = 0.15; // low gravity while flying so darts stay flat and easy to throw
const DARTBOARD = {
  x: 0,
  y: 1.65,
  z: -ROOM.depth / 2 + 0.035,
  radius: 0.42,
  thickness: 0.04,
};
const TABLE = { width: 1.2, height: 0.8, depth: 0.6, z: -0.7 };
// ----------------------------------------------------------------------------

function mat(color: number, roughness = 0.8) {
  return new MeshStandardMaterial({ color: new Color(color), roughness });
}

/** A fixed box the balls bounce off (floor, walls, table). */
function staticBox(
  world: World,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  castShadow = true,
): Entity {
  const mesh = new Mesh(new BoxGeometry(...size), mat(color));
  mesh.position.set(...pos);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  const e = world.createTransformEntity(mesh);
  e.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: size,
    friction: 0.6,
    restitution: 0.3,
  });
  e.addComponent(PhysicsBody, { state: PhysicsState.Static });
  e.addComponent(LocomotionEnvironment);
  return e;
}

export function buildRoom(world: World) {
  const { depth: D } = ROOM;

  // Tiled light-gray floor, oak wood paneled walls, arched ceiling with 2 skylights & 3D clouds
  buildArchitecture(world);

  // Table in front of the player
  staticBox(
    world,
    [TABLE.width, TABLE.height, TABLE.depth],
    [0, TABLE.height / 2, TABLE.z],
    0x6b4a2f,
  );
  const tableTop = TABLE.height;

  // Balls on the back-left of the table: squeeze (grip) to grab up close, or point + trigger from afar
  BALL_COLORS.forEach((color, i) => {
    const ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 32, 16),
      mat(color, 0.35),
    );
    const home: [number, number, number] = [
      -0.46 + i * 0.22,
      tableTop + BALL_RADIUS + 0.01,
      TABLE.z - 0.12,
    ];
    ball.position.set(...home);
    ball.castShadow = true;
    const e = world.createTransformEntity(ball);
    e.addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Sphere,
      dimensions: [BALL_RADIUS, 0, 0],
      density: 400,
      restitution: BALL_BOUNCE,
      friction: 0.5,
    });
    e.addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      angularDamping: 0.3,
    });
    e.addComponent(OneHandGrabbable);
    e.addComponent(RayInteractable);
    e.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    e.addComponent(Resettable);
    e.getVectorView(Resettable, 'home').set(home);
  });

  // Darts on the back-right of the table, pointing toward the wall dartboard (-Z)
  DART_COLORS.forEach((color, i) => {
    const dartMesh = createDartMesh(color);
    const home: [number, number, number] = [
      0.16 + i * 0.09,
      tableTop + DART_WIDTH / 2 + 0.005,
      TABLE.z - 0.12,
    ];
    dartMesh.position.set(...home);
    const e = world.createTransformEntity(dartMesh);
    e.addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
      dimensions: [DART_WIDTH, DART_WIDTH, DART_LENGTH],
      density: 300,
      restitution: 0.15,
      friction: 0.6,
    });
    e.addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      linearDamping: 0.05,
      angularDamping: 0.85,
    });
    e.addComponent(OneHandGrabbable);
    e.addComponent(RayInteractable);
    e.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    e.addComponent(Dart, { stuck: false, armed: true });
    e.addComponent(Resettable);
    e.getVectorView(Resettable, 'home').set(home);
  });

  // RC Car and its Remote Control side-by-side on the front of the table
  buildRCCarAndRemote(world, tableTop);

  // Target dartboard mounted on the far wall
  buildDartboard(world);

  // A pyramid of "cans" against the far wall to knock over
  const canR = 0.06;
  const canH = 0.16;
  const canZ = -D / 2 + 0.6;
  const rows = [3, 2, 1];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const can = new Mesh(
        new CylinderGeometry(canR, canR, canH, 24),
        mat(row === 2 ? 0xff8c1a : 0x3fbf7f, 0.4),
      );
      const home: [number, number, number] = [
        (i - (count - 1) / 2) * (canR * 2 + 0.01),
        canH / 2 + row * canH + 0.001,
        canZ,
      ];
      can.position.set(...home);
      can.castShadow = true;
      const e = world.createTransformEntity(can);
      e.addComponent(PhysicsShape, {
        shape: PhysicsShapeType.Cylinder,
        dimensions: [canR, canH, 0],
        density: 150,
        restitution: 0.2,
      });
      e.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
      e.addComponent(Resettable);
      e.getVectorView(Resettable, 'home').set(home);
    }
  });

  // Big red reset button on the table's right edge (point + trigger)
  const btn = new Mesh(new CylinderGeometry(0.05, 0.05, 0.03, 32), mat(0xd62828, 0.3));
  btn.position.set(TABLE.width / 2 - 0.08, tableTop + 0.015, TABLE.z + 0.18);
  const be = world.createTransformEntity(btn);
  be.addComponent(RayInteractable);
  be.addComponent(ResetButton);

  // Floating Mario-style stretchy head behind the player (+Z) with its own elastic reset button
  buildStretchyHead(world);
}

const RC_CAR_SIZE: [number, number, number] = [0.16, 0.085, 0.24];
const RC_REMOTE_SIZE: [number, number, number] = [0.26, 0.028, 0.16];
const THROTTLE_ACTIVE_COLORS = [0x2ecc71, 0x7bed9f, 0xf1c40f, 0xe67e22, 0xe74c3c];
const THROTTLE_INACTIVE_COLOR = 0x343b44;

/** Builds the drivable RC Car and its multi-button Remote Control side-by-side on the table. */
function buildRCCarAndRemote(world: World, tableTop: number) {
  // ---- 1. RC Car (front-center of table, facing -Z) ----
  const [carW, carH, carD] = RC_CAR_SIZE;
  const carChassis = new Mesh(
    new BoxGeometry(carW * 0.86, carH * 0.48, carD * 0.94),
    mat(0xff5500, 0.3),
  );
  const carHome: [number, number, number] = [
    0.06,
    tableTop + carH / 2 + 0.006,
    TABLE.z + 0.16,
  ];
  carChassis.position.set(...carHome);
  carChassis.castShadow = true;

  // Cockpit cabin
  const cabin = new Mesh(
    new BoxGeometry(carW * 0.72, carH * 0.42, carD * 0.44),
    mat(0x1f252d, 0.25),
  );
  cabin.position.set(0, carH * 0.38, -carD * 0.03);
  carChassis.add(cabin);

  // Front bumper & bright headlights at -Z
  const bumper = new Mesh(
    new BoxGeometry(carW * 0.92, carH * 0.22, 0.018),
    mat(0x22262b, 0.5),
  );
  bumper.position.set(0, -carH * 0.12, -carD * 0.48);
  carChassis.add(bumper);

  [-1, 1].forEach((side) => {
    const light = new Mesh(
      new BoxGeometry(0.024, 0.014, 0.008),
      mat(0xfff3b0, 0.15),
    );
    light.position.set(side * (carW * 0.28), 0.004, -carD * 0.475);
    carChassis.add(light);
  });

  // Rear racing spoiler wing at +Z
  const wing = new Mesh(
    new BoxGeometry(carW * 0.88, 0.008, 0.032),
    mat(0x1f252d, 0.35),
  );
  wing.position.set(0, carH * 0.46, carD * 0.42);
  carChassis.add(wing);

  [-1, 1].forEach((side) => {
    const strut = new Mesh(
      new BoxGeometry(0.008, carH * 0.32, 0.016),
      mat(0x1f252d, 0.4),
    );
    strut.position.set(side * (carW * 0.32), carH * 0.28, carD * 0.41);
    carChassis.add(strut);
  });

  // Four wheels (front wheels named so RCCarSystem can visually steer them)
  const wheelGeo = new CylinderGeometry(0.028, 0.028, 0.022, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new CylinderGeometry(0.015, 0.015, 0.024, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelMat = mat(0x1a1c1e, 0.85);
  const hubMat = mat(0xd8dee9, 0.3);

  const wheelCoords: Array<[number, number, string]> = [
    [-carW * 0.48, -carD * 0.31, 'rc-wheel-fl'],
    [carW * 0.48, -carD * 0.31, 'rc-wheel-fr'],
    [-carW * 0.48, carD * 0.31, 'rc-wheel-rl'],
    [carW * 0.48, carD * 0.31, 'rc-wheel-rr'],
  ];
  wheelCoords.forEach(([wx, wz, name]) => {
    const wheel = new Mesh(wheelGeo, wheelMat);
    wheel.name = name;
    wheel.position.set(wx, -carH * 0.18, wz);
    const hub = new Mesh(hubGeo, hubMat);
    wheel.add(hub);
    carChassis.add(wheel);
  });

  const carEntity = world.createTransformEntity(carChassis);
  carEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: RC_CAR_SIZE,
    density: 450,
    restitution: 0.15,
    friction: 0.3,
  });
  carEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    linearDamping: 0.2,
    angularDamping: 0.9,
  });
  carEntity.addComponent(OneHandGrabbable);
  carEntity.addComponent(RayInteractable);
  carEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  carEntity.addComponent(RCCar, { speed: 0, throttle: 0.6 });
  carEntity.addComponent(Resettable);
  carEntity.getVectorView(Resettable, 'home').set(carHome);

  // ---- 2. Remote Control next to the RC Car (front-left of table) ----
  const [remW, remH, remD] = RC_REMOTE_SIZE;
  const remoteBase = new Mesh(
    new BoxGeometry(remW, remH, remD),
    mat(0x282e38, 0.55),
  );
  const remoteHome: [number, number, number] = [
    -0.32,
    tableTop + remH / 2 + 0.004,
    TABLE.z + 0.16,
  ];
  remoteBase.position.set(...remoteHome);
  remoteBase.castShadow = true;

  // Telescopic antenna at back-left corner of remote
  const antenna = new Mesh(
    new CylinderGeometry(0.0025, 0.004, 0.14, 10),
    mat(0xcfd6de, 0.25),
  );
  antenna.position.set(-remW * 0.42, remH / 2 + 0.07, -remD * 0.38);
  const antTip = new Mesh(new SphereGeometry(0.006, 12, 8), mat(0xff3b30, 0.3));
  antTip.position.set(0, 0.07, 0);
  antenna.add(antTip);
  remoteBase.add(antenna);

  // Steering indicator bar above Left/Right buttons
  const steerIndicator = new Mesh(
    new BoxGeometry(0.056, 0.008, 0.012),
    mat(0x56ccf2, 0.3),
  );
  steerIndicator.name = 'rc-steer-indicator';
  steerIndicator.position.set(-0.072, remH / 2 + 0.005, -0.046);
  remoteBase.add(steerIndicator);

  // Throttle slot backing & movable Throttle Lever Handle
  const slotTrack = new Mesh(
    new BoxGeometry(0.01, 0.004, 0.076),
    mat(0x15181d, 0.8),
  );
  slotTrack.position.set(0.01, remH / 2 + 0.002, 0);
  remoteBase.add(slotTrack);

  const throttleKnob = new Mesh(
    new BoxGeometry(0.052, 0.016, 0.014),
    mat(0xf2c94c, 0.25),
  );
  throttleKnob.name = 'rc-throttle-knob';
  throttleKnob.position.set(0.01, remH / 2 + 0.012, 0);
  remoteBase.add(throttleKnob);

  const remoteEntity = world.createTransformEntity(remoteBase);
  remoteEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: RC_REMOTE_SIZE,
    density: 500,
    restitution: 0.1,
    friction: 0.8,
  });
  remoteEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    linearDamping: 0.4,
    angularDamping: 0.9,
  });
  remoteEntity.addComponent(OneHandGrabbable);
  remoteEntity.addComponent(RCRemote);
  remoteEntity.addComponent(Resettable);
  remoteEntity.getVectorView(Resettable, 'home').set(remoteHome);

  // Helper to spawn an interactive button on top of the remote control
  const addControl = (
    action: number,
    size: [number, number, number],
    offset: [number, number, number],
    color: number,
  ) => {
    const btnMesh = new Mesh(new BoxGeometry(...size), mat(color, 0.35));
    btnMesh.position.set(
      remoteHome[0] + offset[0],
      remoteHome[1] + offset[1],
      remoteHome[2] + offset[2],
    );
    const ce = world.createTransformEntity(btnMesh);
    ce.addComponent(RayInteractable);
    ce.addComponent(RCControl, { action });
    ce.getVectorView(RCControl, 'localOffset').set(offset);
  };

  const topY = remH / 2 + 0.009;

  // Steer Left (1) & Steer Right (2) buttons on left side of remote
  addControl(1, [0.046, 0.018, 0.058], [-0.098, topY, 0.012], 0x2b82d9);
  addControl(2, [0.046, 0.018, 0.058], [-0.044, topY, 0.012], 0x2b82d9);

  // Gas (3, green top-right) & Brake (4, red bottom-right) pedals on right side
  addControl(3, [0.056, 0.02, 0.056], [0.086, topY + 0.001, -0.032], 0x2ecc71);
  addControl(4, [0.056, 0.02, 0.056], [0.086, topY + 0.001, 0.034], 0xe74c3c);

  // Throttle Down (-) (5, bottom-center) & Throttle Up (+) (6, top-center)
  addControl(5, [0.042, 0.016, 0.022], [0.01, topY, 0.056], 0xe67e22);
  addControl(6, [0.042, 0.016, 0.022], [0.01, topY, -0.056], 0xf2994a);

  // 5 clickable Throttle Bar segments (11..15) in the center column (low to max acceleration)
  for (let i = 0; i < 5; i++) {
    const level = i + 1;
    const zOff = 0.028 - i * 0.014; // +0.028 (level 1) up to -0.028 (level 5)
    const initialColor =
      level <= 3 ? THROTTLE_ACTIVE_COLORS[i] : THROTTLE_INACTIVE_COLOR;
    addControl(10 + level, [0.044, 0.012, 0.011], [0.01, topY - 0.002, zOff], initialColor);
  }
}

/** Builds a throwable dart oriented along local Z (sharp tip at -Z, flights at +Z). */
function createDartMesh(color: number): Mesh {
  const barrelGeo = new CylinderGeometry(0.008, 0.011, 0.055, 16);
  barrelGeo.rotateX(Math.PI / 2);
  const barrel = new Mesh(barrelGeo, mat(color, 0.35));
  barrel.castShadow = true;

  // Sharp steel needle tip at -Z
  const tipGeo = new CylinderGeometry(0.0045, 0.0008, 0.045, 12);
  tipGeo.rotateX(Math.PI / 2);
  const tip = new Mesh(tipGeo, mat(0xd4dce6, 0.2));
  tip.position.set(0, 0, -0.065);
  tip.castShadow = true;
  barrel.add(tip);

  // Brass/dark nose collar connecting barrel to tip
  const noseGeo = new CylinderGeometry(0.011, 0.0045, 0.02, 16);
  noseGeo.rotateX(Math.PI / 2);
  const nose = new Mesh(noseGeo, mat(0xd4af37, 0.3));
  nose.position.set(0, 0, -0.035);
  barrel.add(nose);

  // Slender rear shaft
  const shaftGeo = new CylinderGeometry(0.0035, 0.005, 0.048, 12);
  shaftGeo.rotateX(Math.PI / 2);
  const shaft = new Mesh(shaftGeo, mat(0x22252a, 0.5));
  shaft.position.set(0, 0, 0.046);
  barrel.add(shaft);

  // Crossed tail flights (fins) at +Z
  const finMat = mat(color, 0.45);
  const finH = new Mesh(new BoxGeometry(DART_WIDTH, 0.002, 0.042), finMat);
  finH.position.set(0, 0, 0.066);
  barrel.add(finH);

  const finV = new Mesh(new BoxGeometry(0.002, DART_WIDTH, 0.042), finMat);
  finV.position.set(0, 0, 0.066);
  barrel.add(finV);

  return barrel;
}

/** Builds a concentric bullseye target dartboard mounted on the far wall. */
function buildDartboard(world: World) {
  const { x, y, z, radius, thickness } = DARTBOARD;

  // Dark backing rim disc
  const backGeo = new CylinderGeometry(radius + 0.025, radius + 0.025, thickness, 48);
  backGeo.rotateX(Math.PI / 2);
  const board = new Mesh(backGeo, mat(0x231f20, 0.7));
  board.position.set(x, y, z);
  board.receiveShadow = true;

  // Concentric scoring rings stepped slightly in +Z to avoid z-fighting
  const rings: Array<[number, number]> = [
    [radius, 0xf5f0e6],          // Outer white ring
    [radius * 0.78, 0x1e2229],   // Black ring
    [radius * 0.56, 0x2b82d9],   // Blue ring
    [radius * 0.36, 0xd9382b],   // Red ring
    [radius * 0.18, 0xf2c94c],   // Gold bullseye ring
    [radius * 0.07, 0xd62828],   // Inner double-bullseye
  ];

  const discThickness = 0.004;
  rings.forEach(([r, color], idx) => {
    const ringGeo = new CylinderGeometry(r, r, discThickness, 48);
    ringGeo.rotateX(Math.PI / 2);
    const ringMesh = new Mesh(ringGeo, mat(color, 0.55));
    ringMesh.position.set(0, 0, thickness / 2 + idx * 0.0015);
    ringMesh.receiveShadow = true;
    board.add(ringMesh);
  });

  world.createTransformEntity(board);
}

/** Assists dart throws toward the board, sticks hits into the target, and lets misses fall off. */
export class DartSystem extends createSystem({
  darts: { required: [Dart, PhysicsBody] },
}) {
  private pos = new Vector3();
  private rot = new Quaternion();
  private forward = new Vector3(0, 0, -1);
  private stickDir = new Vector3();

  update(delta: number) {
    const physics = this.world.getSystem(PhysicsSystem);
    const boardFrontZ = DARTBOARD.z + DARTBOARD.thickness / 2 + 0.009;
    const captureZ = boardFrontZ + DART_LENGTH * 0.55;
    const dt = Math.max(delta, 0.005);

    for (const e of this.queries.darts.entities) {
      const obj = e.object3D;
      if (!obj) continue;

      const isGrabbed = e.hasComponent(Grabbed);
      const isStuck = e.getValue(Dart, 'stuck');

      if (isGrabbed) {
        if (isStuck) {
          unstickDart(e, false);
        }
        // Re-arm once pulled away from the board face
        if (obj.position.z > captureZ + 0.08) {
          e.setValue(Dart, 'armed', true);
        }

        const prev = e.getVectorView(Dart, 'prevPos');
        const hv = e.getVectorView(Dart, 'handVel');
        if (!e.getValue(Dart, 'wasGrabbed')) {
          e.setValue(Dart, 'wasGrabbed', true);
          e.setValue(Dart, 'launchFrames', 0);
          prev.set([obj.position.x, obj.position.y, obj.position.z]);
          hv.set([0, 0, 0]);
        } else {
          const ivx = (obj.position.x - prev[0]) / dt;
          const ivy = (obj.position.y - prev[1]) / dt;
          const ivz = (obj.position.z - prev[2]) / dt;
          prev.set([obj.position.x, obj.position.y, obj.position.z]);

          const instSpeed = Math.hypot(ivx, ivy, ivz);
          const prevSpeed = Math.hypot(hv[0], hv[1], hv[2]);
          const alpha = instSpeed >= prevSpeed * 0.7 ? 0.6 : 0.18;
          hv[0] = hv[0] * (1 - alpha) + ivx * alpha;
          hv[1] = hv[1] * (1 - alpha) + ivy * alpha;
          hv[2] = hv[2] * (1 - alpha) + ivz * alpha;
        }
        continue;
      }

      // Just released from grab: check if thrown toward the dartboard and apply throw assist
      if (e.getValue(Dart, 'wasGrabbed')) {
        e.setValue(Dart, 'wasGrabbed', false);
        const hv = e.getVectorView(Dart, 'handVel');
        const pv = e.getVectorView(PhysicsBody, '_linearVelocity');
        const hSpeed = Math.hypot(hv[0], hv[1], hv[2]);
        const pSpeed = Math.hypot(pv[0], pv[1], pv[2]);
        const vx = hSpeed >= pSpeed ? hv[0] : pv[0];
        const vy = hSpeed >= pSpeed ? hv[1] : pv[1];
        const vz = hSpeed >= pSpeed ? hv[2] : pv[2];
        const rawSpeed = Math.max(hSpeed, pSpeed);

        // Assist any forward flick/throw aimed generally toward the front wall
        if (rawSpeed > 0.22 && vz < 0.08 && obj.position.z > DARTBOARD.z + 0.35) {
          const dxBoard = DARTBOARD.x - obj.position.x;
          const dyBoard = DARTBOARD.y - obj.position.y;
          const dzBoard = DARTBOARD.z - obj.position.z;
          const distToBoard = Math.hypot(dxBoard, dyBoard, dzBoard);

          const fwdSpeed = Math.max(-vz, rawSpeed * 0.5, 0.6);
          const tRaw = Math.abs(dzBoard) / fwdSpeed;
          const rawWallX = obj.position.x + vx * tRaw;
          const rawWallY = obj.position.y + vy * tRaw;
          const offX = rawWallX - DARTBOARD.x;
          const offY = rawWallY - DARTBOARD.y;
          const offDist = Math.hypot(offX, offY);

          // If thrown within a generous 2.2m cone of the board, pull aim toward the bullseye
          if (offDist < 2.2) {
            let targetOffsetX = offX * 0.2;
            let targetOffsetY = offY * 0.18;
            const targetOffsetDist = Math.hypot(targetOffsetX, targetOffsetY);
            const maxAssistRadius = DARTBOARD.radius * 0.82;
            if (targetOffsetDist > maxAssistRadius) {
              const scale = maxAssistRadius / targetOffsetDist;
              targetOffsetX *= scale;
              targetOffsetY *= scale;
            }

            const targetX = DARTBOARD.x + targetOffsetX;
            const targetY = DARTBOARD.y + targetOffsetY;
            const assistSpeed = Math.min(Math.max(rawSpeed * 2.5, 7.5), 11.0);
            const flightTime = distToBoard / assistSpeed;

            const lvx = (targetX - obj.position.x) / flightTime;
            const lvy =
              (targetY - obj.position.y) / flightTime +
              0.5 * 9.81 * DART_FLIGHT_GRAVITY * flightTime;
            const lvz = (DARTBOARD.z - obj.position.z) / flightTime;

            e.getVectorView(Dart, 'launchVel').set([lvx, lvy, lvz]);
            e.setValue(Dart, 'launchFrames', 3);
            e.setValue(Dart, 'armed', true);
            e.setValue(PhysicsBody, 'gravityFactor', DART_FLIGHT_GRAVITY);
          }
        }
      }

      // Apply assisted launch velocity and point-first alignment for the first frames of flight
      const launchFrames = e.getValue(Dart, 'launchFrames') ?? 0;
      if (launchFrames > 0) {
        e.setValue(Dart, 'launchFrames', launchFrames - 1);
        const lv = e.getVectorView(Dart, 'launchVel');
        if (launchFrames === 3) {
          this.stickDir.set(lv[0], lv[1], lv[2]).normalize();
          this.rot.setFromUnitVectors(this.forward, this.stickDir);
          physics?.setBodyTransform(e, {
            position: obj.position,
            quaternion: this.rot,
          });
        }
        if (!e.hasComponent(PhysicsManipulation)) {
          e.addComponent(PhysicsManipulation, {
            linearVelocity: [lv[0], lv[1], lv[2]],
            angularVelocity: [0, 0, 0],
          });
        }
      }

      if (isStuck) {
        // Hold the stuck dart firmly embedded in the dartboard if bumped
        const sp = e.getVectorView(Dart, 'stuckPos');
        const dx = obj.position.x - sp[0];
        const dy = obj.position.y - sp[1];
        const dz = obj.position.z - sp[2];
        if (dx * dx + dy * dy + dz * dz > 0.000004) {
          const sq = e.getVectorView(Dart, 'stuckQuat');
          this.pos.set(sp[0], sp[1], sp[2]);
          this.rot.set(sq[0], sq[1], sq[2], sq[3]);
          physics?.setBodyTransform(e, {
            position: this.pos,
            quaternion: this.rot,
          });
        }
        continue;
      }

      // If it's away from the far wall, make sure it's armed for the next throw
      if (obj.position.z > captureZ + 0.15) {
        if (!e.getValue(Dart, 'armed')) {
          e.setValue(Dart, 'armed', true);
        }
        continue;
      }

      // Dart has reached the far wall plane
      if (obj.position.z <= captureZ && e.getValue(Dart, 'armed')) {
        const dx = obj.position.x - DARTBOARD.x;
        const dy = obj.position.y - DARTBOARD.y;
        const radialDist = Math.hypot(dx, dy);

        if (radialDist <= DARTBOARD.radius) {
          // Hit the dartboard! Embed tip-first into the board surface
          const vel = e.getVectorView(PhysicsBody, '_linearVelocity');
          this.stickDir.set(vel[0] * 0.08, vel[1] * 0.08, -1).normalize();
          this.rot.setFromUnitVectors(this.forward, this.stickDir);

          const halfLen = DART_LENGTH / 2;
          const tipEmbedZ = boardFrontZ - 0.015;
          this.pos.set(
            obj.position.x - this.stickDir.x * halfLen,
            obj.position.y - this.stickDir.y * halfLen,
            tipEmbedZ - this.stickDir.z * halfLen,
          );

          e.getVectorView(Dart, 'stuckPos').set([this.pos.x, this.pos.y, this.pos.z]);
          e.getVectorView(Dart, 'stuckQuat').set([
            this.rot.x,
            this.rot.y,
            this.rot.z,
            this.rot.w,
          ]);
          e.setValue(Dart, 'stuck', true);
          e.setValue(Dart, 'armed', false);
          e.setValue(Dart, 'launchFrames', 0);
          e.setValue(PhysicsBody, 'gravityFactor', 0);
          e.setValue(PhysicsBody, 'linearDamping', 100);
          e.setValue(PhysicsBody, 'angularDamping', 100);

          physics?.setBodyTransform(e, {
            position: this.pos,
            quaternion: this.rot,
          });
        } else {
          // Hit the bare wall outside the dartboard: disarm and restore normal gravity so it falls
          e.setValue(Dart, 'armed', false);
          e.setValue(Dart, 'launchFrames', 0);
          e.setValue(PhysicsBody, 'gravityFactor', 1);
        }
      }
    }
  }
}

function unstickDart(e: Entity, armed: boolean) {
  e.setValue(Dart, 'stuck', false);
  e.setValue(Dart, 'armed', armed);
  e.setValue(Dart, 'wasGrabbed', false);
  e.setValue(Dart, 'launchFrames', 0);
  e.setValue(PhysicsBody, 'gravityFactor', 1);
  e.setValue(PhysicsBody, 'linearDamping', 0.05);
  e.setValue(PhysicsBody, 'angularDamping', 0.85);
}

/** Drives the RC Car from the Remote Control buttons (steer left/right, gas, brake, throttle). */
export class RCCarSystem extends createSystem({
  cars: { required: [RCCar, PhysicsBody] },
  remotes: { required: [RCRemote] },
  controls: { required: [RCControl] },
  pressedControls: { required: [RCControl, Pressed] },
}) {
  private carForward = new Vector3();
  private carUp = new Vector3();
  private ctrlPos = new Vector3();
  private uprightRot = new Quaternion();
  private upAxis = new Vector3(0, 1, 0);

  init() {
    this.cleanupFuncs.push(
      this.queries.pressedControls.subscribe('qualify', (ctrl) => {
        const action = ctrl.getValue(RCControl, 'action') ?? 0;
        for (const car of this.queries.cars.entities) {
          const cur = car.getValue(RCCar, 'throttle') ?? 0.6;
          if (action === 5) {
            car.setValue(RCCar, 'throttle', Math.max(0.2, Math.round((cur - 0.2) * 10) / 10));
          } else if (action === 6) {
            car.setValue(RCCar, 'throttle', Math.min(1.0, Math.round((cur + 0.2) * 10) / 10));
          } else if (action >= 11 && action <= 15) {
            car.setValue(RCCar, 'throttle', (action - 10) * 0.2);
          }
        }
      }),
    );
  }

  update(delta: number) {
    const dt = Math.max(delta, 0.005);
    const physics = this.world.getSystem(PhysicsSystem);

    let steerInput = 0; // +1 = left, -1 = right
    let gasInput = 0;
    let brakeInput = 0;

    // 1. Check held buttons on the remote control
    for (const ctrl of this.queries.controls.entities) {
      if (!ctrl.hasComponent(Pressed)) continue;
      const action = ctrl.getValue(RCControl, 'action') ?? 0;
      if (action === 1) steerInput += 1;
      else if (action === 2) steerInput -= 1;
      else if (action === 3) gasInput = 1;
      else if (action === 4) brakeInput = 1;
      else if (action >= 11 && action <= 15) {
        for (const car of this.queries.cars.entities) {
          car.setValue(RCCar, 'throttle', (action - 10) * 0.2);
        }
      }
    }

    steerInput = Math.max(-1, Math.min(1, steerInput));

    // 2. Sync remote control buttons & throttle visuals to the remote body
    let currentThrottle = 0.6;
    for (const car of this.queries.cars.entities) {
      currentThrottle = car.getValue(RCCar, 'throttle') ?? 0.6;
    }
    const activeLevel = Math.round(currentThrottle / 0.2);

    for (const rem of this.queries.remotes.entities) {
      const remObj = rem.object3D;
      if (!remObj) continue;

      const knob = remObj.getObjectByName('rc-throttle-knob');
      if (knob) {
        knob.position.z = 0.028 - (activeLevel - 1) * 0.014;
      }
      const steerBar = remObj.getObjectByName('rc-steer-indicator');
      if (steerBar) {
        steerBar.rotation.y = steerInput * 0.45;
      }

      for (const ctrl of this.queries.controls.entities) {
        const ctrlObj = ctrl.object3D as Mesh | undefined;
        if (!ctrlObj) continue;
        const action = ctrl.getValue(RCControl, 'action') ?? 0;
        const off = ctrl.getVectorView(RCControl, 'localOffset');
        const isDepressed =
          ctrl.hasComponent(Pressed) ||
          (action === 1 && steerInput > 0.2) ||
          (action === 2 && steerInput < -0.2) ||
          (action === 3 && gasInput > 0.2) ||
          (action === 4 && brakeInput > 0.2);

        this.ctrlPos
          .set(off[0], off[1] - (isDepressed ? 0.004 : 0), off[2])
          .applyQuaternion(remObj.quaternion)
          .add(remObj.position);
        ctrlObj.position.copy(this.ctrlPos);
        ctrlObj.quaternion.copy(remObj.quaternion);

        if (action >= 11 && action <= 15) {
          const segLevel = action - 10;
          const matInst = ctrlObj.material as MeshStandardMaterial;
          matInst.color.setHex(
            segLevel <= activeLevel
              ? THROTTLE_ACTIVE_COLORS[segLevel - 1]
              : THROTTLE_INACTIVE_COLOR,
          );
        }
      }
    }

    // 4. Update RC Car physics & wheel steering
    for (const car of this.queries.cars.entities) {
      const carObj = car.object3D;
      if (!carObj) continue;

      const fl = carObj.getObjectByName('rc-wheel-fl');
      const fr = carObj.getObjectByName('rc-wheel-fr');
      if (fl) fl.rotation.y = steerInput * 0.45;
      if (fr) fr.rotation.y = steerInput * 0.45;

      if (car.hasComponent(Grabbed)) {
        car.setValue(RCCar, 'speed', 0);
        continue;
      }

      const throttle = car.getValue(RCCar, 'throttle') ?? 0.6;
      let speed = car.getValue(RCCar, 'speed') ?? 0;

      if (brakeInput > 0) {
        // Brake rapidly slows the car to a stop
        const brakeDecel = 12.0 * brakeInput;
        speed = Math.max(0, speed - brakeDecel * dt);
      } else if (gasInput > 0) {
        // Throttle controls how much acceleration Gas gives the car
        const accel = (1.2 + throttle * 7.5) * gasInput;
        const maxSpeed = 0.9 + throttle * 4.1;
        speed = Math.min(speed + accel * dt, maxSpeed);
      } else {
        // Natural rolling resistance when coasting
        speed = Math.max(0, speed - 2.2 * dt);
      }
      car.setValue(RCCar, 'speed', speed);

      this.carForward.set(0, 0, -1).applyQuaternion(carObj.quaternion);
      this.carForward.y = 0;
      if (this.carForward.lengthSq() > 0.0001) {
        this.carForward.normalize();
      } else {
        this.carForward.set(0, 0, -1);
      }

      // Self-right the car if it tips over (e.g. after driving off the table edge)
      this.carUp.set(0, 1, 0).applyQuaternion(carObj.quaternion);
      const vel = car.getVectorView(PhysicsBody, '_linearVelocity');
      if (this.carUp.y < 0.85 && Math.abs(vel[1]) < 0.8) {
        const yaw = Math.atan2(-this.carForward.x, -this.carForward.z);
        this.uprightRot.setFromAxisAngle(this.upAxis, yaw);
        physics?.setBodyTransform(car, {
          position: carObj.position,
          quaternion: this.uprightRot,
        });
      }

      if (
        (speed > 0.005 || Math.abs(steerInput) > 0.01 || brakeInput > 0) &&
        !car.hasComponent(PhysicsManipulation)
      ) {
        car.addComponent(PhysicsManipulation, {
          linearVelocity: [
            this.carForward.x * speed,
            vel[1],
            this.carForward.z * speed,
          ],
          angularVelocity: [0, steerInput * 2.6, 0],
        });
      }
    }
  }
}

/** Puts every ball, dart, RC car/remote, and can back. Triggered by the red button, the A button, or escaping. */
export class ResetSystem extends createSystem({
  items: { required: [Resettable] },
  pressed: { required: [ResetButton, Pressed] },
}) {
  private pos = new Vector3();
  private rot = new Quaternion();

  init() {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', () => this.resetAll()),
    );
  }

  resetAll() {
    for (const e of this.queries.items.entities) this.resetOne(e);
  }

  private resetOne(e: Entity) {
    if (e.hasComponent(Dart)) {
      unstickDart(e, true);
    }
    if (e.hasComponent(RCCar)) {
      e.setValue(RCCar, 'speed', 0);
    }
    const h = e.getVectorView(Resettable, 'home');
    this.pos.set(h[0], h[1], h[2]);
    this.rot.identity();
    this.world.getSystem(PhysicsSystem)?.setBodyTransform(e, {
      position: this.pos,
      quaternion: this.rot,
    });
  }

  update() {
    const right = this.input.xr.gamepads.right;
    if (right?.getButtonDown(InputComponent.A_Button)) this.resetAll();

    // Anything that tunnels out of the room comes back on its own
    for (const e of this.queries.items.entities) {
      const y = e.object3D?.position.y ?? 0;
      if (y < -1 || y > ARCH_PEAK_HEIGHT + 1.5) this.resetOne(e);
    }
  }
}

// ---- Room Architecture: Tiled Gray Floor, Oak Paneling, Arched Skylight Ceiling & 3D Clouds ----

function createTiledFloorMaterial(): MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Grout background
  ctx.fillStyle = '#9aa1a9';
  ctx.fillRect(0, 0, 512, 512);

  // 4x4 tiles per repeat (12x12 tiles across the 6m x 6m floor = 0.5m tiles)
  const cells = 4;
  const cell = 512 / cells;
  const grout = 5;
  const shades = ['#d9dde2', '#d2d7dc', '#dfe3e8', '#d5dae0'];

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const x = c * cell + grout;
      const y = r * cell + grout;
      const w = cell - grout * 2;
      const h = cell - grout * 2;

      ctx.fillStyle = shades[(r * 3 + c) % shades.length];
      ctx.fillRect(x, y, w, h);

      // Subtle bevel edge highlight (top/left) & shadow (bottom/right)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x, y, w, 3);
      ctx.fillRect(x, y, 3, h);

      ctx.fillStyle = 'rgba(80, 90, 100, 0.22)';
      ctx.fillRect(x, y + h - 3, w, 3);
      ctx.fillRect(x + w - 3, y, 3, h);
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 3);
  return new MeshStandardMaterial({
    map: tex,
    roughness: 0.35,
    metalness: 0.05,
  });
}

function createOakMaterial(
  baseHex = '#a86b32',
  darkHex = '#7c491b',
  lightHex = '#c28447',
  repeatX = 2,
  repeatY = 1,
  roughness = 0.55,
): MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Vertical warm oak wood grain fibers & cathedral streaks
  for (let i = 0; i < 90; i++) {
    const x = ((i * 37) % 256);
    const w = 1 + (i % 3);
    ctx.fillStyle = i % 2 === 0 ? darkHex : lightHex;
    ctx.globalAlpha = 0.14 + (i % 4) * 0.04;
    ctx.fillRect(x, 0, w, 256);
  }
  ctx.globalAlpha = 1.0;

  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return new MeshStandardMaterial({ map: tex, roughness });
}

function archHeightAtX(x: number): number {
  const norm = x / (ROOM.width / 2);
  return ROOM.height + (ARCH_PEAK_HEIGHT - ROOM.height) * (1 - norm * norm);
}

function archSlopeAngleAtX(x: number): number {
  // dy/dx of H + PeakDelta * (1 - (x / 3)^2) = -2 * PeakDelta * x / 9
  const dydx = (-2 * (ARCH_PEAK_HEIGHT - ROOM.height) * x) / ((ROOM.width / 2) ** 2);
  return Math.atan(dydx);
}

function buildArchitecture(world: World) {
  const { width: W, depth: D, height: H } = ROOM;
  const t = 0.2;

  const floorMat = createTiledFloorMaterial();
  const oakWallMat = createOakMaterial('#a96d35', '#7e4b1c', '#c6884a', 4, 2, 0.55);
  const oakTrimMat = createOakMaterial('#834e1f', '#5e3512', '#9e632d', 2, 1, 0.48);
  const oakPanelMat = createOakMaterial('#b87b40', '#8c5522', '#d19558', 1, 1, 0.5);
  const oakCeilingMat = createOakMaterial('#9f642c', '#744419', '#ba7c40', 2, 3, 0.55);

  // 1. Light-Gray Tiled Floor (top surface at y = 0)
  const floorMesh = new Mesh(new BoxGeometry(W, t, D), floorMat);
  floorMesh.position.set(0, -t / 2, 0);
  floorMesh.receiveShadow = true;
  const floorEntity = world.createTransformEntity(floorMesh);
  floorEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [W, t, D],
    friction: 0.6,
    restitution: 0.3,
  });
  floorEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });
  floorEntity.addComponent(LocomotionEnvironment);

  // 2. Four Oak Wood Paneled Walls with 3D wainscoting, rails, stiles & raised panels
  const addOakWall = (
    size: [number, number, number],
    pos: [number, number, number],
    alongX: boolean,
    inwardSign: number,
  ) => {
    const wallMesh = new Mesh(new BoxGeometry(...size), oakWallMat);
    wallMesh.position.set(...pos);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;

    const span = alongX ? W : D;
    const faceOffset = (t / 2 + 0.008) * inwardSign;

    // Horizontal oak rails: baseboard, chair rail, and upper frieze rail
    const railHeights: Array<[number, number]> = [
      [-H / 2 + 0.07, 0.14], // Baseboard
      [-H / 2 + 1.05, 0.08], // Chair rail
      [H / 2 - 0.07, 0.14],  // Crown cornice rail
    ];
    railHeights.forEach(([ry, rh]) => {
      const railGeo = alongX
        ? new BoxGeometry(span, rh, 0.022)
        : new BoxGeometry(0.022, rh, span);
      const rail = new Mesh(railGeo, oakTrimMat);
      rail.position.set(
        alongX ? 0 : faceOffset,
        ry,
        alongX ? faceOffset : 0,
      );
      wallMesh.add(rail);
    });

    // Vertical oak stiles and recessed/raised oak panels (6 bays across 6m)
    const bays = 6;
    const bayWidth = span / bays;
    for (let i = 0; i <= bays; i++) {
      const coord = -span / 2 + i * bayWidth;
      const stileGeo = alongX
        ? new BoxGeometry(0.07, H, 0.02)
        : new BoxGeometry(0.02, H, 0.07);
      const stile = new Mesh(stileGeo, oakTrimMat);
      stile.position.set(
        alongX ? coord : faceOffset,
        0,
        alongX ? faceOffset : coord,
      );
      wallMesh.add(stile);

      if (i < bays) {
        const bayCenter = coord + bayWidth / 2;
        const pw = bayWidth - 0.16;

        // Lower wainscoting raised oak panel
        const lowerGeo = alongX
          ? new BoxGeometry(pw, 0.68, 0.014)
          : new BoxGeometry(0.014, 0.68, pw);
        const lowerPanel = new Mesh(lowerGeo, oakPanelMat);
        lowerPanel.position.set(
          alongX ? bayCenter : faceOffset * 0.85,
          -H / 2 + 0.56,
          alongX ? faceOffset * 0.85 : bayCenter,
        );
        wallMesh.add(lowerPanel);

        // Upper tall raised oak panel
        const upperGeo = alongX
          ? new BoxGeometry(pw, 1.58, 0.014)
          : new BoxGeometry(0.014, 1.58, pw);
        const upperPanel = new Mesh(upperGeo, oakPanelMat);
        upperPanel.position.set(
          alongX ? bayCenter : faceOffset * 0.85,
          -H / 2 + 1.98,
          alongX ? faceOffset * 0.85 : bayCenter,
        );
        wallMesh.add(upperPanel);
      }
    }

    // If front or back wall (alongX), fill the arched gable above y = H up to the ceiling arch
    if (alongX) {
      const gableStrips = 12;
      const stripW = W / gableStrips;
      for (let s = 0; s < gableStrips; s++) {
        const sx = -W / 2 + (s + 0.5) * stripW;
        const archH = archHeightAtX(sx) - H;
        if (archH > 0.02) {
          const gableStrip = new Mesh(
            new BoxGeometry(stripW + 0.01, archH, t),
            oakWallMat,
          );
          gableStrip.position.set(sx, H / 2 + archH / 2, 0);
          wallMesh.add(gableStrip);
        }
      }
    }

    const we = world.createTransformEntity(wallMesh);
    we.addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
      dimensions: size,
      friction: 0.6,
      restitution: 0.3,
    });
    we.addComponent(PhysicsBody, { state: PhysicsState.Static });
    we.addComponent(LocomotionEnvironment);
  };

  addOakWall([W, H, t], [0, H / 2, -D / 2 - t / 2], true, 1);  // Far wall (-Z)
  addOakWall([W, H, t], [0, H / 2, D / 2 + t / 2], true, -1);  // Back wall (+Z)
  addOakWall([t, H, D], [-W / 2 - t / 2, H / 2, 0], false, 1); // Left wall (-X)
  addOakWall([t, H, D], [W / 2 + t / 2, H / 2, 0], false, -1); // Right wall (+X)

  // Invisible high physics ceiling collider above the arch peak to keep high throws in bounds
  const ceilColliderMesh = new Mesh(new BoxGeometry(W, t, D), oakTrimMat);
  ceilColliderMesh.visible = false;
  ceilColliderMesh.position.set(0, ARCH_PEAK_HEIGHT + 0.35, 0);
  const ceilCollider = world.createTransformEntity(ceilColliderMesh);
  ceilCollider.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [W, t, D],
    friction: 0.5,
    restitution: 0.3,
  });
  ceilCollider.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // 3. Great-Room Arched Ceiling with 2 Ceiling Windows (Skylights)
  // Window 1 spans z in [-2.05, -0.45], x in [-1.5, 1.5]
  // Window 2 spans z in [+0.45, +2.05], x in [-1.5, 1.5]
  const archRoot = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), oakTrimMat);
  const glassMat = new MeshStandardMaterial({
    color: new Color(0x9ad4ff),
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.18,
  });
  const windowFrameMat = mat(0x3b2310, 0.45);

  const strips = 12;
  const dx = W / strips; // 0.5m per strip

  const addArchPanel = (
    stripIdx: number,
    zStart: number,
    zEnd: number,
    isWindow: boolean,
  ) => {
    const cx = -W / 2 + (stripIdx + 0.5) * dx;
    const cy = archHeightAtX(cx);
    const angle = archSlopeAngleAtX(cx);
    const segWidth = dx / Math.cos(angle) + 0.012;
    const zLen = zEnd - zStart;
    const cz = (zStart + zEnd) * 0.5;

    const panelMesh = new Mesh(
      new BoxGeometry(segWidth, isWindow ? 0.012 : 0.045, zLen),
      isWindow ? glassMat : oakCeilingMat,
    );
    panelMesh.position.set(cx, cy, cz);
    panelMesh.rotation.z = angle;
    panelMesh.castShadow = false;
    panelMesh.receiveShadow = !isWindow;
    archRoot.add(panelMesh);
  };

  for (let s = 0; s < strips; s++) {
    const isWindowBand = s >= 3 && s <= 8; // x from -1.5m to +1.5m
    if (!isWindowBand) {
      addArchPanel(s, -D / 2, D / 2, false);
    } else {
      // Solid oak ceiling planks around the 2 ceiling windows
      addArchPanel(s, -D / 2, -2.05, false);
      addArchPanel(s, -2.05, -0.45, true); // Ceiling Window 1 (Front Skylight)
      addArchPanel(s, -0.45, 0.45, false); // Central oak arch bridge
      addArchPanel(s, 0.45, 2.05, true);   // Ceiling Window 2 (Back Skylight)
      addArchPanel(s, 2.05, D / 2, false);
    }
  }

  // Exposed curved oak timber arch ribs across the great-room vault
  const ribZPositions = [-2.92, -2.05, -1.25, -0.45, 0, 0.45, 1.25, 2.05, 2.92];
  ribZPositions.forEach((rz) => {
    const isMainTruss =
      Math.abs(rz) < 0.01 ||
      Math.abs(Math.abs(rz) - 2.05) < 0.01 ||
      Math.abs(Math.abs(rz) - 0.45) < 0.01 ||
      Math.abs(Math.abs(rz) - 2.92) < 0.01;
    const ribThickness = isMainTruss ? 0.11 : 0.055;
    const ribDepth = isMainTruss ? 0.14 : 0.065;

    for (let s = 0; s < strips; s++) {
      const cx = -W / 2 + (s + 0.5) * dx;
      const cy = archHeightAtX(cx) - ribDepth * 0.4;
      const angle = archSlopeAngleAtX(cx);
      const segWidth = dx / Math.cos(angle) + 0.015;
      const ribSeg = new Mesh(
        new BoxGeometry(segWidth, ribDepth, ribThickness),
        isMainTruss ? oakTrimMat : windowFrameMat,
      );
      ribSeg.position.set(cx, cy, rz);
      ribSeg.rotation.z = angle;
      ribSeg.castShadow = false;
      archRoot.add(ribSeg);
    }
  });

  // Longitudinal oak ridge beam at the apex (x = 0) and window side frame beams (x = ±1.5m)
  const ridgeBeam = new Mesh(
    new BoxGeometry(0.14, 0.16, D),
    oakTrimMat,
  );
  ridgeBeam.position.set(0, ARCH_PEAK_HEIGHT - 0.05, 0);
  ridgeBeam.castShadow = false;
  archRoot.add(ridgeBeam);

  [-1.5, 1.5].forEach((wx) => {
    const wy = archHeightAtX(wx) - 0.04;
    const angle = archSlopeAngleAtX(wx);
    const purlin = new Mesh(new BoxGeometry(0.1, 0.12, D), oakTrimMat);
    purlin.position.set(wx, wy, 0);
    purlin.rotation.z = angle;
    purlin.castShadow = false;
    archRoot.add(purlin);
  });

  // Bright Daytime Sky Canopy high above the 2 ceiling windows
  const skyCanopy = new Mesh(
    new BoxGeometry(18, 0.08, 12),
    new MeshStandardMaterial({
      color: new Color(0x68b9ff),
      emissive: new Color(0x4aa3f0),
      emissiveIntensity: 0.75,
      roughness: 1.0,
    }),
  );
  skyCanopy.position.set(0, 6.7, 0);
  skyCanopy.castShadow = false;
  skyCanopy.receiveShadow = false;
  archRoot.add(skyCanopy);

  world.createTransformEntity(archRoot);

  // 4. Fluffy 3D Clouds that float across the sky above the two ceiling windows
  const cloudConfigs: Array<{ x: number; y: number; z: number; speed: number; scale: number }> = [
    { x: -3.2, y: 5.15, z: -1.25, speed: 0.42, scale: 1.0 },
    { x: 1.4, y: 5.45, z: -1.1, speed: 0.34, scale: 1.15 },
    { x: -1.1, y: 5.1, z: 1.2, speed: 0.48, scale: 0.95 },
    { x: 3.6, y: 5.38, z: 1.35, speed: 0.38, scale: 1.1 },
    { x: -6.0, y: 5.3, z: -1.35, speed: 0.45, scale: 1.05 },
    { x: 6.2, y: 5.22, z: 1.1, speed: 0.4, scale: 0.9 },
  ];

  const cloudMat = new MeshStandardMaterial({
    color: new Color(0xffffff),
    emissive: new Color(0xdceeff),
    emissiveIntensity: 0.35,
    roughness: 0.85,
  });

  const puffOffsets: Array<[number, number, number, number]> = [
    [0, 0.08, 0, 0.46],
    [-0.38, 0.0, 0.06, 0.36],
    [0.4, 0.02, -0.04, 0.38],
    [-0.18, 0.2, -0.1, 0.34],
    [0.2, 0.18, 0.12, 0.35],
    [-0.65, -0.06, -0.05, 0.28],
    [0.68, -0.05, 0.08, 0.29],
  ];

  cloudConfigs.forEach((cfg, idx) => {
    const rootPuff = new Mesh(
      new SphereGeometry(0.46 * cfg.scale, 18, 14),
      cloudMat,
    );
    rootPuff.scale.set(1.25, 0.72, 0.95);
    rootPuff.position.set(cfg.x, cfg.y, cfg.z);
    rootPuff.castShadow = false;

    for (let p = 1; p < puffOffsets.length; p++) {
      const [px, py, pz, pr] = puffOffsets[p];
      const puff = new Mesh(
        new SphereGeometry(pr * cfg.scale, 16, 12),
        cloudMat,
      );
      puff.position.set(px * cfg.scale, py * cfg.scale, pz * cfg.scale);
      puff.castShadow = false;
      rootPuff.add(puff);
    }

    const ce = world.createTransformEntity(rootPuff);
    ce.addComponent(SkyCloud, {
      speed: cfg.speed,
      baseY: cfg.y,
      phase: idx * 1.3,
    });
  });
}

/** Gently drifts the 3D clouds across the sky above the arched ceiling windows. */
export class CloudSystem extends createSystem({
  clouds: { required: [SkyCloud] },
}) {
  update(delta: number, time: number) {
    const dt = Math.min(delta, 0.05);
    for (const e of this.queries.clouds.entities) {
      const obj = e.object3D;
      if (!obj) continue;
      const speed = e.getValue(SkyCloud, 'speed') ?? 0.4;
      const baseY = e.getValue(SkyCloud, 'baseY') ?? 5.2;
      const phase = e.getValue(SkyCloud, 'phase') ?? 0;

      obj.position.x += speed * dt;
      if (obj.position.x > 7.8) {
        obj.position.x = -7.8;
      }
      obj.position.y = baseY + Math.sin(time * 0.7 + phase) * 0.06;
    }
  }
}

// ---- Floating Mario-style Stretchy Head (behind the player at +Z) ----------
const HEAD_POS = { x: 0, y: 1.52, z: 1.65 };
const FACE_BTN_POS: [number, number, number] = [-0.52, 1.48, 1.52];
const SKIN_COLOR = 0xffcca3;
const SKIN_ROSY = 0xffb38a;
const HAIR_BROWN = 0x3d1e0d;
const MARIO_RED = 0xe62314;

/**
 * Builds a floating Mario-like head behind the player (+Z, facing -Z) with 10
 * grabbable/pullable stretchy parts:
 * 0=Nose, 1=Left Cheek, 2=Right Cheek, 3=Mustache, 4=Hat,
 * 5=Left Ear, 6=Right Ear, 7=Left Eyelid, 8=Right Eyelid, 9=Chin
 * plus a floating elastic-snap reset button beside the head.
 */
function buildStretchyHead(world: World) {
  const { x: hx, y: hy, z: hz } = HEAD_POS;

  // Static cranium base
  const headBase = new Mesh(
    new SphereGeometry(0.22, 32, 24),
    mat(SKIN_COLOR, 0.55),
  );
  headBase.position.set(hx, hy, hz);
  headBase.castShadow = true;

  // Back hair & sideburns (dark brown)
  const backHair = new Mesh(
    new SphereGeometry(0.226, 24, 18),
    mat(HAIR_BROWN, 0.7),
  );
  backHair.position.set(0, -0.01, 0.035);
  headBase.add(backHair);

  [-1, 1].forEach((side) => {
    const sideburn = new Mesh(
      new BoxGeometry(0.035, 0.1, 0.065),
      mat(HAIR_BROWN, 0.7),
    );
    sideburn.position.set(side * 0.2, 0.0, -0.05);
    headBase.add(sideburn);

    // Eyes (sclera + blue iris + pupil + highlight) facing -Z
    const sclera = new Mesh(
      new SphereGeometry(0.042, 20, 16),
      mat(0xffffff, 0.25),
    );
    sclera.scale.set(0.95, 1.15, 0.65);
    sclera.position.set(side * 0.075, 0.04, -0.195);
    headBase.add(sclera);

    const iris = new Mesh(
      new SphereGeometry(0.025, 16, 12),
      mat(0x1b75ff, 0.2),
    );
    iris.scale.set(0.95, 1.1, 0.55);
    iris.position.set(side * 0.075, 0.04, -0.214);
    headBase.add(iris);

    const pupil = new Mesh(
      new SphereGeometry(0.014, 14, 10),
      mat(0x111111, 0.15),
    );
    pupil.scale.set(1, 1.1, 0.5);
    pupil.position.set(side * 0.075, 0.04, -0.222);
    headBase.add(pupil);
  });

  // Smiling mouth under the mustache
  const mouth = new Mesh(
    new SphereGeometry(0.048, 16, 12),
    mat(0x8a2be2, 0.6),
  );
  mouth.material = mat(0x7a1c1c, 0.6);
  mouth.scale.set(1.3, 0.45, 0.5);
  mouth.position.set(0, -0.125, -0.195);
  headBase.add(mouth);

  world.createTransformEntity(headBase);

  // Floating Reset Button next to the head (also holds the 10 stretch-bridge meshes)
  const btnHousing = new Mesh(
    new CylinderGeometry(0.075, 0.075, 0.03, 32),
    mat(0xf2c94c, 0.35),
  );
  btnHousing.geometry.rotateX(Math.PI / 2);
  btnHousing.position.set(...FACE_BTN_POS);

  const btnCapGeo = new CylinderGeometry(0.056, 0.056, 0.028, 32);
  btnCapGeo.rotateX(Math.PI / 2);
  const btnCap = new Mesh(btnCapGeo, mat(0x2ecc71, 0.3));
  btnCap.name = 'face-reset-cap';
  btnCap.position.set(0, 0, -0.018);
  btnHousing.add(btnCap);

  // Helper to spawn a grabbable, pullable FacePart + its companion elastic bridge
  const addFacePart = (
    partId: number,
    mesh: Mesh,
    home: [number, number, number],
    bridgeColor: number,
    baseRadius: number,
  ) => {
    mesh.position.set(...home);
    mesh.castShadow = true;
    const e = world.createTransformEntity(mesh);
    e.addComponent(OneHandGrabbable);
    e.addComponent(RayInteractable);
    e.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    e.addComponent(FacePart, {
      partId,
      snapping: false,
      baseRadius,
    });
    e.getVectorView(FacePart, 'home').set(home);

    const bridge = new Mesh(
      new CylinderGeometry(1, 1, 1, 16),
      mat(bridgeColor, 0.55),
    );
    bridge.name = `stretch-bridge-${partId}`;
    bridge.visible = false;
    bridge.raycast = () => {};
    btnHousing.add(bridge);
  };

  // 0. Nose (big round Mario nose in front)
  const noseGeo = new SphereGeometry(0.068, 24, 18);
  noseGeo.scale(1.05, 0.92, 1.18);
  const nose = new Mesh(noseGeo, mat(SKIN_ROSY, 0.45));
  addFacePart(0, nose, [hx, hy - 0.015, hz - 0.255], SKIN_ROSY, 0.046);

  // 1 & 2. Left Cheek & Right Cheek
  [-1, 1].forEach((side, idx) => {
    const cheekGeo = new SphereGeometry(0.062, 20, 16);
    cheekGeo.scale(1.05, 0.95, 0.95);
    const cheek = new Mesh(cheekGeo, mat(SKIN_ROSY, 0.5));
    addFacePart(
      1 + idx,
      cheek,
      [hx + side * 0.135, hy - 0.065, hz - 0.175],
      SKIN_ROSY,
      0.042,
    );
  });

  // 3. Mustache (bushy multi-lobed dark brown Mario mustache under the nose)
  const stacheCenterGeo = new SphereGeometry(0.046, 18, 14);
  stacheCenterGeo.scale(1.4, 0.65, 0.85);
  const mustache = new Mesh(stacheCenterGeo, mat(HAIR_BROWN, 0.65));
  const lobeOffsets: Array<[number, number, number, number]> = [
    [-0.055, -0.004, 0.008, 0.044],
    [0.055, -0.004, 0.008, 0.044],
    [-0.105, 0.008, 0.024, 0.038],
    [0.105, 0.008, 0.024, 0.038],
  ];
  lobeOffsets.forEach(([lx, ly, lz, lr]) => {
    const lobeGeo = new SphereGeometry(lr, 16, 12);
    lobeGeo.scale(1.2, 0.72, 0.8);
    const lobe = new Mesh(lobeGeo, mat(HAIR_BROWN, 0.65));
    lobe.position.set(lx, ly, lz);
    mustache.add(lobe);
  });
  addFacePart(3, mustache, [hx, hy - 0.088, hz - 0.225], HAIR_BROWN, 0.042);

  // 4. Hat (iconic red Mario cap with visor and white 'M' emblem)
  const hatCrownGeo = new SphereGeometry(0.235, 28, 18);
  hatCrownGeo.scale(1.04, 0.58, 1.1);
  const hat = new Mesh(hatCrownGeo, mat(MARIO_RED, 0.5));

  const brimGeo = new CylinderGeometry(0.185, 0.185, 0.022, 24);
  brimGeo.scale(1.1, 1, 0.85);
  const brim = new Mesh(brimGeo, mat(MARIO_RED, 0.45));
  brim.position.set(0, -0.055, -0.145);
  brim.rotation.x = 0.12;
  hat.add(brim);

  const badgeGeo = new CylinderGeometry(0.055, 0.055, 0.012, 24);
  badgeGeo.rotateX(Math.PI / 2);
  const badge = new Mesh(badgeGeo, mat(0xffffff, 0.3));
  badge.position.set(0, 0.015, -0.242);
  hat.add(badge);

  // Red 'M' bars on the white hat badge
  const mMat = mat(MARIO_RED, 0.3);
  [-0.022, 0.022].forEach((mx) => {
    const leg = new Mesh(new BoxGeometry(0.01, 0.042, 0.006), mMat);
    leg.position.set(mx, 0, -0.006);
    badge.add(leg);
  });
  [-1, 1].forEach((side) => {
    const diag = new Mesh(new BoxGeometry(0.009, 0.028, 0.006), mMat);
    diag.position.set(side * 0.009, 0.004, -0.006);
    diag.rotation.z = side * 0.45;
    badge.add(diag);
  });
  addFacePart(4, hat, [hx, hy + 0.165, hz - 0.01], MARIO_RED, 0.085);

  // 5 & 6. Left Ear & Right Ear
  [-1, 1].forEach((side, idx) => {
    const earGeo = new SphereGeometry(0.06, 20, 16);
    earGeo.scale(0.5, 1.15, 0.9);
    const ear = new Mesh(earGeo, mat(SKIN_COLOR, 0.5));
    const innerEar = new Mesh(
      new SphereGeometry(0.034, 14, 10),
      mat(SKIN_ROSY, 0.6),
    );
    innerEar.scale.set(0.45, 1.0, 0.8);
    innerEar.position.set(side * 0.012, 0, -0.008);
    ear.add(innerEar);
    addFacePart(
      5 + idx,
      ear,
      [hx + side * 0.23, hy - 0.005, hz - 0.01],
      SKIN_COLOR,
      0.036,
    );
  });

  // 7 & 8. Left Eyelid & Right Eyelid (with arched eyebrows on top)
  [-1, 1].forEach((side, idx) => {
    const lidGeo = new SphereGeometry(0.048, 18, 12);
    lidGeo.scale(1.12, 0.52, 0.85);
    const eyelid = new Mesh(lidGeo, mat(SKIN_ROSY, 0.5));

    const brow = new Mesh(
      new BoxGeometry(0.082, 0.022, 0.032),
      mat(HAIR_BROWN, 0.65),
    );
    brow.position.set(0, 0.026, -0.012);
    brow.rotation.z = side * -0.12;
    eyelid.add(brow);

    addFacePart(
      7 + idx,
      eyelid,
      [hx + side * 0.075, hy + 0.078, hz - 0.195],
      SKIN_ROSY,
      0.028,
    );
  });

  // 9. Chin (rounded bottom jaw/chin)
  const chinGeo = new SphereGeometry(0.064, 20, 16);
  chinGeo.scale(1.25, 0.82, 1.02);
  const chin = new Mesh(chinGeo, mat(SKIN_COLOR, 0.5));
  addFacePart(9, chin, [hx, hy - 0.185, hz - 0.155], SKIN_COLOR, 0.044);

  const btnEntity = world.createTransformEntity(btnHousing);
  btnEntity.addComponent(RayInteractable);
  btnEntity.addComponent(FaceResetButton);
}

/**
 * Handles stretching & holding Mario's face parts when pulled, and snaps them
 * back like an underdamped elastic band (wobbling back and forth) when the
 * floating reset button is pressed.
 */
export class StretchyFaceSystem extends createSystem({
  parts: { required: [FacePart] },
  resetBtns: { required: [FaceResetButton] },
  pressedReset: { required: [FaceResetButton, Pressed] },
}) {
  private disp = new Vector3();
  private dir = new Vector3();
  private upAxis = new Vector3(0, 1, 0);
  private forward = new Vector3(0, 0, -1);
  private bridgeRot = new Quaternion();
  private partRot = new Quaternion();
  private identityRot = new Quaternion();

  init() {
    this.cleanupFuncs.push(
      this.queries.pressedReset.subscribe('qualify', () => this.snapAllBack()),
    );
  }

  snapAllBack() {
    for (const e of this.queries.parts.entities) {
      if (e.hasComponent(Grabbed)) continue;
      const obj = e.object3D;
      const h = e.getVectorView(FacePart, 'home');
      const v = e.getVectorView(FacePart, 'vel');
      if (obj) {
        const dx = obj.position.x - h[0];
        const dy = obj.position.y - h[1];
        const dz = obj.position.z - h[2];
        const dist = Math.hypot(dx, dy, dz);
        // Even if a part wasn't pulled far, give it a fun little elastic boing
        if (dist < 0.02) {
          v.set([0, 0, -0.9]);
        } else {
          v.set([0, 0, 0]);
        }
      }
      e.setValue(FacePart, 'snapping', true);
    }
  }

  update(delta: number) {
    const dt = Math.min(Math.max(delta, 0.004), 0.033);
    const stiffness = 145; // high spring stiffness for fast elastic snap
    const damping = 4.0; // low damping so parts overshoot and wobble back & forth

    let btnRoot: Mesh | undefined;
    for (const b of this.queries.resetBtns.entities) {
      btnRoot = b.object3D as Mesh | undefined;
      const cap = btnRoot?.getObjectByName('face-reset-cap');
      if (cap) {
        cap.position.z = b.hasComponent(Pressed) ? -0.008 : -0.018;
      }
    }

    for (const e of this.queries.parts.entities) {
      const obj = e.object3D;
      if (!obj) continue;

      const partId = e.getValue(FacePart, 'partId') ?? 0;
      const baseRadius = e.getValue(FacePart, 'baseRadius') ?? 0.04;
      const h = e.getVectorView(FacePart, 'home');
      const v = e.getVectorView(FacePart, 'vel');
      const isGrabbed = e.hasComponent(Grabbed);

      if (isGrabbed) {
        // While grabbed, cancel any active snap-back and clamp max pull distance
        if (e.getValue(FacePart, 'snapping')) {
          e.setValue(FacePart, 'snapping', false);
        }
        v.set([0, 0, 0]);
        this.disp.set(
          obj.position.x - h[0],
          obj.position.y - h[1],
          obj.position.z - h[2],
        );
        const maxPull = 0.85;
        if (this.disp.length() > maxPull) {
          this.disp.setLength(maxPull);
          obj.position.set(
            h[0] + this.disp.x,
            h[1] + this.disp.y,
            h[2] + this.disp.z,
          );
        }
      } else if (e.getValue(FacePart, 'snapping')) {
        // Underdamped Hooke's law spring: accelerates toward home, overshoots, and wobbles
        const dx = obj.position.x - h[0];
        const dy = obj.position.y - h[1];
        const dz = obj.position.z - h[2];

        const ax = -stiffness * dx - damping * v[0];
        const ay = -stiffness * dy - damping * v[1];
        const az = -stiffness * dz - damping * v[2];

        v[0] += ax * dt;
        v[1] += ay * dt;
        v[2] += az * dt;

        obj.position.x += v[0] * dt;
        obj.position.y += v[1] * dt;
        obj.position.z += v[2] * dt;

        const remDistSq =
          (obj.position.x - h[0]) ** 2 +
          (obj.position.y - h[1]) ** 2 +
          (obj.position.z - h[2]) ** 2;
        const velSq = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        if (remDistSq < 0.000002 && velSq < 0.0002) {
          obj.position.set(h[0], h[1], h[2]);
          v.set([0, 0, 0]);
          e.setValue(FacePart, 'snapping', false);
        }
      }
      // Note: when neither grabbed nor snapping, obj.position holds its pulled position!

      // Update rubbery part deformation and elastic connecting bridge
      this.disp.set(
        obj.position.x - h[0],
        obj.position.y - h[1],
        obj.position.z - h[2],
      );
      const dist = this.disp.length();
      const bridge = btnRoot?.getObjectByName(`stretch-bridge-${partId}`);

      if (dist > 0.003) {
        this.dir.copy(this.disp).divideScalar(dist);

        // Stretch the pulled part slightly along the pull direction and squash perpendicular
        const stretch = 1 + Math.min(dist * 1.15, 0.75);
        const squash = 1 / Math.sqrt(stretch);
        obj.scale.set(squash, squash, stretch);

        this.partRot.setFromUnitVectors(this.forward, this.dir);
        obj.quaternion.copy(this.identityRot).slerp(
          this.partRot,
          Math.min(dist * 1.8, 0.45),
        );

        if (bridge) {
          bridge.visible = true;
          const midX = (h[0] + obj.position.x) * 0.5;
          const midY = (h[1] + obj.position.y) * 0.5;
          const midZ = (h[2] + obj.position.z) * 0.5;
          bridge.position.set(
            midX - FACE_BTN_POS[0],
            midY - FACE_BTN_POS[1],
            midZ - FACE_BTN_POS[2],
          );
          this.bridgeRot.setFromUnitVectors(this.upAxis, this.dir);
          bridge.quaternion.copy(this.bridgeRot);
          const taper = baseRadius / Math.sqrt(1 + dist * 2.2);
          bridge.scale.set(taper, dist, taper);
        }
      } else {
        obj.scale.set(1, 1, 1);
        obj.quaternion.identity();
        if (bridge) {
          bridge.visible = false;
        }
      }
    }
  }
}
