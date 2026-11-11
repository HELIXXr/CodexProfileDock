import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {queryRateLimits} from "./usage.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dock-usage-test-"));
const fixture = path.join(root, "app-server.mjs");
fs.writeFileSync(fixture, `
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createInterface} from "node:readline";
const reply = (id, result) => console.log(JSON.stringify({id, result}));
for await (const line of createInterface({input:process.stdin})) {
  const request = JSON.parse(line);
  assert.ok(!fs.existsSync(path.join(process.env.CODEX_HOME, "auth.json")));
  switch (request.method) {
    case "initialize":
      assert.equal(request.params.capabilities.experimentalApi, true);
      reply(request.id, {});
      break;
    case "initialized":
      break;
    case "account/login/start":
      assert.deepEqual(request.params, {type:"chatgptAuthTokens",accessToken:"fixture",chatgptAccountId:"workspace"});
      reply(request.id, {type:"chatgptAuthTokens"});
      break;
    case "account/rateLimits/read":
      if (process.argv[2] === "expired") {
        console.log(JSON.stringify({id:"server-1",method:"account/chatgptAuthTokens/refresh",params:{reason:"unauthorized"}}));
      } else {
        reply(request.id, {
          rateLimitsByLimitId:{codex:{
            primary:{usedPercent:18,windowDurationMins:300,resetsAt:1800000000,internal:"secret"},
            secondary:{usedPercent:100,windowDurationMins:10080}
          }},
          rateLimits:{primary:{usedPercent:90}},
          private:"not for the sidebar"
        });
      }
      break;
    default:
      assert.fail("unexpected RPC");
  }
}
`);
const auth = {accessToken:"fixture",chatgptAccountId:"workspace"};
try {
  const run = mode => queryRateLimits({command:process.execPath,args:[fixture,mode]}, auth, root);
  assert.deepEqual(await run("ok"), [
    {remaining:82,minutes:300,resetsAt:1800000000},
    {remaining:0,minutes:10080,resetsAt:null},
  ]);
  await assert.rejects(run("expired"), {message:"usage_expired"});
  assert.deepEqual(fs.readdirSync(root), ["app-server.mjs"]);
  console.log("PASS: structured usage RPC, sanitized windows, expiration and cleanup");
} finally {
  fs.unlinkSync(fixture);
  fs.rmdirSync(root);
}
