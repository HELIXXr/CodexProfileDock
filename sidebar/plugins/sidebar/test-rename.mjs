import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"dock-rename-"));
const vault=path.join(root,"vault");
const home=path.join(root,"absent-codex-home");
const exe=path.join(process.env.SystemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
const script=fileURLToPath(new URL("./scripts/Switch-Codex.ps1",import.meta.url));
const rename=(name,newName)=>execFileSync(exe,["-NoProfile","-NonInteractive","-File",script,
 "-Action","Rename","-Name",name,"-NewName",newName,"-Vault",vault,"-CodexHome",home],{encoding:"utf8",windowsHide:true}).trim();
const files=()=>fs.readdirSync(vault).filter(name=>name.endsWith(".dpapi"));
const source=Buffer.from([17,0,44,91,255]);
fs.mkdirSync(vault);
fs.writeFileSync(path.join(vault,"Personal.dpapi"),source);
fs.writeFileSync(path.join(vault,"Work.dpapi"),"another backup");
try{
 assert.equal(rename("Personal","work"),"rename_exists");
 assert.deepEqual(fs.readFileSync(path.join(vault,"Personal.dpapi")),source);
 assert.equal(fs.readFileSync(path.join(vault,"Work.dpapi"),"utf8"),"another backup");
 assert.equal(rename("Personal","personal"),"rename_ok");
 assert.ok(files().includes("personal.dpapi"));
 assert.equal(rename("Personal","Missing"),"rename_missing");
 assert.equal(rename("personal","Archive"),"rename_ok");
 assert.deepEqual(files().sort(),["Archive.dpapi","Work.dpapi"]);
 assert.deepEqual(fs.readFileSync(path.join(vault,"Archive.dpapi")),source);
 assert.equal(fs.existsSync(home),false);
 console.log("PASS: physical profile rename, case-only rename, conflict protection and unchanged credential bytes");
}finally{
 for(const name of fs.readdirSync(vault))fs.unlinkSync(path.join(vault,name));
 fs.rmdirSync(vault);
 fs.rmdirSync(root);
}
