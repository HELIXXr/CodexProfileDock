import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createBackend} from "./backend.mjs";
const local=fs.mkdtempSync(path.join(os.tmpdir(),"dock-probe-"));
const state=path.join(local,"CodexProfileDockSidebar");
try{
 const denied=createBackend({local,launch:async()=>{throw Error("worker_no_ready");}});
 await assert.rejects(denied.probe(),/worker_no_ready/);
 assert.equal(denied.list().operation.reason,"worker_no_ready");
 assert.equal(denied.list().busy,false);
 let action;
 const good=createBackend({local,startupTimeoutMs:300,launch:async args=>{
   action=args[1];fs.writeFileSync(path.join(state,args[5]+".ready"),"ready");
 }});
 const job=await good.probe();
 assert.equal(action,"Probe");
 assert.equal(fs.existsSync(path.join(state,job.id+".go")),true);
 console.log("PASS: startup diagnostics and isolated probe request");
}finally{fs.rmSync(local,{recursive:true,force:true});}

