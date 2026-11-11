# VR Ball Room: Procedural (asset-free)

This is a variant of `../vr-ball-game/` that ships **no asset files**: no images, models or
audio. Everything is generated at load time by code in `src/procedural/`:

| File | What it generates |
|---|---|
| `textures.ts` | PBR texture sets (albedo + normal + roughness/metalness) rendered by noise shaders on the GPU at up to 2048px: oak, marble tiles, brushed metal, bark, end grain, ground, rock, foliage, pebbled rubber |
| `geometry.ts` | Detailed shapes: rounded-edge boxes and smooth cylinders/spheres used by every object, the modelled table (turned legs, apron, drawer, brass pulls), drinks cans with lids, tabs and printed labels |
| `materials.ts` | Physically based materials (clear coat, sheen, glass) built on those sets |
| `env.ts` | Sky shader (sun, moon, stars, moving clouds), reflection probe with box-projected reflections and one bounce of indirect light, light shafts, dust, chandelier and sconces |
| `arena.ts` | "Hollow Grove", the Monke Map: terrain, hollow stump, climbable trees, boulders, instanced grass with wind |
| `decor.ts` | Main-room dressing: potted trees, shelves with books, vases and art, rug, LED wall washes, painted corner shadows |
| `bake.ts` | GPU light bake: ray-traced sky light, lamp light, bounced sun and ambient occlusion for box-built scenery |
| `showcase.ts` | The Gallery, a second room with baked lighting, reached through the door on the back wall |
| `quality.ts` | High / Low tier. Auto-detected (standalone headsets get Low); switch with the bottom-left button or `?quality=high|low|auto` |

**Building on this:** read [`PROCEDURAL_GUIDE.md`](PROCEDURAL_GUIDE.md) (recipes, helper scripts in `../tools/`, known traps).

Debug URL parameters: `?dbg=night,monke,gallery,bakefast,info&look=pitch,yaw&pos=x,y,z`.

The original notes follow.

# VR Ball Room (VR Game Concept)

A WebXR playground for the Meta Quest 3, built with Meta's
[Immersive Web SDK](https://iwsdk.dev) (Three.js + ECS + Havok physics).
It runs in a browser, so there is nothing to install on the headset.

**Play:** https://benjamingames.github.io/vr-game-experiment/vr-ball-room-procedural/

- **Quest 3:** open that link in the Quest Browser and press **Enter XR**.
- **PC:** open it in Chrome or Edge. Move with WASD and look with the mouse.

## What's in it

- **Throwing toys:** an oak-paneled room with throwable balls, a can pyramid,
  and a dartboard with darts that stick.
- **RC car** you drive with a tabletop remote.
- **Stretchy floating head** with 10 parts you can pull.
- **Five toy stations:** basketball hoop, bowling lane, xylophone,
  whack-a-mole, and a reflex bag / high-striker.
- **Settings menu:**
  - In VR, press the left controller's menu button (or X/Y).
  - On PC, press `M`.
  - Inside it: day/night, hand models, Monke Mode (move with your hands,
    Gorilla Tag style), and Basic Map vs Monke Map (the Giant Stump).
- **Reset:** press the right controller's **A** button or the red reset
  button to put everything back.

## Develop

Needs Node 22.

```sh
cd vr-ball-game
npm install
npx @iwsdk/cli dev up --no-open   # dev server on https://<your-pc-ip>:8081 (Windows: start-vr.bat)
npm run typecheck
npm run build                     # production build in dist/
```

To test changes on the headset before they go live:
1. Make sure the Quest and the PC are on the same Wi-Fi.
2. Open the PC's Wi-Fi address on port 8081 in the Quest Browser.
3. Accept the self-signed certificate warning.

Every push to `main` rebuilds and redeploys the Pages site through
`.github/workflows/deploy-pages.yml` at the repo root.

Working on this with an AI agent? Start with `HANDOFF.md`, then `AGENTS.md`.
