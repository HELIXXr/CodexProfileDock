# Windows PowerShell 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Save','Switch','List','ReadUsageAuth','Rename')][string]$Action,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$Name,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z')][string]$NewName,
    [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }),
    [string]$Vault = $(if (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'LocalCodexSwitch') -PathType Container) {
        Join-Path $env:LOCALAPPDATA 'LocalCodexSwitch' # Preserve existing saved profiles.
    } else { Join-Path $env:LOCALAPPDATA 'CodexProfileDock' })
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$auth = Join-Path ([IO.Path]::GetFullPath($CodexHome)) 'auth.json'
$Vault = [IO.Path]::GetFullPath($Vault)
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser

function Read-Blob([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    if ($item.PSIsContainer -or $item.Length -gt 1048576 -or
        ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Unexpected credential file type or size.'
    }
    return ,([IO.File]::ReadAllBytes($Path))
}

function Get-Identity([byte[]]$Bytes) {
    try {
        $data = [Text.Encoding]::UTF8.GetString($Bytes).TrimStart([char]0xFEFF) | ConvertFrom-Json -ErrorAction Stop
        if ($data.auth_mode -ne 'chatgpt' -or !$data.tokens.access_token -or !$data.tokens.refresh_token) { throw 'format' }
        $jwt = ([string]$data.tokens.id_token).Split('.')
        if ($jwt.Length -ne 3) { throw 'format' }
        $payload = $jwt[1].Replace('-','+').Replace('_','/')
        $payload += '=' * ((4 - $payload.Length % 4) % 4)
        $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json -ErrorAction Stop
        if (!$claims.sub -or !$claims.iss) { throw 'format' }
        return (ConvertTo-Json -Compress -InputObject @($claims.iss,$claims.sub,$data.tokens.account_id))
    } catch { throw 'Unsupported login file. Expected file-based ChatGPT credentials.' }
}

function Write-Atomic([string]$Path, [byte[]]$Bytes) {
    $tmp = Join-Path ([IO.Path]::GetDirectoryName($Path)) ([guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllBytes($tmp, $Bytes)
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($tmp, $Path, [NullString]::Value) }
        else { [IO.File]::Move($tmp, $Path) }
    } finally {
        if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) }
    }
}

function Read-Profile([string]$Path) {
    return ,([Security.Cryptography.ProtectedData]::Unprotect((Read-Blob $Path), $null, $scope))
}

function Save-Profile([string]$Path, [byte[]]$Bytes) {
    Write-Atomic $Path ([Security.Cryptography.ProtectedData]::Protect($Bytes, $null, $scope))
}

function Assert-Closed {
    if (Get-Process -Name 'Codex','ChatGPT','codex-app-server','codex-tui' -ErrorAction SilentlyContinue) {
        throw 'Close Codex, ChatGPT Desktop and any Codex CLI sessions first.'
    }
}

if ($Action -eq 'List') {
    if (Test-Path -LiteralPath $Vault -PathType Container) {
        Get-ChildItem -LiteralPath $Vault -Filter '*.dpapi' -File | Select-Object -ExpandProperty BaseName
    }
    return
}
if (!$Name) { throw 'Supply -Name, for example Personal or Work.' }
if ($Action -eq 'Rename') {
    if (!$NewName -or $NewName -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') { 'rename_invalid'; return }
    if (!(Test-Path -LiteralPath $Vault -PathType Container)) { 'rename_missing'; return }
    try { $renameLock = [IO.File]::Open((Join-Path $Vault '.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { 'rename_busy'; return }
    try {
        $files = @(Get-ChildItem -LiteralPath $Vault -Filter '*.dpapi' -File)
        $source = $files | Where-Object { $_.Name -ceq ($Name + '.dpapi') } | Select-Object -First 1
        if (!$source -or ($source.Attributes -band [IO.FileAttributes]::ReparsePoint)) { 'rename_missing'; return }
        if ($Name -ceq $NewName) { 'rename_ok'; return }
        $target = $NewName + '.dpapi'
        if ($files | Where-Object { $_.Name -cne $source.Name -and $_.Name -ieq $target }) {
            'rename_exists'
            return
        }
        [IO.File]::Move($source.FullName, (Join-Path $Vault $target))
        'rename_ok'
    } finally { $renameLock.Dispose() }
    return
}
if ($Action -eq 'ReadUsageAuth') {
    $saved = Read-Profile (Join-Path $Vault ($Name + '.dpapi'))
    $identity = Get-Identity $saved
    $bytes = $saved
    try {
        $active = Read-Blob $auth
        if ((Get-Identity $active) -ceq $identity) { $bytes = $active }
    } catch {
        # Use the saved snapshot if the active login is absent or different.
    }
    $data = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF) | ConvertFrom-Json
    $accountId = [string]$data.tokens.account_id
    if (!$accountId) { throw 'The login is missing its workspace ID.' }

    $codexExecutable = $null
    foreach ($package in @(Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue)) {
        if (!$package.InstallLocation) { continue }
        $candidate = Join-Path $package.InstallLocation 'app\resources\codex.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $codexExecutable = $candidate
            break
        }
    }
    if (!$codexExecutable) {
        $codexExecutable = (Get-Command codex.exe -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1).Source
    }
    @{accessToken=[string]$data.tokens.access_token; chatgptAccountId=$accountId;
      codexExecutable=$codexExecutable} | ConvertTo-Json -Compress
    return
}
Assert-Closed
if (!(Test-Path -LiteralPath $auth -PathType Leaf)) {
    throw 'No auth.json in the selected Codex home. Sign in normally and check the credential storage mode.'
}
[IO.Directory]::CreateDirectory($Vault) | Out-Null
$profile = Join-Path $Vault ($Name + '.dpapi')
# Serialize operations even if the same vault is used from different terminals.
$lock = [IO.File]::Open((Join-Path $Vault '.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    $current = Read-Blob $auth
    $identity = Get-Identity $current
    if ($Action -eq 'Save') {
        if ((Test-Path -LiteralPath $profile) -and (Get-Identity (Read-Profile $profile)) -cne $identity) {
            throw 'That label already belongs to a different account.'
        }
        Save-Profile $profile $current
        Write-Output "Saved profile: $Name"
        return
    }
    if (!(Test-Path -LiteralPath $profile -PathType Leaf)) { throw 'Target profile has not been saved.' }
    $next = Read-Profile $profile
    if ((Get-Identity $next) -ceq $identity) {
        Save-Profile $profile $current
        Write-Output "Profile already active: $Name"
        return
    }
    $matched = $false
    foreach ($entry in (Get-ChildItem -LiteralPath $Vault -Filter '*.dpapi' -File)) {
        if ((Get-Identity (Read-Profile $entry.FullName)) -ceq $identity) {
            Save-Profile $entry.FullName $current
            $matched = $true
        }
    }
    if (!$matched) { throw 'Save the current account under its own label before switching.' }
    Assert-Closed
    Write-Atomic $auth $next
    Write-Output "Switched to $Name. Reopen Codex and verify the active account."
} finally {
    $lock.Dispose()
}
