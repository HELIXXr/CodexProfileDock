# Profile Dock 原生侧栏版（0.8.1 Beta）

从 Codex 原生侧栏选择、保存和切换本机账号。支持 Windows、Node.js 和 Microsoft Store 版 Codex 桌面应用。

## 安装与升级
在本目录运行 `codex plugin marketplace add .`，再运行 `codex plugin add helix-codex-profile-dock-sidebar@helix-profile-dock-preview`。安装后完全退出并重开 Codex。独立窗口版仍可并存。

## 使用
Codex 桌面加载 Profile Dock 后，会由 Explorer 启动一次性任务，自动自检后台并刷新各账号额度。无需先打开侧栏。可在侧栏手动点「测试后台」重试。自检不会退出 Codex 或改动账号。切换或保存前，请先保存工作，等待任务结束，然后在面板内确认。点击账号旁的「重命名」可修改本地别名，Codex 可以保持打开。

后台通过当前登录用户的 Windows Explorer 按需启动，完成操作后自动退出。不用手动开助手，也不安装常驻进程或开机任务。后台使用 Ctrl+Q 请求 Codex 正常退出；进程完全退出后才写入登录缓存并请求重开。若退出超时或任务中断，请核对实际账号；不会自动重试。

账号记录沿用 %LOCALAPPDATA%\CodexProfileDock（或旧版 LocalCodexSwitch）。侧栏和 Explorer 工作进程共用 %USERPROFILE%\.codex-profile-dock-sidebar。此目录包含操作状态、本地回执和启动查询结果，不含登录令牌。不要分享账号备份或 auth.json。

在「已保存账号」顶部点击「刷新」，可以查询各账号的额度窗口、剩余百分比和重置时间。账号旁的额度环显示各窗口中最低的剩余百分比。查询时 Codex 可保持打开。只把短期访问令牌通过本机管道交给临时 Codex App Server，进程结束后清理临时目录。侧栏只接收额度数据。自动查询结果在本次桌面启动期间供插件实例共用，手动查询结果保留在本次插件会话中。查询失败时可继续切换账号；如果登录快照过期，请先用对应账号登录并重新保存。

## 测试
在 Windows 上可运行 `node plugins/sidebar/test-startup.mjs` 和 `node plugins/sidebar/test-interrupted.mjs`；测试使用临时目录。

