@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair_embedded_pg.ps1" %*
exit /b %errorlevel%