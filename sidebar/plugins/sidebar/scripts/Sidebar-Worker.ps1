param(
 [Parameter(Mandatory)][ValidateSet('Save','Switch','Probe')][string]$Action,
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$Name,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9-]{36}\z')][string]$OperationId,
 [Parameter(Mandatory)][string]$StateDir,
 [Parameter(Mandatory)][string]$Vault,
 [Parameter(Mandatory)][string]$CodexHome
)
$ErrorActionPreference='Stop'
$lock=Join-Path $StateDir 'operation.lock'
$ready=Join-Path $StateDir ($OperationId+'.ready')
$go=Join-Path $StateDir ($OperationId+'.go')
function Test-OwnLock {
 try {return [IO.File]::ReadAllText($lock) -ceq $OperationId} catch {return $false}
}
function Write-State($status,$reason) {
 if(!(Test-OwnLock)){return}
 $data=@{id=$OperationId;status=$status;kind=$Action;reason=$reason;updated=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
 $temp=Join-Path $StateDir ($OperationId+'.tmp')
 [IO.File]::WriteAllText($temp,$data,[Text.UTF8Encoding]::new($false))
 $target=Join-Path $StateDir 'latest.json'
 if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}
}
if(!(Test-OwnLock)){exit 1}
$phase='worker_forms'
try {
 Add-Type -AssemblyName System.Windows.Forms
 $phase='worker_script'
 . (Join-Path $PSScriptRoot 'Desktop-Restart.ps1')
 if(!(Get-Command Invoke-DockRestartSwitch -ErrorAction SilentlyContinue)){throw 'Worker initialization failed'}
 if(!(Test-OwnLock)){exit 1}
 [IO.File]::WriteAllText($ready,'ready')
 $phase='worker_permit'
 $timer=[Diagnostics.Stopwatch]::StartNew()
 while(!(Test-Path -LiteralPath $go)){
   if(!(Test-OwnLock)){exit 1}
   if($timer.Elapsed.TotalSeconds -ge 15){throw 'No startup authorization'}
   Start-Sleep -Milliseconds 100
 }
 if(!(Test-OwnLock)){exit 1}
 if($Action -eq 'Probe'){Write-State 'probe_ok';return}
 $phase='operation'
 Write-State 'running'
 $result=Invoke-DockRestartSwitch -SwitchAccount {
   $null=& (Join-Path $PSScriptRoot 'Switch-Codex.ps1') -Action $Action -Name $Name -Vault $Vault -CodexHome $CodexHome
 } -Progress {param($message)} -Pump {}
 if($result -eq 'Manual'){Write-State 'manual'}else{Write-State 'requested'}
}catch{Write-State 'failed' $phase}finally{
 foreach($marker in $ready,$go){if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker}}
 if(Test-OwnLock){Remove-Item -LiteralPath $lock}
}

