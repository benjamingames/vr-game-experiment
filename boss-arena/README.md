# Boss Arena

WebXR boss-battle game for Meta Quest 3 (also plays on desktop). No build step: static ES modules with a vendored three.js, like `fnaf-repair/`. The arena, textures and sound are generated in code; the two bosses are GLB models.

**Right now:** the arena, you as the **Minecraft player** (R6-style: six stiff blocks swinging from their joints), and two bosses, **Springtrap** and **The Demogorgon**. Press **B** to make them hunt you.

| File | What it does |
|---|---|
| `js/arena.js` | The map: stage, fence, 4 sliding gates + tunnels, stands, smiley-ball crowd, truss lights, jumbotron. `bossSpots` (6 pads, with facing), `gates`, `setGate(i, open)`, `collide(x, z, r)`. |
| `js/steve.js` | The player: a procedural Minecraft player (head, torso, 2 arms, 2 legs) using `models/steve_skin.png`. `play('punch'\|'wave'\|'taunt'\|'cheer'\|'hurt')`, `setHold('block')`, `update(dt, speed)`. Also `loadGLB` and `makeBlockHand()` for the VR hands. |
| `js/boss.js` | `Boss` class: plays the GLB's clips (idle, walk, run, attacks) and has an idle / hunt / return state machine. |
| `js/textures.js` | Canvas-painted textures (stage top, tread bump, faces, signs). |
| `js/main.js` | Renderer, VR + desktop input, third-person camera, boss setup. |
| `js/audio.js` | WebAudio crowd murmur and effects. |
| `models/` | `springtrap.glb`, `demogorgon.glb` (slimmed to ~9 MB and ~5 MB with gltf-transform: unused animations dropped, welded, simplified, WebP textures), `steve_skin.png`. |

The Demogorgon walks with the `Demo|QK_WalkHuntRT` clip.

## Controls
VR: left stick move, right stick snap-turn, swing the gloves to punch, **A** = open/close gates, **B** = bosses hunt.
PC: WASD, Shift run, mouse look, click/F punch, right-click block, E wave, T flex, H ouch, C cheer, V first/third person, G gates, B bosses hunt.

## Debug URL parameters
`?autoplay=1` skip the menu, `?view=first`, `?quality=low|high` (Quest defaults to low), `?pos=x,z`, `?look=yaw,pitch`, `?cam=x,y,z` fixed camera, `?springyaw=` / `?demoyaw=` / `?steveyaw=` turn a model (radians).
In the console, `window.boss` exposes the arena, hero, bosses, `toggleHunt()` and `step(seconds)` (with `boss.dbg.paused = true`) for frame-exact screenshots.

## Credits
- Minecraft skin/model basis: "Minecraft Player" by None_Yaroslav, CC-BY-4.0.
- Springtrap ("Dead by Daylight - The Animatronic") and The Demogorgon: by MG Rips (MG_GameRips) on Sketchfab, CC-BY-NC-4.0 (non-commercial use only).
