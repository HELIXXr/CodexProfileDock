import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {createBackend} from "./backend.mjs";
const local=fs.mkdtempSync(path.join(os.tmpdir(),"dock-companion-"));
const exe=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
const script=fileURLToPath(new URL("./scripts/Sidebar-Companion.ps1",import.meta.url));
let child,error="";
const wait=async (predicate)=>{const end=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<end,error||"companion timeout");await new Promise(r=>setTimeout(r,100));}};
try{
 const b=createBackend({local});
 assert.equal(b.list().companionOnline,false);
 await assert.rejects(b.probe(),/后台助手未运行/);
 assert.equal(b.list().busy,false);
 child=spawn(exe,["-NoProfile","-STA","-File",script,"-LocalRoot",local,"-Once"],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
 child.stderr.on("data",c=>error+=c);
 await wait(()=>b.list().companionOnline);
 await b.probe();
 await wait(()=>child.exitCode!==null);
 assert.equal(child.exitCode,0,error);
 assert.equal(b.list().operation.status,"probe_ok",JSON.stringify(b.list().operation));
 assert.equal(b.list().busy,false);
 assert.equal(b.list().companionOnline,false);
 assert.deepEqual(fs.readdirSync(path.join(local,"CodexProfileDockSidebar")).sort(),["companion.instance","latest.json"]);
 console.log("PASS: offline refusal, real companion handshake, no-op probe, and clean completion.");
}finally{
 if(child && child.exitCode===null){child.kill();await new Promise(r=>child.once("close",r));}
 fs.rmSync(local,{recursive:true,force:true});
}

