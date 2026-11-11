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

function Invoke-DockRestartSwitch {
    param(
        [Parameter(Mandatory)][scriptblock]$SwitchAccount,
        [Parameter(Mandatory)][scriptblock]$Progress,
        [Parameter(Mandatory)][scriptblock]$Pump,
        [ValidateRange(0,60)][int]$TimeoutSeconds = 15, [ValidateRange(0,30)][int]$FocusSeconds = 8
    )
    $running = @(Get-DockCodexProcesses)
    $desktop = Get-DockCodexDesktop
    if ($running.Count) {
        if (!$desktop) { throw '无法识别 Codex 的重启入口。请手动退出 Codex 后再切换。' }
        if (!@(Get-DockCodexDesktopProcesses $desktop $running).Count) {
            throw '未找到可安全退出的 Codex 桌面进程。请先退出其他 Codex 或 CLI 进程。'
        }
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
                if (Request-DockCodexQuit $window) { $requested = $true; break }
            }
            if (!$requested -and $focusWait.Elapsed.TotalSeconds -lt $FocusSeconds) {
                & $Pump
                Start-Sleep -Milliseconds 150
            }
        } while (!$requested -and $focusWait.Elapsed.TotalSeconds -lt $FocusSeconds)
        if (!$requested -and @(Get-DockCodexProcesses).Count) {
            throw '无法把 Codex 置于前台并请求退出，账号未切换。请手动完全退出后重试。'
        }
        $wait = [Diagnostics.Stopwatch]::StartNew()
        while (@(Get-DockCodexProcesses).Count) {
            if ($wait.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
                throw 'Codex 或 CLI 尚未完全退出，账号未切换。请从托盘退出后重试。'
            }
            & $Pump
            Start-Sleep -Milliseconds 150
        }
    }

    & $Progress '正在切换账号…'
    try {
        & $SwitchAccount
    } catch {
        $failure = $_.Exception.Message
        if ($running.Count -and $desktop -and !@(Get-DockCodexProcesses).Count) {
            try { Open-DockCodexDesktop $desktop } catch {
                throw "账号未切换，且未能重开 Codex。请手动打开。原因：$failure"
            }
        }
        throw "账号未切换。$failure"
    }
    if (!$desktop) { return 'Manual' }
    & $Progress '正在重新打开 Codex…'
    try { Open-DockCodexDesktop $desktop } catch { return 'Manual' }
    return 'Requested'
}
