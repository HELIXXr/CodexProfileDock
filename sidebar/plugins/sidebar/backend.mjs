import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
export const validName = n => typeof n==="string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(n);

export function createBackend({local=process.env.LOCALAPPDATA, launch, startupTimeoutMs=6000}={}) {
  if(!local) throw Error("Windows local data directory is unavailable");
  local=path.resolve(local);
  const state=path.join(local,"CodexProfileDockSidebar");
  const vault=fs.existsSync(path.join(local,"LocalCodexSwitch"))?path.join(local,"LocalCodexSwitch"):path.join(local,"CodexProfileDock");
  const pending=new Map();
  const lock=path.join(state,"operation.lock");
  function profiles(){
    try { return fs.readdirSync(vault,{withFileTypes:true}).filter(e=>e.isFile() && e.name.endsWith(".dpapi") && validName(e.name.slice(0,-6))).map(e=>e.name.slice(0,-6)).sort(); }
    catch(e){if(e.code==="ENOENT")return [];throw Error("无法读取账号别名。");}
  }
  const heartbeat=path.join(state,"companion.heartbeat");
  function companionOnline(){
    try{return Date.now()-fs.statSync(heartbeat).mtimeMs<8000;}catch{return false;}
  }
  const run=launch??(async args=>{
    if(!companionOnline())throw Error("companion_offline");
    const id=args[5];
    const tmp=path.join(state,id+".request.tmp");
    fs.writeFileSync(tmp,JSON.stringify({id,action:args[1],name:args[3],created:Date.now()}),{flag:"wx"});
    fs.renameSync(tmp,path.join(state,id+".request.json"));
  });
  return {
    list(){let operation=null;try{operation=JSON.parse(fs.readFileSync(path.join(state,"latest.json"),"utf8").replace(/^\uFEFF/,""));}catch{}
      return {profiles:profiles(),busy:fs.existsSync(lock),companionOnline:companionOnline(),operation};},
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
        let reason=/^(?:companion_offline|worker_no_ready)$/i.test(error.message)?error.message:"startup";
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
        for(const suffix of [".ready",".request.json",".request.tmp"]){
          fs.rmSync(path.join(state,id+suffix),{force:true});
        }

        throw Error(reason==="companion_offline" ? "后台助手未运行，请先双击 Start-Profile-Dock-Companion.cmd。账号未改变。" : "后台未确认启动，已取消本次操作。账号未改变。诊断代码："+reason);
      }
      return {id,status:"queued"};
    }
  };
}



