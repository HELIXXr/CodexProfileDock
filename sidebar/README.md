# Profile Dock 原生侧栏版（0.2.1 Beta）

面板在 Codex 内打开。它读取本机加密账号文件的**别名**，不解密或展示令牌。需要 Node.js 和支持侧栏扩展的 Windows Codex 桌面应用。

## 安装与升级
在本目录运行 `codex plugin marketplace add .`，再运行 `codex plugin add helix-codex-profile-dock-sidebar@helix-profile-dock-preview`。安装后完全退出并重开 Codex。原来的独立窗口版可以并存。

## 使用
选择账号的「切换并重开」，在面板内再次确认。保存当前账号时填写英文字母/数字别名；**保存也会退出并重开 Codex**。操作前请保存工作并等待任务完成。

后台使用 Windows WMI 启动独立 PowerShell 进程，避免 Codex 退出时结束本次操作。后台未按时确认启动时会取消操作并解除锁，避免一直停在排队状态。只在识别到 Microsoft Store Codex 后请求应用通过 Ctrl+Q 退出，不强杀。其他 CLI 未关闭、窗口无法置前或退出超时均会停止。重开后核对 Codex 中实际显示的账号。

## 数据
账号备份沿用 %LOCALAPPDATA%\\CodexProfileDock 或旧的 LocalCodexSwitch。状态文件在 %LOCALAPPDATA%\\CodexProfileDockSidebar，不含令牌。账号别名经 UI 专用工具返回，不作为模型工具结果内容公开。此版本不标记哪个账号「当前激活」，以 Codex 实际显示为准。
如果后台进程异常退出而锁文件残留，先确认没有 Sidebar-Worker.ps1 进程运行，再删除状态目录内的 operation.lock。不要在流程运行时删除。

## 测试
运行 `node plugins/sidebar/test-backend.mjs`。它只使用临时模拟文件，不触碰真实账号。

