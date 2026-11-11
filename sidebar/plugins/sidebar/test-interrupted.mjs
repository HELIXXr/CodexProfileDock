import assert from "node:assert/strict";
import fs from "node:fs";import os from "node:os";import path from "node:path";import {randomUUID} from "node:crypto";
import {createBackend} from "./backend.mjs";
const local=fs.mkdtempSync(path.join(os.tmpdir(),"dock-dead-worker-"));
try{
 const state=path.join(local,"CodexProfileDockSidebar");fs.mkdirSync(state);
 const id=randomUUID();const lock=path.join(state,"operation.lock");const status=path.join(state,"latest.json");
 fs.writeFileSync(lock,id);fs.writeFileSync(path.join(state,id+".go"),"go");
 fs.writeFileSync(status,JSON.stringify({id,status:"running",pid:1234,updated:new Date(Date.now()-30000).toISOString()}));
 assert.equal(createBackend({local,isWorkerAlive:()=>true}).list().busy,true);
 const b=createBackend({local,isWorkerAlive:()=>false});
 assert.equal(b.list().operation.status,"interrupted");
 assert.equal(b.list().busy,false);
 assert.equal(fs.existsSync(path.join(state,id+".go")),false);
 console.log("PASS: live worker protected, dead worker marked interrupted and unlocked.");
}finally{fs.rmSync(local,{recursive:true,force:true});}

