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

function Get-DockCodexWindows($desktop,$processes) {
    $session = [Diagnostics.Process]::GetCurrentProcess().SessionId
    foreach ($process in $processes) {
        if ($process.SessionId -eq $session -and $process.MainWindowHandle -ne 0 -and
            $process.Path -and $process.Path.StartsWith($desktop.Root,[StringComparison]::OrdinalIgnoreCase)) {
            $process
        }
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
        [ValidateRange(0,60)][int]$TimeoutSeconds = 15
    )
    $running = @(Get-DockCodexProcesses)
    $desktop = Get-DockCodexDesktop
    if ($running.Count) {
        if (!$desktop) { throw '无法识别 Codex 的重启入口。请手动退出 Codex 后再切换。' }
        $windows = @(Get-DockCodexWindows $desktop $running)
        if (!$windows.Count) { throw '没有找到可正常关闭的 Codex 窗口。请从托盘退出 Codex，并关闭 Codex CLI 后重试。' }
        & $Progress '正在请求 Codex 正常退出…'
        $requested = $false
        foreach ($window in $windows) {
            if ($window.CloseMainWindow()) { $requested = $true }
        }
        if (!$requested) { throw '无法请求 Codex 正常退出，账号未切换。请手动退出后重试。' }
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
