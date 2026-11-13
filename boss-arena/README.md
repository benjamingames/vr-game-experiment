# Boss Arena

WebXR boss-battle game for Meta Quest 3 (also plays on desktop). No build step: static ES modules with a vendored three.js, like `fnaf-repair/`. Everything (textures, models, sound) is generated in code.

**Right now:** the arena map and the first fighter, **Rook**. The bosses are not in yet.

| File | What it does |
|---|---|
| `js/arena.js` | The map: stage, fence, 4 sliding gates + tunnels, stands, smiley-ball crowd, truss lights, jumbotron. `buildArena()` returns `bossSpots` (6 pads, with facing), `gates`, `setGate(i, open)`, `collide(x, z)`. |
| `js/character.js` | `Hero` class (Rook): jointed body, procedural animation. `play('punch'\|'wave'\|'taunt'\|'cheer'\|'hurt')`, `setHold('block')`, `update(dt, speed)` for idle/walk/run. `makeGlove()` is used for the VR hands. |
| `js/textures.js` | Canvas-painted textures (stage top, tread bump, faces, signs). |
| `js/main.js` | Renderer, VR + desktop input, third-person camera, the Rook showcase pad. |
| `js/audio.js` | WebAudio crowd murmur and effects. |

## Controls
VR: left stick move, right stick snap-turn, swing the gloves to punch, **A** = open/close gates.
PC: WASD, Shift run, mouse look, click/F punch, right-click block, E wave, T flex, H ouch, C cheer, V first/third person, G gates.

## Debug URL parameters
`?autoplay=1` skip the menu, `?view=first`, `?quality=low|high` (Quest defaults to low), `?pos=x,z`, `?look=yaw,pitch`, `?cam=x,y,z` fixed camera, `?showcase=0` hide the Rook demo pad.
In the console, `window.boss` exposes the arena, the heroes and `step(seconds)` (with `boss.dbg.paused = true`) for frame-exact screenshots.

## Adding bosses (next step)
Put GLB files in `boss-arena/models/` and add `models` to the copy step in `.github/workflows/deploy-pages.yml`. Use `arena.bossSpots` for where they stand, and `arena.setGate(i, true)` for entrances. The workflow already ships `js` and `lib` only, so remember that line.
