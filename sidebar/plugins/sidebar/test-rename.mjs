import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"dock-rename-"));
const vault=path.join(root,"vault"),home=path.join(root,"absent-codex-home");
const exe=path.join(process.env.SystemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
const script=fileURLToPath(new URL("./scripts/Switch-Codex.ps1",import.meta.url));
const security=fileURLToPath(new URL("./scripts/Vault-Security.ps1",import.meta.url));
fs.mkdirSync(vault);
const initializer=path.join(root,"fixture.ps1");
fs.writeFileSync(initializer,String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
function Read-Blob($p){return ,([IO.File]::ReadAllBytes($p))}
function Write-Atomic($p,[byte[]]$b){[IO.File]::WriteAllBytes($p,$b)}
function Get-Identity($b){'fixture'}
. $args[0]
$payload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"iss":"fixture","sub":"fixture"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
foreach($name in @('Personal','Work')){
 $auth=@{auth_mode='chatgpt';tokens=@{id_token="fixture.$payload.fixture";access_token='fixture-access';refresh_token='fixture-refresh';account_id=$name}}|ConvertTo-Json -Compress
 Save-DockProfile (Join-Path $args[1] ($name+'.dpapi')) ([Text.Encoding]::UTF8.GetBytes($auth))
}
`);
const rename=(name,newName)=>execFileSync(exe,["-NoProfile","-ExecutionPolicy","RemoteSigned","-NonInteractive","-File",script,
 "-Action","Rename","-Name",name,"-NewName",newName,"-Vault",vault,"-CodexHome",home],{encoding:"utf8",windowsHide:true}).trim();
try{
 execFileSync(exe,["-NoProfile","-ExecutionPolicy","RemoteSigned","-File",initializer,security,vault],{windowsHide:true});
 const original=fs.readFileSync(path.join(vault,"Personal.dpapi"));
 assert.equal(rename("Personal","work"),"rename_exists");
 assert.deepEqual(fs.readFileSync(path.join(vault,"Personal.dpapi")),original);
 assert.equal(rename("Personal","personal"),"rename_ok");
 assert.ok(fs.readdirSync(vault).includes("personal.dpapi"));
 assert.equal(rename("Personal","Missing"),"rename_missing");
 assert.equal(rename("personal","Archive"),"rename_ok");
 assert.notDeepEqual(fs.readFileSync(path.join(vault,"Archive.dpapi")),original);
 assert.equal(fs.existsSync(home),false);
 console.log("PASS account rename rebinds the encrypted alias, handles case-only changes, and rejects conflicts");
}finally{fs.rmSync(root,{recursive:true,force:true});}
