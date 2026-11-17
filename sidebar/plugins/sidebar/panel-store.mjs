import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";

export function createPanelStore(state){
 function read(file,fallback){try{return JSON.parse(fs.readFileSync(path.join(state,file),"utf8"));}catch{return fallback;}}
 function write(file,value){
  fs.mkdirSync(state,{recursive:true,mode:0o700});
  const target=path.join(state,file),temp=path.join(state,randomUUID()+".tmp");
  try{fs.writeFileSync(temp,JSON.stringify(value),{flag:"wx",mode:0o600});fs.renameSync(temp,target);}
  finally{fs.rmSync(temp,{force:true});}
 }
 return {
  order(names){
   const saved=read("account-order.json",[]);
   return [...new Set([...(Array.isArray(saved)?saved:[]),...names])].filter(name=>names.includes(name));
  },
  move(names,name,direction){
   const order=this.order(names),from=order.indexOf(name),to=from+direction;
   if(from<0||![1,-1].includes(direction))throw Error("profile_missing");
   if(to>=0&&to<order.length)[order[from],order[to]]=[order[to],order[from]];
   write("account-order.json",order);
  },
  renamed(names,previous,name){
   const saved=read("account-order.json",names);
   write("account-order.json",Array.isArray(saved)?saved.map(value=>value===previous?name:value):names);
  },
  usage(key){
   if(!/^[a-f0-9]{64}$/.test(key))return null;
   const value=read("quota-"+key+".json",null);
   if(!value||!Number.isFinite(Date.parse(value.checkedAt))||!Array.isArray(value.windows)||!value.windows.length)return null;
   if(value.windows.length>2||!value.windows.every(w=>w&&Number.isFinite(w.remaining)&&w.remaining>=0&&w.remaining<=100&&(w.minutes===null||Number.isSafeInteger(w.minutes)&&w.minutes>0)&&(w.resetsAt===null||Number.isSafeInteger(w.resetsAt)&&w.resetsAt>0&&w.resetsAt<=8.64e12)))return null;
   return {checkedAt:value.checkedAt,windows:value.windows.map(({remaining,minutes,resetsAt})=>({remaining,minutes,resetsAt}))};
  },
  saveUsage(key,snapshot){if(/^[a-f0-9]{64}$/.test(key))write("quota-"+key+".json",snapshot);},
  forgetUsage(key){if(/^[a-f0-9]{64}$/.test(key))fs.rmSync(path.join(state,"quota-"+key+".json"),{force:true});}
 };
}
