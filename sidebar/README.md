# Codex Profile Dock 0.8.2 · Windows 侧栏版

这是一个非官方的 Codex 桌面插件。你可以在侧栏保存、重命名和切换已登录的 ChatGPT 账号，也可以查看各账号的剩余额度。切换时插件会请求 Codex 正常退出，切换完成后再打开。

## 安装或升级

1. 安装并打开一次 Microsoft Store 版 Codex 桌面应用。安装 [Node.js](https://nodejs.org/en/download) 22 或更高版本，确保新开的终端能运行 `node --version`。
2. 如果终端找不到 `codex`，运行 `npm install -g @openai/codex` 安装官方 CLI，再打开新终端检查 `codex --version`。已用 Codex CLI 0.155.1 和 Node.js 24 验证安装流程。
3. 将 ZIP **完整解压**到本机一个准备保留的文件夹。双击 `Install-Profile-Dock.cmd`，按提示操作。已有试装版的用户直接运行新版安装脚本即可升级。
4. 保存工作后，完全退出并重开 Codex，在侧栏打开 **Profile Dock**。首次打开可点「测试后台」确认插件能启动后台任务。

## 保存并切换两个账号

1. 先通过 Codex 正常登录第一个账号。在 Profile Dock 的「保存当前账号」里填一个本地别名，例如 `Personal`，点「保存账号」并确认。Codex 会退出并重新打开。
2. 通过 Codex 正常登录第二个账号，用另一个别名（例如 `Work`）保存。
3. 切换时，先保存工作并等运行中的任务完成，然后在目标账号旁点「切换」并确认。Codex 重开后核对当前登录账号。
4. 点「刷新」查询各账号的额度和重置时间。账号旁的额度环显示所有额度窗口中最低的剩余百分比。点「重命名」可修改本地别名。

别名支持 1–32 个英文字母、数字、短横线或下划线，并以字母或数字开头。

## 卸载

双击 `Uninstall-Profile-Dock.cmd`，然后完全退出并重开 Codex。卸载会移除侧栏插件和它的插件源，保留已保存的账号记录。

## 常见问题

- **安装窗口提示脚本被阻止。** 核对 ZIP 来源后，右键 ZIP →「属性」。如果有「解除锁定」，勾选并应用，再解压到新文件夹。公司电脑上的执行策略由管理员管理。详见 [Microsoft 的 PowerShell 执行策略说明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)。
- **重开后没有侧栏入口。** 确认安装脚本成功、Codex 已完全退出过，并且 `node` 和 `codex` 都能在新终端运行。若刚安装 Node.js 且应用还读不到 PATH，可注销 Windows 后重新登录。
- **保存时找不到 `auth.json`。** 插件支持使用文件保存登录状态的 ChatGPT 登录方式。系统凭据库和 API Key 登录不在支持范围内。
- **刷新额度提示登录快照过期。** 通过 Codex 正常登录该账号，再用原别名重新保存。
- **切换后 Codex 没有重开。** 手动打开 Codex，核对当前登录账号后再操作。

## 账号数据

账号记录以 Windows DPAPI 加密，保存在 `%LOCALAPPDATA%\CodexProfileDock`。检测到旧版 `LocalCodexSwitch` 目录时会沿用它。额度查询通过 Codex App Server 向 OpenAI 查询，侧栏只接收额度数据。请勿转发 `auth.json`、`.dpapi` 文件或账号备份。
