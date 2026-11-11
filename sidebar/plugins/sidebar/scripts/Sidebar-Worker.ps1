param(
 [Parameter(Mandatory)][ValidateSet('Save','Switch')][string]$Action,
 [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$Name,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9-]{36}\z')][string]$OperationId
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'Desktop-Restart.ps1')
$state=Join-Path $env:LOCALAPPDATA 'CodexProfileDockSidebar'
$lock=Join-Path $state 'operation.lock'
if(!(Test-Path -LiteralPath $lock) -or [IO.File]::ReadAllText($lock) -cne $OperationId){exit 1}
function Write-State($status){
 $data=@{id=$OperationId;status=$status;updated=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
 $temp=Join-Path $state ($OperationId+'.tmp')
 [IO.File]::WriteAllText($temp,$data,[Text.UTF8Encoding]::new($false))
 $target=Join-Path $state 'latest.json'
 if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}
}
try {
 Write-State 'running'
 $result=Invoke-DockRestartSwitch -SwitchAccount {
   $null=& (Join-Path $PSScriptRoot 'Switch-Codex.ps1') -Action $Action -Name $Name
 } -Progress {param($message)} -Pump {}
 if($result -eq 'Manual'){Write-State 'manual'}else{Write-State 'requested'}
}catch{Write-State 'failed'}finally{
 if((Test-Path -LiteralPath $lock) -and [IO.File]::ReadAllText($lock) -ceq $OperationId){Remove-Item -LiteralPath $lock}
}

