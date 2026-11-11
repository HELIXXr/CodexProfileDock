param(
    [Parameter(Mandatory)]
    [ValidateSet('Install', 'Uninstall')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$marketplace = 'helix-profile-dock-preview'
$plugin = "helix-codex-profile-dock-sidebar@$marketplace"
$marketplaceFile = '.agents\plugins\marketplace.json'

function Invoke-DockCodex {
    param([string[]]$Arguments)
    & $codex.Source @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Codex CLI 命令失败（退出码 $LASTEXITCODE）：codex $($Arguments -join ' ')"
    }
}

function Register-DockMarketplace {
    param([string]$Root)
    Push-Location -LiteralPath $Root
    try {
        Invoke-DockCodex -Arguments @('plugin', 'marketplace', 'add', '.')
    } finally {
        Pop-Location
    }
}

try {
    $codex = Get-Command codex -CommandType Application -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.exe', '.cmd', '.bat' } |
        Select-Object -First 1
    if (!$codex) { throw '找不到 Codex CLI。请按 README 安装后，重新打开此脚本。' }

    if ($Action -eq 'Install') {
        if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $marketplaceFile) -PathType Leaf)) {
            throw '找不到插件目录。请先完整解压 ZIP，再运行安装脚本。'
        }
        $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (!$node) { throw '找不到 Node.js。请安装 Node.js 22 或更高版本，并将其加入 PATH。' }
        $nodeVersion = & $node.Source -p 'process.versions.node'
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^(\d+)\.' -or [int]$Matches[1] -lt 22) {
            throw '此插件需要 Node.js 22 或更高版本。'
        }
        if (!(Get-AppxPackage -Name OpenAI.Codex)) {
            throw '找不到 Microsoft Store 版 Codex 桌面应用。请先安装并正常打开一次。'
        }
    }

    $json = Invoke-DockCodex -Arguments @('plugin', 'marketplace', 'list', '--json')
    $current = (($json -join "`n" | ConvertFrom-Json).marketplaces |
        Where-Object { $_.name -eq $marketplace } | Select-Object -First 1)

    if ($Action -eq 'Uninstall') {
        Invoke-DockCodex -Arguments @('plugin', 'remove', $plugin)
        if ($current) {
            Invoke-DockCodex -Arguments @('plugin', 'marketplace', 'remove', $marketplace)
        }
        Write-Host '卸载完成。请完全退出并重开 Codex。已保存的账号记录仍在本机。'
        exit 0
    }

    $registeredHere = $current -and (
        [IO.Path]::GetFullPath($current.root).TrimEnd('\') -eq $PSScriptRoot.TrimEnd('\')
    )
    if (!$registeredHere -and $current) {
        Invoke-DockCodex -Arguments @('plugin', 'marketplace', 'remove', $marketplace)
    }
    $added = $false
    try {
        if (!$registeredHere) {
            Register-DockMarketplace -Root $PSScriptRoot
            $added = $true
        }
        Invoke-DockCodex -Arguments @('plugin', 'add', $plugin)
    } catch {
        $installError = $_
        try {
            if ($added) {
                Invoke-DockCodex -Arguments @('plugin', 'marketplace', 'remove', $marketplace)
            }
            if (!$registeredHere -and $current -and
                (Test-Path -LiteralPath (Join-Path $current.root $marketplaceFile) -PathType Leaf)) {
                Register-DockMarketplace -Root $current.root
            }
        } catch {
            Write-Warning "恢复之前的插件源失败：$($_.Exception.Message)"
        }
        throw $installError
    }
    Write-Host '安装完成。请保留解压后的文件夹，完全退出并重开 Codex，然后在侧栏打开 Profile Dock。'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
