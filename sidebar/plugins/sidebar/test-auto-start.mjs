import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createStartup} from "./startup.mjs";

const state=fs.mkdtempSync(path.join(os.tmpdir(),"dock-startup-"));
const names=["Expired","Working"];
const calls=[];
const options={
  state,
  identify:async()=> "123-456",
  list:()=>({profiles:names,busy:false}),
  probe:async()=>{calls.push("probe");return true;},
  query:async name=>{
    calls.push(name);
    if(name==="Expired")throw Error("usage_expired");
    return {windows:[{remaining:70,minutes:300,resetsAt:null}],checkedAt:"2026-11-11T12:00:00.000Z"};
  },
};
try{
  const first=createStartup(options), second=createStartup(options);
  await Promise.all([first.start(),second.start(),first.start()]);
  assert.deepEqual(calls,["probe","Expired","Working"]);
  for(const instance of [first,second]){
    const result=instance.snapshot();
    assert.equal(result.status,"complete");
    assert.equal(result.probe,"passed");
    assert.equal(result.errors.Expired,"usage_expired");
    assert.equal(result.usage.Working.windows[0].remaining,70);
    assert.equal(result.total,2);
  }
  const nextBoot=createStartup({...options,identify:async()=> "789-012"});
  await nextBoot.start();
  assert.equal(calls.filter(x=>x==="probe").length,2);
  const cli=createStartup({...options,identify:async()=>null});
  await cli.start();
  assert.equal(cli.snapshot(),null);
  assert.equal(calls.length,6);
  console.log("PASS: startup once per desktop, shared results, partial failure, new boot and CLI exclusion");
}finally{
  for(const entry of fs.readdirSync(state))fs.unlinkSync(path.join(state,entry));
  fs.rmdirSync(state);
}
