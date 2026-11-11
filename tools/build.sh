#!/bin/bash
# Typecheck and production-build the procedural game. Prints only errors and the final line.
#   tools/build.sh
. "$(dirname "$0")/common.sh"
cd "$GAME_DIR" || exit 1
[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null 2>&1
npm run typecheck 2>&1 | grep -E "error" | head -20
NODE_ENV=production npm run build 2>&1 | grep -E "built in|rror" | head -10
