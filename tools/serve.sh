#!/bin/bash
# (Re)start the local preview server for the last build: https://localhost:4173/ (self-signed).
#   tools/serve.sh
. "$(dirname "$0")/common.sh"
cd "$GAME_DIR" || exit 1
# Stop whatever is listening on the port (found by port, never by process name)
ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r kill
sleep 1
nohup node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port "$PORT" > "$OUT_DIR/preview.log" 2>&1 &
sleep 3
curl -skI "https://127.0.0.1:$PORT/" | head -1
