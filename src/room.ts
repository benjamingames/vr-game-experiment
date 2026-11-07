import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DistanceGrabbable,
  Entity,
  InputComponent,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  OneHandGrabbable,
  PhysicsBody,
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
import { ResetButton, Resettable } from './ball-components.js';

// ---- Tweak these to play around -------------------------------------------
const ROOM = { width: 6, depth: 6, height: 3 }; // meters; player starts at the center
const BALL_RADIUS = 0.07;
const BALL_BOUNCE = 0.6; // 0 = dead, 1 = superball
const BALL_COLORS = [0xff4d4d, 0x4da6ff, 0xffd24d];
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

  // Balls on the table: squeeze (grip) to grab up close, or point + trigger from afar
  BALL_COLORS.forEach((color, i) => {
    const ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 32, 16),
      mat(color, 0.35),
    );
    const home: [number, number, number] = [
      (i - 1) * 0.3,
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

/** Puts every ball and can back. Triggered by the red button, the A button, or a ball escaping. */
export class ResetSystem extends createSystem({
  items: { required: [Resettable] },
  pressed: { required: [ResetButton, Pressed] },
}) {
  private pos = new Vector3();
  private rot = new Quaternion();

  init() {
    this.queries.pressed.subscribe('qualify', () => this.resetAll());
  }

  resetAll() {
    for (const e of this.queries.items.entities) this.resetOne(e);
  }

  private resetOne(e: Entity) {
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
