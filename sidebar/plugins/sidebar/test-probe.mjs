import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createBackend} from "./backend.mjs";
const userProfile=fs.mkdtempSync(path.join(os.tmpdir(),"dock-probe-"));
const local=path.join(userProfile,"AppData","Local");
const state=path.join(userProfile,".codex-profile-dock-sidebar");
try{
 const denied=createBackend({local,userProfile,launch:async()=>{throw Error("worker_no_ready");}});
 await assert.rejects(denied.probe(), {message:"worker_start_failed",reason:"worker_no_ready"});
 assert.equal(denied.list().operation.reason,"worker_no_ready");
 assert.equal(denied.list().busy,false);
 let action;
 const good=createBackend({local,userProfile,startupTimeoutMs:300,launch:async args=>{
   action=args[1];fs.writeFileSync(path.join(state,args[5]+".ready"),"ready");
 }});
 const job=await good.probe();
 assert.equal(action,"Probe");
 assert.equal(fs.existsSync(path.join(state,job.id+".go")),true);
 assert.equal(fs.existsSync(path.join(local,"CodexProfileDockSidebar")),false);
 console.log("PASS: startup diagnostics and probe handshake outside AppData");
}finally{fs.rmSync(userProfile,{recursive:true,force:true});}

