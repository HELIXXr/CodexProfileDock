import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createBackend} from "./backend.mjs";
import {createStartup} from "./startup.mjs";

const [key,local,userProfile,codexHome]=process.argv.slice(2);
if(/^\d+-\d+$/.test(key) && [local,userProfile,codexHome].every(value=>value&&path.isAbsolute(value))){
 const backend=createBackend({local,userProfile,codexHome});
 const selfTest=createBackend({local,userProfile,codexHome,stateDir:path.join(backend.stateDir,"startup-probe")});
 const startup=createStartup({
  state:backend.stateDir,
  identify:async()=>key,
  list:()=>backend.list(),
  query:name=>backend.refreshUsage({name}),
  async probe(){
   const {id}=await selfTest.probe();
   const deadline=Date.now()+4000;
   while(Date.now()<deadline){
    const {operation,busy}=selfTest.list();
    if(!busy)return operation?.id===id && operation.status==="probe_ok";
    await delay(100);
   }
   return false;
  }
 });
 try{await startup.start();}catch{process.exitCode=1;}
}
