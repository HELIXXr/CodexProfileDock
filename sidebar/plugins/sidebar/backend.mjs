import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {readProfileUsage} from "./usage.mjs";
export const validName = n => typeof n==="string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(n);

function workerAlive(pid){
  try{process.kill(pid,0);return true;}catch(error){return error.code!=="ESRCH";}
}

export function createBackend({local=process.env.LOCALAPPDATA, userProfile=process.env.USERPROFILE, codexHome=process.env.CODEX_HOME, stateDir, launch, startupTimeoutMs=6000, isWorkerAlive=workerAlive}={}) {
  if(!local) throw Error("Windows local data directory is unavailable");
  local=path.resolve(local);
  if(!userProfile) throw Error("Windows user profile directory is unavailable");
  // Store-packaged Codex redirects new AppData files away from the Explorer worker.
  const state=stateDir??path.resolve(userProfile,".codex-profile-dock-sidebar");
  const vault=fs.existsSync(path.join(local,"LocalCodexSwitch"))?path.join(local,"LocalCodexSwitch"):path.join(local,"CodexProfileDock");
  const pending=new Map();
  const usage=new Map();
  const lock=path.join(state,"operation.lock");
  function profiles(){
    try { return fs.readdirSync(vault,{withFileTypes:true}).filter(e=>e.isFile() && e.name.endsWith(".dpapi") && validName(e.name.slice(0,-6))).map(e=>e.name.slice(0,-6)).sort(); }
    catch(e){if(e.code==="ENOENT")return [];throw Error("无法读取账号别名。");}
  }
  const home=path.resolve(codexHome || path.join(process.env.USERPROFILE ?? local, ".codex"));
  const run=launch??(args=>new Promise((resolve,reject)=>{
    const exe=path.join(process.env.SystemRoot??"C:\\\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
    const broker=fileURLToPath(new URL("./scripts/Launch-SidebarWorker.ps1",import.meta.url));
    const child=spawn(exe,["-NoProfile","-STA","-NonInteractive","-WindowStyle","Hidden","-File",broker,...args,
      "-StateDir",state,"-Vault",vault,"-CodexHome",home],{stdio:["ignore","pipe","ignore"],windowsHide:true});
    let response="";
    child.stdout.setEncoding("utf8").on("data",chunk=>{response=(response+chunk).slice(-160);});
    const timer=setTimeout(()=>{child.kill();reject(Error("explorer_timeout"));},6000);
    child.once("error",()=>{clearTimeout(timer);reject(Error("explorer_spawn"));});
    child.once("close",code=>{
      clearTimeout(timer);
      if(code===0 && response.trim()==="explorer_accepted")resolve();
      else reject(Error("explorer_unavailable"));
    });
  }));
  function inspectOperation(){
    const latest=path.join(state,"latest.json");
    let operation=null;
    try{operation=JSON.parse(fs.readFileSync(latest,"utf8").replace(/^\uFEFF/,""));}catch{}
    if(operation?.status==="running" && /^[a-f0-9-]{36}$/.test(operation.id) &&
       Number.isInteger(operation.pid) && operation.pid>0 &&
       Date.now()-Date.parse(operation.updated)>10000 && !isWorkerAlive(operation.pid)){
      const recovery=path.join(state,operation.id+".recover");
      let ownsRecovery=false;
      try{
        fs.closeSync(fs.openSync(recovery,"wx"));ownsRecovery=true;
        if(fs.readFileSync(lock,"utf8")===operation.id){
          operation={...operation,status:"interrupted",reason:"worker_exited",updated:new Date().toISOString()};
          fs.writeFileSync(latest,JSON.stringify(operation));
          for(const suffix of [".ready",".go",".tmp"])fs.rmSync(path.join(state,operation.id+suffix),{force:true});
          fs.rmSync(lock);
        }
      }catch{}finally{
        if(ownsRecovery){try{fs.rmSync(recovery,{force:true});}catch{}}
      }
    }
    return operation;
  }
  return {
    stateDir:state,
    list(){
      const operation=inspectOperation();
      const names=profiles();
      return {profiles:names,busy:fs.existsSync(lock),operation,
        usage:Object.fromEntries(names.filter(name=>usage.has(name)).map(name=>[name,usage.get(name)]))};
    },
    async refreshUsage({name}={}){
      if(!validName(name)||!profiles().includes(name))throw Error("usage_profile_missing");
      if(fs.existsSync(lock))throw Error("usage_busy");
      try{
        const windows=await readProfileUsage({name,vault,codexHome:home,state});
        const snapshot={windows,checkedAt:new Date().toISOString()};
        usage.set(name,snapshot);
        return snapshot;
      }catch(error){
        throw Error(/^usage_(auth_unavailable|cli_unavailable|expired|no_windows|timeout|unavailable)$/.test(error.message)
          ? error.message : "usage_unavailable");
      }
    },
    prepare({action,name}={}){
      if(!["Save","Switch"].includes(action)||!validName(name))throw Error("请输入 1–32 位英文、数字、短横线或下划线别名，并以字母或数字开头。");
      if(action==="Switch"&&!profiles().includes(name))throw Error("所选账号不存在，请刷新列表。");
      pending.clear();
      const ticket=randomUUID();pending.set(ticket,{action,name,expires:Date.now()+120000});
      return {ticket,action,name};
    },
    probe(){
      const ticket=randomUUID();pending.set(ticket,{action:"Probe",name:"Probe",expires:Date.now()+120000});
      return this.start({ticket});
    },
    async start({ticket}={}){
      const intent=pending.get(ticket);pending.delete(ticket);
      if(!intent||intent.expires<Date.now())throw Error("确认已过期，请重新选择账号。");
      if(intent.action==="Switch"&&!profiles().includes(intent.name))throw Error("所选账号已不存在。");
      fs.mkdirSync(state,{recursive:true});
      inspectOperation();
      let handle;
      try{handle=fs.openSync(lock,"wx");}catch(e){if(e.code==="EEXIST")throw Error("有操作正在进行；如上次异常终止，请先确认没有后台切换进程，再移除 operation.lock。");throw e;}
      const id=randomUUID();
      try{
        fs.writeFileSync(handle,id);fs.closeSync(handle);handle=undefined;
        fs.writeFileSync(path.join(state,"latest.json"),JSON.stringify({id,status:"queued",kind:intent.action,updated:new Date().toISOString()}));
        await run(["-Action",intent.action,"-Name",intent.name,"-OperationId",id]);
        const ready=path.join(state,id+".ready");
        const deadline=Date.now()+startupTimeoutMs;
        while(!fs.existsSync(ready) && fs.existsSync(lock) && Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!fs.existsSync(ready) || fs.readFileSync(lock,"utf8")!==id)throw Error("worker_no_ready");
        // The worker may not touch Codex until this single-use permit exists.
        fs.writeFileSync(path.join(state,id+".go"),"go",{flag:"wx"});
      }catch(error){
        let reason=/^(?:explorer_(?:timeout|spawn|unavailable)|worker_no_ready)$/i.test(error.message)?error.message:"startup";
        try{
          const result=JSON.parse(fs.readFileSync(path.join(state,"latest.json"),"utf8"));
          if(result.id===id && /^worker_(?:forms|script|permit)$/.test(result.reason))reason=result.reason;
        }catch{}
        if(handle!==undefined)fs.closeSync(handle);
        let ownLock=false;
        try{ownLock=fs.readFileSync(lock,"utf8")===id;}catch{}
        if(ownLock){
          fs.writeFileSync(path.join(state,"latest.json"),JSON.stringify({id,status:"failed",kind:intent.action,reason,updated:new Date().toISOString()}));
          fs.rmSync(lock,{force:true});
        }
        for(const suffix of [".ready"]){
          fs.rmSync(path.join(state,id+suffix),{force:true});
        }

        throw Error("后台未确认启动，已取消本次操作。账号未改变。诊断代码："+reason);
      }
      return {id,status:"queued"};
    }
  };
}



