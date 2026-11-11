import {
  BoxGeometry as FlatBox,
  CanvasTexture,
  Color,
  DirectionalLight,
  DistanceGrabbable,
  DoubleSide,
  Entity,
  Grabbed,
  Group,
  HemisphereLight,
  InputComponent,
  LocomotionEnvironment,
  LocomotionSystem,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  Object3D,
  OneHandGrabbable,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  PointLight,
  Pressed,
  Quaternion,
  RayInteractable,
  RepeatWrapping,
  Vector3,
  World,
  createSystem,
} from '@iwsdk/core';
import {
  CarnivalStriker,
  Dart,
  FacePart,
  FaceResetButton,
  HoopBall,
  Mole,
  RCCar,
  RCControl,
  RCRemote,
  ReflexBag,
  ResetButton,
  Resettable,
  ScorePip,
  SettingsButton,
  SettingsMenu,
  SkyCloud,
  ToyMallet,
  XylophoneBar,
} from './ball-components.js';
import { buildMaze, mazeHooks } from './maze.js';
import { buildProceduralArena } from './procedural/arena.js';
import { buildDecor } from './procedural/decor.js';
import { buildShowcase } from './procedural/showcase.js';
import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  buildTable,
  canGeometry,
  canLabel,
  barStuds,
  bellGeometry,
  brass,
  canLid,
  coilSpring,
  fingerHoles,
  hoopDetail,
  moleFace,
  pinGeometry,
  detailCar,
  detailDartboard,
  detailedDart,
} from './procedural/geometry.js';
import {
  bagBase,
  bagGeometry,
  bagTrim,
  hammerDetail,
  hollow,
  hoopDress,
  laneMarkings,
  moleCabinet,
  moleMarquee,
  pedestal,
  strikerDress,
  xyloFrame,
} from './procedural/stations.js';
import { setTextureRenderer } from './procedural/textures.js';
import { buildProceduralEnvironment, procEnv } from './procedural/env.js';
import {
  basketball,
  canMetal,
  floorPlanks,
  leather,
  plaster,
  oak,
  plastic,
  rubberBall,
  skylightGlass,
} from './procedural/materials.js';

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
  return plastic(color, roughness);
}

/** A fixed box the balls bounce off (floor, walls, table). */
function staticBox(
  world: World,
  size: [number, number, number],
  pos: [number, number, number],
  color: number,
  castShadow = true,
): Entity {
  // Brown-toned blocks (lane, rails, stands) are real varnished wood; the rest stay moulded plastic
  const tone = new Color(color);
  const woody = tone.r > tone.g * 1.15 && tone.g > tone.b * 1.15 && tone.r > 0.06;
  const material = woody
    ? oak('#000000', `#${tone.getHexString()}`, 1, Math.max(1, Math.round(Math.max(...size) / 1.5)), 0.36, size[0] > 0.5 ? 4 : 0)
    : mat(color);
  const mesh = new Mesh(new BoxGeometry(...size), material);
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
  return e;
}

export function buildRoom(world: World) {
  const { depth: D } = ROOM;

  setTextureRenderer(world.renderer);
  // Procedural sky dome, lamps, light shafts (all shader / code generated)
  buildProceduralEnvironment(world);

  // Tiled light-gray floor, oak wood paneled walls, arched ceiling with 2 skylights & 3D clouds
  buildArchitecture(world);
  buildDecor();
  buildShowcase(world);

  // Table in front of the player
  const tableEntity = staticBox(
    world,
    [TABLE.width, TABLE.height, TABLE.depth],
    [0, TABLE.height / 2, TABLE.z],
    0x6b4a2f,
  );
  {
    // Swap the plain block for a modelled table (the box collider is unchanged)
    const tableMesh = tableEntity.object3D as Mesh;
    const legWood = oak('#5e3c1f', '#b07a48', 1, 1, 0.4);
    const topWood = oak('#5e3c1f', '#b07a48', 1, 2, 0.34, 4, Math.PI / 2);
    const table = buildTable(TABLE.width, TABLE.height, TABLE.depth, legWood, topWood);
    tableMesh.geometry.dispose();
    tableMesh.geometry = table.top;
    tableMesh.material = topWood;
    tableMesh.add(table.parts);
  }
  const tableTop = TABLE.height;

  // Balls on the back-left of the table: squeeze (grip) to grab up close, or point + trigger from afar
  BALL_COLORS.forEach((color, i) => {
    const ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 48, 24),
      rubberBall(color),
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
    e.addComponent(HoopBall, { prevY: home[1], cooldown: 0 });
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
        canGeometry(canR, canH),
        canMetal(row === 2 ? 0xff8c1a : 0x3fbf7f, canLabel(row === 2 ? 'ZAP!' : 'FIZZ')),
      );
      can.add(canLid(canR, canH, canMetal(0xdfe3e8)));
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

  // 5 Interactive Toy Stations around the perimeter of the room
  buildFiveToyStations(world);

  // 3-Lines Menu Button & Floating VR Settings Menu (Day/Night + Girl/Boy Hand Tracking Hands)
  buildSettingsMenuAndLauncher(world, tableTop);

  // Spooky doorway on the far wall that leads to the cake maze (the maze itself lives far away)
  mazeHooks.isRoomActive = () => !(sceneSkyRefs.gorillaTagMapGroup?.visible ?? false);
  buildMaze(world);
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

  detailCar(carChassis, carW, carH, carD);
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
  return detailedDart(color, DART_WIDTH);
}

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

  // Wooden support post so the dartboard stands solidly inside the Giant Stump too
  const post = new Mesh(new CylinderGeometry(0.045, 0.055, y, 16), mat(0x5c3a21, 0.7));
  post.position.set(0, -y / 2, -thickness * 0.4);
  board.add(post);
  detailDartboard(board, radius, thickness, oak('#5e3c1f', '#b07a48', 6, 1, 0.45));

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
  // Polished marble-veined stone tiles: albedo, normal and roughness are all synthesized.
  return floorPlanks();
}

