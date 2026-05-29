@echo off
setlocal

echo Stopping embedded PostgreSQL runtime...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg_runtime.ps1" stop
if %errorlevel%==2 (
  echo Embedded PostgreSQL runtime directory is not provisioned yet.
  echo Close backend and frontend terminals manually if they are still running.
  exit /b 0
)

if not %errorlevel%==0 (
  echo Failed to stop embedded PostgreSQL runtime.
  exit /b %errorlevel%
)

echo Embedded PostgreSQL runtime stopped.
echo Close backend and frontend terminals manually if they are still running.
endlocal