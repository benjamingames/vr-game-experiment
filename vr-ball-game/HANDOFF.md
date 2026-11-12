# Handoff: VR Ball Room (WebXR on Meta Quest 3)

You are picking up a small, working VR prototype. The owner (Ben) will ask you for changes in
plain language and test them in a Meta Quest 3 headset. Your job: make focused edits, keep it
running, and tell him exactly what to reload or restart.

## What it is

- An oak-paneled room with a table of toys, built up across many small commits (see `git log`).
- **Throwing:** balls, a can pyramid, and a dartboard with sticky darts plus a throw assist.
- **RC car** with a remote: steering, gas, brake, and throttle.
- **Stretchy floating head** with 10 pullable parts and an elastic reset.
- **Five toy stations:** basketball hoop, bowling lane, xylophone, whack-a-mole, and reflex bag / high-striker.
- **Movement:** smooth locomotion in VR (left stick moves, right stick turns), and WASD + mouse look on desktop.
- **Settings menu:**
  - Opens with the left controller's menu button, X/Y, or the `M` key.
  - Day/Night toggle.
  - Hand models.
  - **Monke Mode:** Gorilla Tag-style hand locomotion. The body is lowered automatically (the VR rig sits
    below the ground by `MONKE_DROP_RATIO` of the player's standing head height), so standing upright puts the
    hands at ground level and nobody has to crouch. While it is on, `SettingsAndHandsSystem` owns the rig and
    `LocomotionSystem` is paused (see `applyMonkeMode`). Tunables: the `MONKE_*` constants next to `GORILLA_MAP_SCALE`.
  - Map choice: **Basic Map** (oak room) or **Monke Map** (Giant Stump, `public/gorilla-tag-map.glb`).
- Runs in the **Quest Browser via WebXR**, with nothing installed on the headset.
- **Live site:** https://benjamingames.github.io/vr-game-experiment/

## Hosting (GitHub Pages)

- **Repo:** https://github.com/benjamingames/vr-game-experiment. The default branch is `main`.
- **Deploys:** every push to `main` runs `.github/workflows/deploy-pages.yml`. It runs typecheck, then build, then publishes `dist/` to Pages.
- **If the deploy workflow fails, the live site does not change.** Check the repo's Actions tab.
- **The site is served from the `/vr-game-experiment/` subpath.** Never reference assets with a leading `/`, because that resolves to the domain root and 404s on Pages.
  - Asset URLs in `src/assets.ts`: use `` `${import.meta.env.BASE_URL}file.glb` ``.
  - Anything in `public/`: same rule. Use `BASE_URL` or a relative path.
  - `vite.config.ts` has `base: './'`. Keep it.
- **Before pushing, run `npm run build`.** Ideally also serve `dist/` under a `/vr-game-experiment/` folder and load it, to catch path breakage.

## Stack

- **Immersive Web SDK (IWSDK)** `@iwsdk/core` 1.1.0-rc.2. This is Meta's open-source WebXR framework, built on Three.js with an entity-component system (ECS) and Havok physics.
- **Three.js** via `super-three` 0.185. It is re-exported by `@iwsdk/core`.
- **TypeScript**, **Vite 7**, and the `@iwsdk/vite-plugin-dev` plugin.
- **Node** 22 LTS.
- **Docs:** https://iwsdk.dev. Meta's reference: https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/

## Location and environment

- **Project path:** `C:\projects\vr-ball-game` on a Windows PC. Use PowerShell syntax for commands.
- **Git:** the project is a clone of the GitHub repo above. Commit each working change; pushing to `main` publishes it.
  - If the owner's older local folder still has a `master` branch with no remote, re-clone from GitHub rather than pushing from it.
- **The PC has a VirtualBox adapter at `192.168.56.1`.** It is NOT reachable from the headset. Never give the owner that address.
- **The PC's Wi-Fi address is currently `192.168.0.236`.** It can change. To recheck, run `ipconfig` and use the IPv4 address under "Wireless LAN adapter Wi-Fi".
- **Headset URL:** `https://192.168.0.236:8081/`. The dev server uses a self-signed certificate, which the owner has already accepted on the Quest. WebXR needs HTTPS, so never switch to plain http.
- **Firewall:** works as-is today. Don't change firewall settings unless the headset stops connecting, and ask first if you do.

## Running it

```powershell
npx @iwsdk/cli dev up --no-open    # start server (or double-click start-vr.bat)
npx @iwsdk/cli dev status          # shows runtimeUrls.network; confirms running
npx @iwsdk/cli dev down            # stop
npm run typecheck                  # ALWAYS run after edits; type errors fail silently in-browser
npm run build                      # production build to dist/ (sanity check)
```

- Vite hot-reloads `src/` edits. If the headset doesn't update, tell the owner to reload the page in the Quest Browser.
- Editing `iwsdk.config.json` restarts Vite automatically.
- **Desktop testing without the headset:** open `https://localhost:8081` in desktop Chrome. IWSDK injects **IWER**, an emulated Quest 3, on localhost only. You can enter XR and drive the controllers with the mouse and keyboard.
- `npm run dev` launches a *managed* browser that exposes IWSDK's CLI/MCP inspection tools, such as `ecs find` and `browser screenshot`. It may first need `npx playwright install chromium`. This is optional.

## File map (what matters)

| File | Role |
|---|---|
| `src/index.ts` | `World.create(...)` with the project config, registers `ResetSystem`, calls `buildRoom(world)` |
| `src/room.ts` | **Everything gameplay** (~4,400 lines). `buildRoom()` builds every object in code. It holds one system per feature: `DartSystem`, `RCCarSystem`, `ResetSystem`, `CloudSystem`, `StretchyFaceSystem`, `ToyStationsSystem`, `DesktopFirstPersonSystem`, `SettingsAndHandsSystem` (menu, maps, Monke Mode). Tunables are at the top. Splitting it into one file per feature is a reasonable refactor if asked. |
| `src/ball-components.ts` | Custom ECS components: `Resettable { home: Vec3 }` and `ResetButton` (a tag) |
| `src/components.ts` | `defineComponents([...])`. Every custom component must be listed here. |
| `src/assets.ts` | `defineAssets()` holds only `gorillaTagMap` (the Monke Map stump GLB, loaded via `BASE_URL`). Must stay side-effect free, because it is evaluated twice. |
| `iwsdk.config.json` | **Project authority.** Sets VR mode, `grabbing: true`, `physics: true`, `locomotion: false`, hand tracking on, and the camera start pose. |
| `public/scenes/main.iwsdk.scene.json` | Scene JSON. Now contains **only the two lights** (key directional light with shadows, plus a hemisphere fill light). |
| `start-vr.bat` / `QUEST.md` | Owner-facing launcher and quick start |
| `AGENTS.md`, `.agents/skills/`, `.codex/`, `.cursor/`, `.claude/` | Meta's generated agent guidance and skills for IWSDK. **Read `AGENTS.md` before editing.** The skills (`iwsdk-physics`, `iwsdk-grab`, `iwsdk-compose-scene`, etc.) are worth consulting for their domains. |
| `src/scene-assets/*.ts`, `public/ui/*.uikitml`, `public/audio/`, `public/hands/` | Leftovers: the starter template's files and hand models that are no longer loaded. **Unused**; safe to delete or reuse. |

## How the gameplay works

- **Static colliders:** the floor, walls, ceiling and table are boxes with `PhysicsShape(Box)` and `PhysicsBody(Static)`. The floor's top surface is at y = 0. The player starts at the room center facing −Z, and the table is at z = −0.7.
- **Balls** have these components:
  - `PhysicsShape(Sphere, r=0.07, density 400, restitution 0.6)` and `PhysicsBody(Dynamic)`
  - `OneHandGrabbable` for squeeze/grip near the ball
  - `RayInteractable` plus `DistanceGrabbable(MoveFromTarget)` for point-and-trigger from a distance
  - Physics handles the throw: IWSDK drives the held body kinematically and releases it with the hand's velocity.
- **Cans:** dynamic cylinders arranged 3-2-1.
- **Reset:** `ResetSystem` calls `PhysicsSystem.setBodyTransform` to return each `Resettable` to its `home`. It fires on:
  - the reset button (`ResetButton` + `Pressed`, via ray + trigger)
  - the right controller's **A** button
  - automatically, for any object that leaves the room vertically

## Rules that bite in IWSDK (follow them)

1. Import Three classes from `@iwsdk/core`, **never** from `three`. Importing from `three` creates a duplicate instance and breaks things silently.
2. Create objects with `world.createTransformEntity(mesh)`, never `scene.add()`.
3. A colliding object needs **both** `PhysicsBody` and `PhysicsShape`. Keep collider dimensions equal to the mesh dimensions.
4. Move or teleport physics bodies with `PhysicsSystem.setBodyTransform`, not by setting `object3D.position`.
5. For one-shot forces or velocities, use `PhysicsManipulation` (it is auto-removed after one frame).
6. Vector fields: read and write via `entity.getVectorView(Comp, 'field')`. `setValue` throws on Vec fields.
7. `Grabbed` is managed by `GrabSystem`. Read it; never add or remove it.
8. No allocations inside `update()`. Preallocate in `init()` or as class fields. The target is 72–90 fps on Quest.
9. Use `entity.dispose()`, not `destroy()`.
10. Locomotion is **on**. Any new walkable surface needs the `LocomotionEnvironment` component, or the player falls through it.
11. New custom components go in a system-free module and must be registered in `src/components.ts`.
12. Run `npm run typecheck` after every change, before telling the owner to test.

**Architecture note:** IWSDK convention is that static geometry is built in TS and placed by scene JSON. This prototype instead builds and places everything in `room.ts` for simplicity. Keep that approach unless the owner wants to use Meta's visual scene editor; in that case, migrate objects into `src/assets.ts` and the scene JSON.

## Input reference

```ts
const pad = this.input.xr.gamepads.right;           // or .left
pad?.getButtonDown(InputComponent.A_Button);         // also Trigger, Squeeze, B_Button, X_Button, Y_Button, Thumbstick
pad?.getAxesValues(InputComponent.Thumbstick);
this.player.head; this.player.gripSpaces.right; this.player.raySpaces.left;
```

## Working agreement with the owner

- He describes changes in plain language and tests in the headset. Keep each change small and self-contained.
- After each change, tell him one of two things: "reload the page on the Quest", or "restart the server" (only for config or dependency changes).
- Explain VR-specific terms briefly the first time they come up.
- Don't add hosting, firewall or network changes without asking.
- Commit to git after each working change, with a one-line description.

## Ideas he may ask for (starting points, not requirements)

- **Score or targets:** count cans knocked off. Check each can's y position against its home position, and show the result with an IWSDK spatial UI panel (`iwsdk-ui` skill) or a Three `CanvasTexture` sign.
- **Walking around:** set `locomotion: true` in the config and add `LocomotionEnvironment` to the floor.
- **Hoop or bucket:** a static ring of boxes, plus a trigger-volume check on ball position.
- **Sounds on bounce:** use `AudioUtils` and `AudioSource`, and read the `PhysicsBody` `_linearVelocity` magnitude to detect impacts.
- **Sharing beyond home Wi-Fi:** `npm run build` and host `dist/` on any HTTPS static host (GitHub Pages works). See the `iwsdk-hosting` skill.
