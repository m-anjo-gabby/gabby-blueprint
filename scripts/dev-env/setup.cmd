@echo off
rem Gabby Blueprint dev environment setup. Double-click this file on the new PC.
rem Arguments are passed through to setup.ps1 (e.g. setup.cmd -RepoPath D:\work\gabby-blueprint).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
echo.
pause
