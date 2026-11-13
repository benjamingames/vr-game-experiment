# Handoff: Animatronic Repair Shop (read this first)

**Repo:** `benjamingames/vr-game-experiment`. **Game folder:** `fnaf-repair/`.
**Live:** https://benjamingames.github.io/vr-game-experiment/fnaf-repair/
**Deploy:** every push to `main` runs `.github/workflows/deploy-pages.yml`. That workflow copies `fnaf-repair/index.html`, `js/`, `lib/` and `models/` into the site. If you add a new top-level file or folder the game needs, add it to the `cp` line in the workflow's "Assemble site" step, or it won't be published.
**Owner:** Ben. He plays on a Meta Quest 3 in the Quest Browser and also on PC. He wants realistic, high-quality graphics. Commit as `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit ...`.

## The game (owner's design)

The FNAF animatronics (Freddy, Bonnie, Chica, Foxy) broke down. You walk from your **garage** across a night street into **Freddy Fazbear's Pizza**, climb onto the **stage** and pick their broken parts up off the floor. Then you carry them back to the garage and install them on four repair stands.
- Every installed part earns money: **$1 at first**, more with upgrades.
- Upgrades: more money per part, **better tools that assemble faster**, a bigger parts bag and faster sneakers.
- **Mr. Cupcake** is an add-on part for **Chica's left hand**.
- Fixing all four ends the round with a bonus. Then they "break again" and the parts respawn on the stage.

## Tech

- No build step. Plain ES modules with an importmap in `index.html`. three.js **r170** is vendored in `lib/` (`three.module.js` plus the addons it needs). Don't add a bundler or a CDN dependency.
- No image or audio files. Textures are painted on canvases in code, and sounds are synthesized with WebAudio.
- Models in `models/` were compressed with
  `gltf-transform optimize IN OUT --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.6 --simplify-error 0.0005`.
  The originals (50+ MB) are not in the repo. Ask Ben to re-upload them if you need them.

| File | What it does |
|---|---|
| `js/game.js` | Main file: renderer, scene, player rig, VR controllers + desktop input, targeting, pickup/install, economy (`VALUE`, `TOOLS`, `BAG`, `SHOES`, `UPGRADES` at the top), shop + money board (canvas screens), HUD, wrist panel, toasts, effects, save/load, main loop `frame()`. |
| `js/world.js` | The whole map. `L` holds the layout constants (garage, street, pizzeria, stage, stand positions, spawn). The `Batch` class merges static geometry per material. Also builds lights, colliders (2D AABBs) and `floorY(x,z)` (stage height, stairs ramp, Pirate Cove platform). `collide()` pushes the player circle out of the colliders. |
| `js/textures.js` | Procedural PBR textures (tileable fbm noise → color + normal + roughness), plus sign and poster canvases. `mat(set, {repeat})` makes a MeshStandardMaterial from them. |
| `js/animatronics.js` | Loads each model, normalizes it (feet at y=0, facing +Z, given height), bakes skinning, then cuts it into parts `head, torso, armL, armR, legL, legR`. |
| `js/props.js` | `makeTool(level)` (0 screwdriver … 4 robo-arm; a child named `spin` rotates while working) and `makeHand(left)` for VR. |
| `js/audio.js` | `sfx.*` sounds, the tool loop, and the fluorescent-light hum. |

### How the parts work (`animatronics.js`)
- **Rigged models** (Freddy, Bonnie, Foxy) are cut by bone. Each triangle goes to the region of its vertices' strongest bone. `regionFromBoneName` / `boneRegionOf` map bone names to regions, and unsided finger bones inherit their parent's side. Before baking, `poseArms` lowers T-posed arms into a standing pose. Bone names per model are in `ANIMATRONICS[].pose`.
- **Chica** is not rigged. Her mesh is split into connected chunks, and each chunk is assigned by its center using the thresholds in `ANIMATRONICS[chica].spatial`.
- **Shared buffers:** each part is a `Group` positioned at the part's center, holding meshes that share the baked vertex buffers (only the index differs). Each part's `slot` is that center in stand-local space. `localBox` is used to lay parts flat on the stage, and `tip` (average of the lowest vertices) is used for Mr. Cupcake's position on Chica's left hand.
- **Holograms:** missing parts show as a fresnel hologram (`holo()` in game.js). It is blue normally and pulses orange when that part is in your bag.

