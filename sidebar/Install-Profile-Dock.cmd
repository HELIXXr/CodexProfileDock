@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Setup-Profile-Dock.ps1" -Action Install
set "dock_exit=%errorlevel%"
pause
exit /b %dock_exit%
