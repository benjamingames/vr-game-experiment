#!/bin/bash
# Take a screenshot of the running preview with a headless browser.
#   tools/shot.sh <name> "<query string>" [virtual seconds, default 60]
# Example:
#   tools/shot.sh lounge "quality=high&dbg=gallery,bakefast&look=-0.1,-0.9&pos=-301.5,0,1.2"
# Writes tools/out/<name>.png and prints any shader / console errors.
#
# Query parameters the game understands (see PROCEDURAL_GUIDE.md):
#   quality=high|low|auto     graphics tier
#   dbg=night,monke,gallery,bakefast,info   comma separated switches
#   look=pitch,yaw            camera angles in radians (yaw 0 faces -Z, positive turns left)
#   pos=x,y,z                 player position in world metres (the gallery is centred on x=-300)
#
# NOTE: a headless page renders only a handful of frames, however long it runs. Anything that
# takes many frames to settle will look unfinished, so use dbg=bakefast for the gallery.
. "$(dirname "$0")/common.sh"
name="$1"; query="$2"; secs="${3:-60}"
[ -z "$name" ] && { echo "usage: shot.sh <name> \"<query>\" [seconds]"; exit 1; }
WT="$(win_temp)"
cd /tmp
rm -f "$(wslpath "$WT")/vrshot-$name.png" 2>/dev/null
timeout 150 "$CHROME" --headless=new "--user-data-dir=$WT\\vr-headless" --ignore-certificate-errors \
  --window-size="${SIZE:-1000,620}" --no-first-run --enable-logging=stderr --v=0 \
  "--screenshot=$WT\\vrshot-$name.png" --virtual-time-budget=$(( secs * 1000 )) \
  "https://localhost:$PORT/?$query" 2>&1 \
  | grep -i -E "CONSOLE.*(error|THREE)" | grep -v X4122 | sed 's/^.*CONSOLE/CONSOLE/' | cut -c1-300 | sort -u | head -10
cp "$(wslpath "$WT")/vrshot-$name.png" "$OUT_DIR/$name.png" 2>/dev/null && echo "saved $OUT_DIR/$name.png"
