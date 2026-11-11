# Profile Dock 原生侧栏版（0.3.0 Beta）

在 Codex 原生侧栏内选择、保存和切换本机账号。需要 Windows、Node.js 和支持侧栏扩展的 Codex 桌面应用。

## 安装
在本目录运行 `codex plugin marketplace add .`，再运行 `codex plugin add helix-codex-profile-dock-sidebar@helix-profile-dock-preview`。安装后完全退出并重开 Codex。旧的独立窗口版可以并存。

## 启动后台助手
双击本目录的 `Start-Profile-Dock-Companion.cmd`。助手在当前 Windows 用户会话中安静运行，不自动加入开机启动，不使用 WMI，不会因为 Codex 退出而结束。看到面板显示「后台助手已连接」后可点击「测试后台」；自检不会读取登录令牌、改动账号或退出 Codex。需要结束助手时双击 `Stop-Profile-Dock-Companion.cmd`；它会在当前操作结束后停止。

## 切换与保存
先保存工作并等待任务结束，再在面板选择账号并确认。保存账号也需要退出并重开 Codex。后台通过 Ctrl+Q 请求已识别的 Microsoft Store 版 Codex 正常退出，等进程完全退出后才更新账号。未能退出时会停止，不强制杀进程。重开后请核对实际账号。

账号记录仍沿用 %LOCALAPPDATA%\CodexProfileDock（或旧版 LocalCodexSwitch）。状态和操作请求保存在 %LOCALAPPDATA%\CodexProfileDockSidebar，文件包含状态、操作与本地别名，不含令牌。不要分享账号备份或 auth.json。

## 测试
运行 `node plugins/sidebar/test-companion.mjs`，通过临时目录测试真实助手和自检，不触碰账号。

