---
name: helix-codex-profile-dock
description: Open the standalone Windows Codex profile switcher only when the user explicitly asks to open it.
---

On Windows, locate the plugin root two directories above this SKILL.md, using the path of the loaded skill. Resolve scripts/Open-CodexProfileDock.cmd relative to that root, verify that the file exists, and launch that exact path with PowerShell Start-Process -FilePath. The user requested a visible interactive window. If the skill path is unavailable, ask the user to double-click the launcher in the extracted project. Do not search for credentials, close Codex, save profiles, or switch accounts on behalf of the user.
