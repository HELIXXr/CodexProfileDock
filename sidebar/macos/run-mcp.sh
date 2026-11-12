#!/bin/bash
set -euo pipefail
umask 077
support="$HOME/Library/Application Support/CodexProfileDock"
IFS= read -r node < "$support/node-path"
IFS= read -r codex < "$support/codex-path"
if [[ "$node" != /* || ! -x "$node" || "$codex" != /* ]]; then
  echo 'Profile Dock cannot find its Node.js executable. Rerun the macOS installer.' >&2
  exit 1
fi
export PATH="${node%/*}:${codex%/*}:/opt/homebrew/bin:/usr/local/bin:$PATH"
exec "$node" "$(dirname -- "$0")/server.mjs"
