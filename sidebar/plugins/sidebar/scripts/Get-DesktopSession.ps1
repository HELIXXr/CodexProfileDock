param([Parameter(Mandatory)][int]$ParentId)
$ErrorActionPreference = 'Stop'
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$ParentId"
if (!$parent -or $parent.Name -notin 'codex.exe','codex-app-server.exe') { return }
$desktop = Get-Process -Id $parent.ParentProcessId -ErrorAction SilentlyContinue
if ($desktop.Path -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(?:ChatGPT|Codex)\.exe$') { return }
"$($desktop.Id)-$($desktop.StartTime.ToUniversalTime().Ticks)"
