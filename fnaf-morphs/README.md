# FNAF Morphs

VR-only WebXR game for the Meta Quest 3. You wear an animatronic ("morph") and walk the FNAF 1 pizzeria. No build step: static ES modules with a vendored three.js.

Normal visitors on a non-VR browser only see a "VR only" message. Developers can add `?debug=1` for a desktop preview (see below).

| File | What it does |
|---|---|
| `js/main.js` | Renderer, VR session, locomotion (left stick walk, right stick snap-turn), controllers + rays, the springlock timer, the mirror. |
| `js/morph.js` | `Morph`: a rigged GLB you wear. Head follows the headset, arms use two-bone IK to the controllers, legs walk, head meshes are hidden in first person. Springlock failure animation. `MORPH_DEFS` is the morph list. |
| `js/ui.js` | The in-VR menu panel and the 3-lines wrist button (it also shows the countdown). |
| `js/nav.js` | Walls / furniture / floor height baked into a 2D grid from the map triangles. |
| `js/audio.js` | Plays `models/springlock-failure.mp3` (it already contains the snap/crunch and the laugh), reads its loudness to drive the jaw and the shake. |
| `models/` | `map.glb`, `springbonnie.glb`, `springtrap.glb` (slimmed with gltf-transform: welded, simplified, WebP textures, spec-gloss converted to metal-rough), `springlock-failure.mp3`, plus `foxy.glb`, `bonnie.glb`, `chica.glb`, `freddy.glb`. |

## Playing
- Open the menu with the **3 lines** button floating over your left hand (poke it with your right hand, or point and pull the trigger). **Y** also opens it.
- Pick a morph with a controller ray + trigger. The menu also has the springlock timer toggle, "Springlock NOW", a mirror, height recalibration and "Back to start".
- **Springlock failure:** 1 minute 30 seconds after you put Spring Bonnie or Springtrap on, the locks snap, the suit plates burst outward, the mp3 laugh plays and the suit shakes with it, then everything settles back and play goes on. The timer restarts after each one.

- **Foxy climbs:** squeeze **grip** with a hand next to a tall wall and that hand stabs in (hook on one hand, a prop hook on the other) and holds. A small hidden trigger block sits inside each hook tip, and that block is what has to touch the wall (`?showblocks=1` shows it). Pull yourself up hand over hand; let go to fall (you keep your momentum).
- **Stage mirror:** a big real mirror on the back wall of the stage shows your morph (head included). The menu's Mirror button gives a portable one.

## Adding a morph
Drop the rigged `.glb` in `models/`, add an entry to `MORPH_DEFS` in `js/morph.js`. Bones are found by name (`bip_head`, `bip_upperarm_L`, `bip_hand_L`, `bip_hip_L`, ...). Rigid plates parented to bones are what burst out in the springlock animation. Replace the map by swapping `models/map.glb` (change `SPAWN` in `main.js`).

## Debug URL parameters (desktop preview)
`?debug=1` shows a desktop button; WASD + mouse look, `M` menu, `1`/`2`/`0` pick a morph, `L` springlock now, `R` mirror, `V` third person.
`?start=1` skip the menu screen, `morph=springbonnie|springtrap|freddy|bonnie|chica|foxy`, `mirror=1`, `lockat=<seconds>` (default 90), `pos=x,z`, `yaw=`, `pitch=`, `view=third`, `cam=x,y,z&camlook=x,y,z` (world coordinates).
In the console `window.fm` exposes `step(seconds)`, `triggerSpringlock()`, `selectMorph(id)` etc.

## Not tested on a headset
Built and checked in a headless browser only (map, collision grid, both morphs, mirror, menu, timer, failure animation). The controller-to-hand rotation offsets, the wrist button position and comfort are untested on a real Quest 3.
