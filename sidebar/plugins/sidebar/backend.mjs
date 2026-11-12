import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {readProfileUsage} from "./usage.mjs";
import {createMacPlatform,launchMacWorker,macPaths} from "./macos.mjs";
export const validName = n => typeof n==="string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(n);

export class PanelError extends Error {
  constructor(code, reason) {
    super(code);
    this.reason = reason;
  }
}

function workerAlive(pid){
  try{process.kill(pid,0);return true;}catch(error){return error.code!=="ESRCH";}
}

export function createBackend({local=process.env.LOCALAPPDATA, userProfile=process.env.USERPROFILE, codexHome=process.env.CODEX_HOME, stateDir, launch, startupTimeoutMs=6000, isWorkerAlive=workerAlive}={}) {
  const macSettings=process.platform==="darwin"?macPaths(userProfile,local):null;
  if(macSettings) ({local,userProfile}=macSettings);
  if(!local) throw Error("Local data directory is unavailable");
  local=path.resolve(local);
  if(!userProfile) throw Error("Windows user profile directory is unavailable");
  // Store-packaged Codex redirects new AppData files away from the Explorer worker.
  const state=stateDir??macSettings?.state??path.resolve(userProfile,".codex-profile-dock-sidebar");
  const vault=macSettings?.vault??(fs.existsSync(path.join(local,"LocalCodexSwitch"))?path.join(local,"LocalCodexSwitch"):path.join(local,"CodexProfileDock"));
  const home=path.resolve(codexHome || path.join(userProfile, ".codex"));
  const mac=macSettings?createMacPlatform({...macSettings,codexHome:home}):null;
  const pending=new Map();
  const usage=new Map();
  const lock=path.join(state,"operation.lock");
  function profiles(){
    try {
      if(mac)return mac.vault.names().sort();
      return fs.readdirSync(vault,{withFileTypes:true}).filter(e=>e.isFile() && e.name.endsWith(".dpapi") && validName(e.name.slice(0,-6))).map(e=>e.name.slice(0,-6)).sort(); }
    catch(e){if(e.code==="ENOENT")return [];throw new PanelError("profiles_unreadable");}
  }
  function profileRef(name){
    try{
      const file=fs.statSync(path.join(vault,name+(mac?".keychain":".dpapi")),{bigint:true});
      return file.isFile()?`${file.dev}:${file.ino}:${file.birthtimeNs}`:null;
    }catch{return null;}
  }
  const run=launch??(mac?args=>launchMacWorker("./macos-worker.mjs",[
    state,userProfile,local,home,args[1],args[3],args[5],...args.slice(7)
  ]):args=>new Promise((resolve,reject)=>{
    const exe=path.join(process.env.SystemRoot??"C:\\\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
    const broker=fileURLToPath(new URL("./scripts/Launch-SidebarWorker.ps1",import.meta.url));
    const child=spawn(exe,["-NoProfile","-ExecutionPolicy","RemoteSigned","-STA","-NonInteractive","-WindowStyle","Hidden","-File",broker,...args,
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
    startupOptions:{state,local,userProfile,codexHome:home,mac},
    list(){
      const operation=inspectOperation();
      const names=profiles();
      const profileRefs=Object.fromEntries(names.map(name=>[name,profileRef(name)]));
      return {profiles:names,busy:fs.existsSync(lock),operation,profileRefs,
        usage:Object.fromEntries(names.filter(name=>usage.has(profileRefs[name])).map(name=>[name,usage.get(profileRefs[name])]))};
    },
    async refreshUsage({name}={}){
      if(!validName(name)||!profiles().includes(name))throw Error("usage_profile_missing");
      if(fs.existsSync(lock))throw Error("usage_busy");
      const ref=profileRef(name);
      if(!ref)throw Error("usage_profile_missing");
      try{
        const windows=mac?await mac.usage(name,state):await readProfileUsage({name,vault,codexHome:home,state});
        const snapshot={windows,checkedAt:new Date().toISOString()};
        if(profileRef(name)!==ref)throw Error("usage_profile_missing");
        usage.set(ref,snapshot);
        return snapshot;
      }catch(error){
        throw Error(/^usage_(auth_unavailable|cli_unavailable|expired|no_windows|timeout|unavailable|profile_missing)$/.test(error.message)
          ? error.message : "usage_unavailable");
      }
    },
    async renameProfile({name,newName}={}){
      if(!validName(name)||!validName(newName)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(newName)){
        throw new PanelError("rename_invalid");
      }
      const names=profiles();
      if(!names.includes(name))throw new PanelError("profile_missing");
      if(name===newName)return {name:newName};
      if(names.some(other=>other!==name&&other.toLowerCase()===newName.toLowerCase())){
        throw new PanelError("rename_exists");
      }
      const ticket=randomUUID();
      pending.set(ticket,{action:"Rename",name,newName,expires:Date.now()+120000});
      const {id}=await this.start({ticket});
      const receipt=path.join(state,id+".rename-result");
      const deadline=Date.now()+5000;
      try{
        while(Date.now()<deadline){
          let result;
          try{result=JSON.parse(fs.readFileSync(receipt,"utf8"));}catch{}
          if(result?.id===id){
            if(result.status==="renamed")return {name:newName};
            const knownReasons=["rename_exists","rename_missing","rename_busy","rename_invalid"];
            throw new PanelError(knownReasons.includes(result.reason)?result.reason:"rename_failed");
          }
          await delay(100);
        }
        throw new PanelError("rename_no_receipt");
      }finally{fs.rmSync(receipt,{force:true});}
    },
    prepare({action,name}={}){
      if(!["Save","Switch"].includes(action)||!validName(name))throw new PanelError("alias_invalid");
      if(action==="Switch"&&!profiles().includes(name))throw new PanelError("profile_missing");
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
      if(!intent||intent.expires<Date.now())throw new PanelError("ticket_expired");
      if(intent.action==="Switch"&&!profiles().includes(intent.name))throw new PanelError("profile_missing");
      fs.mkdirSync(state,{recursive:true,mode:0o700});
      inspectOperation();
      let handle;
      try{handle=fs.openSync(lock,"wx");}catch(e){if(e.code==="EEXIST")throw new PanelError("operation_busy");throw e;}
      const id=randomUUID();
      try{
        fs.writeFileSync(handle,id);fs.closeSync(handle);handle=undefined;
        if(intent.action==="Switch"&&!profiles().includes(intent.name))throw Error("profile_missing");
        fs.writeFileSync(path.join(state,"latest.json"),JSON.stringify({id,status:"queued",kind:intent.action,updated:new Date().toISOString()}));
        const args=["-Action",intent.action,"-Name",intent.name,"-OperationId",id];
        if(intent.action==="Rename")args.push("-NewName",intent.newName);
        await run(args);
        const ready=path.join(state,id+".ready");
        const deadline=Date.now()+startupTimeoutMs;
        while(!fs.existsSync(ready) && fs.existsSync(lock) && Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!fs.existsSync(ready) || fs.readFileSync(lock,"utf8")!==id)throw Error("worker_no_ready");
        // The worker may not touch Codex until this single-use permit exists.
        fs.writeFileSync(path.join(state,id+".go"),"go",{flag:"wx"});
      }catch(error){
        let reason=/^(?:explorer_(?:timeout|spawn|unavailable)|worker_no_ready|profile_missing)$/i.test(error.message)?error.message:"startup";
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

        if(reason==="profile_missing")throw new PanelError("profile_missing");
        throw new PanelError("worker_start_failed",reason);
      }
      return {id,status:"queued"};
    }
  };
}



