import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createMacPlatform, macPaths, writePrivateAtomic } from "./macos.mjs";

const [state, userProfile, local, home, action, name, id, newName] = process.argv.slice(2);
const validName = value => /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(value ?? "");
const validId = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id ?? "");
if (![state, userProfile, local, home].every(value => value && path.isAbsolute(value)) ||
    !validId || !["Probe", "Save", "Switch", "Rename"].includes(action) ||
    !validName(name) || (action === "Rename" && !validName(newName))) process.exit(1);

const files = suffix => path.join(state, id + suffix);
const lock = path.join(state, "operation.lock");
const latest = path.join(state, "latest.json");
const platform = createMacPlatform({ ...macPaths(userProfile, local), codexHome: home });
const knownErrors = new Set([
  "rename_exists", "rename_missing", "rename_invalid", "mac_keychain_unavailable",
  "mac_file_auth_required", "mac_config_unavailable", "mac_alias_taken", "mac_save_current_first",
  "mac_desktop_unavailable", "mac_quit_timeout", "mac_codex_running", "profile_missing", "usage_cli_unavailable",
]);

function ownsLock() {
  try { return fs.readFileSync(lock, "utf8") === id; } catch { return false; }
}

function publish(status, reason) {
  writePrivateAtomic(latest, JSON.stringify({ id, kind: action, status, reason, pid: process.pid, updated: new Date().toISOString() }));
  if (action === "Rename" && ["failed", "renamed"].includes(status)) {
    writePrivateAtomic(files(".rename-result"), JSON.stringify({ id, status, reason }));
  }
}

if (!ownsLock()) process.exit(1);
try {
  // The server must issue a single-use permit before this worker may change anything.
  publish("running");
  fs.writeFileSync(files(".ready"), "ready", { flag: "wx", mode: 0o600 });
  const deadline = Date.now() + 12000;
  while (ownsLock() && !fs.existsSync(files(".go")) && Date.now() < deadline) await delay(50);
  if (!ownsLock()) process.exit(1);
  if (!fs.existsSync(files(".go"))) {
    publish("failed", "worker_permit");
  } else if (action === "Probe") {
    await platform.probe();
    publish("probe_ok");
  } else if (action === "Rename") {
    await platform.vault.rename(name, newName);
    publish("renamed");
  } else {
    publish(await platform.run(action, name));
  }
} catch (error) {
  if (ownsLock()) publish("failed", knownErrors.has(error.message) ? error.message : "operation");
} finally {
  if (ownsLock()) {
    for (const suffix of [".ready", ".go"]) fs.rmSync(files(suffix), { force: true });
    fs.rmSync(lock);
  }
}