function createOakMaterial(
  _baseHex = '#a86b32',
  darkHex = '#7c491b',
  lightHex = '#c28447',
  repeatX = 2,
  repeatY = 1,
  roughness = 0.55,
): MeshStandardMaterial {
  return oak(darkHex, lightHex, repeatX, repeatY, roughness);
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
  const plasterMat = plaster(3, 1.5);
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
    const wallMesh = new Mesh(new BoxGeometry(...size), plasterMat);
    // Oak backing for the wainscot (the wall above the chair rail is painted plaster)
    const wainscot = new Mesh(
      alongX ? new BoxGeometry(W, 1.06, 0.012) : new BoxGeometry(0.012, 1.06, D),
      oakWallMat,
    );
    wainscot.position.set(
      alongX ? 0 : (t / 2 + 0.003) * inwardSign,
      -H / 2 + 0.56,
      alongX ? (t / 2 + 0.003) * inwardSign : 0,
    );
    wallMesh.add(wainscot);
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
        ? new BoxGeometry(0.07, 1.06, 0.02)
        : new BoxGeometry(0.02, 1.06, 0.07);
      const stile = new Mesh(stileGeo, oakTrimMat);
      stile.position.set(
        alongX ? coord : faceOffset,
        -H / 2 + 0.56,
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
        void upperPanel; // upper wall is flat plaster now
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
            new FlatBox(stripW + 0.01, archH, t),
            plasterMat,
          );
          gableStrip.position.set(sx, H / 2 + archH / 2, 0);
          gableStrip.castShadow = true;
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
    sceneSkyRefs.wallColliders.push({ entity: we, mesh: wallMesh, homePos: pos });
  };

  sceneSkyRefs.floorEntity = floorEntity;
  sceneSkyRefs.floorMesh = floorMesh;
  sceneSkyRefs.wallColliders.length = 0;

  addOakWall([W, H, t], [0, H / 2, -D / 2 - t / 2], true, 1);  // Far wall (-Z)
  addOakWall([W, H, t], [0, H / 2, D / 2 + t / 2], true, -1);  // Back wall (+Z)
  addOakWall([t, H, D], [-W / 2 - t / 2, H / 2, 0], false, 1); // Left wall (-X)
  addOakWall([t, H, D], [W / 2 + t / 2, H / 2, 0], false, -1); // Right wall (+X)

  // Invisible high physics ceiling collider above the arch peak to keep high throws in bounds
  const ceilHomePos: [number, number, number] = [0, ARCH_PEAK_HEIGHT + 0.35, 0];
  const ceilColliderMesh = new Mesh(new BoxGeometry(W, t, D), oakTrimMat);
  ceilColliderMesh.visible = false;
  ceilColliderMesh.position.set(...ceilHomePos);
  const ceilCollider = world.createTransformEntity(ceilColliderMesh);
  ceilCollider.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [W, t, D],
    friction: 0.5,
    restitution: 0.3,
  });
  ceilCollider.addComponent(PhysicsBody, { state: PhysicsState.Static });
  sceneSkyRefs.ceilCollider = { entity: ceilCollider, homePos: ceilHomePos };

  // 3. Great-Room Arched Ceiling with 2 Ceiling Windows (Skylights)
  // Window 1 spans z in [-2.05, -0.45], x in [-1.5, 1.5]
  // Window 2 spans z in [+0.45, +2.05], x in [-1.5, 1.5]
  const archRoot = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), oakTrimMat);
  const indoorArchGroup = new Group();
  archRoot.add(indoorArchGroup);
  sceneSkyRefs.indoorArchGroup = indoorArchGroup;

  const glassMat = skylightGlass();
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
    panelMesh.castShadow = !isWindow;
    panelMesh.receiveShadow = !isWindow;
    indoorArchGroup.add(panelMesh);
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
      ribSeg.castShadow = true;
      indoorArchGroup.add(ribSeg);
    }
  });

  // Longitudinal oak ridge beam at the apex (x = 0) and window side frame beams (x = ±1.5m)
  const ridgeBeam = new Mesh(
    new BoxGeometry(0.14, 0.16, D),
    oakTrimMat,
  );
  ridgeBeam.position.set(0, ARCH_PEAK_HEIGHT - 0.05, 0);
  ridgeBeam.castShadow = true;
  indoorArchGroup.add(ridgeBeam);

  [-1.5, 1.5].forEach((wx) => {
    const wy = archHeightAtX(wx) - 0.04;
    const angle = archSlopeAngleAtX(wx);
    const purlin = new Mesh(new BoxGeometry(0.1, 0.12, D), oakTrimMat);
    purlin.position.set(wx, wy, 0);
    purlin.rotation.z = angle;
    purlin.castShadow = true;
    indoorArchGroup.add(purlin);
  });

  // Bright Daytime Sky Canopy high above the 2 ceiling windows
  const skyCanopyMat = new MeshStandardMaterial({
    color: new Color(0x68b9ff),
    emissive: new Color(0x4aa3f0),
    emissiveIntensity: 0.75,
    roughness: 1.0,
    side: DoubleSide,
  });
  const skyCanopy = new Mesh(new BoxGeometry(18, 0.08, 12), skyCanopyMat);
  skyCanopy.position.set(0, 6.7, 0);
  skyCanopy.castShadow = false;
  skyCanopy.receiveShadow = false;
  archRoot.add(skyCanopy);
  skyCanopy.visible = false; // replaced by the procedural sky shader
  sceneSkyRefs.skyCanopy = skyCanopy;

  // Nighttime Moon & Starfield canopy just below the sky canopy (visible through skylights at night)
  const nightSkyGroup = new Group();
  nightSkyGroup.visible = false;
  const moonMat = new MeshStandardMaterial({
    color: new Color(0xfff8d6),
    emissive: new Color(0xffeaa0),
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const moonMesh = new Mesh(new SphereGeometry(0.42, 24, 18), moonMat);
  moonMesh.scale.set(1, 0.35, 1);
  moonMesh.position.set(-0.65, 6.35, -1.18);
  nightSkyGroup.add(moonMesh);

  const starMat = new MeshStandardMaterial({
    color: new Color(0xffffff),
    emissive: new Color(0xdbeafe),
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const starGeo = new SphereGeometry(0.032, 8, 8);
  for (let i = 0; i < 48; i++) {
    const star = new Mesh(starGeo, starMat);
    const sx = ((i * 73) % 100) * 0.08 - 4.0;
    const sz = ((i * 41) % 100) * 0.056 - 2.8;
    const sScale = 0.65 + (i % 4) * 0.28;
    star.scale.setScalar(sScale);
    star.position.set(sx, 6.48, sz);
    nightSkyGroup.add(star);
  }
  const indoorNightLight = new PointLight(0xffb86c, 0, 9.5, 1.4);
  indoorNightLight.position.set(0, 3.3, 0);
  archRoot.add(indoorNightLight);
  nightSkyGroup.clear(); // moon and stars are drawn by the sky shader
  indoorNightLight.shadow.mapSize.set(1024, 1024);
  indoorNightLight.shadow.bias = -0.004;
  indoorNightLight.shadow.normalBias = 0.06;
  procEnv.mainLamp = indoorNightLight;
  archRoot.add(nightSkyGroup);

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

  sceneSkyRefs.skyCanopyMat = skyCanopyMat;
  sceneSkyRefs.cloudMat = cloudMat;
  sceneSkyRefs.glassMat = glassMat;
  sceneSkyRefs.nightSkyGroup = nightSkyGroup;
  sceneSkyRefs.indoorNightLight = indoorNightLight;

  const puffOffsets: Array<[number, number, number, number]> = [
    [0, 0.08, 0, 0.46],
    [-0.38, 0.0, 0.06, 0.36],
    [0.4, 0.02, -0.04, 0.38],
    [-0.18, 0.2, -0.1, 0.34],
    [0.2, 0.18, 0.12, 0.35],
    [-0.65, -0.06, -0.05, 0.28],
    [0.68, -0.05, 0.08, 0.29],
  ];

  // Clouds are part of the sky shader now, so no puff meshes are spawned.
  cloudConfigs.slice(0, 0).forEach((cfg, idx) => {
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

  // 5. Gorilla Tag Map (Giant Stump centered at (0,0,0) with Forest, Gazebo, Treehouse, Canyon & Crystal Cave)
  const gorillaTagMapGroup = new Group();
  gorillaTagMapGroup.name = 'gorilla-tag-map-root';
  gorillaTagMapGroup.visible = false; // Visible when Monke Map is enabled

  const gorillaTagWalkableGroup = new Group();
  gorillaTagWalkableGroup.name = 'gorilla-tag-walkable-env';
  gorillaTagWalkableGroup.visible = false;

  // The arena is generated in code (see procedural/arena.ts): no model file is loaded.
  const arena = buildProceduralArena();
  arena.traverse((child: Object3D) => {
    const m = child as Mesh;
    if (!m.isMesh) return;
    const matName = (m.material as MeshStandardMaterial)?.name ?? '';
    if (!matName.includes('leaves')) {
      const walkProxy = new Mesh(m.geometry);
      walkProxy.visible = false;
      gorillaTagWalkableGroup.add(walkProxy);
    }
  });
  gorillaTagMapGroup.add(arena);
  buildGorillaMapSpatialGrid(arena);

  // Warm ambient point light inside the Giant Stump so all objects inside the stump are well-lit
  const stumpInteriorLight = new PointLight(0xfff1d6, 0.6, 9.0, 1.4);
  stumpInteriorLight.position.set(0, 3.8, 0);
  gorillaTagMapGroup.add(stumpInteriorLight);

  world.createTransformEntity(gorillaTagMapGroup);
  const gorillaWalkEntity = world.createTransformEntity(gorillaTagWalkableGroup);
  sceneSkyRefs.gorillaTagMapGroup = gorillaTagMapGroup;
  sceneSkyRefs.gorillaTagWalkableEntity = gorillaWalkEntity;
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

// ---- 5 Interactive Toy Stations around the Room ----------------------------
// 1. Arcade Basketball Hoop + Basketball + LED Scoreboard (Left Wall Front)
// 2. Mini Bowling Lane + 6 Bowling Pins + Bowling Ball (Right Wall)
// 3. 8-Note Rainbow Musical Xylophone + 2 Mallets (Left Center Stand)
// 4. Whack-a-Mole Arcade Cabinet + Foam Hammer (Left Wall Back)
// 5. Boxing Reflex Speed-Bag + Carnival High-Striker Bell Tower (Right Back)

const HOOP_RIM_POS = { x: -2.42, y: 1.92, z: -1.45, radius: 0.23 };
const STRIKER_POS = { x: 1.85, z: 2.15, bellY: 2.28 };
const BAG_BASE_POS = { x: 1.15, y: 0.04, z: 2.15 };

let sharedAudioCtx: AudioContext | null = null;
function playSynthTone(
  freq: number,
  duration = 0.32,
  type: OscillatorType = 'sine',
  slideToFreq = 0,
) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration);
    }
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Ignore audio context restrictions before user gesture
  }
}

function buildFiveToyStations(world: World) {
  // ==========================================================================
  // STATION 1: Arcade Basketball Hoop + Basketball & LED Scoreboard (Left Wall)
  // ==========================================================================
  const bbZ = HOOP_RIM_POS.z;
  // Backboard mounted on left wall (-X, facing +X) + floor support post for Giant Stump
  staticBox(world, [0.04, 0.78, 1.1], [-2.86, 2.12, bbZ], 0xf1f1ec);
  world.createTransformEntity(hoopDress(-2.84, 2.12, bbZ, HOOP_RIM_POS));
  const hoopPost = new Mesh(new CylinderGeometry(0.048, 0.058, 2.12, 16), mat(0x1c1e22, 0.35));
  hoopPost.position.set(-2.9, 1.06, bbZ);
  world.createTransformEntity(hoopPost);
  world.createTransformEntity(
    hoopDetail(HOOP_RIM_POS.x, HOOP_RIM_POS.y, HOOP_RIM_POS.z, HOOP_RIM_POS.radius),
  );
  // Orange steel rim made of 8 static collider segments so balls bounce off the rim
  const rimR = HOOP_RIM_POS.radius;
  const rimSegs = 8;
  for (let i = 0; i < rimSegs; i++) {
    const a = (i / rimSegs) * Math.PI * 2;
    const rx = HOOP_RIM_POS.x + Math.cos(a) * rimR;
    const rz = HOOP_RIM_POS.z + Math.sin(a) * rimR;
    // Collider only: the visible rim is the steel ring in hoopDetail
    staticBox(world, [0.055, 0.03, 0.14], [rx, HOOP_RIM_POS.y, rz], 0xff5722, false).object3D!.visible = false;
  }

  // 5 Score LED Pips above the backboard
  for (let i = 0; i < 5; i++) {
    const pip = new Mesh(
      new SphereGeometry(0.038, 16, 12),
      mat(0x2b303a, 0.3),
    );
    pip.position.set(-2.82, 2.58, bbZ - 0.32 + i * 0.16);
    const pe = world.createTransformEntity(pip);
    pe.addComponent(ScorePip, { station: 1, index: i });
  }

  // Ball pedestal + full-size Orange Basketball
  {
    const ped = staticBox(world, [0.28, 0.72, 0.28], [-2.15, 0.36, bbZ + 0.65], 0x3d4450).object3D as Mesh;
    hollow(ped);
    ped.add(pedestal(0.28, 0.72));
  }
  const bballR = 0.105;
  const bballHome: [number, number, number] = [-2.15, 0.72 + bballR + 0.01, bbZ + 0.65];
  const bballMesh = new Mesh(
    new SphereGeometry(bballR, 64, 40),
    basketball(),
  );
  bballMesh.position.set(...bballHome);
  bballMesh.castShadow = true;
  const bballEntity = world.createTransformEntity(bballMesh);
  bballEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [bballR, 0, 0],
    density: 380,
    restitution: 0.78,
    friction: 0.6,
  });
  bballEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    angularDamping: 0.25,
  });
  bballEntity.addComponent(OneHandGrabbable);
  bballEntity.addComponent(RayInteractable);
  bballEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  bballEntity.addComponent(HoopBall, { prevY: bballHome[1], cooldown: 0 });
  bballEntity.addComponent(Resettable);
  bballEntity.getVectorView(Resettable, 'home').set(bballHome);

  // ==========================================================================
  // STATION 2: Mini Bowling Alley Lane + 6 Pins + Bowling Ball (Right Wall)
  // ==========================================================================
  const laneX = 2.18;
  // Smooth maple bowling lane strip & low side bumper rails
  {
    const lane = staticBox(world, [0.76, 0.02, 3.2], [laneX, 0.01, -0.55], 0xd9a05b).object3D as Mesh;
    const spots: Array<[number, number]> = [];
    [1, 2, 3].forEach((count, rIdx) => {
      for (let i = 0; i < count; i++) spots.push([(i - (count - 1) / 2) * 0.15, 1.0 + rIdx * 0.16]);
    });
    // Decal space: +y of the flat plane points down-lane (toward the pins)
    const marks = laneMarkings(0.74, 3.18, spots.map(([x, z]) => [x, -z] as [number, number]));
    marks.position.y = 0.0108;
    lane.add(marks);
  }
  staticBox(world, [0.05, 0.08, 3.2], [laneX - 0.405, 0.04, -0.55], 0x5c3a21);
  staticBox(world, [0.05, 0.08, 3.2], [laneX + 0.405, 0.04, -0.55], 0x5c3a21);

  // 6 Bowling Pins arranged in a 1-2-3 triangle at the far end of the lane
  const pinR = 0.042;
  const pinH = 0.24;
  const pinRows = [1, 2, 3];
  pinRows.forEach((count, rIdx) => {
    for (let i = 0; i < count; i++) {
      const pinBody = new Mesh(
        pinGeometry(pinR, pinH),
        mat(0xfafafa, 0.3),
      );
      // Red stripe around the neck of each bowling pin
      const stripe = new Mesh(
        new CylinderGeometry(pinR * 0.475, pinR * 0.53, 0.03, 32),
        mat(0xd62828, 0.35),
      );
      stripe.position.set(0, pinH * 0.16, 0);
      pinBody.add(stripe);

      const pinHead = new Mesh(
        new SphereGeometry(pinR * 0.02, 6, 4),
        mat(0xfafafa, 0.3),
      );
      pinHead.position.set(0, pinH * 0.42, 0);
      pinBody.add(pinHead);

      const home: [number, number, number] = [
        laneX + (i - (count - 1) / 2) * 0.15,
        0.02 + pinH / 2 + 0.002,
        -1.55 - rIdx * 0.16,
      ];
      pinBody.position.set(...home);
      pinBody.castShadow = true;

      const pe = world.createTransformEntity(pinBody);
      pe.addComponent(PhysicsShape, {
        shape: PhysicsShapeType.Cylinder,
        dimensions: [pinR, pinH, 0],
        density: 220,
        restitution: 0.35,
        friction: 0.4,
      });
      pe.addComponent(PhysicsBody, {
        state: PhysicsState.Dynamic,
        angularDamping: 0.2,
      });
      pe.addComponent(Resettable);
      pe.getVectorView(Resettable, 'home').set(home);
    }
  });

  // Heavy cobalt-blue Bowling Ball on a return rack at the front of the lane
  {
    const ped = staticBox(world, [0.26, 0.55, 0.26], [laneX, 0.275, 1.12], 0x2b303a).object3D as Mesh;
    hollow(ped);
    ped.add(pedestal(0.26, 0.55));
  }
  const bowlR = 0.095;
  const bowlHome: [number, number, number] = [laneX, 0.55 + bowlR + 0.01, 1.12];
  const bowlBall = new Mesh(
    new SphereGeometry(bowlR, 28, 18),
    mat(0x1d3557, 0.2),
  );
  bowlBall.add(fingerHoles(bowlR));
  bowlBall.position.set(...bowlHome);
  bowlBall.castShadow = true;
  const bowlEntity = world.createTransformEntity(bowlBall);
  bowlEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [bowlR, 0, 0],
    density: 950,
    restitution: 0.25,
    friction: 0.25,
  });
  bowlEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    angularDamping: 0.15,
  });
  bowlEntity.addComponent(OneHandGrabbable);
  bowlEntity.addComponent(RayInteractable);
  bowlEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  bowlEntity.addComponent(HoopBall, { prevY: bowlHome[1], cooldown: 0 });
  bowlEntity.addComponent(Resettable);
  bowlEntity.getVectorView(Resettable, 'home').set(bowlHome);

  // ==========================================================================
  // STATION 3: 8-Note Rainbow Musical Xylophone + 2 Mallets (Left Center)
  // ==========================================================================
  const xyloX = -1.75;
  const xyloZ = 0.05;
  const xyloH = 0.78;
  {
    const stand = staticBox(world, [0.46, xyloH, 0.86], [xyloX, xyloH / 2, xyloZ], 0x5c3d24).object3D as Mesh;
    const legWood = oak('#000000', '#8a6238', 1, 1, 0.4);
    const topWood = oak('#000000', '#8a6238', 1, 1, 0.34);
    const t = buildTable(0.46, xyloH, 0.86, legWood, topWood);
    stand.geometry.dispose();
    stand.geometry = t.top;
    stand.material = topWood;
    stand.add(t.parts);
    const frame = xyloFrame(
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 0.34 - i * 0.018),
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => -0.31 + i * 0.088),
      0.011,
    );
    frame.position.y = xyloH / 2;
    stand.add(frame);
  }

  const noteFreqs = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
  const noteColors = [
    0xff3b30, 0xff9500, 0xffcc00, 0x34c759,
    0x00c7be, 0x007aff, 0x5856d6, 0xaf52de,
  ];

  noteFreqs.forEach((freq, i) => {
    const barLen = 0.34 - i * 0.018;
    const barY = xyloH + 0.022;
    const barZ = xyloZ - 0.31 + i * 0.088;
    const barMesh = new Mesh(
      new BoxGeometry(barLen, 0.022, 0.068),
      mat(noteColors[i], 0.25),
    );
    // Lacquered aluminium tone bar
    (barMesh.material as MeshStandardMaterial).metalness = 0.55;
    barMesh.add(barStuds(barLen));
    barMesh.position.set(xyloX, barY, barZ);
    barMesh.castShadow = true;
    const be = world.createTransformEntity(barMesh);
    be.addComponent(RayInteractable);
    be.addComponent(XylophoneBar, {
      noteIndex: i,
      freq,
      baseY: barY,
      flashTimer: 0,
      hitCooldown: 0,
    });
  });

  // Two grabbable Xylophone Mallets on the front edge of the xylophone stand
  [-0.12, 0.12].forEach((zOff) => {
    const handle = new Mesh(
      new CylinderGeometry(0.01, 0.008, 0.24, 12),
      oak('#8a5a2a', '#d9a05b', 1, 1, 0.45),
    );
    handle.geometry.rotateZ(Math.PI / 2);
    const headBall = new Mesh(
      new SphereGeometry(0.026, 16, 12),
      mat(0xd8342a, 0.45),
    );
    headBall.position.set(-0.12, 0, 0);
    handle.add(headBall);

    const mHome: [number, number, number] = [xyloX + 0.16, xyloH + 0.03, xyloZ + zOff];
    handle.position.set(...mHome);
    const me = world.createTransformEntity(handle);
    me.addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
      dimensions: [0.26, 0.045, 0.045],
      density: 250,
      restitution: 0.3,
      friction: 0.6,
    });
    me.addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      angularDamping: 0.8,
    });
    me.addComponent(OneHandGrabbable);
    me.addComponent(RayInteractable);
    me.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    me.addComponent(ToyMallet);
    me.addComponent(Resettable);
    me.getVectorView(Resettable, 'home').set(mHome);
  });

  // ==========================================================================
  // STATION 4: Whack-a-Mole Arcade Cabinet + Foam Hammer (Left Wall Back)
  // ==========================================================================
  const wamX = -1.95;
  const wamZ = 1.65;
  const wamH = 0.76;
  const wamBody = staticBox(world, [0.58, wamH, 0.78], [wamX, wamH / 2, wamZ], 0x2b2d42).object3D as Mesh;
  hollow(wamBody);

  // Backboard header with 5 score lights
  const wamBack = new Mesh(
    new BoxGeometry(0.06, 0.42, 0.78),
    mat(0xef233c, 0.4),
  );
  wamBack.position.set(wamX - 0.26, wamH + 0.21, wamZ);
  wamBack.add(moleMarquee(0.78, 0.04, 0.07, [0, 1, 2, 3, 4].map((i) => -0.24 + i * 0.12)));
  world.createTransformEntity(wamBack);

  for (let i = 0; i < 5; i++) {
    const pip = new Mesh(
      new SphereGeometry(0.03, 14, 10),
      mat(0x343a40, 0.3),
    );
    pip.position.set(wamX - 0.22, wamH + 0.28, wamZ - 0.24 + i * 0.12);
    const pe = world.createTransformEntity(pip);
    pe.addComponent(ScorePip, { station: 2, index: i });
  }

  // 5 Mole Holes & Pop-Up Moles
  const moleCoords: Array<[number, number]> = [
    [wamX - 0.08, wamZ - 0.22],
    [wamX - 0.08, wamZ + 0.22],
    [wamX, wamZ],
    [wamX + 0.12, wamZ - 0.18],
    [wamX + 0.12, wamZ + 0.18],
  ];

  wamBody.add(moleCabinet(0.58, wamH, 0.78, moleCoords.map(([mx, mz]) => [mx - wamX, mz - wamZ] as [number, number])));
  moleCoords.forEach(([mx, mz], idx) => {
    const rim = new Mesh(
      new CylinderGeometry(0.068, 0.072, 0.02, 20),
      mat(0x111317, 0.8),
    );
    rim.position.set(mx, wamH + 0.01, mz);
    world.createTransformEntity(rim);

    // Cute Mole with yellow hard-hat and pink nose
    const moleBody = new Mesh(
      new CylinderGeometry(0.05, 0.054, 0.14, 18),
      mat(0x8d5524, 0.55),
    );
    const moleHead = new Mesh(
      new SphereGeometry(0.05, 16, 12),
      mat(0x8d5524, 0.55),
    );
    moleHead.position.set(0, 0.06, 0);
    moleBody.add(moleHead);

    const hat = new Mesh(
      new SphereGeometry(0.052, 16, 12),
      mat(0xffbe0b, 0.35),
    );
    hat.scale.set(1.05, 0.55, 1.05);
    hat.position.set(0, 0.095, 0);
    moleBody.add(hat);

    const moleNose = new Mesh(
      new SphereGeometry(0.016, 12, 10),
      mat(0xff758f, 0.4),
    );
    moleNose.position.set(0.048, 0.055, 0);
    moleBody.add(moleNose);

    const baseY = wamH - 0.04;
    moleBody.add(moleFace());
    moleBody.position.set(mx, baseY, mz);
    const me = world.createTransformEntity(moleBody);
    me.addComponent(RayInteractable);
    me.addComponent(Mole, {
      slotIndex: idx,
      state: idx % 2, // start a couple of moles popped up immediately
      timer: 1.0 + idx * 0.55,
      baseY,
    });
  });

  // Grabbable Foam Whack Hammer on the cabinet
  const hammerShaft = new Mesh(
    new CylinderGeometry(0.014, 0.014, 0.24, 12),
    mat(0xf77f00, 0.4),
  );
  const hammerHead = new Mesh(
    new CylinderGeometry(0.042, 0.042, 0.13, 16),
    mat(0xd62828, 0.4),
  );
  hammerHead.geometry.rotateZ(Math.PI / 2);
  hammerHead.position.set(0, 0.11, 0);
  hammerShaft.add(hammerHead);
  hammerShaft.add(hammerDetail(0xd62828));

  const hammerHome: [number, number, number] = [wamX + 0.21, wamH + 0.14, wamZ + 0.28];
  hammerShaft.position.set(...hammerHome);
  const he = world.createTransformEntity(hammerShaft);
  he.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [0.13, 0.26, 0.085],
    density: 260,
    restitution: 0.25,
    friction: 0.6,
  });
  he.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, angularDamping: 0.8 });
  he.addComponent(OneHandGrabbable);
  he.addComponent(RayInteractable);
  he.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  he.addComponent(ToyMallet);
  he.addComponent(Resettable);
  he.getVectorView(Resettable, 'home').set(hammerHome);

  // ==========================================================================
  // STATION 5: Spring Boxing Reflex Speed-Bag + Carnival High-Striker Bell Tower
  // ==========================================================================
  // 5A. Spring Boxing Reflex Speed-Bag (Right-Back area)
  {
    const base = staticBox(
      world,
      [0.44, 0.08, 0.44],
      [BAG_BASE_POS.x, BAG_BASE_POS.y, BAG_BASE_POS.z],
      0x22262b,
    ).object3D as Mesh;
    hollow(base);
    base.add(bagBase());
  }
  const bagPivot = new Mesh(
    new SphereGeometry(0.04, 14, 10),
    mat(0xadb5bd, 0.3),
  );
  bagPivot.position.set(BAG_BASE_POS.x, BAG_BASE_POS.y + 0.04, BAG_BASE_POS.z);

  const bagRod = new Mesh(
    new CylinderGeometry(0.016, 0.022, 1.18, 14),
    mat(0xced4da, 0.3),
  );
  bagRod.position.set(0, 0.59, 0);
  bagPivot.add(bagRod);
  bagPivot.add(coilSpring(0.03, 0.22, 7));

  const pearBag = new Mesh(bagGeometry(), leather(0xb5121c));
  pearBag.add(bagTrim());
  pearBag.position.set(0, 1.24, 0);
  pearBag.castShadow = true;
  bagPivot.add(pearBag);

  const bagEntity = world.createTransformEntity(bagPivot);
  bagEntity.addComponent(RayInteractable);
  bagEntity.addComponent(ReflexBag, {
    tiltX: 0,
    tiltZ: 0,
    velX: 0,
    velZ: 0,
    hitCooldown: 0,
  });

  // 5B. Carnival High-Striker Bell Tower right beside the Reflex Bag
  const { x: sx, z: sz, bellY } = STRIKER_POS;
  staticBox(world, [0.46, 0.14, 0.46], [sx, 0.07, sz], 0x9b2226);

  const towerMast = new Mesh(
    new BoxGeometry(0.14, 2.25, 0.08),
    mat(0xae2012, 0.45),
  );
  towerMast.position.set(sx, 1.18, sz + 0.12);
  world.createTransformEntity(towerMast);
  {
    const bulbGlow = new MeshStandardMaterial({
      color: new Color(0xfff1d0),
      emissive: new Color(0xffc56e),
      emissiveIntensity: 2.2,
      roughness: 0.3,
    });
    const dress = strikerDress(0.08, 0.055, 2.305, bulbGlow);
    dress.position.set(sx, 0, sz);
    world.createTransformEntity(dress);
  }

  // Target Strike Button Pad on the base
  const strikePad = new Mesh(
    new CylinderGeometry(0.13, 0.15, 0.08, 24),
    mat(0xfca311, 0.35),
  );
  strikePad.position.set(sx, 0.18, sz - 0.04);

  // Rising White Puck on the tower rail
  const puck = new Mesh(
    new CylinderGeometry(0.055, 0.055, 0.04, 20),
    mat(0xffffff, 0.25),
  );
  puck.geometry.rotateX(Math.PI / 2);
  puck.name = 'carnival-puck';
  puck.position.set(0, 0.17, 0.11);
  strikePad.add(puck);

  // Golden Bell at the top of the tower
  const bell = new Mesh(
    bellGeometry(),
    brass(),
  );
  bell.name = 'carnival-bell';
  bell.position.set(0, bellY - 0.18, 0.11);
  strikePad.add(bell);

  const strikerEntity = world.createTransformEntity(strikePad);
  strikerEntity.addComponent(RayInteractable);
  strikerEntity.addComponent(CarnivalStriker, {
    puckY: 0.35,
    puckVel: 0,
    bellFlash: 0,
  });
}

