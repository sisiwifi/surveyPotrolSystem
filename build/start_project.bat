@echo off
setlocal

set "BACKEND_PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%BACKEND_PY%" (
  echo Project virtual environment not found: %BACKEND_PY%
  echo Run backend\requirements.txt installation first, or create .venv at the repo root.
  exit /b 1
)

set "RUNTIME_PROBE_OUTPUT=%TEMP%\survey_runtime_%RANDOM%%RANDOM%.env"
"%BACKEND_PY%" "%~dp0runtime_probe.py" > "%RUNTIME_PROBE_OUTPUT%"
if not %errorlevel%==0 (
  echo Failed to resolve runtime settings from build\runtime_probe.py.
  if exist "%RUNTIME_PROBE_OUTPUT%" del /q "%RUNTIME_PROBE_OUTPUT%" >nul 2>&1
  exit /b %errorlevel%
)
for /f "usebackq delims=" %%I in ("%RUNTIME_PROBE_OUTPUT%") do set "%%I"
if exist "%RUNTIME_PROBE_OUTPUT%" del /q "%RUNTIME_PROBE_OUTPUT%" >nul 2>&1

if not defined SURVEY_BACKEND_HOST set "SURVEY_BACKEND_HOST=127.0.0.1"
if not defined SURVEY_BACKEND_PORT set "SURVEY_BACKEND_PORT=8000"

echo Cleaning previous project processes...
call "%~dp0stop_project.bat" >nul 2>&1

if /I not "%SURVEY_EMBEDDED_POSTGRES_ENABLED%"=="1" (
  echo This project is built around embedded PostgreSQL.
  echo The current runtime configuration is not in embedded mode.
  echo If you want to restore the required embedded runtime configuration on this machine,
  echo you can run build\repair_embedded_pg.bat and then rerun build\start_project.bat.
  exit /b 2
)

call :ensure_embedded_runtime
if not %errorlevel%==0 exit /b %errorlevel%

call :start_embedded_runtime
if not %errorlevel%==0 exit /b %errorlevel%

echo Starting backend on %SURVEY_BACKEND_HOST%:%SURVEY_BACKEND_PORT%...
start "picTagView-backend" cmd /k "title picTagView-backend && cd /d %~dp0..\backend && set SURVEY_BACKEND_HOST=%SURVEY_BACKEND_HOST% && set SURVEY_BACKEND_PORT=%SURVEY_BACKEND_PORT% && %BACKEND_PY% -m uvicorn app.main:app --reload --host %SURVEY_BACKEND_HOST% --port %SURVEY_BACKEND_PORT%"

echo Waiting for backend to initialize...
timeout /t 2 /nobreak >nul

set "VUE_APP_API_BASE=http://%SURVEY_BACKEND_HOST%:%SURVEY_BACKEND_PORT%"

echo Checking backend health: %VUE_APP_API_BASE%/
curl -s %VUE_APP_API_BASE%/ >nul 2>&1
if %errorlevel%==0 (
  echo Backend is running.
) else (
  echo Backend may still be starting. Please wait a few seconds and refresh.
)

echo Starting frontend with API base %VUE_APP_API_BASE%...
start "picTagView-frontend" cmd /k "title picTagView-frontend && cd /d %~dp0..\frontend && set VUE_APP_API_BASE=%VUE_APP_API_BASE% && npm run serve"

echo All components started.
endlocal
exit /b 0

:ensure_embedded_runtime
if exist "%SURVEY_POSTGRES_BIN_DIR%\pg_ctl.exe" if exist "%SURVEY_POSTGRES_BIN_DIR%\initdb.exe" exit /b 0
echo Missing embedded PostgreSQL runtime for this project.
echo Required runtime binaries were not found under %SURVEY_POSTGRES_BIN_DIR%.
echo If you want to provision the embedded runtime on this machine,
echo you can run build\repair_embedded_pg.bat and then rerun build\start_project.bat.
exit /b 2

:start_embedded_runtime
echo Starting embedded PostgreSQL runtime...
powershell -NoProfile -Command "$identity = [Security.Principal.WindowsIdentity]::GetCurrent(); $principal = [Security.Principal.WindowsPrincipal]::new($identity); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 1 } exit 0" >nul 2>&1
if %errorlevel%==0 goto start_embedded_runtime_direct

echo Administrator terminal detected. Starting embedded PostgreSQL in a standard user session...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_unelevated.ps1" -CommandPath "%~dp0pg_runtime.bat" -Arguments "start" -Wait -WaitTimeoutSeconds 30
if not %errorlevel%==0 (
  echo Failed to start embedded PostgreSQL from a standard user session.
  echo Run build\stop_project.bat, then rerun build\start_project.bat. If it still fails, run build\repair_embedded_pg.bat.
  exit /b 5
)
exit /b 0

:start_embedded_runtime_direct
call "%~dp0pg_runtime.bat" start
if %errorlevel%==5 exit /b 5
if not %errorlevel%==0 (
  echo Embedded PostgreSQL runtime failed to start.
  exit /b %errorlevel%
)
exit /b 0
