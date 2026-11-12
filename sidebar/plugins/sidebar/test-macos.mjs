import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMacVault, applyMacAccountAction } from "./macos.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "profile-dock-mac-test-"));
try {
  const secrets = new Map();
  const keychain = async (action, id, data) => {
    if (action === "put") secrets.set(id, Buffer.from(data));
    else if (action === "get") {
      if (!secrets.has(id)) throw Error("mac_keychain_unavailable");
      return secrets.get(id);
    } else if (action === "delete") secrets.delete(id);
  };
  const fixture = (id, suffix) => Buffer.from(JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      id_token: "fixture." + Buffer.from(JSON.stringify({ iss: "fixture", sub: id })).toString("base64url") + ".fixture",
      account_id: id,
      access_token: "fixture-access-" + suffix,
      refresh_token: "fixture-refresh-" + suffix,
    },
  }));
  const vault = createMacVault(path.join(root, "profiles"), keychain);
  const auth = path.join(root, "auth.json");
  const first = fixture("one", "old");
  const updated = fixture("one", "new");
  const second = fixture("two", "current");
  let allowWrite = true;
  const active = () => fs.readFileSync(auth);
  const run = (action, name) => applyMacAccountAction({
    action, name, auth, vault,
    assertClosed: async () => { if (!allowWrite) throw Error("mac_codex_running"); },
  });

  fs.writeFileSync(auth, first);
  await run("Save", "Personal");
  assert.deepEqual(await vault.read("Personal"), first);
  assert.equal(fs.readFileSync(path.join(root, "profiles", "Personal.keychain"), "utf8").includes("fixture"), false);
  await vault.rename("Personal", "Archive");
  assert.deepEqual(await vault.read("Archive"), first);

  fs.writeFileSync(auth, second);
  await assert.rejects(run("Save", "archive"), {message:"mac_alias_taken"});
  await run("Save", "Work");
  fs.writeFileSync(auth, updated);
  allowWrite = false;
  await assert.rejects(run("Switch", "Work"), {message:"mac_codex_running"});
  assert.deepEqual(active(), updated);
  assert.deepEqual(await vault.read("Archive"), first);
  allowWrite = true;
  await run("Switch", "Work");
  assert.deepEqual(active(), second);
  assert.deepEqual(await vault.read("Archive"), updated);
  if (process.platform !== "win32") assert.equal(fs.statSync(auth).mode & 0o777, 0o600);
  console.log("PASS macOS account records, alias conflicts, refreshed credentials, and closed-app write guard");
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