/** Runs all 5 Interactive Toy Stations (Basketball Hoop, Xylophone, Whack-a-Mole, Reflex Bag, High-Striker). */
export class ToyStationsSystem extends createSystem({
  hoopBalls: { required: [HoopBall] },
  scorePips: { required: [ScorePip] },
  xyloBars: { required: [XylophoneBar] },
  pressedXylo: { required: [XylophoneBar, Pressed] },
  mallets: { required: [ToyMallet] },
  moles: { required: [Mole] },
  pressedMoles: { required: [Mole, Pressed] },
  reflexBags: { required: [ReflexBag] },
  pressedBags: { required: [ReflexBag, Pressed] },
  strikers: { required: [CarnivalStriker] },
  pressedStrikers: { required: [CarnivalStriker, Pressed] },
  pressedReset: { required: [ResetButton, Pressed] },
}) {
  private hoopScore = 0;
  private moleScore = 0;
  private handPosL = new Vector3();
  private handPosR = new Vector3();

  init() {
    this.cleanupFuncs.push(
      this.queries.pressedXylo.subscribe('qualify', (bar) => {
        this.strikeXylophoneBar(bar);
      }),
      this.queries.pressedMoles.subscribe('qualify', (mole) => {
        this.whackMole(mole);
      }),
      this.queries.pressedBags.subscribe('qualify', (bag) => {
        bag.setValue(ReflexBag, 'velX', (Math.random() - 0.5) * 8);
        bag.setValue(ReflexBag, 'velZ', -11);
        playSynthTone(110, 0.16, 'triangle', 55);
      }),
      this.queries.pressedStrikers.subscribe('qualify', (st) => {
        st.setValue(CarnivalStriker, 'puckVel', 6.8);
        playSynthTone(180, 0.18, 'triangle', 90);
      }),
      this.queries.pressedReset.subscribe('qualify', () => {
        this.hoopScore = 0;
        this.moleScore = 0;
      }),
    );
  }

  private strikeXylophoneBar(bar: Entity) {
    const freq = bar.getValue(XylophoneBar, 'freq') ?? 261.63;
    bar.setValue(XylophoneBar, 'flashTimer', 0.22);
    bar.setValue(XylophoneBar, 'hitCooldown', 0.16);
    playSynthTone(freq, 0.38, 'sine');
  }

  private whackMole(mole: Entity) {
    const state = mole.getValue(Mole, 'state') ?? 0;
    if (state !== 1) return;
    mole.setValue(Mole, 'state', 2);
    mole.setValue(Mole, 'timer', 0.45);
    this.moleScore = (this.moleScore % 5) + 1;
    playSynthTone(480, 0.2, 'square', 180);
  }

  update(delta: number) {
    const dt = Math.min(Math.max(delta, 0.004), 0.033);

    const right = this.input.xr.gamepads.right;
    if (right?.getButtonDown(InputComponent.A_Button)) {
      this.hoopScore = 0;
      this.moleScore = 0;
    }

    this.player.gripSpaces.left.getWorldPosition(this.handPosL);
    this.player.gripSpaces.right.getWorldPosition(this.handPosR);

    // 1. Check Basketball Hoop scoring
    for (const ball of this.queries.hoopBalls.entities) {
      const obj = ball.object3D;
      if (!obj) continue;
      let cd = ball.getValue(HoopBall, 'cooldown') ?? 0;
      if (cd > 0) {
        cd = Math.max(0, cd - dt);
        ball.setValue(HoopBall, 'cooldown', cd);
      }
      const prevY = ball.getValue(HoopBall, 'prevY') ?? obj.position.y;
      const curY = obj.position.y;
      ball.setValue(HoopBall, 'prevY', curY);

      if (cd <= 0 && prevY >= HOOP_RIM_POS.y && curY < HOOP_RIM_POS.y) {
        const dx = obj.position.x - HOOP_RIM_POS.x;
        const dz = obj.position.z - HOOP_RIM_POS.z;
        if (Math.hypot(dx, dz) < HOOP_RIM_POS.radius * 0.85) {
          this.hoopScore = (this.hoopScore % 5) + 1;
          ball.setValue(HoopBall, 'cooldown', 0.6);
          playSynthTone(587.33, 0.15, 'sine', 880);
        }
      }
    }

    // Update Basketball & Whack-a-Mole Score LED Pips
    for (const pip of this.queries.scorePips.entities) {
      const mesh = pip.object3D as Mesh | undefined;
      if (!mesh) continue;
      const st = pip.getValue(ScorePip, 'station') ?? 0;
      const idx = pip.getValue(ScorePip, 'index') ?? 0;
      const lit = st === 1 ? idx < this.hoopScore : idx < this.moleScore;
      const m = mesh.material as MeshStandardMaterial;
      m.color.setHex(lit ? (st === 1 ? 0x2ecc71 : 0xffbe0b) : 0x2b303a);
    }

    // 2. Update Xylophone Bars & check mallet strikes
    for (const bar of this.queries.xyloBars.entities) {
      const barObj = bar.object3D;
      if (!barObj) continue;
      const baseY = bar.getValue(XylophoneBar, 'baseY') ?? 0.8;
      let flash = bar.getValue(XylophoneBar, 'flashTimer') ?? 0;
      let cd = bar.getValue(XylophoneBar, 'hitCooldown') ?? 0;

      if (cd > 0) {
        cd = Math.max(0, cd - dt);
        bar.setValue(XylophoneBar, 'hitCooldown', cd);
      } else {
        for (const mallet of this.queries.mallets.entities) {
          const mObj = mallet.object3D;
          if (!mObj) continue;
          const dx = Math.abs(mObj.position.x - barObj.position.x);
          const dy = Math.abs(mObj.position.y - barObj.position.y);
          const dz = Math.abs(mObj.position.z - barObj.position.z);
          if (dx < 0.16 && dy < 0.065 && dz < 0.055) {
            this.strikeXylophoneBar(bar);
            flash = 0.22;
            break;
          }
        }
      }

      if (flash > 0) {
        flash = Math.max(0, flash - dt);
        bar.setValue(XylophoneBar, 'flashTimer', flash);
        barObj.position.y = baseY - 0.008;
      } else {
        barObj.position.y = baseY;
      }
    }

    // 3. Update Whack-a-Mole pop-ups & mallet/ball hits
    for (const mole of this.queries.moles.entities) {
      const mObj = mole.object3D;
      if (!mObj) continue;
      let state = mole.getValue(Mole, 'state') ?? 0;
      let timer = (mole.getValue(Mole, 'timer') ?? 1.0) - dt;
      const baseY = mole.getValue(Mole, 'baseY') ?? 0.72;

      if (state === 1) {
        // Check if struck by a mallet or ball
        for (const mallet of this.queries.mallets.entities) {
          const hObj = mallet.object3D;
          if (hObj && hObj.position.distanceToSquared(mObj.position) < 0.025) {
            this.whackMole(mole);
            state = 2;
            timer = 0.45;
            break;
          }
        }
      }

      if (timer <= 0) {
        if (state === 0) {
          state = 1;
          timer = 1.6 + Math.random() * 1.4;
        } else {
          state = 0;
          timer = 0.9 + Math.random() * 1.8;
        }
        mole.setValue(Mole, 'state', state);
      }
      mole.setValue(Mole, 'timer', timer);

      const targetY = state === 1 ? baseY + 0.11 : baseY;
      mObj.position.y += (targetY - mObj.position.y) * Math.min(1, dt * 14);
      mObj.scale.y = state === 2 ? 0.55 : 1.0;
    }

    // 4. Update Spring Boxing Reflex Speed-Bag
    for (const bag of this.queries.reflexBags.entities) {
      const bObj = bag.object3D;
      if (!bObj) continue;
      let tx = bag.getValue(ReflexBag, 'tiltX') ?? 0;
      let tz = bag.getValue(ReflexBag, 'tiltZ') ?? 0;
      let vx = bag.getValue(ReflexBag, 'velX') ?? 0;
      let vz = bag.getValue(ReflexBag, 'velZ') ?? 0;
      let cd = bag.getValue(ReflexBag, 'hitCooldown') ?? 0;

      if (cd > 0) {
        cd = Math.max(0, cd - dt);
      } else {
        // Check if punched by player hands or hit by a ball/mallet
        const bagHeadX = BAG_BASE_POS.x + Math.sin(tz) * 1.24;
        const bagHeadY = BAG_BASE_POS.y + 1.24;
        const bagHeadZ = BAG_BASE_POS.z - Math.sin(tx) * 1.24;

        const checkHit = (px: number, py: number, pz: number, r: number) => {
          const dx = bagHeadX - px;
          const dy = bagHeadY - py;
          const dz = bagHeadZ - pz;
          if (dx * dx + dy * dy + dz * dz < r * r) {
            vx += -dz * 35;
            vz += dx * 35;
            cd = 0.22;
            playSynthTone(115, 0.15, 'triangle', 55);
          }
        };

        checkHit(this.handPosL.x, this.handPosL.y, this.handPosL.z, 0.24);
        checkHit(this.handPosR.x, this.handPosR.y, this.handPosR.z, 0.24);
        for (const ball of this.queries.hoopBalls.entities) {
          const bo = ball.object3D;
          if (bo) checkHit(bo.position.x, bo.position.y, bo.position.z, 0.26);
        }
      }

      // Underdamped 2D angular spring so the bag whips back and forth rapidly
      const k = 95;
      const damp = 3.2;
      vx += (-k * tx - damp * vx) * dt;
      vz += (-k * tz - damp * vz) * dt;
      tx = Math.max(-0.85, Math.min(0.85, tx + vx * dt));
      tz = Math.max(-0.85, Math.min(0.85, tz + vz * dt));

      bObj.rotation.x = tx;
      bObj.rotation.z = tz;

      bag.setValue(ReflexBag, 'tiltX', tx);
      bag.setValue(ReflexBag, 'tiltZ', tz);
      bag.setValue(ReflexBag, 'velX', vx);
      bag.setValue(ReflexBag, 'velZ', vz);
      bag.setValue(ReflexBag, 'hitCooldown', cd);
    }

    // 5. Update Carnival High-Striker Bell Tower
    for (const st of this.queries.strikers.entities) {
      const sObj = st.object3D;
      if (!sObj) continue;
      let py = st.getValue(CarnivalStriker, 'puckY') ?? 0.35;
      let pv = st.getValue(CarnivalStriker, 'puckVel') ?? 0;
      let bf = st.getValue(CarnivalStriker, 'bellFlash') ?? 0;

      // Check if struck by a mallet or ball
      if (py <= 0.38 && pv <= 0.1) {
        for (const mallet of this.queries.mallets.entities) {
          const mObj = mallet.object3D;
          if (mObj && mObj.position.distanceToSquared(sObj.position) < 0.06) {
            pv = 6.8;
            playSynthTone(180, 0.18, 'triangle', 90);
            break;
          }
        }
      }

      if (py > 0.35 || pv !== 0) {
        pv -= 9.8 * dt;
        py += pv * dt;
        if (py >= STRIKER_POS.bellY - 0.12) {
          py = STRIKER_POS.bellY - 0.12;
          pv = -Math.abs(pv) * 0.35;
          bf = 0.45;
          playSynthTone(1046.5, 0.65, 'sine'); // High C bell ding!
        } else if (py <= 0.35) {
          py = 0.35;
          pv = 0;
        }
      }

      if (bf > 0) bf = Math.max(0, bf - dt);

      const puck = sObj.getObjectByName('carnival-puck');
      if (puck) puck.position.y = py - 0.18;

      const bell = sObj.getObjectByName('carnival-bell') as Mesh | undefined;
      if (bell) {
        bell.scale.setScalar(bf > 0 ? 1.18 : 1.0);
      }

      st.setValue(CarnivalStriker, 'puckY', py);
      st.setValue(CarnivalStriker, 'puckVel', pv);
      st.setValue(CarnivalStriker, 'bellFlash', bf);
    }
  }
}

