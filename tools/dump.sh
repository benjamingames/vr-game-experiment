#!/bin/bash
# Print the game's debug state line (sun light, player position, lighting zone, caught errors).
#   tools/dump.sh "<query string>" [virtual seconds]
# The query must include dbg=info, e.g.:  tools/dump.sh "quality=high&dbg=gallery,bakefast,info"
. "$(dirname "$0")/common.sh"
WT="$(win_temp)"
cd /tmp
timeout 150 "$CHROME" --headless=new "--user-data-dir=$WT\\vr-headless" --ignore-certificate-errors \
  --window-size=600,400 --no-first-run --dump-dom --virtual-time-budget=$(( ${2:-40} * 1000 )) \
  "https://localhost:$PORT/?$1" 2>/dev/null | grep -o "<title>[^<]*" | sed 's/&quot;/"/g; s/&amp;/\&/g; s/<title>//'
