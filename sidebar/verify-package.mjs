import fs from "node:fs";
import path from "node:path";
import {createHash,verify} from "node:crypto";
import {fileURLToPath} from "node:url";

const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA3mBXI5AUZe9FHHIAujXX\nEI+tdQIsm6OsLEv74dmt97UQM4ry3Nav82Kbeov7/FzknPEUUOh5ZGx7wf1jAMvG\n5/xAq3PkFNoAWPbAUDffNqbXOXMM3HlxYjNGyb0/llP8SW77idSrL3f1RrL90cEL\nCkvX2yc58/oNDm69M2IPwmCTcpMWWI2vMFuTHkGgMgGH4QzZnQbIyHoP3DQzJhRu\nitR43FGffAjZ46DNFtt1l3Ek6yOlGqzDjcpuNG96j6556wGcugzYGNGRIu+x7uwe\n4TAZqr0+GwRKTDTsWpFgV5gc/vC/FAStYixRgq5TLICQhxpma7z4oytNUHR9mdEu\ngpcbX5KmDTKOTbqYQM6IOug40C7qodmV839ls2MxeZQYZUhcrU0YQOxw9GhbM1y0\n21SLV1mJU6LnFrUVJiKavIw558Pkfd2E9jWYmvQoJnqxynWfpbWMZF4uLquWtYxw\nvK+nuKEOT/FCKn2QEOIsw3qzQgZrJJ67H/tRP5MJ7iSlAgMBAAE=\n-----END PUBLIC KEY-----\n";
const root=path.dirname(fileURLToPath(import.meta.url));
export function verifyPackage(directory=root){
 const base=fs.realpathSync(directory);
 for(const name of ["release-manifest.json","release-manifest.sig"]){
  if(!fs.lstatSync(path.join(directory,name)).isFile())throw Error("Invalid manifest file");
 }
 const manifest=fs.readFileSync(path.join(base,"release-manifest.json"));
 const signature=Buffer.from(fs.readFileSync(path.join(base,"release-manifest.sig"),"utf8").trim(),"base64");
 if(!verify("sha256",manifest,publicKey,signature))throw Error("Profile Dock release signature is invalid.");
 const release=JSON.parse(manifest);
 if(release.version!=="0.10.1"||!Array.isArray(release.files))throw Error("Unexpected Profile Dock release.");
 const paths=new Set();
 for(const entry of release.files){
  if(typeof entry.path!=="string"||entry.path.includes("\\")||entry.path.split("/").some(p=>!p||p==="."||p==="..")||
     !/^[a-f0-9]{64}$/.test(entry.sha256)||paths.has(entry.path))throw Error("Invalid manifest entry.");
  paths.add(entry.path);
  let cursor=base;
  for(const segment of entry.path.split("/")){
   cursor=path.join(cursor,segment);
   if(fs.lstatSync(cursor).isSymbolicLink())throw Error("Profile Dock package contains a symbolic link.");
  }
  if(!fs.statSync(cursor).isFile()||fs.realpathSync(cursor)!==cursor)throw Error("Invalid release file.");
  const digest=createHash("sha256").update(fs.readFileSync(cursor)).digest("hex");
  if(digest!==entry.sha256)throw Error("Profile Dock file integrity check failed: "+entry.path);
 }
 for(const required of ["verify-package.mjs","Setup-Profile-Dock.ps1","macos/native.m","plugins/sidebar/server.mjs","plugins/sidebar/panel-store.mjs"]){
  if(!paths.has(required))throw Error("Required release file is not signed.");
 }
 return release;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{verifyPackage();console.log("Profile Dock release signature and files verified.");}
 catch(error){console.error(error.message);process.exitCode=1;}
}