/**
 * First-person mouse-look & keyboard camera control for 2D desktop browser mode.
 * Works alongside LocomotionSystem's WASD movement when not in an XR headset session.
 * - Left-click drag (when not grabbing an object) or Right-click drag: rotate view
 * - Right-click tap: toggle Pointer Lock (free FPS mouse look without holding a button)
 * - Q / E keys: smooth turn left / right
 */
export class DesktopFirstPersonSystem extends createSystem({
  grabbed: { required: [Grabbed] },
  pressed: { required: [Pressed] },
}) {
  private yaw = 0;
  private pitch = -0.22;
  private isPointerDown = false;
  private pointerButton = 0;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;

  init() {
    this.camera.rotation.order = 'YXZ';
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;

    const canvas = this.renderer.domElement;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (this.world.session) return;
      this.isPointerDown = true;
      this.pointerButton = e.button;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.world.session) return;

      // 1. Free FPS mouse-look when Pointer Lock is active
      if (document.pointerLockElement === canvas) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch = Math.max(
          -1.42,
          Math.min(1.42, this.pitch - e.movementY * 0.0022),
        );
        return;
      }

      // 2. Click-and-drag look (Right-drag anywhere, or Left-drag when not grabbing/pressing an object)
      if (!this.isPointerDown) return;
      const isInteractingWithObject =
        this.pointerButton === 0 &&
        (this.queries.grabbed.entities.size > 0 ||
          this.queries.pressed.entities.size > 0);
      if (isInteractingWithObject) {
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        return;
      }

      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      if (Math.hypot(dx, dy) > 2) {
        this.dragMoved = true;
      }

      this.yaw -= dx * 0.0032;
      this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch - dy * 0.0032));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.world.session) return;
      // Quick right-click tap toggles Pointer Lock for hands-free FPS mouse look
      if (e.button === 2 && !this.dragMoved) {
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock?.();
        } else {
          canvas.requestPointerLock?.();
        }
      }
      this.isPointerDown = false;
    };

    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    this.cleanupFuncs.push(
      () => canvas.removeEventListener('contextmenu', onContextMenu),
      () => canvas.removeEventListener('pointerdown', onPointerDown),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('pointerup', onPointerUp),
    );
  }

  update(delta: number) {
    if (this.world.session) return;

    const dt = Math.min(delta, 0.05);
    if (this.input.keyboard?.getKeyPressed('KeyQ')) {
      this.yaw += 1.8 * dt;
    }
    if (this.input.keyboard?.getKeyPressed('KeyE')) {
      this.yaw -= 1.8 * dt;
    }

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}

// ---- VR Hand-Tracking Hands (Girl / Boy) & 3-Lines Settings Menu -----------
const sceneSkyRefs: {
  skyCanopyMat: MeshStandardMaterial | null;
  cloudMat: MeshStandardMaterial | null;
  glassMat: MeshStandardMaterial | null;
  nightSkyGroup: Group | null;
  indoorNightLight: PointLight | null;
  floorEntity: Entity | null;
  floorMesh: Mesh | null;
  indoorArchGroup: Group | null;
  skyCanopy: Mesh | null;
  wallColliders: Array<{
    entity: Entity;
    mesh: Mesh;
    homePos: [number, number, number];
  }>;
  ceilCollider: {
    entity: Entity;
    homePos: [number, number, number];
  } | null;
  gorillaTagMapGroup: Group | null;
  gorillaTagWalkableEntity: Entity | null;
} = {
  skyCanopyMat: null,
  cloudMat: null,
  glassMat: null,
  nightSkyGroup: null,
  indoorNightLight: null,
  floorEntity: null,
  floorMesh: null,
  indoorArchGroup: null,
  skyCanopy: null,
  wallColliders: [],
  ceilCollider: null,
  gorillaTagMapGroup: null,
  gorillaTagWalkableEntity: null,
};

// ---- Gorilla Tag Map Fast Spatial Triangle Grid (Zero-Allocation Queries) --
const GORILLA_MAP_SCALE = 1.6;
const GORILLA_GRID_CELL = 2.5;
const gorillaMapGrid = new Map<number, number[]>();

