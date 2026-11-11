import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createBackend} from "./backend.mjs";
const local=fs.mkdtempSync(path.join(os.tmpdir(),"dock-start-"));
const state=path.join(local,"CodexProfileDockSidebar");
try{
 const dead=createBackend({local,launch:async()=>{},startupTimeoutMs:80});
 await assert.rejects(dead.start(dead.prepare({action:"Save",name:"Fixture"})),/后台/);
 assert.equal(dead.list().busy,false);
 assert.equal(dead.list().operation.status,"failed");
 const good=createBackend({local,startupTimeoutMs:300,launch:async(args)=>{
   const id=args[5];
   fs.writeFileSync(path.join(state,id+".ready"),"ready");
 }});
 const job=await good.start(good.prepare({action:"Save",name:"Fixture"}));
 assert.equal(fs.existsSync(path.join(state,job.id+".go")),true);
 assert.equal(good.list().busy,true);
 console.log("PASS: missing worker fails and unlocks; ready worker gets permission.");
}finally{fs.rmSync(local,{recursive:true,force:true});}

