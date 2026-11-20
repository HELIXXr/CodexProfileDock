# Launch and close only the installed Microsoft Store Codex desktop app.
function Get-DockCodexDesktop {
    $packages = @(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop)
    $entries = @(Get-StartApps -ErrorAction Stop | Where-Object {
        $_.AppID -like 'OpenAI.Codex_*!App' -and $_.AppID.Split('!')[0] -in $packages.PackageFamilyName
    })
    if ($entries.Count -ne 1) { return }
    $package = @($packages | Where-Object { $_.PackageFamilyName -eq $entries[0].AppID.Split('!')[0] })
    if ($package.Count -ne 1 -or !$package[0].InstallLocation) { return }
    [pscustomobject]@{
        AppID = $entries[0].AppID
        Root = $package[0].InstallLocation.TrimEnd('\') + '\'
        RuntimeRoot = (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin').TrimEnd('\') + '\'
    }
}

function Get-DockCodexProcesses {
    Get-Process -Name 'Codex','ChatGPT','codex-app-server','codex-tui' -ErrorAction SilentlyContinue
}

function Get-DockCodexDesktopProcesses($desktop,$processes) {
    $session = [Diagnostics.Process]::GetCurrentProcess().SessionId
    foreach ($process in $processes) {
        if ($process.SessionId -eq $session -and
            $process.Path -and $process.Path.StartsWith($desktop.Root,[StringComparison]::OrdinalIgnoreCase)) {
            $process
        }
    }
}

function Get-DockCodexWindows($desktop,$processes) {
    Get-DockCodexDesktopProcesses $desktop $processes | Where-Object { $_.MainWindowHandle -ne 0 }
}

function Request-DockCodexQuit($window) {
    if (!('ProfileDock.NativeQuit' -as [type])) {
        Add-Type -Namespace ProfileDock -Name NativeQuit -ErrorAction Stop -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsIconic(System.IntPtr hwnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr hwnd, int command);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetForegroundWindow(System.IntPtr hwnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hwnd, out uint processId);
"@
    }
    try {
        $window.Refresh()
        $handle = $window.MainWindowHandle
        if ($handle -eq [IntPtr]::Zero) { return $false }
        if ([ProfileDock.NativeQuit]::IsIconic($handle)) {
            [void][ProfileDock.NativeQuit]::ShowWindowAsync($handle,9) # SW_RESTORE
        }
        [void][ProfileDock.NativeQuit]::SetForegroundWindow($handle)
        # Use the app's Quit shortcut only after verifying the foreground window.
        $foreground = [ProfileDock.NativeQuit]::GetForegroundWindow()
        if ($foreground -ne $handle) { return $false }
        [uint32]$owner = 0
        [void][ProfileDock.NativeQuit]::GetWindowThreadProcessId($foreground,[ref]$owner)
        if ($owner -ne $window.Id -or [ProfileDock.NativeQuit]::GetForegroundWindow() -ne $handle) {
            return $false
        }
        [Windows.Forms.SendKeys]::SendWait('^q')
        return $true
    } catch [System.InvalidOperationException] {
        return $false
    }
}

function Open-DockCodexDesktop($desktop) {
    Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList "shell:AppsFolder\$($desktop.AppID)" -WindowStyle Hidden -ErrorAction Stop
}

function Start-DockCodexDesktop($desktop, [scriptblock]$Pump, [int]$TimeoutSeconds) {
    Open-DockCodexDesktop $desktop
    $wait = [Diagnostics.Stopwatch]::StartNew()
    do {
        if (@(Get-DockCodexDesktopProcesses $desktop @(Get-DockCodexProcesses)).Count) { return $true }
        if ($wait.Elapsed.TotalSeconds -ge $TimeoutSeconds) { return $false }
        & $Pump
        Start-Sleep -Milliseconds 150
    } while ($true)
}

function Throw-DockRestartError([string]$Reason, [string]$Message) {
    $errorWithReason = [InvalidOperationException]::new($Message)
    $errorWithReason.Data['ProfileDockReason'] = $Reason
    throw $errorWithReason
}

function Invoke-DockRestartSwitch {
    param(
        [Parameter(Mandatory)][scriptblock]$SwitchAccount,
        [Parameter(Mandatory)][scriptblock]$Progress,
        [Parameter(Mandatory)][scriptblock]$Pump,
        [ValidateRange(0,60)][int]$TimeoutSeconds = 15,
        [ValidateRange(0,30)][int]$FocusSeconds = 8,
        [ValidateRange(0,30)][int]$RelaunchSeconds = 12
    )
    $running = @(Get-DockCodexProcesses)
    $desktop = Get-DockCodexDesktop
    if ($running.Count -and !$desktop) {
        Throw-DockRestartError 'dock_desktop_unavailable' '无法识别 Codex 的重启入口。'
    }
    if ($desktop) {
        foreach ($process in $running) {
            $path = $process.Path
            if ($path -and !$path.StartsWith($desktop.Root,[StringComparison]::OrdinalIgnoreCase) -and
                !$path.StartsWith($desktop.RuntimeRoot,[StringComparison]::OrdinalIgnoreCase)) {
                Throw-DockRestartError 'dock_external_process' '请先结束 VS Code 或终端中的其他 Codex 会话，再重试。'
            }
        }
    }
    if ($running.Count -and !@(Get-DockCodexDesktopProcesses $desktop $running).Count) {
        Throw-DockRestartError 'dock_external_process' '请先结束其他 Codex 会话，再重试。'
    }

    $quitAttempted = $false
    try {
        if ($running.Count) {
            $windows = @(Get-DockCodexWindows $desktop $running)
            if (!$windows.Count) {
                & $Progress '正在恢复托盘中的 Codex 窗口…'
                Open-DockCodexDesktop $desktop
            }
            & $Progress '正在通过 Ctrl+Q 请求 Codex 退出…'
            $focusWait = [Diagnostics.Stopwatch]::StartNew()
            $requested = $false
            do {
                $current = @(Get-DockCodexProcesses)
                if (!$current.Count) { break }
                foreach ($window in @(Get-DockCodexWindows $desktop $current)) {
                    $quitAttempted = $true
                    if (Request-DockCodexQuit $window) { $requested = $true; break }
                }
                if (!$requested -and $focusWait.Elapsed.TotalSeconds -lt $FocusSeconds) {
                    & $Pump
                    Start-Sleep -Milliseconds 150
                }
            } while (!$requested -and $focusWait.Elapsed.TotalSeconds -lt $FocusSeconds)
            if (!$requested -and @(Get-DockCodexDesktopProcesses $desktop @(Get-DockCodexProcesses)).Count) {
                Throw-DockRestartError 'dock_quit_not_requested' '无法把 Codex 置于前台并请求退出。'
            }
            $wait = [Diagnostics.Stopwatch]::StartNew()
            while (($remaining = @(Get-DockCodexProcesses)).Count) {
                if ($wait.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
                    if (@(Get-DockCodexDesktopProcesses $desktop $remaining).Count) {
                        Throw-DockRestartError 'dock_desktop_still_running' '桌面版 Codex 尚未完全退出。'
                    }
                    Throw-DockRestartError 'dock_external_process' '仍有其他 Codex 进程在运行，账号未切换。'
                }
                & $Pump
                Start-Sleep -Milliseconds 150
            }
        }
        & $Progress '正在切换账号…'
        & $SwitchAccount
    } catch {
        if ($quitAttempted -and !@(Get-DockCodexDesktopProcesses $desktop @(Get-DockCodexProcesses)).Count) {
            $reopened = $false
            try { $reopened = Start-DockCodexDesktop $desktop $Pump $RelaunchSeconds } catch {}
            if (!$reopened) {
                Throw-DockRestartError 'dock_recovery_failed' '账号操作未完成，且未能重开 Codex。请手动打开。'
            }
        }
        throw
    }
    if (!$desktop) { return 'Manual' }
    & $Progress '正在重新打开 Codex…'
    try {
        if (!(Start-DockCodexDesktop $desktop $Pump $RelaunchSeconds)) { return 'Manual' }
    } catch { return 'Manual' }
    return 'Requested'
}
