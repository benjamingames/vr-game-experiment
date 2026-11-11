# VR Ball Room — Quest 3 quick start

A room, a table, three throwable balls, a can pyramid to knock over, and a reset button.
Built on Meta's Immersive Web SDK (WebXR). The game runs in the Quest Browser;
your PC only serves the files over Wi-Fi.

## Run it
1. Install Node.js 22 LTS on the PC (one time).
2. Double-click `start-vr.bat` (Windows). Or: `npm install` then `npx @iwsdk/cli dev up --no-open`.
3. On the Quest (same Wi-Fi), open Browser → go to the `https://<pc-ip>:8081/` address it prints.
4. Accept the self-signed certificate warning (Advanced → Proceed). One time per browser.
5. Press **Enter XR**.

## Controls
- **Grip (squeeze)** near a ball: pick it up. Swing and let go to throw.
- **Point + trigger** at a ball from a distance: pull it to you.
- **Point + trigger** at the red button, or press **A**: reset balls and cans.

## Tinker
- `src/room.ts` — top of file has ROOM size, ball size/bounce/colors, table. Save, reload on the Quest.
- `iwsdk.config.json` — XR features (turn `locomotion` on to walk with the thumbstick;
  you'd then add `LocomotionEnvironment` to the floor).
- `CLAUDE.md`/`AGENTS.md` + `.claude/skills/` — Meta's agent guidance. Open the folder in
  Claude Code and just describe what you want next.

## If it doesn't load
- Blank page / can't connect: PC firewall is blocking port 8081 (allow Node on Private networks),
  or the Quest is on a guest/isolated Wi-Fi network.
- No Enter XR button: you're on http:// instead of https://.