function gorillaGridKey(gx: number, gz: number): number {
  return (gx + 1024) * 2048 + (gz + 1024);
}

function buildGorillaMapSpatialGrid(mapScene: Object3D) {
  gorillaMapGrid.clear();
  mapScene.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const matObj = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matName = matObj?.name ?? '';
    // Skip decorative leaf clusters, small cosmetic props & indoor stump boards/stages
    // so collision only uses solid terrain/structures and never blocks stump doorways
    if (
      matName.includes('leaves') ||
      matName.includes('clay') ||
      matName.includes('pillow') ||
      matName.includes('metalpattern') ||
      matName.includes('bush') ||
      matName.includes('darkbrownpanel') ||
      matName.includes('bronze')
    ) {
      return;
    }

    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;

    for (let i = 0; i < count; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i + 1) : i + 1;
      const c = idx ? idx.getX(i + 2) : i + 2;

      const ax = pos.getX(a);
      const ay = pos.getY(a);
      const az = pos.getZ(a);
      const bx = pos.getX(b);
      const by = pos.getY(b);
      const bz = pos.getZ(b);
      const cx = pos.getX(c);
      const cy = pos.getY(c);
      const cz = pos.getZ(c);

      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const lenSq = nx * nx + ny * ny + nz * nz;
      if (lenSq < 0.0004) continue;
      const invLen = 1 / Math.sqrt(lenSq);
      const unitNx = nx * invLen;
      const unitNy = ny * invLen;
      const unitNz = nz * invLen;

      // Skip the horizontal cover cap over the Crystal Caves entrance shaft inside the Giant Stump
      // so players can drop down the shaft (around 265° / -Z) into the Caves!
      const mx = (ax + bx + cx) / 3;
      const my = (ay + by + cy) / 3;
      const mz = (az + bz + cz) / 3;
      if (
        false &&
        mx > -0.88 * GORILLA_MAP_SCALE &&
        mx < 1.38 * GORILLA_MAP_SCALE &&
        mz > -4.08 * GORILLA_MAP_SCALE &&
        mz < -2.02 * GORILLA_MAP_SCALE &&
        Math.abs(my) < 0.25 * GORILLA_MAP_SCALE &&
        Math.abs(unitNy) > 0.38
      ) {
        continue;
      }

      const minCx = Math.floor(Math.min(ax, bx, cx) / GORILLA_GRID_CELL);
      const maxCx = Math.floor(Math.max(ax, bx, cx) / GORILLA_GRID_CELL);
      const minCz = Math.floor(Math.min(az, bz, cz) / GORILLA_GRID_CELL);
      const maxCz = Math.floor(Math.max(az, bz, cz) / GORILLA_GRID_CELL);

      for (let gx = minCx; gx <= maxCx; gx++) {
        for (let gz = minCz; gz <= maxCz; gz++) {
          const key = gorillaGridKey(gx, gz);
          let list = gorillaMapGrid.get(key);
          if (!list) {
            list = [];
            gorillaMapGrid.set(key, list);
          }
          list.push(ax, ay, az, bx, by, bz, cx, cy, cz, unitNx, unitNy, unitNz);
        }
      }
    }
  });
}

/**
 * Samples the Gorilla Tag map floor/ramp/branch height (`out[0]`) and ceiling height (`out[1]`)
 * at `(px, pz)` relative to the player's current `footY`, with zero allocations.
 */
function sampleGorillaMapVertical(
  px: number,
  footY: number,
  pz: number,
  out: [number, number],
) {
  const gx = Math.floor(px / GORILLA_GRID_CELL);
  const gz = Math.floor(pz / GORILLA_GRID_CELL);
  const list = gorillaMapGrid.get(gorillaGridKey(gx, gz));

  let bestGroundY = -Infinity;
  let bestCeilingY = Infinity;

  if (list) {
    for (let i = 0; i < list.length; i += 12) {
      const absNy = Math.abs(list[i + 10]);
      if (absNy < 0.35) continue;

      const ax = list[i];
      const ay = list[i + 1];
      const az = list[i + 2];
      const bx = list[i + 3];
      const by = list[i + 4];
      const bz = list[i + 5];
      const cx = list[i + 6];
      const cy = list[i + 7];
      const cz = list[i + 8];

      const v0x = cx - ax;
      const v0z = cz - az;
      const v1x = bx - ax;
      const v1z = bz - az;
      const v2x = px - ax;
      const v2z = pz - az;

      const dot00 = v0x * v0x + v0z * v0z;
      const dot01 = v0x * v1x + v0z * v1z;
      const dot02 = v0x * v2x + v0z * v2z;
      const dot11 = v1x * v1x + v1z * v1z;
      const dot12 = v1x * v2x + v1z * v2z;

      const denom = dot00 * dot11 - dot01 * dot01;
      if (Math.abs(denom) < 1e-8) continue;

      const invDenom = 1 / denom;
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

      if (u >= -0.04 && v >= -0.04 && u + v <= 1.04) {
        const triY = ay + u * (cy - ay) + v * (by - ay);
        if (triY <= footY + 0.95 && triY > bestGroundY) {
          bestGroundY = triY;
        }
        if (triY >= footY + 1.35 && triY < bestCeilingY) {
          bestCeilingY = triY;
        }
      }
    }
  }

  // Inside the Giant Stump's central area around (0, 0, 0) (excluding the Caves entrance shaft),
  // keep the floor level at y = 0
  const inCaveShaft =
    false &&
    px > -0.85 * GORILLA_MAP_SCALE &&
    px < 1.35 * GORILLA_MAP_SCALE &&
    pz > -4.05 * GORILLA_MAP_SCALE &&
    pz < -2.02 * GORILLA_MAP_SCALE;
  if (!inCaveShaft && px * px + pz * pz < 12.0 && Math.abs(bestGroundY) < 0.16) {
    bestGroundY = 0;
  }

  out[0] = bestGroundY;
  out[1] = bestCeilingY;
}

/**
 * Checks whether a hand at `(hx, hy, hz)` is within `radius` meters of any floor or
 * surface on the Gorilla Tag map.
 */
function isHandTouchingGorillaMap(
  hx: number,
  hy: number,
  hz: number,
  radius: number,
): boolean {
  const gx = Math.floor(hx / GORILLA_GRID_CELL);
  const gz = Math.floor(hz / GORILLA_GRID_CELL);
  const list = gorillaMapGrid.get(gorillaGridKey(gx, gz));
  if (!list) return false;

  for (let i = 0; i < list.length; i += 12) {
    const ax = list[i];
    const ay = list[i + 1];
    const az = list[i + 2];
    const bx = list[i + 3];
    const by = list[i + 4];
    const bz = list[i + 5];
    const cx = list[i + 6];
    const cy = list[i + 7];
    const cz = list[i + 8];

    if (
      hy < Math.min(ay, by, cy) - radius ||
      hy > Math.max(ay, by, cy) + radius ||
      hx < Math.min(ax, bx, cx) - radius ||
      hx > Math.max(ax, bx, cx) + radius ||
      hz < Math.min(az, bz, cz) - radius ||
      hz > Math.max(az, bz, cz) + radius
    ) {
      continue;
    }

    const nx = list[i + 9];
    const ny = list[i + 10];
    const nz = list[i + 11];
    const planeDist = Math.abs((hx - ax) * nx + (hy - ay) * ny + (hz - az) * nz);
    if (planeDist <= radius) {
      return true;
    }
  }
  return false;
}

function closestPointOnSegment2D(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  out: [number, number],
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 1e-8) {
    t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  }
  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  out[0] = cx;
  out[1] = cz;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

const tempSegPt: [number, number] = [0, 0];

/**
 * Prevents the player from moving horizontally through steep walls (like the Giant Stump wall
 * or rock cliffs) while allowing smooth sliding along walls and walking out EVERY Stump opening
 * (Canyon tunnel, Forest ramp & left exit tunnel, Upper-stump spiral ramp, Gazebo branch doorway,
 * and Caves shaft)!
 */
function resolveGorillaMapWallPush(
  px: number,
  footY: number,
  pz: number,
  bodyRadius: number,
  outXZ: [number, number],
) {
  let curX = px;
  let curZ = pz;
  // Use a narrow mid-body band [footY + 0.58, footY + 0.72] so low step risers (<= footY + 0.58)
  // and overhead doorway/tunnel arches (>= footY + 0.72) never block horizontal passage!
  const bandMinY = footY + 0.58;
  const bandMaxY = footY + 0.72;
  const gx = Math.floor(curX / GORILLA_GRID_CELL);
  const gz = Math.floor(curZ / GORILLA_GRID_CELL);
  const list = gorillaMapGrid.get(gorillaGridKey(gx, gz));
  const rSq = bodyRadius * bodyRadius;

  if (list) {
    for (let i = 0; i < list.length; i += 12) {
      const absNy = Math.abs(list[i + 10]);
      // Only push back against vertical/steep walls (not walkable floors/ramps)
      if (absNy > 0.42) continue;

      const ax = list[i];
      const ay = list[i + 1];
      const az = list[i + 2];
      const bx = list[i + 3];
      const by = list[i + 4];
      const bz = list[i + 5];
      const cx = list[i + 6];
      const cy = list[i + 7];
      const cz = list[i + 8];

      const minY = Math.min(ay, by, cy);
      const maxY = Math.max(ay, by, cy);

      if (
        maxY < bandMinY ||
        minY > bandMaxY ||
        curX < Math.min(ax, bx, cx) - bodyRadius ||
        curX > Math.max(ax, bx, cx) + bodyRadius ||
        curZ < Math.min(az, bz, cz) - bodyRadius ||
        curZ > Math.max(az, bz, cz) + bodyRadius
      ) {
        continue;
      }

      // Find the closest point on the triangle's 2D footprint (segments AB, BC, CA)
      let bestDistSq = closestPointOnSegment2D(curX, curZ, ax, az, bx, bz, tempSegPt);
      let bestX = tempSegPt[0];
      let bestZ = tempSegPt[1];

      const d2 = closestPointOnSegment2D(curX, curZ, bx, bz, cx, cz, tempSegPt);
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestX = tempSegPt[0];
        bestZ = tempSegPt[1];
      }

      const d3 = closestPointOnSegment2D(curX, curZ, cx, cz, ax, az, tempSegPt);
      if (d3 < bestDistSq) {
        bestDistSq = d3;
        bestX = tempSegPt[0];
        bestZ = tempSegPt[1];
      }

      if (bestDistSq < rSq && bestDistSq > 1e-8) {
        const dist = Math.sqrt(bestDistSq);
        const push = bodyRadius - dist;
        curX += ((curX - bestX) / dist) * push;
        curZ += ((curZ - bestZ) / dist) * push;
      }
    }
  }

  outXZ[0] = curX;
  outXZ[1] = curZ;
}

