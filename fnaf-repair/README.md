# Animatronic Repair Shop

WebXR game (Quest 3 + desktop). No build step: plain ES modules, three.js r170 vendored in `lib/`.

- `js/game.js` – renderer, player (VR + mouse/keyboard), gameplay, economy, shop/board screens, save (localStorage).
- `js/world.js` – the map: garage + house, night street, pizzeria (dining room, stage, Pirate Cove). Static geometry is merged per material.
- `js/textures.js` – every surface texture is painted in code (colour + normal + roughness).
- `js/animatronics.js` – loads the models and cuts them into parts: rigged models are cut by bone (head, torso, arms, legs; arms are lowered out of the T-pose first), Chica (unrigged) by connected pieces. Mr. Cupcake is an extra Chica part on her left hand.
- `js/props.js` – tools (screwdriver → wrench → drill → impact driver → robo-arm) and VR hands. `js/audio.js` – synthesised sounds.
- `models/` – the five GLBs, compressed with `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.6`.

Debug URL params: `?autoplay&reset&quality=low|high&money=500&pos=x,y,z&look=yaw,pitch`. `window.game` has test hooks (`finishAll()`, `buy(i)`, `view(...)`).
