import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { queryRateLimits, appServerArgs } from "./usage.mjs";

const exec = promisify(execFile);
const maxAuthSize = 1024 * 1024;
const extension = ".keychain";
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;
const alias = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

export function macPaths(userProfile = os.homedir(), local = path.join(userProfile, "Library", "Application Support")) {
  const support = path.join(local, "CodexProfileDock");
  return { userProfile, local, support, state: path.join(support, "state"), vault: path.join(support, "profiles") };
}

function readFile(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw Error("mac_file_auth_required");
    const bytes = fs.readFileSync(fd);
    if (bytes.length > limit) throw Error("mac_file_auth_required");
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

export function parseMacAuth(bytes) {
  try {
    const data = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    const { id_token, access_token, refresh_token, account_id } = data.tokens;
    if (data.auth_mode !== "chatgpt" || ![id_token, access_token, refresh_token].every(value => typeof value === "string" && value)) {
      throw Error();
    }
    const jwt = id_token.split(".");
    if (jwt.length !== 3) throw Error();
    const { iss, sub } = JSON.parse(Buffer.from(jwt[1], "base64url").toString("utf8"));
    if (typeof iss !== "string" || !iss || typeof sub !== "string" || !sub) throw Error();
    const accountId = typeof account_id === "string" ? account_id : "";
    return { identity: JSON.stringify([iss, sub, accountId]), accessToken: access_token, chatgptAccountId: accountId };
  } catch {
    throw Error("mac_file_auth_required");
  }
}

function readActive(auth) {
  try {
    return readFile(auth, maxAuthSize);
  } catch {
    throw Error("mac_file_auth_required");
  }
}

export function writePrivateAtomic(file, bytes) {
  const temporary = path.join(path.dirname(file), "." + randomUUID() + ".tmp");
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600, flush: true });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function createMacVault(directory, keychain) {
  function file(name) {
    if (typeof name !== "string" || !alias.test(name)) throw Error("rename_invalid");
    return path.join(directory, name + extension);
  }

  function names() {
    try {
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith(extension))
        .map(entry => entry.name.slice(0, -extension.length))
        .filter(name => alias.test(name));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  function itemId(name) {
    const id = readFile(file(name), 64).toString("utf8");
    if (!uuid.test(id)) throw Error("mac_keychain_unavailable");
    return id;
  }

  return {
    names,
    read(name) {
      return keychain("get", itemId(name));
    },
    async write(name, bytes) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const oldId = names().includes(name) ? itemId(name) : null;
      const id = randomUUID();
      await keychain("put", id, bytes);
      try {
        writePrivateAtomic(file(name), id);
      } catch (error) {
        await keychain("delete", id).catch(() => {});
        throw error;
      }
      if (oldId) await keychain("delete", oldId).catch(() => {});
    },
    async rename(name, newName) {
      const existing = names();
      if (!existing.includes(name)) throw Error("rename_missing");
      if (existing.some(other => other !== name && other.toLowerCase() === newName.toLowerCase())) {
        throw Error("rename_exists");
      }
      if (name !== newName) fs.renameSync(file(name), file(newName));
    },
  };
}

async function planAccountAction({ action, name, auth, vault }) {
  const current = readActive(auth);
  const { identity } = parseMacAuth(current);
  const names = vault.names();
  if (action === "Save") {
    const existing = names.find(value => value.toLowerCase() === name.toLowerCase());
    if (existing && parseMacAuth(await vault.read(existing)).identity !== identity) throw Error("mac_alias_taken");
    return { current, update: [existing ?? name] };
  }

  if (!names.includes(name)) throw Error("profile_missing");
  const next = await vault.read(name);
  if (parseMacAuth(next).identity === identity) return { current, update: [name] };
  const update = [];
  for (const saved of names) {
    if (saved !== name && parseMacAuth(await vault.read(saved)).identity === identity) update.push(saved);
  }
  if (!update.length) throw Error("mac_save_current_first");
  return { current, update, next };
}

export async function applyMacAccountAction(options) {
  await options.assertClosed();
  const { current, update, next } = await planAccountAction(options);
  for (const name of update) await options.vault.write(name, current);
  if (next) {
    await options.assertClosed();
    writePrivateAtomic(options.auth, next);
  }
}

