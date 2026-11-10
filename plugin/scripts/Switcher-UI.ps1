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
    $form.ClientSize = [Drawing.Size]::new(510,500)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.Font = [Drawing.Font]::new('Microsoft YaHei UI',9)
    $form.BackColor = [Drawing.Color]::FromArgb(242,245,251)
    $ink = [Drawing.Color]::FromArgb(25,36,61)
    $muted = [Drawing.Color]::FromArgb(75,90,119)
    $accent = [Drawing.Color]::FromArgb(63,66,170)
    $paper = [Drawing.Color]::White
    $tint = [Drawing.Color]::FromArgb(235,237,253)
    $warning = [Drawing.Color]::FromArgb(147,46,29)
    $ok = [Drawing.Color]::FromArgb(18,107,73)
    $form.ForeColor = $ink

    function Add-Control($parent,$kind,$caption,$x,$y,$w,$h) {
        $control = New-Object "Windows.Forms.$kind"
        $control.Text = $caption
        $control.SetBounds($x,$y,$w,$h)
        $parent.Controls.Add($control)
        return $control
    }

    function Add-Button($parent,$caption,$x,$y,$w,$h,$background,$foreground) {
        $button = Add-Control $parent Button $caption $x $y $w $h
        $button.FlatStyle = 'Flat'
        $button.FlatAppearance.BorderSize = 0
        $button.UseVisualStyleBackColor = $false
        $button.BackColor = $background
        $button.ForeColor = $foreground
        $button.Cursor = [Windows.Forms.Cursors]::Hand
        return $button
    }

    $header = Add-Control $form Panel '' 0 0 510 100
    $header.BackColor = [Drawing.Color]::FromArgb(29,37,78)
    $brand = Add-Control $header Label 'PROFILE DOCK' 24 15 205 18
    $brand.Font = [Drawing.Font]::new('Segoe UI',8,[Drawing.FontStyle]::Bold)
    $brand.ForeColor = [Drawing.Color]::FromArgb(177,190,250)
    $title = Add-Control $header Label 'Codex 账号切换' 22 37 350 46
    $title.Font = [Drawing.Font]::new('Microsoft YaHei UI',20,[Drawing.FontStyle]::Bold)
    $title.ForeColor = $paper
    $badge = Add-Control $header Label '仅在本机运行' 367 43 119 27
    $badge.TextAlign = 'MiddleCenter'
    $badge.BackColor = [Drawing.Color]::FromArgb(52,62,115)
    $badge.ForeColor = $paper

    $card = Add-Control $form Panel '' 20 118 470 185
    $card.BackColor = $paper
    $heading = Add-Control $card Label '已保存账号' 16 12 256 27
    $heading.Font = [Drawing.Font]::new('Microsoft YaHei UI',11,[Drawing.FontStyle]::Bold)
    $count = Add-Control $card Label '' 351 14 103 23
    $count.TextAlign = 'MiddleRight'
    $count.ForeColor = $muted
    $list = Add-Control $card ListBox '' 16 43 438 88
    $list.AccessibleName = '已保存账号'
    $list.IntegralHeight = $false
    $list.BorderStyle = 'FixedSingle'
    $list.BackColor = [Drawing.Color]::FromArgb(248,249,254)
    $empty = Add-Control $card Label '还没有保存的账号。请在下方添加。' 17 44 436 86
    $empty.TextAlign = 'MiddleCenter'
    $empty.BackColor = $list.BackColor
    $empty.ForeColor = $muted
    $empty.BringToFront()
    $switch = Add-Button $card '切换所选账号' 16 141 438 32 $accent $paper
    $switch.Enabled = $false

    $addCard = Add-Control $form Panel '' 20 315 470 92
    $addCard.BackColor = $paper
    $addTitle = Add-Control $addCard Label '新增账号' 16 9 200 26
    $addTitle.Font = [Drawing.Font]::new('Microsoft YaHei UI',11,[Drawing.FontStyle]::Bold)
    $hint = Add-Control $addCard Label '别名示例：Personal' 226 12 228 23
    $hint.TextAlign = 'MiddleRight'
    $hint.ForeColor = $muted
    $name = Add-Control $addCard TextBox '' 16 48 285 28
    $name.AccessibleName = '账号别名'
    $save = Add-Button $addCard '保存当前账号' 311 42 143 36 $tint $accent

    $notice = Add-Control $form Label '操作前请保存工作，并完全退出 Codex。' 22 419 466 22
    $notice.ForeColor = $muted
    $status = Add-Control $form Label '' 22 447 466 45
    $status.ForeColor = $muted

    function Set-Status([string]$message,$color=$muted) {
        $status.Text = $message
        $status.ForeColor = $color
    }

    function Refresh-Profiles {
        $selected = $list.SelectedItem
        $list.BeginUpdate()
        try {
            $list.Items.Clear()
            foreach ($entry in (& $engine List | Sort-Object)) { [void]$list.Items.Add($entry) }
            if ($selected -and $list.Items.Contains($selected)) { $list.SelectedItem = $selected }
        } finally { $list.EndUpdate() }
        $count.Text = "$($list.Items.Count) 个账号"
        $empty.Visible = $list.Items.Count -eq 0
        $list.Enabled = $list.Items.Count -gt 0
        $switch.Enabled = $list.SelectedIndex -ge 0
    }

    function Run-Action($action,$aliasName) {
        try {
            $null = & $engine -Action $action -Name $aliasName
            Refresh-Profiles
            if ($action -eq 'Save') {
                $name.Clear()
                $list.SelectedItem = $aliasName
                Set-Status "已保存：$aliasName" $ok
            } else {
                Set-Status "已切换：$aliasName。请重新打开 Codex 核对。" $ok
            }
        } catch {
            Set-Status '操作未完成。' $warning
            [void][Windows.Forms.MessageBox]::Show($form,$_.Exception.Message,'Codex Profile Dock')
        }
    }

    $list.Add_SelectedIndexChanged({ $switch.Enabled = $list.SelectedIndex -ge 0 })
    $save.Add_Click({
        $aliasName = $name.Text.Trim()
        if (!$aliasName) {
            Set-Status '请先输入账号别名，例如 Personal。' $warning
            [void]$name.Focus()
            return
        }
        if ($aliasName -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}\z') {
            Set-Status '别名需为 1–32 个字符，以英文字母或数字开头，可包含下划线和短横线。' $warning
            [void]$name.Focus()
            return
        }
        Run-Action Save $aliasName
    })
    $switch.Add_Click({
        if ($list.SelectedIndex -ge 0) { Run-Action Switch ([string]$list.SelectedItem) }
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