### Gameplay details (`game.js`)
- **State:** `state = { money, round, up:{value,tool,bag,shoes}, installed:[ids], bag:[ids], earned }` is saved to localStorage key `fnaf-repair-save-v1`. `applyState()` rebuilds the scene from it.
- **Part states:** `stage` → `bag` → `installing` → `installed`. Part ids look like `freddy:armL` and `chica:cupcake`.
- **Targeting** (`aimFrom`) uses cheap ray-vs-sphere tests: parts (radius `part.radius`), stands (sphere at y=1, r 0.75), and the shop screen (a real raycast, which gives a UV that is mapped to `shop.buttons`). Don't raycast the part meshes; they share huge buffers and it's too slow on Quest.
- **Installing** = hold the action while still aiming at the same stand. Progress is `dt / tool().time`. Looking away cancels it and the part goes back in the bag.
- **VR:** controllers live under `rig`.
  - Trigger = action (pick up / hold to install / buy).
  - Grip = grab a part your hand is touching, otherwise same as the trigger.
  - Left stick = move relative to where your head faces. Right stick = 30° snap turn.
  - The left wrist shows a canvas panel (money, tool, bag). A toast panel is attached to the camera, and a prompt sprite appears above whatever you're aiming at.
  - Shadows are turned off while in VR.
- **Desktop:** pointer lock. WASD to move, Shift to run, click or E for the action.

## Testing (what was used)

- Serve the repo root (`python3 -m http.server 8123`) and open `/fnaf-repair/`.
- URL params: `?autoplay` (skips the menu), `&reset`, `&quality=low|high` (default is high on PC, low on Quest), `&money=500`, `&pos=x,y,z`, `&look=yaw,pitch` (yaw 0 faces -Z toward the stands; yaw π faces the pizzeria).
- `window.game` test hooks: `finishAll()`, `buy(i)`, `view(x,z,yaw,pitch)`, `actionStart(null)`, `actionEnd(null)`, `aim`, `installing`, `info()` (draw calls, triangles).
- Screenshots were taken with headless Chrome via puppeteer-core (`--use-angle=swiftshader`). It renders at roughly 1 fps, so timed actions run slowly there.
- **Look at screenshots before committing.** The owner judges by how it looks.

Useful camera spots:
- garage `pos=0,0,-0.3&look=0,-0.08`
- street `pos=0,0,4&look=3.14,0.05`
- dining room `pos=0,0,26&look=3.14,0`
- stage `pos=0,0,37.5&look=3.14,-0.3`
- shop screen `pos=-2.6,0,-2.6&look=1.5708,0.05`

**Performance (quality=low, desktop):** about 150–175 draw calls and about 255k triangles per view. VR roughly doubles that. Keep new static props inside the `Batch`. Don't add lights at runtime: it forces every shader to recompile and causes a stutter.

## Status / known gaps

- **Never tested in a real headset.** Things to check first on a Quest:
  - hand model angle in grip space (`makeHand`)
  - tool angle in hand (`ctl.toolMesh` rotation in `startInstall`)
  - wrist panel placement
  - stick directions and snap turn
  - frame rate
- Mr. Cupcake's position on Chica's hand is approximate: `slot = arm.tip + (-0.01, 0.17, 0.07)` in game.js.
- Fixed animatronics are static. They don't move or react.
- Walking physically in room-scale VR can take you through walls. Collision only applies to stick movement.
- The stage wood texture is a bit orange and swirly. The pizzeria has no back rooms. Its hallway door is a closed decoration.
- Canvas text uses Google Fonts (Barlow). Screens are redrawn after `document.fonts.ready`.

## Ideas the owner may ask for next

More rooms (backstage, Parts & Service, office), animatronics coming to life when fixed, a night/power mechanic, a delivery truck at round end, more upgrades (auto-collector, cart), better VR hands, and sound/music.
