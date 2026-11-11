# Run in the logged-in Windows desktop session, independently of Codex.
param(
 [string]$LocalRoot=$env:LOCALAPPDATA,
 [switch]$Once
)
$ErrorActionPreference='Stop'
if(!$LocalRoot){throw 'LOCALAPPDATA is not set'}
$LocalRoot=[IO.Path]::GetFullPath($LocalRoot)
$state=Join-Path $LocalRoot 'CodexProfileDockSidebar'
$vault=Join-Path $LocalRoot 'CodexProfileDock'
$legacy=Join-Path $LocalRoot 'LocalCodexSwitch'
$codexHome=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
$heartbeat=Join-Path $state 'companion.heartbeat'
$stop=Join-Path $state 'companion.stop'
$lock=Join-Path $state 'operation.lock'
$trace=Join-Path $state 'companion-diagnostics.log'
function Write-DockTrace($stage) {
 try {
   if((Test-Path -LiteralPath $trace) -and (Get-Item -LiteralPath $trace).Length -gt 16384){
     [IO.File]::WriteAllText($trace,'')
   }
   Add-Content -LiteralPath $trace -Encoding UTF8 -Value ('{0:o} {1}' -f [DateTimeOffset]::Now,$stage)
 }catch{}
}
$null=New-Item -ItemType Directory -Path $state -Force
try{$guard=[IO.File]::Open((Join-Path $state 'companion.instance'),'OpenOrCreate','ReadWrite','None')}catch [IO.IOException]{return}
try {
 if(Test-Path -LiteralPath $stop){Remove-Item -LiteralPath $stop}
 $tick=[Diagnostics.Stopwatch]::StartNew()
 Write-DockTrace 'companion_started'
 [IO.File]::WriteAllText($heartbeat,'ready')
 while(!(Test-Path -LiteralPath $stop)){
   if($tick.ElapsedMilliseconds -ge 2000){
     [IO.File]::WriteAllText($heartbeat,'ready')
     $tick.Restart()
   }
   $id=$null
   try{$id=[IO.File]::ReadAllText($lock)}catch [IO.IOException]{}
   if($id -cmatch '^[a-f0-9-]{36}\z'){
     $file=Join-Path $state ($id+'.request.json')
     if(Test-Path -LiteralPath $file -PathType Leaf){
       Write-DockTrace 'request_seen'
       try{$j=[IO.File]::ReadAllText($file) | ConvertFrom-Json -ErrorAction Stop}
       catch{$j=$null;Write-DockTrace ('request_read_error '+$_.Exception.GetType().Name)}
       Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
       $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
       if($j.id -ceq $id -and $j.action -cin @('Probe','Save','Switch') -and
          $j.name -cmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z' -and
          $j.created -is [ValueType] -and $j.created -ge ($now-15000) -and $j.created -le $now){
         Write-DockTrace 'request_accepted'
         $activeVault=if(Test-Path -LiteralPath $legacy -PathType Container){$legacy}else{$vault}
         & (Join-Path $PSScriptRoot 'Sidebar-Worker.ps1') -Action $j.action -Name $j.name -OperationId $id -StateDir $state -Vault $activeVault -CodexHome $codexHome
         Write-DockTrace 'worker_returned'
         if($Once){break}
       }else{Write-DockTrace 'request_rejected'}
     }
   }
   Start-Sleep -Milliseconds 200
 }
}catch{
 Write-DockTrace ('companion_error '+$_.Exception.GetType().Name)
 throw
}finally{
 Write-DockTrace 'companion_stopped'
 foreach($file in $heartbeat,$stop){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue}}
 $guard.Dispose()
}

