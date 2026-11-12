#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
support="$HOME/Library/Application Support/CodexProfileDock"
node="$(command -v node || true)"
codex="$(command -v codex || true)"
if [[ "$(uname -s)" != Darwin || "$node" != /* || "$codex" != /* ]]; then
  echo 'This installer needs macOS, Node.js 22+, and the Codex CLI.' >&2
  exit 1
fi
if ! "$node" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)'; then
  echo 'Install Node.js 22 or later.' >&2
  exit 1
fi
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
  echo 'Install Apple Command Line Tools with xcode-select --install, then rerun this installer.' >&2
  exit 1
fi

mkdir -p "$support/bin"
chmod 700 "$support" "$support/bin"
work="$(mktemp -d "$support/.install.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
source_dir="$root/plugins/sidebar"
market="$support/marketplace"
plugin="$work/marketplace/plugins/sidebar"
mkdir -p "$plugin" "$work/marketplace/.agents/plugins"
cp "$root/.agents/plugins/marketplace.json" "$work/marketplace/.agents/plugins/"
cp -R "$source_dir/assets" "$plugin/"
for file in backend.mjs macos.mjs macos-worker.mjs plugin.json server.mjs sidebar.html startup.mjs startup-worker.mjs usage.mjs; do
  cp "$source_dir/$file" "$plugin/"
done
cp "$root/macos/mcp.json" "$root/macos/run-mcp.sh" "$plugin/"

# Compile locally so the Keychain client is native to this Mac.
if [[ ! -x "$support/bin/profile-dock-native" ]] || ! cmp -s "$root/macos/native.m" "$support/bin/native-source.m"; then
  /usr/bin/xcrun clang -fobjc-arc -O2 -framework AppKit -framework Security \
    -o "$work/profile-dock-native" "$root/macos/native.m"
  /usr/bin/codesign --force --sign - "$work/profile-dock-native"
  chmod 700 "$work/profile-dock-native"
  mv -f "$work/profile-dock-native" "$support/bin/profile-dock-native"
  cp "$root/macos/native.m" "$support/bin/native-source.m"
fi
printf '%s\n' "$node" > "$work/node-path"
printf '%s\n' "$codex" > "$work/codex-path"
mv -f "$work/node-path" "$support/node-path"
mv -f "$work/codex-path" "$support/codex-path"

if [[ -L "$market" || ( -e "$market" && ! -d "$market" ) ]]; then
  echo 'Unexpected Profile Dock marketplace path.' >&2
  exit 1
fi
if [[ -d "$market" ]]; then mv "$market" "$work/previous"; fi
mv "$work/marketplace" "$market"
registration=''
if registration="$("$codex" plugin marketplace add "$market" --json)" &&
   "$codex" plugin add 'helix-codex-profile-dock-sidebar@helix-profile-dock-preview'; then
  printf '\nInstalled Profile Dock. Fully quit and reopen Codex, then open Profile Dock in the sidebar.\n'
else
  if [[ -d "$work/previous" ]]; then
    mv "$market" "$work/failed"
    mv "$work/previous" "$market"
  elif [[ -n "$registration" ]]; then
    "$codex" plugin marketplace remove 'helix-profile-dock-preview' >/dev/null 2>&1 || true
  fi
  echo 'Profile Dock installation failed. Check the Codex CLI output above.' >&2
  exit 1
fi
