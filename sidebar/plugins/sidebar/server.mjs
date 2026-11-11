import {readFileSync} from "node:fs";
import path from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {createInterface} from "node:readline";
import {createBackend} from "./backend.mjs";
import {createStartup} from "./startup.mjs";
const backend=createBackend(),uri="ui://profile-dock/sidebar.html";
const selfTest=createBackend({stateDir:path.join(backend.stateDir,"startup-probe")});
const startup=createStartup({
 state:backend.stateDir,
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
const manuallyRefreshed=new Set();
function listProfiles(){
 const panel=backend.list(), auto=startup.snapshot();
 if(!auto)return panel;
 const usage={}, errors={};
 for(const name of panel.profiles){
  if(Object.hasOwn(auto.usage,name))usage[name]=auto.usage[name];
  if(Object.hasOwn(auto.errors,name)&&!manuallyRefreshed.has(name))errors[name]=auto.errors[name];
 }
 return {...panel,usage:{...usage,...panel.usage},usageErrors:errors,
  busy:panel.busy||auto.status==="running",
  startup:{status:auto.status,probe:auto.probe,total:auto.total,complete:Object.keys(auto.usage).length}};
}
const resource={uri,name:"Profile Dock",mimeType:"text/html;profile=mcp-app"};
const html=readFileSync(new URL("./sidebar.html",import.meta.url),"utf8");
const entryIcons=["light","dark"].map(theme=>({
 src:"data:image/png;base64,"+readFileSync(new URL("./assets/profile-dock-"+theme+".png",import.meta.url)).toString("base64"),
 mimeType:"image/png",sizes:["128x128"],theme
}));
const schema={type:"object",properties:{},additionalProperties:false};
const tools=[
 {name:"open_sidebar_preview",title:"Profile Dock",description:"Open the local account panel.",inputSchema:schema,icons:entryIcons,annotations:{readOnlyHint:true,openWorldHint:false},_meta:{ui:{resourceUri:uri},"openai/ui":{entrypoints:[{type:"global"}]}}},
 ...[
 ["list_profiles",schema,true],
 ["probe_worker",schema,false],
 ["refresh_usage",{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false},true,true],
 ["prepare_operation",{type:"object",properties:{action:{enum:["Save","Switch"]},name:{type:"string"}},required:["action","name"],additionalProperties:false},true],
 ["start_operation",{type:"object",properties:{ticket:{type:"string"}},required:["ticket"],additionalProperties:false},false]
 ].map(([name,inputSchema,readOnlyHint,openWorldHint=false])=>({name,inputSchema,description:"Profile Dock panel action.",annotations:{readOnlyHint,destructiveHint:!readOnlyHint,openWorldHint},_meta:{ui:{visibility:["app"]}}}))
];
const result=data=>({content:[{type:"text",text:"Profile Dock panel response."}],_meta:{panel:data}});
async function dispatch(method,p){
 switch(method){
 case "initialize":return {protocolVersion:["2024-11-05","2025-03-26","2025-06-18","2025-11-25"].includes(p.protocolVersion)?p.protocolVersion:"2025-11-25",serverInfo:{name:"profile-dock-sidebar",title:"Profile Dock",version:"0.7.0"},capabilities:{tools:{},resources:{}}};
 case "ping":return {};
 case "tools/list":return {tools};
 case "tools/call":try{
  if(p.name==="open_sidebar_preview")return result({});
  if(p.name==="list_profiles")return result(listProfiles());
  if(startup.snapshot()?.status==="running" && ["refresh_usage","probe_worker","prepare_operation","start_operation"].includes(p.name)){
   throw Error(p.name==="refresh_usage"?"usage_busy":"正在运行启动自检和额度刷新，请稍候。");
  }
  if(p.name==="refresh_usage"){
   const snapshot=await backend.refreshUsage(p.arguments);
   manuallyRefreshed.add(p.arguments.name);
   return result(snapshot);
  }
  if(p.name==="probe_worker")return result(await backend.probe());
  if(p.name==="prepare_operation")return result(backend.prepare(p.arguments));
  if(p.name==="start_operation")return result(await backend.start(p.arguments));
 }catch(e){return {isError:true,content:[{type:"text",text:e.message}]};}
 break;
 case "resources/list":return {resources:[resource]};
 case "resources/templates/list":return {resourceTemplates:[]};
 case "resources/read":if(p.uri===uri)return {contents:[{...resource,text:html}]};break;
 }
 throw Error("Unknown request");
}
const send=m=>process.stdout.write(JSON.stringify({jsonrpc:"2.0",...m})+"\n");
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 let m;try{m=JSON.parse(line);}catch{send({id:null,error:{code:-32700,message:"Parse error"}});continue;}
 if(!m||m.jsonrpc!=="2.0"||typeof m.method!=="string")continue;
 if(m.method==="notifications/initialized"){void startup.start().catch(()=>{});continue;}
 if(!Object.hasOwn(m,"id"))continue;
 try{send({id:m.id,result:await dispatch(m.method,m.params??{})});}catch{send({id:m.id,error:{code:-32601,message:"Unknown request"}});}
}

