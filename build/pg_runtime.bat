@echo off
setlocal

set "ACTION=%~1"
if not defined ACTION set "ACTION=status"

set "BACKEND_PY=%~dp0..\.venv\Scripts\python.exe"
if not exist "%BACKEND_PY%" (
	echo Project virtual environment not found: %BACKEND_PY%
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

if /I not "%SURVEY_EMBEDDED_POSTGRES_ENABLED%"=="1" (
	echo This project is built around embedded PostgreSQL.
	echo The current runtime configuration is not in embedded mode.
	echo If you want to restore the required embedded runtime configuration on this machine,
	echo you can run build\repair_embedded_pg.bat and then rerun this command.
	exit /b 2
)

if /I "%ACTION%"=="init" goto delegate_to_powershell
if /I "%ACTION%"=="reset" goto delegate_to_powershell
if /I "%ACTION%"=="restart" goto delegate_to_powershell

if not exist "%SURVEY_POSTGRES_BIN_DIR%\pg_ctl.exe" (
	echo Missing embedded PostgreSQL runtime for this project.
	echo Required runtime binaries were not found under %SURVEY_POSTGRES_BIN_DIR%.
	echo If you want to provision the embedded runtime on this machine,
	echo you can run build\repair_embedded_pg.bat and then rerun this command.
	exit /b 2
)

if /I "%ACTION%"=="start" goto start_cluster
if /I "%ACTION%"=="stop" goto stop_cluster
if /I "%ACTION%"=="status" goto status_cluster

echo Unsupported pg_runtime action: %ACTION%
exit /b 2

:start_cluster
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg_runtime.ps1" init >nul 2>&1
if not %errorlevel%==0 exit /b %errorlevel%
"%SURVEY_POSTGRES_BIN_DIR%\pg_ctl.exe" -D "%SURVEY_POSTGRES_CLUSTER_DIR%" -l "%SURVEY_POSTGRES_LOG_FILE%" -o "-h %SURVEY_POSTGRES_HOST% -p %SURVEY_POSTGRES_PORT%" start -w
exit /b %errorlevel%

:stop_cluster
if not exist "%SURVEY_POSTGRES_CLUSTER_DIR%\PG_VERSION" exit /b 0
"%SURVEY_POSTGRES_BIN_DIR%\pg_ctl.exe" -D "%SURVEY_POSTGRES_CLUSTER_DIR%" stop -m fast -w
exit /b %errorlevel%

:status_cluster
if not exist "%SURVEY_POSTGRES_CLUSTER_DIR%\PG_VERSION" (
	echo Embedded PostgreSQL cluster has not been initialized yet.
	exit /b 1
)
"%SURVEY_POSTGRES_BIN_DIR%\pg_ctl.exe" -D "%SURVEY_POSTGRES_CLUSTER_DIR%" status
exit /b %errorlevel%

:delegate_to_powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg_runtime.ps1" %ACTION%
exit /b %errorlevel%