export async function readMacAuthMode(command, codexHome) {
  const child = spawn(command, ["app-server", "--listen", "stdio://"], {
    cwd: codexHome,
    env: { ...process.env, CODEX_HOME: codexHome, RUST_LOG: "off" },
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  const closed = new Promise(resolve => child.once("close", resolve));
  const timer = setTimeout(() => child.kill(), 6500);
  const send = (method, id, params = {}) => child.stdin.write(JSON.stringify({ method, id, params }) + "\n");
  let mode, requirement, readConfig = false, readRequirements = false;
  try {
    send("initialize", 1, { clientInfo: { name: "profile_dock", version: "0.9.0" } });
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      const message = JSON.parse(line);
      if (![1, 2, 3].includes(message.id)) continue;
      if (message.error) break;
      if (message.id === 1) {
        send("initialized");
        send("config/read", 2);
        send("configRequirements/read", 3);
      } else if (message.id === 2) {
        mode = message.result?.config?.cli_auth_credentials_store;
        readConfig = true;
      } else {
        requirement = message.result?.requirements?.cliAuthCredentialsStore;
        readRequirements = true;
      }
      if (readConfig && readRequirements) return requirement ?? mode;
    }
  } catch {
    // Never forward app-server output. A configuration can contain private values.
  } finally {
    clearTimeout(timer);
    child.stdin.end();
    child.kill();
    await closed;
  }
  throw Error("mac_config_unavailable");
}

export function launchMacWorker(script, args) {
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    detached: true,
    stdio: "ignore",
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function createMacPlatform({ support, vault, codexHome }) {
  const native = path.join(support, "bin", "profile-dock-native");
  const auth = path.join(codexHome, "auth.json");
  const platformVault = createMacVault(vault, async (action, id, data) => {
    const request = exec(native, [action, id], { encoding: "buffer", timeout: 10000, maxBuffer: maxAuthSize + 1024 });
    request.child.stdin.on("error", () => {});
    request.child.stdin.end(data);
    try {
      return (await request).stdout;
    } catch {
      throw Error("mac_keychain_unavailable");
    }
  });

  async function desktop() {
    try {
      const { stdout } = await exec(native, ["desktop"], { timeout: 4000 });
      return JSON.parse(stdout);
    } catch {
      throw Error("mac_desktop_unavailable");
    }
  }

  function codexExecutable() {
    try {
      const command = readFile(path.join(support, "codex-path"), 8192).toString("utf8").trim();
      if (!path.isAbsolute(command)) throw Error();
      fs.accessSync(command, fs.constants.X_OK);
      return command;
    } catch {
      throw Error("usage_cli_unavailable");
    }
  }

  async function assertClosed(app) {
    const current = await desktop();
    if (current.pid) throw Error("mac_codex_running");
    let listing;
    try {
      listing = (await exec("/bin/ps", ["-ax", "-o", "uid=,pid=,comm="], { timeout: 4000 })).stdout;
    } catch {
      throw Error("mac_codex_running");
    }
    for (const line of listing.split("\n")) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!match || Number(match[1]) !== process.getuid()) continue;
      const executable = match[3];
      if (executable.startsWith(app.path + "/Contents/") ||
          /^(?:codex|codex-app-server|codex-tui|codex-(?:aarch64|x86_64)-apple-darwin)$/.test(path.basename(executable))) {
        throw Error("mac_codex_running");
      }
    }
  }

  async function assertSigned(app) {
    try {
      await exec("/usr/bin/codesign", ["--verify", "-R", 'anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2" and identifier "com.openai.codex"', app.path], { timeout: 5000 });
    } catch {
      throw Error("mac_desktop_unavailable");
    }
  }

  return {
    vault: platformVault,
    async probe() {
      const { stdout } = await exec(native, ["probe"], { timeout: 4000 });
      if (stdout.trim() !== "ok") throw Error("mac_desktop_unavailable");
    },
    async desktopSession(parentPid = process.ppid) {
      try {
        const { pid, started } = await desktop();
        if (!pid || !started) return null;
        for (let n = 0; n < 12 && parentPid > 1; n++) {
          if (parentPid === pid) return pid + "-" + started;
          const { stdout } = await exec("/bin/ps", ["-p", String(parentPid), "-o", "ppid="], { timeout: 1500 });
          parentPid = Number(stdout.trim());
        }
      } catch {}
      return null;
    },
    async usage(name, state) {
      let saved;
      try {
        saved = parseMacAuth(await platformVault.read(name));
      } catch {
        throw Error("usage_auth_unavailable");
      }
      try {
        const active = parseMacAuth(readActive(auth));
        if (active.identity === saved.identity) saved = active;
      } catch {}
      return queryRateLimits({ command: codexExecutable(), args: appServerArgs }, saved, state);
    },
    async run(action, name) {
      const command = codexExecutable();
      if (await readMacAuthMode(command, codexHome) !== "file") throw Error("mac_file_auth_required");
      const app = await desktop();
      if (!app.pid || !app.started || !path.isAbsolute(app.path)) throw Error("mac_desktop_unavailable");
      await assertSigned(app);
      await planAccountAction({ action, name, auth, vault: platformVault });
      let result = "manual";
      try {
        await exec(native, ["quit", String(app.pid), String(app.started)], { timeout: 5000 }).catch(() => {
          throw Error("mac_quit_timeout");
        });
        const deadline = Date.now() + 25000;
        for (;;) {
          try {
            await assertClosed(app);
            break;
          } catch (error) {
            if (Date.now() >= deadline) throw error;
            await delay(250);
          }
        }
        await applyMacAccountAction({ action, name, auth, vault: platformVault, assertClosed: () => assertClosed(app) });
      } finally {
        try {
          if (!(await desktop()).pid) {
            await assertSigned(app);
            await exec("/usr/bin/open", ["-a", app.path], { timeout: 6000 });
            result = "requested";
          }
        } catch {}
      }
      return result;
    },
  };
}
