#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
codex="$(command -v codex || true)"
node="$(command -v node || true)"
if [[ "$codex" != /* || "$node" != /* ]]; then
  echo 'The Codex CLI and Node.js must be available to uninstall Profile Dock.' >&2
  exit 1
fi
"$codex" plugin remove 'helix-codex-profile-dock-sidebar@helix-profile-dock-preview'
if "$codex" plugin marketplace list --json | "$node" -e '
  const {marketplaces} = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  process.exit(marketplaces.some(item => item.name === "helix-profile-dock-preview") ? 0 : 1);
'; then
  "$codex" plugin marketplace remove 'helix-profile-dock-preview'
fi
echo 'Uninstalled. Reopen Codex. Your saved accounts remain in the macOS login keychain.'
