@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$projectRoot = [System.IO.Path]::GetFullPath('%~dp0..');" ^
  "$targets = Get-CimInstance Win32_Process | Where-Object {" ^
  "  $_.CommandLine -and (" ^
  "    ($_.Name -ieq 'cmd.exe' -and (" ^
  "      $_.CommandLine.Contains('title picTagView-backend') -or" ^
  "      $_.CommandLine.Contains('title picTagView-frontend') -or" ^
  "      ($_.CommandLine.Contains($projectRoot) -and ($_.CommandLine.Contains('uvicorn app.main:app') -or $_.CommandLine.Contains('npm run serve')))" ^
  "    )) -or" ^
  "    ($_.Name -ieq 'python.exe' -and $_.CommandLine.Contains($projectRoot) -and $_.CommandLine.Contains('uvicorn app.main:app')) -or" ^
  "    ($_.Name -ieq 'node.exe' -and $_.CommandLine.Contains($projectRoot) -and ($_.CommandLine.Contains('npm run serve') -or $_.CommandLine.Contains('vue-cli-service')))" ^
  "  )" ^
  "};" ^
  "foreach ($process in $targets) { cmd.exe /c \"taskkill /PID $($process.ProcessId) /T /F\" | Out-Null }" >nul 2>&1

call "%~dp0pg_runtime.bat" stop >nul 2>&1
exit /b 0
