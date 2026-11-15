# Use only synthetic credentials in an isolated vault.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=Join-Path ([IO.Path]::GetTempPath()) ('dock-security-'+[guid]::NewGuid().ToString('N'))
$vault=Join-Path $root 'vault'
[void][IO.Directory]::CreateDirectory($vault)
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
function Read-Blob([string]$Path) { return ,([IO.File]::ReadAllBytes($Path)) }
function Write-Atomic([string]$Path,[byte[]]$Bytes) { [IO.File]::WriteAllBytes($Path,$Bytes) }
function Get-Identity([byte[]]$Bytes) {
 $data=[Text.Encoding]::UTF8.GetString($Bytes)|ConvertFrom-Json
 if($data.auth_mode -ne 'chatgpt'){throw 'fixture invalid'}
 return $data.tokens.account_id
}
. (Join-Path $PSScriptRoot 'scripts/Vault-Security.ps1')
try {
 $old=[Text.Encoding]::UTF8.GetBytes('{"auth_mode":"chatgpt","tokens":{"account_id":"fixture-one"}}')
 $other=[Text.Encoding]::UTF8.GetBytes('{"auth_mode":"chatgpt","tokens":{"account_id":"fixture-two"}}')
 $one=Join-Path $vault 'Personal.dpapi'; $two=Join-Path $vault 'Work.dpapi'
 [IO.File]::WriteAllBytes($one,[Security.Cryptography.ProtectedData]::Protect($old,$null,$scope))
 [IO.File]::WriteAllBytes($two,[Security.Cryptography.ProtectedData]::Protect($other,$null,$scope))
 Upgrade-DockVault $vault
 if((Get-Identity (Read-DockProfile $one)) -ne 'fixture-one'){throw 'Legacy migration failed'}
 if(!(Test-Path -LiteralPath ($one+'.pre-security-backup'))){throw 'Migration backup missing'}
 $acl=Get-Acl -LiteralPath $vault
 if(!$acl.AreAccessRulesProtected){throw 'Vault ACL still inherits'}
 foreach($path in @($vault,$one,$two)){
   $rules=(Get-Acl -LiteralPath $path).Access
   if($rules|Where-Object{$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -like '*CodexSandboxUsers*'}){throw 'Sandbox can still access vault'}
 }
 $a=[IO.File]::ReadAllBytes($one); $b=[IO.File]::ReadAllBytes($two)
 [IO.File]::WriteAllBytes($one,$b); [IO.File]::WriteAllBytes($two,$a)
 $rejected=$false
 try{ $null=Read-DockProfile $one }catch{ $rejected=$_.Exception.Message -like '*integrity*' }
 if(!$rejected){throw 'Swapped alias was accepted'}
 [IO.File]::WriteAllBytes($one,$a);[IO.File]::WriteAllBytes($two,$b)
 $copy=Join-Path $vault 'Archive.dpapi';Save-DockProfile $copy (Read-DockProfile $one)
 if((Get-Identity (Read-DockProfile $copy)) -ne 'fixture-one'){throw 'Rebound alias failed'}
 'PASS legacy migration, ciphertext backup, private vault ACL, and swapped-alias rejection'
} finally {
 if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($root)) -ne [IO.Path]::GetTempPath().TrimEnd('\')){throw 'Unexpected fixture cleanup path'}
 Remove-Item -LiteralPath $root -Recurse -Force
}
