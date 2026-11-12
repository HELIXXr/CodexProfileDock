import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createInterface } from "node:readline";
import { readMacAuthMode } from "../plugins/sidebar/macos.mjs";

const root = path.join(os.homedir(), "Library", "Application Support", "CodexProfileDock");
const native = path.join(root, "bin", "profile-dock-native");
const cli = fs.readFileSync(path.join(root, "codex-path"), "utf8").trim();
const id = randomUUID();
const sample = Buffer.alloc(24 * 1024, 42);
const call = (args, input) => spawnSync(native, args, { input, timeout: 4000 });
const probe = call(["probe"]);
assert.equal(probe.status, 0, probe.stderr.toString());
assert.equal(probe.stdout.toString().trim(), "ok");
assert.equal(call(["put", id], sample).status, 0);
try {
  const result = call(["get", id]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, sample);
} finally {
  assert.equal(call(["delete", id]).status, 0);
}
assert.notEqual(call(["get", id]).status, 0);
assert.equal(await readMacAuthMode(cli, process.env.CODEX_HOME), "file");
fs.writeFileSync(path.join(process.env.CODEX_HOME, "config.toml"), 'cli_auth_credentials_store = "keyring"\n');
assert.equal(await readMacAuthMode(cli, process.env.CODEX_HOME), "keyring");

const source = path.join(root, "marketplace", "plugins", "sidebar");
const { version } = JSON.parse(fs.readFileSync(path.join(source, "plugin.json"), "utf8"));
const launcher = path.join(process.env.CODEX_HOME, "plugins", "cache", "helix-profile-dock-preview",
  "helix-codex-profile-dock-sidebar", version, "run-mcp.sh");
const server = spawn("/bin/bash", [launcher], { stdio: ["pipe", "pipe", "inherit"] });
const closed = new Promise(resolve => server.once("close", resolve));
const timer = setTimeout(() => server.kill(), 10000);
const lines = createInterface({ input: server.stdout })[Symbol.asyncIterator]();
try {
  server.stdin.end(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "probe_worker", arguments: {} },
  }) + "\n");
  const { value } = await lines.next();
  const reply = JSON.parse(value);
  assert.equal(reply.result._meta.panel.status, "queued");
  assert.equal(await closed, 0);
} finally {
  clearTimeout(timer);
  server.kill();
}
const latest = path.join(root, "state", "latest.json");
for (let n = 0; n < 80; n++) {
  if (JSON.parse(fs.readFileSync(latest, "utf8")).status === "probe_ok" &&
      !fs.existsSync(path.join(root, "state", "operation.lock"))) break;
  await delay(50);
}
assert.equal(JSON.parse(fs.readFileSync(latest, "utf8")).status, "probe_ok");
assert.equal(fs.existsSync(path.join(root, "state", "operation.lock")), false);
assert.equal(fs.existsSync(path.join(process.env.CODEX_HOME, "auth.json")), false);
console.log("PASS native Keychain round trip, actual Codex configuration, and detached worker after MCP exit");
