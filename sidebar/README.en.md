# Codex Profile Dock 0.8.3 for Windows

[中文安装和使用说明](README.md)

Profile Dock is an unofficial sidebar plugin for Codex Desktop. It saves local ChatGPT sign-ins under aliases, switches between them, and shows remaining quota. It asks Codex to quit and reopen when switching accounts.

The panel follows the Codex interface language. It uses Simplified Chinese for any Chinese locale and English for every other locale.

## Install or upgrade

1. Install the Microsoft Store version of Codex and open it once. Install [Node.js](https://nodejs.org/en/download) 22 or later and confirm that `node --version` works in a new terminal.
2. If the terminal cannot find `codex`, run `npm install -g @openai/codex` to install the official CLI. Open a new terminal and check `codex --version`. The installer was tested with Codex CLI 0.155.1 and Node.js 24.
3. Extract the entire ZIP to a folder you plan to keep. Double-click `Install-Profile-Dock.cmd`. Use the same installer to upgrade a preview version.
4. Save your work, fully quit and reopen Codex, then open **Profile Dock** from the sidebar. Select **Test background** to check that the plugin can start its background task.

## Save and switch accounts

1. Sign in to your first account normally in Codex. In Profile Dock, enter an alias such as `Personal`, select **Save account**, and confirm. Codex will close and reopen.
2. Sign in to your second account normally and save it under a different alias, such as `Work`.
3. To switch, save your work and wait for running tasks to finish. Select **Switch** next to the target account and confirm. After Codex reopens, verify the active account.
4. Select **Refresh** to check quota and reset times. The ring shows the lowest remaining percentage across quota windows. Select **Rename** to change a local alias.

Aliases can contain 1–32 ASCII letters, digits, hyphens, or underscores. Start with a letter or digit.

## Uninstall

Double-click `Uninstall-Profile-Dock.cmd`, then fully quit and reopen Codex. This removes the plugin and its marketplace source. Saved account records stay on your computer.

## Troubleshooting

- **Windows blocks the installer script.** Verify the ZIP’s source, then right-click the ZIP, open **Properties**, and select **Unblock** if available. Apply the change and extract to a new folder. On managed PCs, your administrator controls PowerShell execution policy. [Microsoft’s PowerShell execution policy guide](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)
- **The sidebar entry is missing.** Check that installation finished successfully, Codex fully quit before reopening, and both `node` and `codex` work in a new terminal. If Codex still cannot find Node.js after a new install, sign out of Windows and back in.
- **Saving cannot find `auth.json`.** Profile Dock supports ChatGPT sign-ins that Codex stores in a file. System credential stores and API key sign-ins are outside that scope.
- **A saved sign-in expired.** Sign in to that account normally in Codex, then save it again with its existing alias.
- **Codex did not reopen after switching.** Open Codex manually and check the active account.

## Account data

Saved sign-ins are encrypted by Windows DPAPI under `%LOCALAPPDATA%\CodexProfileDock` or the existing `LocalCodexSwitch` folder. Quota requests go to OpenAI through Codex App Server. The panel receives quota data only. Keep `auth.json`, `.dpapi` files, and account backups private.
