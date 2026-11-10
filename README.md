# Codex Profile Dock

Windows 10/11 上的独立 Codex 账号切换工具。脚本在本机运行，不联网，不收集账号密码。无需安装插件或额外运行时即可双击启动。

## 使用

1. 下载并完整解压 ZIP，双击 Open-CodexProfileDock.cmd。
2. 在 Codex 正常登录第一个账号，保存好工作并完全退出 Codex，在切换器中输入别名（如 Personal），点「保存当前账号」。
3. 打开 Codex，用正常登录流程换到第二个账号。完全退出后，用另一个别名（如 Work）保存。
4. 日常切换：完全退出 Codex 和 Codex CLI，选择目标账号，点「切换所选账号」。重新打开 Codex，核对账号。

## 凭据和兼容性

只支持 Codex 使用 auth.json 文件保存的 ChatGPT 登录；不适用于系统凭据库或 API Key 登录。若账号凭据失效，需要正常登录后重新保存。切换时只替换本机的活动登录缓存，不迁移或隔离聊天数据。

保存的账号记录由 Windows DPAPI 加密，位于 %LOCALAPPDATA%\CodexProfileDock。若本机已有旧版 LocalCodexSwitch 目录，会继续使用它。备份通常只能由同一台电脑上的同一 Windows 用户解密，不适合用来迁移账号。活动 auth.json 由 Codex 读取，仍包含敏感登录令牌。不要分享 auth.json、.dpapi 文件或私人备份。此项目为非官方工具。

## 可选：从 Codex 启动

在解压目录中运行 codex plugin marketplace add .，再到桌面应用的插件目录选择 Codex Profile Dock (Local)，安装 Codex Profile Dock。启用后可以对 Codex 说「用 helix-codex-profile-dock 打开切换器」。插件只负责打开窗口；保存和切换在独立窗口中手动操作。无法安装插件时，可以直接双击启动文件。

英文简述：An unofficial, offline Windows utility for switching locally saved Codex ChatGPT profiles. Extract the full archive and run Open-CodexProfileDock.cmd. Quit Codex before saving or switching. Never share authentication files or encrypted profile backups.
