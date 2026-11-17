import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createPanelStore} from "./panel-store.mjs";
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"dock-panel-store-"));
try{
 const a=createPanelStore(dir),key="a".repeat(64),names=["Personal","Work","Archive"];
 a.move(names,"Work",-1);
 assert.deepEqual(createPanelStore(dir).order(names),["Work","Personal","Archive"]);
 a.renamed(["Personal","Office","Archive"],"Work","Office");
 assert.deepEqual(a.order(["Personal","Office","Archive"]),["Office","Personal","Archive"]);
 assert.deepEqual(a.order(["Archive","Office"]),["Office","Archive"]);
 const snapshot={windows:[{remaining:82,minutes:300,resetsAt:1800000000}],checkedAt:new Date().toISOString()};
 a.saveUsage(key,snapshot);
 assert.deepEqual(createPanelStore(dir).usage(key),snapshot);
 assert.throws(()=>a.move(names,"Work",2));
 a.saveUsage(key,{...snapshot,windows:[{remaining:NaN,minutes:300,resetsAt:null}]});
 assert.equal(a.usage(key),null);
 a.saveUsage(key,{...snapshot,private:"MUST_NOT_FORWARD"});
 assert.deepEqual(a.usage(key),snapshot);
 a.forgetUsage(key);assert.equal(a.usage(key),null);
 console.log("PASS persistent ordering, rename/remove reconciliation, quota cache validation and public fields");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
