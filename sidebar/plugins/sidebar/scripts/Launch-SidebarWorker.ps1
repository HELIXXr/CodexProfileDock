# Launch exactly one worker through the existing desktop Explorer process.
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
function Quote-Argument([string]$value) {
 if($value -match '["\x00\r\n]'){throw 'Invalid argument for Explorer'}
 return '"'+($value -replace '(\\+)$','$1$1')+'"'
}
$worker=Join-Path $PSScriptRoot 'Sidebar-Worker.ps1'
$exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments='-NoProfile -STA -NonInteractive -WindowStyle Hidden -File '+(Quote-Argument $worker)+
 ' -Action '+(Quote-Argument $Action)+' -Name '+(Quote-Argument $Name)+' -OperationId '+(Quote-Argument $OperationId)+
 ' -StateDir '+(Quote-Argument $StateDir)+' -Vault '+(Quote-Argument $Vault)+' -CodexHome '+(Quote-Argument $CodexHome)
$arguments += if($Action -eq 'Rename'){' -NewName '+(Quote-Argument $NewName)}else{''}
try {
 $windows=(New-Object -ComObject Shell.Application).Windows()
 $loc=0; $root=0; $hwnd=0
 $desktop=$windows.FindWindowSW([ref]$loc,[ref]$root,8,[ref]$hwnd,1)
 if(!$desktop -or !$desktop.Document -or !$desktop.Document.Application){throw 'Explorer desktop is unavailable'}
 $desktop.Document.Application.ShellExecute($exe,$arguments,$PSScriptRoot,'open',0)
 'explorer_accepted'
}catch{
 'explorer_unavailable'
 exit 1
}

