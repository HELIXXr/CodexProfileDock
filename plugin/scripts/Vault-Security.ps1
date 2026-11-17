# Windows account vault security. Loaded by Switch-Codex.ps1 and the installer.
function Assert-DockPlainPath([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Refusing a reparse point in a Profile Dock path.'
            }
        }
        $parent = [IO.Path]::GetDirectoryName($current.TrimEnd('\'))
        if (!$parent -or $parent -eq $current) { break }
        $current = $parent
    }
}

function Set-DockAccess([string]$Path, $Access, [bool]$Protected) {
    if (!('ProfileDock.SecurityAcl' -as [type])) {
        Add-Type -Namespace ProfileDock -Name SecurityAcl -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("advapi32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
public static extern uint SetNamedSecurityInfo(string name, int type, uint information,
    System.IntPtr owner, System.IntPtr group, System.IntPtr dacl, System.IntPtr sacl);
"@
    }
    $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($Access.GetSecurityDescriptorBinaryForm(), 0)
    $raw = New-Object byte[] $descriptor.DiscretionaryAcl.BinaryLength
    $descriptor.DiscretionaryAcl.GetBinaryForm($raw, 0)
    $pointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($raw.Length)
    try {
        [Runtime.InteropServices.Marshal]::Copy($raw, 0, $pointer, $raw.Length)
        $flags = if ($Protected) { [uint32]2147483652 } else { [uint32]536870916 }
        $result = [ProfileDock.SecurityAcl]::SetNamedSecurityInfo($Path, 1, $flags,
            [IntPtr]::Zero,[IntPtr]::Zero,$pointer,[IntPtr]::Zero)
        if ($result -ne 0) { throw [ComponentModel.Win32Exception]::new([int]$result) }
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($pointer) }
}

function Protect-DockDirectory([string]$Path, [switch]$AllowSandboxRead) {
    Assert-DockPlainPath $Path
    [void][IO.Directory]::CreateDirectory($Path)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $admins = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($owner)
    foreach ($sid in @($owner, $system, $admins)) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl',
            'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    if ($AllowSandboxRead) {
        try {
            $sandbox = [Security.Principal.NTAccount]::new($env:COMPUTERNAME, 'CodexSandboxUsers')
            $sid = $sandbox.Translate([Security.Principal.SecurityIdentifier])
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,
                'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
        } catch [Security.Principal.IdentityNotMappedException] {}
    }
    Set-DockAccess $Path $acl $true
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force -Recurse) {
        if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Refusing a reparse point inside a Profile Dock directory.'
        }
        $inherited = if ($PSVersionTable.PSEdition -eq 'Core') {
            Get-Acl -LiteralPath $child.FullName
        } elseif ($child.PSIsContainer) {
            [IO.Directory]::GetAccessControl($child.FullName)
        } else {
            [IO.File]::GetAccessControl($child.FullName)
        }
        $inherited.SetAccessRuleProtection($true, $false)
        foreach ($entry in @($inherited.Access)) { [void]$inherited.RemoveAccessRuleSpecific($entry) }
        $inherited.SetAccessRuleProtection($false, $false)
        Set-DockAccess $child.FullName $inherited $false
    }
}

function Read-DockProfile([string]$Path, [switch]$AllowLegacy) {
    $clear = [Security.Cryptography.ProtectedData]::Unprotect((Read-Blob $Path), $null, $scope)
    try { $record = [Text.Encoding]::UTF8.GetString($clear).TrimStart([char]0xFEFF) | ConvertFrom-Json }
    catch { throw 'Invalid saved account.' }
    if ($record.profileDockFormat -eq 1) {
        $expected = [IO.Path]::GetFileNameWithoutExtension($Path)
        if ([string]$record.alias -cne $expected) { throw 'Saved account alias integrity check failed.' }
        return ,([Convert]::FromBase64String([string]$record.auth))
    }
    if (!$AllowLegacy) { throw 'Legacy account must be upgraded before use.' }
    [void](Get-Identity $clear)
    return ,$clear
}

function Save-DockProfile([string]$Path, [byte[]]$Bytes) {
    [void](Get-Identity $Bytes)
    $record = @{
        profileDockFormat = 1
        alias = [IO.Path]::GetFileNameWithoutExtension($Path)
        auth = [Convert]::ToBase64String($Bytes)
    } | ConvertTo-Json -Compress
    $clear = [Text.Encoding]::UTF8.GetBytes($record)
    Write-Atomic $Path ([Security.Cryptography.ProtectedData]::Protect($clear, $null, $scope))
}

function Upgrade-DockVault([string]$Path) {
    Protect-DockDirectory $Path
    $guard = [IO.File]::Open((Join-Path $Path '.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    try {
        $snapshots = @()
        foreach ($file in Get-ChildItem -LiteralPath $Path -File -Filter '*.dpapi') {
            $bytes = Read-DockProfile $file.FullName -AllowLegacy
            [void](Get-Identity $bytes)
            $snapshots += [pscustomobject]@{Path=$file.FullName; Bytes=$bytes}
        }
        foreach ($entry in $snapshots) {
            # Preserve each original ciphertext before the first envelope upgrade.
            $archive = $entry.Path + '.pre-security-backup'
            if (!(Test-Path -LiteralPath $archive)) {
                [IO.File]::WriteAllBytes($archive, (Read-Blob $entry.Path))
            }
            Save-DockProfile $entry.Path $entry.Bytes
        }
    } finally { $guard.Dispose() }
}
