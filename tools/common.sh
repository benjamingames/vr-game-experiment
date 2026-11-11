# Shared settings for the helper scripts. Source this; do not run it.
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$TOOLS_DIR")"
GAME_DIR="${GAME_DIR:-$REPO_DIR/vr-ball-room-procedural}"
OUT_DIR="$TOOLS_DIR/out"
PORT="${PORT:-4173}"
# Headless browser used for screenshots. Default: Windows Chrome reached from WSL (uses the real GPU).
CHROME="${CHROME:-/mnt/c/Program Files/Google/Chrome/Application/chrome.exe}"
mkdir -p "$OUT_DIR"
# Node lives under nvm and is not on PATH in non-interactive shells
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# Windows temp dir (screenshots are written there, then copied into tools/out)
win_temp() { /mnt/c/Windows/System32/cmd.exe /c "echo %TEMP%" 2>/dev/null | tr -d '\r'; }
