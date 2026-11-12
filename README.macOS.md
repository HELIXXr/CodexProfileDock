# Profile Dock for macOS · 0.9.0 beta.1

[English](#english) · [简体中文](#简体中文)

## 简体中文

macOS 版沿用 Codex 侧栏，支持保存、切换、重命名和额度查询。账号快照保存在 macOS 登录钥匙串。侧栏跟随 Codex 的界面语言。

1. 安装并打开一次 [Codex 桌面应用](https://learn.chatgpt.com/docs/app)。准备 Node.js 22 或更高版本、可在终端运行的 Codex CLI 和 Apple 命令行工具。缺少命令行工具时运行 `xcode-select --install`。
2. 完整解压 ZIP，双击 `sidebar/macos/Install-Profile-Dock.command`。也可在终端用 `bash sidebar/macos/Install-Profile-Dock.command` 安装。安装器会在本机编译钥匙串和桌面退出助手。
3. Profile Dock 需要 Codex 使用文件保存**当前**登录。把以下设置放到 Codex 用户配置 `~/.codex/config.toml` 的顶层。如果使用自定义 `CODEX_HOME`，编辑对应目录下的 `config.toml`。

   ```toml
   cli_auth_credentials_store = "file"
   ```

4. 完全退出并重开 Codex。如有需要，用 ChatGPT 正常登录一次。在侧栏打开 **Profile Dock**，点击「测试后台」，然后给当前账号保存一个别名。
5. 通过 Codex 登录另一个账号，用不同别名保存。切换前请保存工作并结束运行中的任务、退出 Codex CLI。插件会请求桌面应用正常退出，更新本机的登录文件，再重开应用。

Codex 的活动登录仍由它自己的 `auth.json` 管理。Profile Dock 保存的账号快照位于登录钥匙串，别名索引位于 `~/Library/Application Support/CodexProfileDock/profiles`。受组织管理的设备如果要求使用钥匙串保存 Codex 活动登录，则不支持这个切换方式。

卸载时运行 `sidebar/macos/Uninstall-Profile-Dock.command` 并重开 Codex。卸载保留钥匙串里的账号记录。macOS 与 Windows 的账号快照分别使用系统钥匙串和 DPAPI，需在各自设备上正常登录并保存。

## English

Profile Dock for macOS uses the Codex sidebar for saving and switching ChatGPT sign-ins, renaming aliases, and checking quota. Saved sign-in snapshots are stored in the macOS login keychain. The panel follows the Codex interface language.

1. Install and open [Codex Desktop](https://learn.chatgpt.com/docs/app) once. Install Node.js 22 or later, the Codex CLI, and Apple Command Line Tools. Run `xcode-select --install` if the tools are missing.
2. Extract the entire ZIP. Double-click `sidebar/macos/Install-Profile-Dock.command` or run `bash sidebar/macos/Install-Profile-Dock.command` in Terminal. The installer builds the native Keychain and app-quit helper locally.
3. Profile Dock needs Codex to store its **active** sign-in in a file. Put this at the top level of `~/.codex/config.toml`. For a custom `CODEX_HOME`, edit the `config.toml` in that directory.

   ```toml
   cli_auth_credentials_store = "file"
   ```

4. Fully quit and reopen Codex. Sign in normally with ChatGPT again if needed. Open **Profile Dock** in the sidebar, select **Test background**, and save the current account under an alias.
5. Sign in to a second account and save it under a different alias. Before switching, save your work, wait for running tasks to finish, and close any Codex CLI sessions. Profile Dock asks the desktop app to quit normally, updates the local sign-in, and opens it again.

Codex manages its active sign-in in `auth.json`. Profile Dock’s saved snapshots live in the login keychain, with alias records under `~/Library/Application Support/CodexProfileDock/profiles`. Devices whose organization enforces Keychain storage for the active Codex sign-in cannot use this switching method.

Run `sidebar/macos/Uninstall-Profile-Dock.command` and reopen Codex to uninstall. Saved sign-ins stay in the Keychain. Save sign-ins separately on each Mac or Windows PC you use.

<sub>Unofficial beta. Not affiliated with OpenAI.</sub>
