@echo off
setlocal

set "BACKEND_PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%BACKEND_PY%" (
  echo Project virtual environment not found: %BACKEND_PY%
  echo Run backend\requirements.txt installation first, or create .venv at the repo root.
  exit /b 1
)

for /f "usebackq delims=" %%I in (`"%BACKEND_PY%" "%~dp0runtime_probe.py"`) do set "%%I"

if not defined SURVEY_BACKEND_HOST set "SURVEY_BACKEND_HOST=127.0.0.1"
if not defined SURVEY_BACKEND_PORT set "SURVEY_BACKEND_PORT=8000"

echo Starting embedded PostgreSQL runtime...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg_runtime.ps1" start
if %errorlevel%==2 (
  echo Embedded PostgreSQL runtime not found. Continuing with current database endpoint %SURVEY_POSTGRES_HOST%:%SURVEY_POSTGRES_PORT%.
) else if not %errorlevel%==0 (
  echo Embedded PostgreSQL runtime failed to start.
  exit /b %errorlevel%
)

echo Starting backend on %SURVEY_BACKEND_HOST%:%SURVEY_BACKEND_PORT%...
start "picTagView-backend" cmd /k "cd /d %~dp0..\backend && set SURVEY_BACKEND_HOST=%SURVEY_BACKEND_HOST% && set SURVEY_BACKEND_PORT=%SURVEY_BACKEND_PORT% && %BACKEND_PY% -m uvicorn app.main:app --reload --host %SURVEY_BACKEND_HOST% --port %SURVEY_BACKEND_PORT%"

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
start "picTagView-frontend" cmd /k "cd /d %~dp0..\frontend && set VUE_APP_API_BASE=%VUE_APP_API_BASE% && npm run serve"

echo All components started.
endlocal
