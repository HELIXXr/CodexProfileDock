param(
 [Parameter(Mandatory)][ValidateSet('Save','Switch','Probe','Rename')][string]$Action,
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$Name,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9-]{36}\z')][string]$OperationId,
 [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$NewName,
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
 $data=@{id=$OperationId;status=$status;kind=$Action;reason=$reason;pid=$PID;stage=$checkpoint;updated=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
 $temp=Join-Path $StateDir ($OperationId+'.tmp')
 [IO.File]::WriteAllText($temp,$data,[Text.UTF8Encoding]::new($false))
 $target=Join-Path $StateDir 'latest.json'
 if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}
 if($checkpoint -eq 'rename' -and $status -ne 'running'){
   $receipt=Join-Path $StateDir ($OperationId+'.rename-result')
   [IO.File]::WriteAllText($receipt,$data,[Text.UTF8Encoding]::new($false))
 }
}
if (Get-Command Write-DockTrace -ErrorAction SilentlyContinue) { Write-DockTrace 'worker_entered' }
if(!(Test-OwnLock)){
 if (Get-Command Write-DockTrace -ErrorAction SilentlyContinue) { Write-DockTrace 'worker_no_lock' }
 return
}
$phase='worker_forms'
$checkpoint='startup'
try {
 Add-Type -AssemblyName System.Windows.Forms
 $phase='worker_script'
 . (Join-Path $PSScriptRoot 'Desktop-Restart.ps1')
 if(!(Get-Command Invoke-DockRestartSwitch -ErrorAction SilentlyContinue)){throw 'Worker initialization failed'}
 if(!(Test-OwnLock)){return}
 [IO.File]::WriteAllText($ready,'ready')
 if (Get-Command Write-DockTrace -ErrorAction SilentlyContinue) { Write-DockTrace 'worker_ready' }
 $phase='worker_permit'
 $timer=[Diagnostics.Stopwatch]::StartNew()
 while(!(Test-Path -LiteralPath $go)){
   if(!(Test-OwnLock)){return}
   if($timer.Elapsed.TotalSeconds -ge 15){throw 'No startup authorization'}
   Start-Sleep -Milliseconds 100
 }
 if(!(Test-OwnLock)){return}
 if($Action -eq 'Probe'){Write-State 'probe_ok';return}
 if($Action -eq 'Rename'){
   $phase='rename_error'
   $checkpoint='rename'
   Write-State 'running'
   $result=& (Join-Path $PSScriptRoot 'Switch-Codex.ps1') -Action Rename -Name $Name -NewName $NewName -Vault $Vault -CodexHome $CodexHome
   if($result -eq 'rename_ok'){Write-State 'renamed'}else{Write-State 'failed' $result}
   return
 }
 $phase='operation'
 $checkpoint='wait_for_exit'
 Write-State 'running'
 $result=Invoke-DockRestartSwitch -SwitchAccount {
   $checkpoint='account_write'
   Write-State 'running'
   $null=& (Join-Path $PSScriptRoot 'Switch-Codex.ps1') -Action $Action -Name $Name -Vault $Vault -CodexHome $CodexHome
   $checkpoint='account_written'
   Write-State 'running'
 } -Progress {param($message)} -Pump {}
 $checkpoint='finished'
 if($result -eq 'Manual'){Write-State 'manual'}else{Write-State 'requested'}
}catch{
 if (Get-Command Write-DockTrace -ErrorAction SilentlyContinue) { Write-DockTrace ('worker_error '+$phase+' '+$_.Exception.GetType().Name) }
 Write-State 'failed' $phase
}finally{
 foreach($marker in $ready,$go){if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker}}
 if(Test-OwnLock){Remove-Item -LiteralPath $lock}
}

