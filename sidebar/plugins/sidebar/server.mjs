import {readFileSync} from "node:fs";
import {createInterface} from "node:readline";
import {createBackend} from "./backend.mjs";
const backend=createBackend(),uri="ui://profile-dock/sidebar.html";
const resource={uri,name:"Profile Dock",mimeType:"text/html;profile=mcp-app"};
const html=readFileSync(new URL("./sidebar.html",import.meta.url),"utf8");
const schema={type:"object",properties:{},additionalProperties:false};
const tools=[
 {name:"open_sidebar_preview",title:"Profile Dock",description:"Open the local account panel.",inputSchema:schema,annotations:{readOnlyHint:true,openWorldHint:false},_meta:{ui:{resourceUri:uri},"openai/ui":{entrypoints:[{type:"global"}]}}},
 ...[
 ["list_profiles",schema,true],
 ["prepare_operation",{type:"object",properties:{action:{enum:["Save","Switch"]},name:{type:"string"}},required:["action","name"],additionalProperties:false},true],
 ["start_operation",{type:"object",properties:{ticket:{type:"string"}},required:["ticket"],additionalProperties:false},false]
 ].map(([name,inputSchema,readOnlyHint])=>({name,inputSchema,description:"Profile Dock panel action.",annotations:{readOnlyHint,destructiveHint:!readOnlyHint,openWorldHint:false},_meta:{ui:{visibility:["app"]}}}))
];
const result=data=>({content:[{type:"text",text:"Profile Dock panel response."}],_meta:{panel:data}});
async function dispatch(method,p){
 switch(method){
 case "initialize":return {protocolVersion:["2024-11-05","2025-03-26","2025-06-18","2025-11-25"].includes(p.protocolVersion)?p.protocolVersion:"2025-11-25",serverInfo:{name:"profile-dock-sidebar",title:"Profile Dock",version:"0.2.0"},capabilities:{tools:{},resources:{}}};
 case "ping":return {};
 case "tools/list":return {tools};
 case "tools/call":try{
  if(p.name==="open_sidebar_preview")return result({});
  if(p.name==="list_profiles")return result(backend.list());
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
 if(!m||m.jsonrpc!=="2.0"||typeof m.method!=="string"||!Object.hasOwn(m,"id"))continue;
 try{send({id:m.id,result:await dispatch(m.method,m.params??{})});}catch{send({id:m.id,error:{code:-32601,message:"Unknown request"}});}
}

