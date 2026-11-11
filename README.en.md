<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="sidebar/plugins/sidebar/assets/profile-dock-dark.png">
    <img src="sidebar/plugins/sidebar/assets/profile-dock-light.png" alt="Profile Dock" width="68">
  </picture>
</p>

<h1 align="center">Codex Profile Dock</h1>

<p align="center">Switch ChatGPT accounts and check remaining quota from the Codex sidebar.</p>
<p align="center">
  <a href="https://github.com/HELIXXr/CodexProfileDock/releases/latest"><strong>Download for Windows</strong></a>
  · <a href="README.md">简体中文</a>
  · <a href="#installation">Installation</a>
</p>

<p align="center">
  <img src="docs/sidebar-en.png" alt="Profile Dock showing demo accounts, remaining quota, reset times, and switch controls" width="540">
  <br><sub>Screenshot uses demo accounts and quota data.</sub>
</p>

## Features

| Feature | What it does |
| --- | --- |
| **Save and switch** | Save your current sign-in under an alias. After you confirm a switch, Profile Dock asks Codex to quit, updates the local sign-in, and reopens Codex. |
| **Check quota** | See the remaining percentage and reset time for each quota window. The ring beside an account shows its lowest remaining percentage. |
| **Rename and display language** | Rename saved aliases in the sidebar. The panel uses Simplified Chinese for Chinese Codex locales and English for all other locales. |

## Installation

You’ll need **Codex Desktop from the Microsoft Store**, **Codex CLI**, and **Node.js 22 or later** on Windows.

1. Install Codex Desktop and open it once. Install [Node.js](https://nodejs.org/en/download), then run `node --version` and `codex --version` in a new terminal. If `codex` is missing, run `npm install -g @openai/codex` and reopen the terminal.
2. Download `Codex-Profile-Dock-Windows-*.zip` from [GitHub Releases](https://github.com/HELIXXr/CodexProfileDock/releases/latest). Extract the entire ZIP to a folder you plan to keep.
3. Double-click `Install-Profile-Dock.cmd`. Save your work, fully quit and reopen Codex, then open **Profile Dock** from the sidebar. Select **Test background** to check the installation.

To upgrade, run the installer from the new release. To uninstall, run `Uninstall-Profile-Dock.cmd` and reopen Codex. Saved account records stay on your computer.

## Save and switch accounts

1. Sign in to your first account normally in Codex. In Profile Dock, enter an alias such as `Personal`, select **Save account**, and confirm.
2. Sign in to your second account normally and save it under a different alias, such as `Work`.
3. Before switching, save your work and wait for running tasks to finish. Select **Switch** next to the target account and confirm. Verify the active account after Codex reopens. Select **Refresh** to fetch the latest quota.

## Compatibility and account data

- Profile Dock supports ChatGPT sign-ins that Codex stores in `auth.json`. System credential stores and API key sign-ins are outside that scope. Codex manages conversation data separately.
- Windows DPAPI encrypts saved sign-ins in `%LOCALAPPDATA%\CodexProfileDock` or an existing `LocalCodexSwitch` folder. Keep `auth.json`, `.dpapi` files, and private backups to yourself.
- Codex App Server requests quotas from OpenAI. The sidebar receives quota data only.

[Full setup and troubleshooting guide](sidebar/README.en.md)

<sub>Unofficial project. Not affiliated with OpenAI.</sub>
