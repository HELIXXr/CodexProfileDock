# The PowerShell host is DPI-unaware; opt in on the UI thread before creating any windows.
Add-Type -Namespace ProfileDock -Name NativeDpi -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr context);
"@
$previousDpiContext = [ProfileDock.NativeDpi]::SetThreadDpiAwarenessContext([IntPtr](-2)) # System aware
if ($previousDpiContext -eq [IntPtr]::Zero) {
    throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
}
try {
    Add-Type -AssemblyName System.Windows.Forms,System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $engine = Join-Path $PSScriptRoot 'Switch-Codex.ps1'
    $form = New-Object Windows.Forms.Form
    $form.SuspendLayout()
    $form.Text = 'Codex Profile Dock'
    $form.ClientSize = [Drawing.Size]::new(460,332)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.Font = [Drawing.Font]::new('Microsoft YaHei UI',10)
    function Add-Control($kind,$caption,$x,$y,$w,$h) {
        $control = New-Object "Windows.Forms.$kind"
        $control.Text = $caption
        $control.SetBounds($x,$y,$w,$h)
        $form.Controls.Add($control)
        return $control
    }
    $null = Add-Control Label '保存或切换之前，请先保存工作并完全退出 Codex。' 18 18 424 36
    $list = Add-Control ListBox '' 18 60 424 105
    $null = Add-Control Label '账号别名（例如 Personal 或 Work）' 18 170 424 24
    $name = Add-Control TextBox '' 18 200 250 28
    $save = Add-Control Button '保存当前账号' 280 197 162 34
    $switch = Add-Control Button '切换所选账号' 18 242 424 36
    $status = Add-Control Label '保存新账号时，请先填写上面的别名。' 18 286 424 42
    function Refresh-Profiles {
        $list.Items.Clear()
        foreach ($entry in (& $engine List | Sort-Object)) { [void]$list.Items.Add($entry) }
    }
    function Run-Action($action,$aliasName) {
        try {
            $null = & $engine -Action $action -Name $aliasName
            Refresh-Profiles
            $status.Text = if ($action -eq 'Save') { "已保存：$aliasName" } else { "已切换：$aliasName。请重新打开 Codex 核对。" }
        } catch {
            $status.Text = '操作未完成。'
            [void][Windows.Forms.MessageBox]::Show($form,$_.Exception.Message,'Codex Profile Dock')
        }
    }
    $save.Add_Click({
        $aliasName = $name.Text.Trim()
        if (!$aliasName) {
            $status.Text = '请先在左侧输入账号别名，例如 Personal。'
            [void]$name.Focus()
            return
        }
        if ($aliasName -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z') {
            $status.Text = '别名需为 1–32 个字符，以英文字母或数字开头，可包含下划线和短横线。'
            [void]$name.Focus()
            return
        }
        Run-Action Save $aliasName
    })
    $switch.Add_Click({
        if (!$list.SelectedItem) { $status.Text = '请先选择一个账号。'; return }
        Run-Action Switch ([string]$list.SelectedItem)
    })
    # Control bounds above are authored at 96 DPI (100% scaling).
    $form.AutoScaleDimensions = [Drawing.SizeF]::new(96,96)
    $form.AutoScaleMode = [Windows.Forms.AutoScaleMode]::Dpi
    $form.ResumeLayout($true)
    Refresh-Profiles
    [void]$form.ShowDialog()
} finally {
    if ($form) { $form.Dispose() }
    [void][ProfileDock.NativeDpi]::SetThreadDpiAwarenessContext($previousDpiContext)
}
