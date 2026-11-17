# Profile Dock 0.10.0 security update

- Windows stores account records and the managed installation under a private ACL for the current user, SYSTEM, and administrators. The installed code allows the Codex sandbox group read/execute access only.
- Saved records bind the alias inside the encrypted envelope. Existing records are adopted during installation after securing the directory. Each original ciphertext is preserved in a private migration backup. This cannot detect an alias that was already swapped before the upgrade.
- The installer verifies an RSA-SHA256 signed file manifest before copying runtime files. The managed copy is verified again. Obtain the ZIP from the official GitHub release and check its published checksum. The verifier and installer are part of the initial download trust boundary.
- macOS removes raw Keychain get/put/delete commands. The helper accepts private pipe sessions and requires macOS device-owner authentication before a session can access saved accounts. Approval expires after two minutes. Startup quota refresh skips Keychain reads. Manual Refresh may show a macOS authentication dialog.
- Keychain alias indices are backed by an alias bound to the Keychain payload. Legacy records are adopted only after an authorized read.
- The current Windows user and administrators, or a fully compromised macOS login session, remain outside the isolation boundary. Neither encryption nor a checksum can protect an application from arbitrary code already executing with all its privileges.

## 中文说明

- Windows 账号目录会改为仅当前用户、SYSTEM 和管理员可访问。安装程序会把经过签名校验的代码复制到私有管理目录，沙盒用户组只保留代码读取与执行权限。
- 账号别名写入加密记录。旧记录在收紧目录权限后升级，并保留原始密文备份。升级无法追溯之前已被调换的别名。
- 安装器使用 RSA-SHA256 校验文件清单和签名，再次验证复制后的代码。首次下载仍须来自项目的 GitHub Release，并核对发布的 ZIP 校验值。
- macOS 钥匙串助手取消可直接调用的原始读取命令。通过私有管道建立会话，访问账号前由 macOS 验证设备所有者身份，会话授权最多持续两分钟。启动时跳过钥匙串额度读取，手动刷新时可能出现系统验证窗口。
- macOS 的账号别名同时绑定到钥匙串内容。旧记录仅在用户授权读取后升级。
- 此方案无法隔离已取得当前用户完整权限的恶意程序或管理员。

## 0.10.0 local panel state / 本机侧栏状态

Quota percentages, reset times, query timestamps and alias ordering are cached locally. They contain no sign-in tokens. On macOS, a private identity digest and token expiry hint allow the panel to identify the active account without opening Keychain at startup. Manual quota queries share one authenticated Keychain session per batch (maximum two minutes).

额度百分比、重置时间、查询时间及别名排序缓存在本机，不含登录令牌。macOS 另存私有身份摘要和令牌到期提示，以便启动时无需打开钥匙串即可核对当前账号。一批手动额度查询共用一次钥匙串授权会话，最多持续两分钟。
