import {execFile, spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {createInterface} from "node:readline";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const authScript = fileURLToPath(new URL("./scripts/Switch-Codex.ps1", import.meta.url));
const appServerArgs = ["app-server", "--listen", "stdio://",
  "-c", 'cli_auth_credentials_store="file"', "-c", "analytics.enabled=false",
  "-c", 'chatgpt_base_url="https://chatgpt.com/backend-api/"'];

export async function readProfileUsage({name, vault, codexHome, state}) {
  const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  let auth;
  try {
    const {stdout} = await promisify(execFile)(powershell,
      ["-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-NonInteractive", "-File", authScript,
        "-Action", "ReadUsageAuth", "-Name", name, "-Vault", vault, "-CodexHome", codexHome],
      {timeout:4000, maxBuffer:64 * 1024, windowsHide:true});
    auth = JSON.parse(stdout);
  } catch {
    throw Error("usage_auth_unavailable");
  }
  if (!auth.codexExecutable) throw Error("usage_cli_unavailable");
  const executable = {command:auth.codexExecutable, args:appServerArgs};
  return queryRateLimits(executable, auth, state);
}

function quotaWindows(result) {
  const bucket = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  const windows = [];
  for (const entry of [bucket?.primary, bucket?.secondary]) {
    if (!Number.isFinite(entry?.usedPercent)) continue;
    const minutes = Number.isSafeInteger(entry.windowDurationMins) && entry.windowDurationMins > 0
      ? entry.windowDurationMins : null;
    const resetsAt = Number.isSafeInteger(entry.resetsAt) && entry.resetsAt > 0 && entry.resetsAt <= 8.64e12
      ? entry.resetsAt : null;
    windows.push({remaining:Math.min(100, Math.max(0, 100 - entry.usedPercent)), minutes, resetsAt});
  }
  if (!windows.length) throw Error("usage_no_windows");
  return windows;
}

export async function queryRateLimits({command, args}, {accessToken, chatgptAccountId}, state) {
  if (!accessToken || !chatgptAccountId) throw Error("usage_auth_unavailable");
  fs.mkdirSync(state, {recursive:true});
  const parent = fs.realpathSync(state);
  const home = fs.mkdtempSync(path.join(parent, "usage-"));
  let child;
  let closed;
  let timer;
  let expired = false;
  try {
    const env = {...process.env, CODEX_HOME:home, RUST_LOG:"off", RUST_BACKTRACE:"0"};
    for (const name of ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "CODEX_CHATGPT_BASE_URL", "CHATGPT_BASE_URL", "CODEX_CHATGPT_ACCESS_TOKEN"]) {
      delete env[name];
    }
    child = spawn(command, args, {env, cwd:home, stdio:["pipe","pipe","ignore"], windowsHide:true});
    child.on("error", () => {});
    child.stdin.on("error", () => {});
    closed = new Promise(resolve => child.once("close", resolve));
    timer = setTimeout(() => {
      expired = true;
      child.kill();
    }, 10000);

    const send = (method, params, id) => {
      child.stdin.write(JSON.stringify({jsonrpc:"2.0", method, params, id}) + "\n");
    };
    const lines = createInterface({input:child.stdout, crlfDelay:Infinity});
    send("initialize", {clientInfo:{name:"profile_dock",title:"Profile Dock",version:"0.8.2"},
      capabilities:{experimentalApi:true}}, 1);
    for await (const line of lines) {
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message?.method === "account/chatgptAuthTokens/refresh") throw Error("usage_expired");
      if (message?.method || ![1, 2, 3].includes(message?.id)) continue;
      if (message.error) {
        if (message.id === 3 && /\b401\b|unauthorized/i.test(message.error.message ?? "")) {
          throw Error("usage_expired");
        }
        throw Error("usage_unavailable");
      }
      if (message.id === 1) {
        send("initialized", {});
        send("account/login/start", {type:"chatgptAuthTokens", accessToken, chatgptAccountId}, 2);
      } else if (message.id === 2) {
        if (message.result?.type !== "chatgptAuthTokens") throw Error("usage_unavailable");
        send("account/rateLimits/read", undefined, 3);
      } else {
        return quotaWindows(message.result);
      }
    }
    throw Error(expired ? "usage_timeout" : "usage_unavailable");
  } finally {
    clearTimeout(timer);
    if (child) {
      child.stdin.end();
      child.kill();
      await closed;
    }
    if (path.dirname(home) === parent && path.basename(home).startsWith("usage-")) {
      fs.rmSync(home, {recursive:true, force:true, maxRetries:2, retryDelay:100});
    }
  }
}