const SETTINGS_BUTTON_LAYOUT: Array<{
  action: number;
  offset: [number, number, number];
  size: [number, number, number];
  label: string;
  sublabel: string;
  accentColor: number;
}> = [
  {
    action: 0,
    offset: [0.325, 0.34, 0.02],
    size: [0.068, 0.058, 0.018],
    label: 'X',
    sublabel: 'CLOSE',
    accentColor: 0xe74c3c,
  },
  {
    action: 1,
    offset: [-0.175, 0.16, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'DAYTIME',
    sublabel: 'Sunny Blue Sky',
    accentColor: 0x38bdf8,
  },
  {
    action: 2,
    offset: [0.175, 0.16, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'NIGHTTIME',
    sublabel: 'Moon & Starry Sky',
    accentColor: 0x818cf8,
  },
  {
    action: 5,
    offset: [-0.175, -0.02, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'NORMAL MODE',
    sublabel: 'Thumbstick / WASD Walk',
    accentColor: 0x06b6d4,
  },
  {
    action: 6,
    offset: [0.175, -0.02, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'MONKE MODE',
    sublabel: 'Floor-Touch Hand Move',
    accentColor: 0xf59e0b,
  },
  {
    action: 7,
    offset: [-0.175, -0.2, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'BASIC MAP',
    sublabel: 'Oak Wood Room & Skylights',
    accentColor: 0x10b981,
  },
  {
    action: 8,
    offset: [0.175, -0.2, 0.022],
    size: [0.31, 0.135, 0.022],
    label: 'MONKE MAP',
    sublabel: 'Giant Stump Spawn & Forest',
    accentColor: 0xa855f7,
  },
];

function makeMenuCardTexture(
  title: string,
  subtitle: string,
  accentHex: string,
  active: boolean,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = active ? '#1e293b' : '#0f172a';
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = active ? accentHex : '#334155';
  ctx.lineWidth = active ? 14 : 6;
  ctx.strokeRect(10, 10, 492, 236);

  if (active) {
    ctx.fillStyle = accentHex;
    ctx.fillRect(22, 22, 118, 36);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACTIVE', 81, 41);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 118);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(subtitle, 256, 178);

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeHeaderTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 1024, 160);

  // 3-lines icon on the left
  ctx.fillStyle = '#38bdf8';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(44, 42 + i * 30, 56, 12);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('VR SETTINGS MENU', 124, 64);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('3-Lines Button / [M] Key  •  Day/Night, Monke Mode & Map Select', 124, 118);

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the 3-Lines Menu launcher button on the front-left corner of the table
 * plus the floating 3D VR Settings Menu panel and its interactive option buttons.
 */
function buildSettingsMenuAndLauncher(world: World, tableTop: number) {
  // 1. Physical 3-Lines Menu Button (☰) on the front-left corner of the table
  const menuBtnBase = new Mesh(
    new CylinderGeometry(0.054, 0.058, 0.028, 32),
    mat(0x1e293b, 0.35),
  );
  menuBtnBase.position.set(-TABLE.width / 2 + 0.09, tableTop + 0.014, TABLE.z + 0.18);

  const barMat = new MeshStandardMaterial({
    color: new Color(0x38bdf8),
    emissive: new Color(0x0284c7),
    emissiveIntensity: 0.55,
    roughness: 0.25,
  });
  [-0.018, 0, 0.018].forEach((bz) => {
    const bar = new Mesh(new BoxGeometry(0.052, 0.008, 0.009), barMat);
    bar.position.set(0, 0.016, bz);
    bar.raycast = () => {};
    menuBtnBase.add(bar);
  });

  const launcherEntity = world.createTransformEntity(menuBtnBase);
  launcherEntity.addComponent(RayInteractable);
  launcherEntity.addComponent(SettingsButton, { action: 0 });

  // 2. Floating 3D VR Settings Menu Panel (starts closed below floor; 3-lines button toggles it in front of player)
  const panelW = 0.78;
  const panelH = 0.78;
  const panelD = 0.024;
  const panelRoot = new Mesh(
    new BoxGeometry(panelW, panelH, panelD),
    new MeshStandardMaterial({
      color: new Color(0x0b1120),
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  panelRoot.position.set(0, -10, 0);

  // Outer glowing cyan frame border
  const borderMat = new MeshStandardMaterial({
    color: new Color(0x38bdf8),
    emissive: new Color(0x0284c7),
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });
  const topBorder = new Mesh(new BoxGeometry(panelW + 0.016, 0.012, panelD + 0.006), borderMat);
  topBorder.position.set(0, panelH / 2, 0);
  topBorder.raycast = () => {};
  panelRoot.add(topBorder);

  const botBorder = new Mesh(new BoxGeometry(panelW + 0.016, 0.012, panelD + 0.006), borderMat);
  botBorder.position.set(0, -panelH / 2, 0);
  botBorder.raycast = () => {};
  panelRoot.add(botBorder);

  // Header sign bar at top of Settings Menu
  const headerBanner = new Mesh(
    new BoxGeometry(0.62, 0.088, 0.006),
    new MeshStandardMaterial({
      map: makeHeaderTexture(),
      roughness: 0.35,
    }),
  );
  headerBanner.position.set(-0.04, 0.335, panelD / 2 + 0.004);
  headerBanner.raycast = () => {};
  panelRoot.add(headerBanner);

  const menuEntity = world.createTransformEntity(panelRoot);
  menuEntity.addComponent(SettingsMenu, { open: false });

  // 3. Interactive Option Buttons (Close, Daytime, Nighttime, Normal Mode, Monke Mode, Basic Map, Monke Map)
  for (const cfg of SETTINGS_BUTTON_LAYOUT) {
    const [bw, bh, bd] = cfg.size;
    const isClose = cfg.action === 0;
    const btnMesh = new Mesh(
      new BoxGeometry(bw, bh, bd),
      isClose
        ? new MeshStandardMaterial({
            color: new Color(0xdc2626),
            emissive: new Color(0x7f1d1d),
            emissiveIntensity: 0.4,
            roughness: 0.3,
          })
        : new MeshStandardMaterial({
            map: makeMenuCardTexture(
              cfg.label,
              cfg.sublabel,
              '#' + cfg.accentColor.toString(16).padStart(6, '0'),
              cfg.action === 1 || cfg.action === 5 || cfg.action === 7,
            ),
            roughness: 0.3,
          }),
    );
    btnMesh.name = `settings-btn-${cfg.action}`;
    btnMesh.position.set(0, -10, 0);

    // Add 3D miniature preview icons onto the cards
    if (cfg.action === 1) {
      // Sun icon on Daytime button
      const sun = new Mesh(
        new SphereGeometry(0.022, 16, 12),
        new MeshStandardMaterial({
          color: new Color(0xfacc15),
          emissive: new Color(0xf59e0b),
          emissiveIntensity: 0.9,
          roughness: 0.2,
        }),
      );
      sun.position.set(-0.11, 0.036, bd / 2 + 0.012);
      sun.raycast = () => {};
      btnMesh.add(sun);
    } else if (cfg.action === 2) {
      // Moon icon on Nighttime button
      const moon = new Mesh(
        new SphereGeometry(0.02, 16, 12),
        new MeshStandardMaterial({
          color: new Color(0xfef08a),
          emissive: new Color(0xeab308),
          emissiveIntensity: 0.7,
          roughness: 0.25,
        }),
      );
      moon.position.set(-0.11, 0.036, bd / 2 + 0.012);
      moon.raycast = () => {};
      btnMesh.add(moon);
    } else if (cfg.action === 5) {
      // Miniature thumbstick / controller icon on Normal Mode button
      const stickBase = new Mesh(
        new CylinderGeometry(0.016, 0.018, 0.008, 16),
        mat(0x0ea5e9, 0.4),
      );
      stickBase.rotation.x = Math.PI / 2;
      stickBase.position.set(-0.115, 0.036, bd / 2 + 0.01);
      stickBase.raycast = () => {};
      const stickTop = new Mesh(
        new SphereGeometry(0.011, 14, 10),
        mat(0x38bdf8, 0.3),
      );
      stickTop.position.set(0, 0.01, 0);
      stickTop.raycast = () => {};
      stickBase.add(stickTop);
      btnMesh.add(stickBase);
    } else if (cfg.action === 6) {
      // Miniature Monke head icon on Monke Mode button
      const monkeIcon = new Mesh(
        new SphereGeometry(0.018, 14, 12),
        mat(0x854d0e, 0.55),
      );
      monkeIcon.position.set(-0.115, 0.036, bd / 2 + 0.012);
      monkeIcon.raycast = () => {};
      const muzzle = new Mesh(
        new SphereGeometry(0.012, 12, 10),
        mat(0xfde68a, 0.5),
      );
      muzzle.position.set(0, -0.004, 0.012);
      muzzle.raycast = () => {};
      monkeIcon.add(muzzle);
      btnMesh.add(monkeIcon);
    }

    const be = world.createTransformEntity(btnMesh);
    be.addComponent(RayInteractable);
    be.addComponent(SettingsButton, { action: cfg.action });
  }
}

/**
 * Manages:
 * 1. Keeping the default clear white XR hand and controller visuals active, with no
 *    player torso/legs mesh in any mode.
 * 2. Toggling the VR Settings Menu when pressing the 3-lines button on the left
 *    controller (`InputComponent.Menu` / button 7, or X/Y fallback, or `M` key on
 *    desktop, or clicking the physical 3-lines button on the table).
 * 3. Switching between Daytime and Nighttime lighting/sky/clouds, between Normal Mode and
 *    Monke Mode (where gravity drops you to the ground and moving your hands moves you
 *    ONLY when your hands touch the floor/surface), and between the Basic Map (Oak Room)
 *    and Monke Map (Giant Stump & Forest with all stump openings passable).
 */
export class SettingsAndHandsSystem extends createSystem({
  menus: { required: [SettingsMenu] },
  buttons: { required: [SettingsButton] },
  pressedButtons: { required: [SettingsButton, Pressed] },
  grabbed: { required: [Grabbed] },
}) {
  private isNight = false;
  private monkeMode = false;
  private monkeMap = false;
  private wasMKeyDown = false;
  private wasGKeyDown = false;
  private browserHudOpen = false;
  private browserHudModal: HTMLDivElement | null = null;
  private browserHudBtnMap = new Map<number, HTMLButtonElement>();
  private browserStatusBadge: HTMLSpanElement | null = null;

  // Monke Mode floor-touch hand-locomotion & Monke Map traversal state
  private handWorldPos = new Vector3();
  private handRelCurr = [new Vector3(), new Vector3()];
  private handRelPrev = [new Vector3(), new Vector3()];
  private handDelta = new Vector3();
  private hasHandPrev = [false, false];
  private monkeVel = new Vector3();
  private mapVertSample: [number, number] = [0, 3.3];
  private handVertSample: [number, number] = [0, 3.3];
  private mapWallSample: [number, number] = [0, 0];
  private wallTeleportPos = new Vector3();
  private wallTeleportQuat = new Quaternion();
  private spawnPos = new Vector3(0, 0, 0.6);
  private walkForward = new Vector3();
  private walkRight = new Vector3();

  private dirLight: DirectionalLight | null = null;
  private hemiLight: HemisphereLight | null = null;

  private headPos = new Vector3();
  private headDir = new Vector3();
  private menuPos = new Vector3(0, 1.42, -1.05);
  private menuQuat = new Quaternion();
  private btnOffset = new Vector3();
  private upAxis = new Vector3(0, 1, 0);

  init() {
    // Keep IWSDK's default clear white XR hands and controllers visible!
    this.input.visualAdapters.hand.left.toggleVisual(true);
    this.input.visualAdapters.hand.right.toggleVisual(true);
    this.input.visualAdapters.controller.left.toggleVisual(true);
    this.input.visualAdapters.controller.right.toggleVisual(true);

    this.initBrowserSettingsHUD();

    this.cleanupFuncs.push(
      this.queries.pressedButtons.subscribe('qualify', (e) => {
        const action = e.getValue(SettingsButton, 'action') ?? 0;
        this.handleAction(action);
      }),
    );
  }

  private initBrowserSettingsHUD() {
    if (typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.id = 'vr-browser-settings-hud';
    root.style.cssText =
      'position:fixed;top:14px;left:14px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;user-select:none;';

    // Top-left bar with ☰ SETTINGS button + Quick Map & Mode pills
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

    const launcherBtn = document.createElement('button');
    launcherBtn.type = 'button';
    launcherBtn.innerHTML = '&#9776; SETTINGS <span style="opacity:0.75;font-size:11px;margin-left:4px;">[M]</span>';
    launcherBtn.style.cssText =
      'background:#0f172a;color:#38bdf8;border:2px solid #38bdf8;border-radius:8px;padding:8px 14px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;gap:6px;';
    launcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAction(0);
    });

    const quickBasicBtn = document.createElement('button');
    quickBasicBtn.type = 'button';
    quickBasicBtn.textContent = 'Basic Map';
    quickBasicBtn.style.cssText =
      'background:#0f172a;color:#e2e8f0;border:2px solid #10b981;border-radius:8px;padding:7px 11px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.35);';
    quickBasicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAction(7);
    });

    const quickMonkeMapBtn = document.createElement('button');
    quickMonkeMapBtn.type = 'button';
    quickMonkeMapBtn.textContent = 'Monke Map (Giant Stump)';
    quickMonkeMapBtn.style.cssText =
      'background:#0f172a;color:#e2e8f0;border:2px solid #a855f7;border-radius:8px;padding:7px 11px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.35);';
    quickMonkeMapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAction(8);
    });

    const statusBadge = document.createElement('span');
    statusBadge.style.cssText =
      'background:rgba(15,23,42,0.85);color:#cbd5e1;border:1px solid #334155;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;';
    this.browserStatusBadge = statusBadge;

    topBar.append(launcherBtn, quickBasicBtn, quickMonkeMapBtn, statusBadge);
    root.appendChild(topBar);

    // Popup Settings Card for Browser users
    const modal = document.createElement('div');
    modal.style.cssText =
      'display:none;margin-top:10px;width:360px;background:rgba(11,17,32,0.96);border:2px solid #38bdf8;border-radius:12px;padding:14px;box-shadow:0 12px 32px rgba(0,0,0,0.65);color:#fff;';
    this.browserHudModal = modal;

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:10px;';
    header.innerHTML =
      '<div style="font-weight:800;font-size:15px;color:#38bdf8;">&#9776; SETTINGS MENU</div>';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText =
      'background:#dc2626;color:#fff;border:none;border-radius:6px;padding:3px 9px;font-weight:800;cursor:pointer;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAction(0);
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

    for (const cfg of SETTINGS_BUTTON_LAYOUT) {
      if (cfg.action === 0) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText =
        'background:#0f172a;color:#fff;border:2px solid #334155;border-radius:8px;padding:9px 8px;text-align:center;cursor:pointer;transition:all 0.12s;';
      btn.innerHTML = `<div style="font-weight:800;font-size:13px;">${cfg.label}</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${cfg.sublabel}</div>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAction(cfg.action);
      });
      this.browserHudBtnMap.set(cfg.action, btn);
      grid.appendChild(btn);
    }

    modal.appendChild(grid);

    const hint = document.createElement('div');
    hint.style.cssText =
      'margin-top:10px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #1e293b;padding-top:8px;';
    hint.textContent =
      'Browser Controls: WASD Move • Mouse Drag / Right-Click Look • [M] Settings • [G] Monke Mode';
    modal.appendChild(hint);

    root.appendChild(modal);
    document.body.appendChild(root);

    this.refreshBrowserHUD();
    this.cleanupFuncs.push(() => root.remove());
  }

  private refreshBrowserHUD() {
    if (this.browserHudModal) {
      this.browserHudModal.style.display = this.browserHudOpen ? 'block' : 'none';
    }
    if (this.browserStatusBadge) {
      const mapName = this.monkeMap ? 'Monke Map (Giant Stump)' : 'Basic Map (Oak Room)';
      const modeName = this.monkeMode ? 'Monke Mode' : 'Normal Mode';
      this.browserStatusBadge.textContent = `${mapName} • ${modeName}`;
    }
    for (const cfg of SETTINGS_BUTTON_LAYOUT) {
      if (cfg.action === 0) continue;
      const btn = this.browserHudBtnMap.get(cfg.action);
      if (!btn) continue;
      const isActive =
        (cfg.action === 1 && !this.isNight) ||
        (cfg.action === 2 && this.isNight) ||
        (cfg.action === 5 && !this.monkeMode) ||
        (cfg.action === 6 && this.monkeMode) ||
        (cfg.action === 7 && !this.monkeMap) ||
        (cfg.action === 8 && this.monkeMap);
      const accentHex = '#' + cfg.accentColor.toString(16).padStart(6, '0');
      btn.style.borderColor = isActive ? accentHex : '#334155';
      btn.style.background = isActive ? '#1e293b' : '#0f172a';
    }
  }

  private handleAction(action: number) {
    if (action === 0) {
      this.toggleMenu();
      playSynthTone(520, 0.12, 'sine', 660);
    } else if (action === 1) {
      this.applyTimeOfDay(false);
      this.refreshMenuButtonTextures();
      playSynthTone(587.33, 0.18, 'triangle', 880);
    } else if (action === 2) {
      this.applyTimeOfDay(true);
      this.refreshMenuButtonTextures();
      playSynthTone(440, 0.22, 'sine', 329.63);
    } else if (action === 5) {
      this.applyMonkeMode(false);
      this.refreshMenuButtonTextures();
      playSynthTone(440, 0.16, 'sine', 587.33);
    } else if (action === 6) {
      this.applyMonkeMode(true);
      this.refreshMenuButtonTextures();
      // Fun playful monke audio chirp!
      playSynthTone(320, 0.18, 'sawtooth', 640);
    } else if (action === 7) {
      this.applyMapMode(false);
      this.refreshMenuButtonTextures();
      playSynthTone(440, 0.16, 'sine', 523.25);
    } else if (action === 8) {
      this.applyMapMode(true);
      this.refreshMenuButtonTextures();
      playSynthTone(349.23, 0.18, 'triangle', 587.33);
    }
  }

  private applyMapMode(isMonkeMap: boolean) {
    this.monkeMap = isMonkeMap;
    procEnv.setMap(isMonkeMap);

    // Show the Gorilla Tag Map (Giant Stump at (0,0,0) + Forest, Gazebo, Treehouse, Canyon, Caves)
    // when Monke Map is active, or show the Basic Oak Wood Room when Basic Map is active!
    if (sceneSkyRefs.gorillaTagMapGroup) {
      sceneSkyRefs.gorillaTagMapGroup.visible = isMonkeMap;
    }
    if (sceneSkyRefs.floorMesh) {
      sceneSkyRefs.floorMesh.visible = !isMonkeMap;
    }
    if (sceneSkyRefs.indoorArchGroup) {
      sceneSkyRefs.indoorArchGroup.visible = !isMonkeMap;
    }
    if (sceneSkyRefs.skyCanopy) {
      if (isMonkeMap) {
        sceneSkyRefs.skyCanopy.scale.set(28, 1, 34);
        sceneSkyRefs.skyCanopy.position.set(0, 88, 0);
      } else {
        sceneSkyRefs.skyCanopy.scale.set(1, 1, 1);
        sceneSkyRefs.skyCanopy.position.set(0, 6.7, 0);
      }
    }

    // Move the 4 indoor oak wall static physics colliders & ceiling collider out of the way in Monke Map,
    // and remove them from LocomotionSystem BEFORE removing the LocomotionEnvironment component so
    // Locomotor's internal handle is properly unregistered!
    const physics = this.world.getSystem(PhysicsSystem);
    const locomotion = this.world.getSystem(LocomotionSystem) as unknown as {
      config?: { slidingSpeed: { value: number } };
      setPlayerPosition?: (p: Vector3) => void;
      removeEnvironmentFromEngine?: (e: Entity) => void;
    } | undefined;

    this.wallTeleportQuat.identity();
    for (const wall of sceneSkyRefs.wallColliders) {
      wall.mesh.visible = !isMonkeMap;
      if (isMonkeMap) {
        if (wall.entity.hasComponent(LocomotionEnvironment)) {
          locomotion?.removeEnvironmentFromEngine?.(wall.entity);
          wall.entity.removeComponent(LocomotionEnvironment);
        }
      } else {
        if (!wall.entity.hasComponent(LocomotionEnvironment)) {
          wall.entity.addComponent(LocomotionEnvironment);
        }
      }
      this.wallTeleportPos.set(
        wall.homePos[0],
        isMonkeMap ? -60 : wall.homePos[1],
        wall.homePos[2],
      );
      wall.mesh.position.copy(this.wallTeleportPos);
      physics?.setBodyTransform(wall.entity, {
        position: this.wallTeleportPos,
        quaternion: this.wallTeleportQuat,
      });
    }
    if (sceneSkyRefs.floorEntity) {
      if (isMonkeMap) {
        if (sceneSkyRefs.floorEntity.hasComponent(LocomotionEnvironment)) {
          locomotion?.removeEnvironmentFromEngine?.(sceneSkyRefs.floorEntity);
          sceneSkyRefs.floorEntity.removeComponent(LocomotionEnvironment);
        }
      } else {
        if (!sceneSkyRefs.floorEntity.hasComponent(LocomotionEnvironment)) {
          sceneSkyRefs.floorEntity.addComponent(LocomotionEnvironment);
        }
      }
    }
    if (sceneSkyRefs.gorillaTagWalkableEntity) {
      if (isMonkeMap) {
        if (!sceneSkyRefs.gorillaTagWalkableEntity.hasComponent(LocomotionEnvironment)) {
          sceneSkyRefs.gorillaTagWalkableEntity.addComponent(LocomotionEnvironment);
        }
      } else {
        if (sceneSkyRefs.gorillaTagWalkableEntity.hasComponent(LocomotionEnvironment)) {
          locomotion?.removeEnvironmentFromEngine?.(sceneSkyRefs.gorillaTagWalkableEntity);
          sceneSkyRefs.gorillaTagWalkableEntity.removeComponent(LocomotionEnvironment);
        }
      }
    }
    if (sceneSkyRefs.ceilCollider) {
      const c = sceneSkyRefs.ceilCollider;
      this.wallTeleportPos.set(
        c.homePos[0],
        isMonkeMap ? -60 : c.homePos[1],
        c.homePos[2],
      );
      c.entity.object3D?.position.copy(this.wallTeleportPos);
      physics?.setBodyTransform(c.entity, {
        position: this.wallTeleportPos,
        quaternion: this.wallTeleportQuat,
      });
    }

    // In Monke Map or Monke Mode, our spatial-grid solver handles smooth ground/ramp/tunnel collision
    // so Locomotor's 1.0m-wide capsule never blocks narrow stump tunnels or steps!
    if (locomotion?.config) {
      locomotion.config.slidingSpeed.value =
        this.monkeMode || this.monkeMap ? 0.0001 : 3.0;
    }

    // Spawn the player inside the Giant Stump (0, 0, 0.6) in Monke Map or in front of the table in Basic Room
    this.monkeVel.set(0, 0, 0);
    this.spawnPos.set(0, 0, 0.6);
    this.player.position.copy(this.spawnPos);
    locomotion?.setPlayerPosition?.(this.spawnPos);
    this.world.getSystem(ResetSystem)?.resetAll();

    // If the floating Settings Menu is currently open, keep it positioned right in front of the player at the spawnpoint
    for (const m of this.queries.menus.entities) {
      if (m.getValue(SettingsMenu, 'open')) {
        this.camera.getWorldPosition(this.headPos);
        this.camera.getWorldDirection(this.headDir);
        this.headDir.y = 0;
        if (this.headDir.lengthSq() < 0.001) {
          this.headDir.set(0, 0, -1);
        } else {
          this.headDir.normalize();
        }
        this.menuPos.copy(this.headPos).addScaledVector(this.headDir, 1.05);
        this.menuPos.y = Math.max(1.15, Math.min(1.65, this.headPos.y - 0.05));
        const yaw = Math.atan2(-this.headDir.x, -this.headDir.z);
        this.menuQuat.setFromAxisAngle(this.upAxis, yaw);
        this.syncMenuTransforms(m, true);
      }
    }
  }

  private applyMonkeMode(enabled: boolean) {
    this.monkeMode = enabled;

    // Reset hand-locomotion tracking state
    this.hasHandPrev[0] = false;
    this.hasHandPrev[1] = false;
    this.monkeVel.set(0, 0, 0);

    // Switching to Monke Mode automatically spawns you in the Monke Map (Giant Stump);
    // switching back to Normal Mode returns to the Basic Map (and you can also toggle maps separately!)
    this.applyMapMode(enabled);
  }

  private findSceneLights() {
    if (this.dirLight && this.hemiLight) return;
    this.scene.traverse((obj: Object3D) => {
      if ((obj as DirectionalLight).isDirectionalLight) {
        this.dirLight = obj as DirectionalLight;
      } else if ((obj as HemisphereLight).isHemisphereLight) {
        this.hemiLight = obj as HemisphereLight;
      }
    });
  }

  private applyTimeOfDay(night: boolean) {
    this.isNight = night;
    this.findSceneLights();

    if (this.dirLight) {
      this.dirLight.color.setHex(night ? 0x7ea8ff : 0xfff1de);
      this.dirLight.intensity = night ? 0.65 : 2.3;
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(night ? 0x22355c : 0xc7d4f5);
      this.hemiLight.groundColor.setHex(night ? 0x453528 : 0x979ba6);
      this.hemiLight.intensity = night ? 0.52 : 1.15;
    }
    if (sceneSkyRefs.skyCanopyMat) {
      sceneSkyRefs.skyCanopyMat.color.setHex(night ? 0x050918 : 0x68b9ff);
      sceneSkyRefs.skyCanopyMat.emissive.setHex(night ? 0x060d24 : 0x4aa3f0);
      sceneSkyRefs.skyCanopyMat.emissiveIntensity = night ? 0.85 : 0.75;
    }
    if (sceneSkyRefs.cloudMat) {
      sceneSkyRefs.cloudMat.color.setHex(night ? 0x33476b : 0xffffff);
      sceneSkyRefs.cloudMat.emissive.setHex(night ? 0x16233b : 0xdceeff);
      sceneSkyRefs.cloudMat.emissiveIntensity = night ? 0.28 : 0.35;
    }
    if (sceneSkyRefs.glassMat) {
      sceneSkyRefs.glassMat.color.setHex(night ? 0x1b2e54 : 0x9ad4ff);
      sceneSkyRefs.glassMat.opacity = night ? 0.26 : 0.18;
    }
    if (sceneSkyRefs.nightSkyGroup) {
      sceneSkyRefs.nightSkyGroup.visible = false;
    }
    if (sceneSkyRefs.indoorNightLight) {
      sceneSkyRefs.indoorNightLight.intensity = night ? 1.35 : 0;
    }
    procEnv.setNight(night);
  }

  private refreshMenuButtonTextures() {
    this.refreshBrowserHUD();

    for (const b of this.queries.buttons.entities) {
      const action = b.getValue(SettingsButton, 'action') ?? 0;
      if (action === 0) continue;
      const cfg = SETTINGS_BUTTON_LAYOUT.find((c) => c.action === action);
      if (!cfg) continue;
      const mesh = b.object3D as Mesh | undefined;
      if (!mesh) continue;

      const isActive =
        (action === 1 && !this.isNight) ||
        (action === 2 && this.isNight) ||
        (action === 5 && !this.monkeMode) ||
        (action === 6 && this.monkeMode) ||
        (action === 7 && !this.monkeMap) ||
        (action === 8 && this.monkeMap);

      const matStd = mesh.material as MeshStandardMaterial;
      if (matStd.map) {
        matStd.map.dispose();
      }
      matStd.map = makeMenuCardTexture(
        cfg.label,
        cfg.sublabel,
        '#' + cfg.accentColor.toString(16).padStart(6, '0'),
        isActive,
      );
      matStd.needsUpdate = true;
    }
  }

  private toggleMenu() {
    for (const m of this.queries.menus.entities) {
      const nextOpen = !(m.getValue(SettingsMenu, 'open') ?? false);
      m.setValue(SettingsMenu, 'open', nextOpen);
      this.browserHudOpen = nextOpen;

      if (nextOpen && typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock?.();
      }

      if (nextOpen) {
        // Place the floating Settings Menu comfortably in front of the player's current view
        this.camera.getWorldPosition(this.headPos);
        this.camera.getWorldDirection(this.headDir);
        this.headDir.y = 0;
        if (this.headDir.lengthSq() < 0.001) {
          this.headDir.set(0, 0, -1);
        } else {
          this.headDir.normalize();
        }

        this.menuPos
          .copy(this.headPos)
          .addScaledVector(this.headDir, 1.05);
        this.menuPos.y = Math.max(1.15, Math.min(1.65, this.headPos.y - 0.05));

        const yaw = Math.atan2(-this.headDir.x, -this.headDir.z);
        this.menuQuat.setFromAxisAngle(this.upAxis, yaw);
      }

      this.syncMenuTransforms(m, nextOpen);
    }
    this.refreshBrowserHUD();
  }

  private syncMenuTransforms(menuEntity: Entity, isOpen: boolean) {
    const menuObj = menuEntity.object3D;
    if (!menuObj) return;

    if (!isOpen) {
      menuObj.position.set(0, -10, 0);
      for (const b of this.queries.buttons.entities) {
        const action = b.getValue(SettingsButton, 'action') ?? 0;
        const bObj = b.object3D;
        if (!bObj) continue;
        // Keep the tabletop 3-lines launcher button (which has no 'settings-btn-' prefix) on the table
        if (!bObj.name.startsWith('settings-btn-')) continue;
        bObj.position.set(0, -10, 0);
        if (action === 0) continue;
      }
      return;
    }

    menuObj.position.copy(this.menuPos);
    menuObj.quaternion.copy(this.menuQuat);

    for (const b of this.queries.buttons.entities) {
      const bObj = b.object3D;
      if (!bObj || !bObj.name.startsWith('settings-btn-')) continue;
      const action = b.getValue(SettingsButton, 'action') ?? 0;
      const cfg = SETTINGS_BUTTON_LAYOUT.find((c) => c.action === action);
      if (!cfg) continue;

      this.btnOffset
        .set(cfg.offset[0], cfg.offset[1], cfg.offset[2])
        .applyQuaternion(this.menuQuat);
      bObj.position.copy(this.menuPos).add(this.btnOffset);
      bObj.quaternion.copy(this.menuQuat);
    }
  }

  update(delta: number) {
    const dt = Math.min(Math.max(delta, 0.004), 0.05);
    this.camera.getWorldPosition(this.headPos);
    this.camera.getWorldDirection(this.headDir);

    const isHoldingObject = this.queries.grabbed.entities.size > 0;

    // 1. MONKE MODE: Move ONLY when your hands touch the floor / ground surface (no air-floating!)
    for (let idx = 0; idx < 2; idx++) {
      const side = idx === 0 ? 'left' : 'right';
      if (this.monkeMode) {
        this.player.gripSpaces[side].getWorldPosition(this.handWorldPos);
        // Track hand offset relative to player rig so moving player.position doesn't feed back
        this.handRelCurr[idx]
          .copy(this.handWorldPos)
          .sub(this.player.position);

        if (this.hasHandPrev[idx] && !isHoldingObject) {
          this.handDelta
            .copy(this.handRelCurr[idx])
            .sub(this.handRelPrev[idx]);
          const handMoveLen = this.handDelta.length();

          if (handMoveLen > 0.0004 && handMoveLen < 0.45) {
            const hx = this.handWorldPos.x;
            const hy = this.handWorldPos.y;
            const hz = this.handWorldPos.z;

            // Check if the hand is touching the center table top
            const touchingTable =
              Math.abs(hx) <= TABLE.width / 2 + 0.14 &&
              Math.abs(hz - TABLE.z) <= TABLE.depth / 2 + 0.14 &&
              hy >= TABLE.height - 0.12 &&
              hy <= TABLE.height + 0.22;

            // Check if the hand is actually touching the floor / ground / ramp under the hand
            let touchingFloor = touchingTable || (hy >= this.player.position.y - 0.25 && hy <= this.player.position.y + 0.30);

            if (!touchingFloor && this.monkeMap) {
              sampleGorillaMapVertical(hx, this.player.position.y, hz, this.handVertSample);
              const handGroundY = this.handVertSample[0];
              if (handGroundY > -100 && hy >= handGroundY - 0.18 && hy <= handGroundY + 0.30) {
                touchingFloor = true;
              } else if (
                hy <= this.player.position.y + 0.45 &&
                isHandTouchingGorillaMap(hx, hy, hz, 0.24)
              ) {
                touchingFloor = true;
              }
            }

            if (touchingFloor) {
              const pushGain = 1.65;
              const px = -this.handDelta.x * pushGain;
              const pz = -this.handDelta.z * pushGain;

              this.player.position.x += px;
              this.player.position.z += pz;

              // Impart horizontal ground push momentum
              const vx = px / dt;
              const vz = pz / dt;
              this.monkeVel.x = this.monkeVel.x * 0.4 + vx * 0.65;
              this.monkeVel.z = this.monkeVel.z * 0.4 + vz * 0.65;

              // Only give a small upward hop when slamming a hand sharply downward into the floor
              // (never add continuous upward lift that would make you float while moving hands!)
              const downSpeed = -this.handDelta.y / dt;
              if (downSpeed > 1.05 && this.monkeVel.y <= 0.25) {
                this.monkeVel.y = Math.min(2.6, downSpeed * 0.55);
              }
            }
          }
        }

        this.handRelPrev[idx].copy(this.handRelCurr[idx]);
        this.hasHandPrev[idx] = true;
      } else {
        this.hasHandPrev[idx] = false;
      }
    }

    // In Normal Mode on the Monke Map, drive WASD / thumbstick walking through our opening-passable
    // spatial solver so the player can walk through every Giant Stump opening in Normal Mode too!
    if (!this.monkeMode && this.monkeMap) {
      this.walkForward.copy(this.headDir);
      this.walkForward.y = 0;
      if (this.walkForward.lengthSq() > 0.0001) {
        this.walkForward.normalize();
      } else {
        this.walkForward.set(0, 0, -1);
      }
      this.walkRight.set(-this.walkForward.z, 0, this.walkForward.x);

      let moveFwd = 0;
      let moveStrafe = 0;
      const kb = this.input.keyboard;
      if (kb) {
        if (kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp')) moveFwd += 1;
        if (kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown')) moveFwd -= 1;
        if (kb.getKeyPressed('KeyD') || kb.getKeyPressed('ArrowRight')) moveStrafe += 1;
        if (kb.getKeyPressed('KeyA') || kb.getKeyPressed('ArrowLeft')) moveStrafe -= 1;
      }
      const gpLeft = this.input.gamepads.left;
      const axes = gpLeft?.getAxesValues(InputComponent.Thumbstick);
      if (axes) {
        if (Math.abs(axes.x) > 0.12) moveStrafe += axes.x;
        if (Math.abs(axes.y) > 0.12) moveFwd -= axes.y;
      }

      const len = Math.hypot(moveFwd, moveStrafe);
      if (len > 0.01) {
        const scale = (Math.min(1, len) * 3.4 * dt) / len;
        this.player.position.x +=
          (this.walkForward.x * moveFwd + this.walkRight.x * moveStrafe) * scale;
        this.player.position.z +=
          (this.walkForward.z * moveFwd + this.walkRight.z * moveStrafe) * scale;
      }
    }

    // Integrate gravity, momentum, and collision when in Monke Mode OR when on the Monke Map
    if (this.monkeMode || this.monkeMap) {
      this.player.position.x += this.monkeVel.x * dt;
      this.player.position.y += this.monkeVel.y * dt;
      this.player.position.z += this.monkeVel.z * dt;

      if (this.monkeMap) {
        // Resolve horizontal wall collision against the Giant Stump walls, trees, rocks & canyon
        // using a sleek 0.20m radius so all stump openings and tunnels are easily passable!
        const headOffsetX = this.headPos.x - this.player.position.x;
        const headOffsetZ = this.headPos.z - this.player.position.z;
        const bodyX = this.player.position.x + headOffsetX;
        const bodyZ = this.player.position.z + headOffsetZ;

        resolveGorillaMapWallPush(
          bodyX,
          this.player.position.y,
          bodyZ,
          0.20,
          this.mapWallSample,
        );
        this.player.position.x = this.mapWallSample[0] - headOffsetX;
        this.player.position.z = this.mapWallSample[1] - headOffsetZ;

        // Sample Gorilla Tag map ground/ramp/branch height under the player
        sampleGorillaMapVertical(
          this.mapWallSample[0],
          this.player.position.y,
          this.mapWallSample[1],
          this.mapVertSample,
        );
        let groundY = this.mapVertSample[0];

        // Inside the Giant Stump, also allow stepping onto the center table!
        const overTable =
          Math.abs(this.mapWallSample[0]) < TABLE.width / 2 - 0.04 &&
          Math.abs(this.mapWallSample[1] - TABLE.z) < TABLE.depth / 2 - 0.04 &&
          this.player.position.y >= TABLE.height - 0.22 &&
          this.player.position.y <= TABLE.height + 1.8;
        if (overTable && TABLE.height > groundY) {
          groundY = TABLE.height;
        }

        // Always pull the player down with crisp gravity (12.5 m/s²) when above the floor so you drop immediately!
        if (groundY > -100) {
          if (this.player.position.y > groundY + 0.005) {
            this.monkeVel.y -= 12.5 * dt;
            if (this.player.position.y + this.monkeVel.y * dt <= groundY) {
              this.player.position.y = groundY;
              if (this.monkeVel.y < 0) this.monkeVel.y = 0;
            }
          } else {
            this.player.position.y = groundY;
            if (this.monkeVel.y < 0) this.monkeVel.y = 0;
          }
        } else {
          this.monkeVel.y -= 12.5 * dt;
        }
      } else {
        // Monke Mode inside the Basic Oak Wood Room
        const overTable =
          Math.abs(this.headPos.x) < TABLE.width / 2 - 0.05 &&
          Math.abs(this.headPos.z - TABLE.z) < TABLE.depth / 2 - 0.05 &&
          this.player.position.y >= TABLE.height - 0.18;
        const groundY = overTable ? TABLE.height : 0;

        if (this.player.position.y > groundY + 0.005) {
          this.monkeVel.y -= 12.5 * dt;
          if (this.player.position.y + this.monkeVel.y * dt <= groundY) {
            this.player.position.y = groundY;
            if (this.monkeVel.y < 0) this.monkeVel.y = 0;
          }
        } else {
          this.player.position.y = groundY;
          if (this.monkeVel.y < 0) this.monkeVel.y = 0;
        }

        const maxX = ROOM.width / 2 - 0.32;
        const maxZ = ROOM.depth / 2 - 0.32;
        this.player.position.x = Math.max(-maxX, Math.min(maxX, this.player.position.x));
        this.player.position.z = Math.max(-maxZ, Math.min(maxZ, this.player.position.z));
        this.player.position.y = Math.min(1.85, this.player.position.y);
      }

      // Safety respawn inside the Giant Stump if the player ever falls below the map
      if (this.player.position.y < -85) {
        this.spawnPos.set(0, 0, 0.6);
        this.player.position.copy(this.spawnPos);
        this.monkeVel.set(0, 0, 0);
      }

      // Keep LocomotionSystem synchronized with the player position
      this.world.getSystem(LocomotionSystem)?.setPlayerPosition(this.player.position);

      const damping = Math.exp(-4.2 * dt);
      this.monkeVel.x *= damping;
      this.monkeVel.z *= damping;
    }

    // 2. Check 3-Lines Menu Button on left Quest controller (InputComponent.Menu / button 7, or X/Y fallback)
    const gpLeft = this.input.gamepads.left;
    if (
      gpLeft?.getButtonDown(InputComponent.Menu) ||
      gpLeft?.getButtonDownByIdx(7) ||
      gpLeft?.getButtonDown(InputComponent.Y_Button) ||
      gpLeft?.getButtonDown(InputComponent.X_Button)
    ) {
      this.toggleMenu();
      playSynthTone(520, 0.12, 'sine', 660);
    }

    // 3. Desktop keyboard shortcuts: 'M' toggles Settings Menu, 'G' toggles Monke Mode
    const isMDown = Boolean(this.input.keyboard?.getKeyPressed('KeyM'));
    if (isMDown && !this.wasMKeyDown) {
      this.toggleMenu();
      playSynthTone(520, 0.12, 'sine', 660);
    }
    this.wasMKeyDown = isMDown;

    const isGDown = Boolean(this.input.keyboard?.getKeyPressed('KeyG'));
    if (isGDown && !this.wasGKeyDown) {
      this.applyMonkeMode(!this.monkeMode);
      this.refreshMenuButtonTextures();
      playSynthTone(this.monkeMode ? 320 : 440, 0.18, 'sawtooth', this.monkeMode ? 640 : 587.33);
    }
    this.wasGKeyDown = isGDown;
  }
}

