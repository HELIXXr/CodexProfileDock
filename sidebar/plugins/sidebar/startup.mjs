import {execFile} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

export async function desktopSession(parentPid=process.ppid){
  const powershell=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  const script=fileURLToPath(new URL("./scripts/Get-DesktopSession.ps1",import.meta.url));
  try{
    const {stdout}=await promisify(execFile)(powershell,["-NoProfile","-NonInteractive",
      "-File",script,"-ParentId",String(parentPid)],{timeout:4000,windowsHide:true});
    const key=stdout.trim();
    return /^\d+-\d+$/.test(key)?key:null;
  }catch{return null;}
}

function readSnapshot(file){
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return null;}
}

function processAlive(pid){
  try{process.kill(pid,0);return true;}
  catch(error){return error.code!=="ESRCH";}
}

function removePriorDesktopResults(state,current){
  for(const name of fs.readdirSync(state)){
    const match=/^startup-(\d+)-\d+\.json$/.exec(name);
    if(!match || path.join(state,name)===current)continue;
    if(!processAlive(Number(match[1])))fs.rmSync(path.join(state,name),{force:true});
  }
}
export function createStartup({state,identify=desktopSession,list,probe,query}){
  let file, task;
  function snapshot(){
    if(!file)return null;
    const data=readSnapshot(file);
    if(data?.status==="running" && Number.isInteger(data.pid) && !processAlive(data.pid))return {...data,status:"interrupted"};
    return data;
  }
  async function run(){
    const key=await identify();
    if(!key || !/^\d+-\d+$/.test(key))return;
    fs.mkdirSync(state,{recursive:true});
    file=path.join(state,"startup-"+key+".json");
    const data={pid:process.pid,status:"running",probe:"pending",total:0,
      usage:Object.create(null),errors:Object.create(null)};
    try{fs.writeFileSync(file,JSON.stringify(data),{flag:"wx"});}
    catch(error){if(error.code==="EEXIST")return;throw error;}
    const temp=file+"."+process.pid+".tmp";
    const publish=()=>{
      try{
        fs.writeFileSync(temp,JSON.stringify(data));
        fs.renameSync(temp,file);
      }finally{fs.rmSync(temp,{force:true});}
    };
    try{
      try{removePriorDesktopResults(state,file);}catch{}
      const current=list();
      if(current.busy){data.status="skipped";return;}
      data.total=current.profiles.length;
      try{data.probe=await probe()?"passed":"failed";}
      catch{data.probe="failed";}
      publish();
      for(const name of current.profiles){
        if(list().busy){data.status="interrupted";return;}
        try{data.usage[name]=await query(name);}
        catch(error){data.errors[name]=/^usage_[a-z_]+$/.test(error.message)?error.message:"usage_unavailable";}
        publish();
      }
      data.status="complete";
    }catch{data.status="interrupted";}
    finally{publish();}
  }
  return {snapshot,start(){return task??=run();}};
}
