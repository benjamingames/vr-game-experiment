# IWSDK project guidance

@AGENTS.md


## Procedural asset-free build

This folder generates every texture, model and light in code. Before changing anything under `src/procedural/`, read `PROCEDURAL_GUIDE.md` in this folder: it lists the modules, step-by-step recipes, the helper scripts in `../tools/` (build, serve, screenshot, state dump) and the traps to avoid. Always run `../tools/build.sh` and look at a screenshot from `../tools/views.sh` before committing.
