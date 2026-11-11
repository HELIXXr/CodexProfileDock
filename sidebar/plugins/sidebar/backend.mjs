import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
export const validName = n => typeof n==="string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/.test(n);

export function createBackend({local=process.env.LOCALAPPDATA, codexHome=process.env.CODEX_HOME, launch, startupTimeoutMs=6000}={}) {
  if(!local) throw Error("Windows local data directory is unavailable");
  local=path.resolve(local);
  const state=path.join(local,"CodexProfileDockSidebar");
  const home=path.resolve(codexHome || path.join(process.env.USERPROFILE ?? local, ".codex"));
  const vault=fs.existsSync(path.join(local,"LocalCodexSwitch"))?path.join(local,"LocalCodexSwitch"):path.join(local,"CodexProfileDock");
  const pending=new Map();
  const lock=path.join(state,"operation.lock");
  function profiles(){
    try { return fs.readdirSync(vault,{withFileTypes:true}).filter(e=>e.isFile() && e.name.endsWith(".dpapi") && validName(e.name.slice(0,-6))).map(e=>e.name.slice(0,-6)).sort(); }
    catch(e){if(e.code==="ENOENT")return [];throw Error("无法读取账号别名。");}
  }
  const run=launch??(args=>new Promise((resolve,reject)=>{
    const exe=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
    const worker=fileURLToPath(new URL("./scripts/Sidebar-Worker.ps1",import.meta.url));
    const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
    const invocation="& "+psQuote(worker)+" -Action "+psQuote(args[1])+" -Name "+psQuote(args[3])+" -OperationId "+psQuote(args[5])+" -StateDir "+psQuote(state)+" -Vault "+psQuote(vault)+" -CodexHome "+psQuote(home);
    const commandLine='"'+exe+'" -NoProfile -STA -WindowStyle Hidden -EncodedCommand '+Buffer.from(invocation,"utf16le").toString("base64");
    // WMI brokers a new process outside the MCP server's process tree.
    const code="$ErrorActionPreference='Stop'; $r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="+psQuote(commandLine)+"}; if($r.ReturnValue -ne 0){exit 1}";
    const child=spawn(exe,["-NoProfile","-WindowStyle","Hidden","-Command",code],{stdio:"ignore",windowsHide:true});
    const timer=setTimeout(()=>{child.kill();reject(Error("launch timeout"));},6000);
    child.once("error",e=>{clearTimeout(timer);reject(e);});
    child.once("exit",exitCode=>{clearTimeout(timer);exitCode===0?resolve():reject(Error("launch failed"));});
  }));
  return {
    list(){let operation=null;try{operation=JSON.parse(fs.readFileSync(path.join(state,"latest.json"),"utf8").replace(/^\uFEFF/,""));}catch{}
      return {profiles:profiles(),busy:fs.existsSync(lock),operation};},
    prepare({action,name}={}){
      if(!["Save","Switch"].includes(action)||!validName(name))throw Error("请输入 1–32 位英文、数字、短横线或下划线别名，并以字母或数字开头。");
      if(action==="Switch"&&!profiles().includes(name))throw Error("所选账号不存在，请刷新列表。");
      pending.clear();
      const ticket=randomUUID();pending.set(ticket,{action,name,expires:Date.now()+120000});
      return {ticket,action,name};
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
        fs.writeFileSync(path.join(state,"latest.json"),JSON.stringify({id,status:"queued",updated:new Date().toISOString()}));
        await run(["-Action",intent.action,"-Name",intent.name,"-OperationId",id]);
        const ready=path.join(state,id+".ready");
        const deadline=Date.now()+startupTimeoutMs;
        while(!fs.existsSync(ready) && fs.existsSync(lock) && Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!fs.existsSync(ready) || fs.readFileSync(lock,"utf8")!==id)throw Error("worker did not acknowledge");
        // The worker may not touch Codex until this single-use permit exists.
        fs.writeFileSync(path.join(state,id+".go"),"go",{flag:"wx"});
      }catch{
        if(handle!==undefined)fs.closeSync(handle);
        let ownLock=false;
        try{ownLock=fs.readFileSync(lock,"utf8")===id;}catch{}
        if(ownLock){
          fs.writeFileSync(path.join(state,"latest.json"),JSON.stringify({id,status:"failed",reason:"startup",updated:new Date().toISOString()}));
          fs.rmSync(lock,{force:true});
        }
        fs.rmSync(path.join(state,id+".ready"),{force:true});

        throw Error("后台未确认启动，已取消本次操作。账号未改变，可以重试。");
      }
      return {id,status:"queued"};
    }
  };
}


