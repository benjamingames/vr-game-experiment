import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DistanceGrabbable,
  Entity,
  Grabbed,
  InputComponent,
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
  SphereGeometry,
  Vector3,
  World,
  createSystem,
} from '@iwsdk/core';
import { Dart, ResetButton, Resettable } from './ball-components.js';

// ---- Tweak these to play around -------------------------------------------
const ROOM = { width: 6, depth: 6, height: 3 }; // meters; player starts at the center
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
  z: -ROOM.depth / 2 + 0.02,
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
  return e;
}

export function buildRoom(world: World) {
  const { width: W, depth: D, height: H } = ROOM;
  const t = 0.2; // wall thickness

  // Floor (top surface at y = 0), walls, ceiling
  staticBox(world, [W, t, D], [0, -t / 2, 0], 0x8a7560);
  staticBox(world, [W, H, t], [0, H / 2, -D / 2 - t / 2], 0xd9d4cc);
  staticBox(world, [W, H, t], [0, H / 2, D / 2 + t / 2], 0xd9d4cc);
  staticBox(world, [t, H, D], [-W / 2 - t / 2, H / 2, 0], 0xcfd8d9);
  staticBox(world, [t, H, D], [W / 2 + t / 2, H / 2, 0], 0xcfd8d9);
  staticBox(world, [W, t, D], [0, H + t / 2, 0], 0xf2f2f2, false);

  // Table in front of the player
  staticBox(
    world,
    [TABLE.width, TABLE.height, TABLE.depth],
    [0, TABLE.height / 2, TABLE.z],
    0x6b4a2f,
  );
  const tableTop = TABLE.height;

  // Balls on the left side of the table: squeeze (grip) to grab up close, or point + trigger from afar
  BALL_COLORS.forEach((color, i) => {
    const ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 32, 16),
      mat(color, 0.35),
    );
    const home: [number, number, number] = [
      -0.44 + i * 0.22,
      tableTop + BALL_RADIUS + 0.01,
      TABLE.z,
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

  // Darts on the right side of the table, pointing toward the wall dartboard (-Z)
  DART_COLORS.forEach((color, i) => {
    const dartMesh = createDartMesh(color);
    const home: [number, number, number] = [
      0.15 + i * 0.09,
      tableTop + DART_WIDTH / 2 + 0.005,
      TABLE.z,
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

/** Puts every ball, dart, and can back. Triggered by the red button, the A button, or escaping. */
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
      if (y < -1 || y > ROOM.height + 1) this.resetOne(e);
    }
  }
}
