import {createBackend,validName} from "./backend.mjs";import fs from "node:fs";import os from "node:os";import path from "node:path";import assert from "node:assert/strict";
const local=fs.mkdtempSync(path.join(os.tmpdir(),"dock-test-"));
try{
const vault=path.join(local,"CodexProfileDock");fs.mkdirSync(vault);fs.writeFileSync(path.join(vault,"Personal.dpapi"),"fixture");fs.writeFileSync(path.join(vault,"Work.dpapi"),"fixture");fs.writeFileSync(path.join(vault,"auth.json"),"MUST_NOT_READ");
const calls=[];const b=createBackend({local,launch:async args=>calls.push(args)});
assert.deepEqual(b.list().profiles,["Personal","Work"]);
for(const name of ["","../x","中文","x".repeat(33)])assert.equal(validName(name),false);
assert.throws(()=>b.prepare({action:"Switch",name:"Unknown"}));
assert.throws(()=>b.prepare({action:"Delete",name:"Personal"}));
await assert.rejects(b.start({ticket:"fake"}));assert.equal(calls.length,0);
const ticket=b.prepare({action:"Switch",name:"Work"});const result=await b.start(ticket);
assert.equal(result.status,"queued");assert.equal(calls.length,1);assert.equal(calls[0][3],"Work");assert.equal(b.list().busy,true);
await assert.rejects(b.start(ticket));
await assert.rejects(b.start(b.prepare({action:"Save",name:"Other"})));
assert.equal(calls.length,1);
fs.unlinkSync(path.join(local,"CodexProfileDockSidebar","operation.lock"));
const c=createBackend({local,launch:async()=>{throw Error("fixture");}});
await assert.rejects(c.start(c.prepare({action:"Save",name:"Other"})));
assert.equal(c.list().busy,false);assert.equal(c.list().operation.status,"failed");
assert.equal(fs.readFileSync(path.join(vault,"auth.json"),"utf8"),"MUST_NOT_READ");
console.log("PASS profiles, confirmation tickets, replay, invalid input, lock, launch failure, unchanged auth fixture");
}finally{fs.rmSync(local,{recursive:true,force:true});}

