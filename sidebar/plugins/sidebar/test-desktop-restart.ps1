
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/Desktop-Restart.ps1')

$script:desktopInfo = [pscustomobject]@{
    Root = 'C:\Fixture\Store\'
    RuntimeRoot = 'C:\Fixture\Runtime\'
}
$testSession = [Diagnostics.Process]::GetCurrentProcess().SessionId
$script:app = [pscustomobject]@{ Path='C:\Fixture\Store\ChatGPT.exe'; MainWindowHandle=1; SessionId=$testSession }
$script:runtime = [pscustomobject]@{ Path='C:\Fixture\Runtime\codex.exe'; MainWindowHandle=0; SessionId=$testSession }
$script:external = [pscustomobject]@{ Path='C:\Fixture\VSCode\codex.exe'; MainWindowHandle=0; SessionId=$testSession }

function Get-DockCodexDesktop { $script:desktopInfo }
function Get-DockCodexProcesses { $script:processes }
function Request-DockCodexQuit($window) {
    $script:quitCount++
    $script:processes = @($script:afterQuit)
    return $true
}
function Open-DockCodexDesktop($desktop) {
    $script:launchCount++
    if ($script:launchWorks) { $script:processes += $script:app }
}
function Reset-Fixture($beforeQuit, $afterQuit, [bool]$launchWorks = $true) {
    $script:processes = @($beforeQuit)
    $script:afterQuit = @($afterQuit)
    $script:quitCount = 0
    $script:writeCount = 0
    $script:launchCount = 0
    $script:launchWorks = $launchWorks
}
function Invoke-Fixture {
    Invoke-DockRestartSwitch -Progress {} -Pump {} -TimeoutSeconds 0 -FocusSeconds 0 -RelaunchSeconds 0 -SwitchAccount {
        if (@(Get-DockCodexProcesses).Count) { throw 'Account write ran before all processes stopped.' }
        $script:writeCount++
    }
}
function Assert-Reason([string]$expected) {
    try { [void](Invoke-Fixture) } catch {
        if ($_.Exception.Data['ProfileDockReason'] -ceq $expected) { return }
        throw
    }
    throw "Expected $expected"
}

Reset-Fixture @($script:app,$script:runtime,$script:external) @()
Assert-Reason 'dock_external_process'
if ($quitCount -or $writeCount -or $launchCount) { throw 'External process did not block before quit.' }

Reset-Fixture @($script:app,$script:runtime) @($script:runtime)
Assert-Reason 'dock_external_process'
if ($quitCount -ne 1 -or $writeCount -or $launchCount -ne 1) { throw 'Lingering runtime did not trigger recovery.' }

Reset-Fixture @($script:app) @($script:app)
Assert-Reason 'dock_desktop_still_running'
if ($writeCount -or $launchCount) { throw 'Running desktop must not be written to or reopened.' }

Reset-Fixture @($script:app,$script:runtime) @($script:runtime) $false
Assert-Reason 'dock_recovery_failed'
if ($writeCount -or $launchCount -ne 1) { throw 'Failed recovery must not write the account.' }

Reset-Fixture @($script:app,$script:runtime) @()
if ((Invoke-Fixture) -ne 'Requested' -or $writeCount -ne 1 -or $launchCount -ne 1) { throw 'Switch after full exit did not reopen.' }

Reset-Fixture @($script:app) @() $false
if ((Invoke-Fixture) -ne 'Manual' -or $writeCount -ne 1 -or $launchCount -ne 1) { throw 'Unconfirmed launch must request manual reopen.' }

'PASS: preflight, full exit guard, failed-switch recovery, confirmed reopen and manual reopen.'
