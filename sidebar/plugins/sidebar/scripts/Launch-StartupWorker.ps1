param(
 [Parameter(Mandatory)][ValidatePattern('^\d+-\d+\z')][string]$DesktopSession,
 [Parameter(Mandatory)][string]$Node,
 [Parameter(Mandatory)][string]$Local,
 [Parameter(Mandatory)][string]$UserProfile,
 [Parameter(Mandatory)][string]$CodexHome
)
$ErrorActionPreference='Stop'
function Quote-Argument([string]$value) {
 if($value -match '["\x00\r\n]'){throw 'Invalid argument for Explorer'}
 return '"'+($value -replace '(\\+)$','$1$1')+'"'
}
$root=Split-Path -Parent $PSScriptRoot
$worker=Join-Path $root 'startup-worker.mjs'
$arguments=(@($worker,$DesktopSession,$Local,$UserProfile,$CodexHome) | ForEach-Object {Quote-Argument $_}) -join ' '
$windows=(New-Object -ComObject Shell.Application).Windows()
$location=0; $reserved=0; $hwnd=0
$desktop=$windows.FindWindowSW([ref]$location,[ref]$reserved,8,[ref]$hwnd,1)
if(!$desktop -or !$desktop.Document -or !$desktop.Document.Application){throw 'Explorer desktop is unavailable'}
$desktop.Document.Application.ShellExecute($Node,$arguments,$root,'open',0)
'explorer_accepted'
