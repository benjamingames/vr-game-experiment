# VR Game Experiments

WebXR games for the Meta Quest 3 (they also run in a desktop browser).
Each game lives in its own folder and is published together on GitHub Pages.

**Play:** https://benjamingames.github.io/vr-game-experiment/

| Game | Folder | Play |
|---|---|---|
| **VR Ball Room** (the original concept: throwing toys, RC car, toy stations, Monke Mode, and the cake maze) | [`vr-ball-game/`](vr-ball-game/) | [/vr-ball-game/](https://benjamingames.github.io/vr-game-experiment/vr-ball-game/) |
| **A Game About Digging a Hole** (single-file game) | [`diggingahole/`](diggingahole/) | [/diggingahole/](https://benjamingames.github.io/vr-game-experiment/diggingahole/) |

## How publishing works

Every push to `main` runs `.github/workflows/deploy-pages.yml`, which builds
`vr-ball-game/`, copies `diggingahole/` as-is, adds the landing page (`index.html`),
and publishes everything as one Pages site.

## Adding another game

1. Make a new folder at the repo root (a single `index.html` works).
2. Add a copy step for it in the workflow's "Assemble site" step.
3. Add a card for it in the root `index.html` and a row in this table.
