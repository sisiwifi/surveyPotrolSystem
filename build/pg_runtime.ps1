param(
    [ValidateSet('init', 'start', 'stop', 'restart', 'status', 'reset')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

function Get-RuntimeSnapshot {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
    $pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path $pythonExe -PathType Leaf)) {
        throw "Project virtual environment not found: $pythonExe"
    }

    $probeScript = Join-Path $PSScriptRoot 'runtime_probe.py'
    $rawJson = & $pythonExe $probeScript --format json
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to resolve runtime settings from build/runtime_probe.py'
    }

    $snapshot = $rawJson | ConvertFrom-Json
    return @{
        PythonExe = $pythonExe
        EmbeddedEnabled = [bool]$snapshot.SURVEY_EMBEDDED_POSTGRES_ENABLED
        RuntimeConfigPath = [string]$snapshot.SURVEY_RUNTIME_CONFIG_PATH
        BackendHost = [string]$snapshot.SURVEY_BACKEND_HOST
        BackendPort = [int]$snapshot.SURVEY_BACKEND_PORT
        Host = [string]$snapshot.SURVEY_POSTGRES_HOST
        Port = [int]$snapshot.SURVEY_POSTGRES_PORT
        User = [string]$snapshot.SURVEY_POSTGRES_USER
        Password = [string]$snapshot.SURVEY_POSTGRES_PASSWORD
        Database = [string]$snapshot.SURVEY_POSTGRES_DB_NAME
        AdminDatabase = [string]$snapshot.SURVEY_POSTGRES_ADMIN_DB_NAME
        RuntimeDir = [string]$snapshot.SURVEY_POSTGRES_RUNTIME_DIR
        BinDir = [string]$snapshot.SURVEY_POSTGRES_BIN_DIR
        ClusterDir = [string]$snapshot.SURVEY_POSTGRES_CLUSTER_DIR
        LogFile = [string]$snapshot.SURVEY_POSTGRES_LOG_FILE
    }
}

function Get-RuntimeBinaryPath {
    param(
        [hashtable]$Snapshot,
        [string]$FileName
    )

    return Join-Path $Snapshot.BinDir $FileName
}

function Test-RuntimeAvailable {
    param([hashtable]$Snapshot)

    $requiredFiles = @(
        (Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_ctl.exe'),
        (Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'initdb.exe')
    )

    foreach ($requiredFile in $requiredFiles) {
        if (-not (Test-Path $requiredFile -PathType Leaf)) {
            return $false
        }
    }
    return $true
}

function Convert-ToCmdArgument {
    param([string]$Value)

    return '"' + $Value.Replace('"', '""') + '"'
}

function Invoke-PgCtl {
    param(
        [hashtable]$Snapshot,
        [string[]]$Arguments
    )

    $pgCtlExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_ctl.exe'
    $commandParts = @((Convert-ToCmdArgument -Value $pgCtlExe))
    foreach ($argument in $Arguments) {
        $commandParts += Convert-ToCmdArgument -Value $argument
    }

    $commandLine = [string]::Join(' ', $commandParts)
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', $commandLine) -Wait -PassThru -WindowStyle Hidden
    return $process.ExitCode
}

function Test-IsElevatedAdministrator {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]::new($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        return $false
    }
}

function Ensure-RuntimeLayout {
    param([hashtable]$Snapshot)

    $paths = @(
        $Snapshot.RuntimeDir,
        (Split-Path -Parent $Snapshot.ClusterDir),
        (Split-Path -Parent $Snapshot.LogFile)
    )

    foreach ($path in $paths) {
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
}

function Sync-ClusterRuntimeSettings {
    param([hashtable]$Snapshot)

    Ensure-RuntimeLayout -Snapshot $Snapshot
    $autoConfigPath = Join-Path $Snapshot.ClusterDir 'postgresql.auto.conf'
    $preservedLines = @()
    if (Test-Path $autoConfigPath -PathType Leaf) {
        $preservedLines = Get-Content -Path $autoConfigPath -Encoding utf8 | Where-Object {
            $_ -notmatch '^\s*(listen_addresses|port)\s*='
        }
    }

    $preservedLines += "listen_addresses = '$($Snapshot.Host)'"
    $preservedLines += "port = $($Snapshot.Port)"
    Set-Content -Path $autoConfigPath -Value $preservedLines -Encoding ascii
}

function Test-ClusterReady {
    param([hashtable]$Snapshot)

    $pgIsReadyExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_isready.exe'
    if (-not (Test-Path $pgIsReadyExe -PathType Leaf)) {
        return $false
    }

    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        & $pgIsReadyExe -h $Snapshot.Host -p $Snapshot.Port | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return $true
        }

        Start-Sleep -Milliseconds 200
    }

    return $false
}

function Initialize-Cluster {
    param([hashtable]$Snapshot)

    if (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf) {
        Sync-ClusterRuntimeSettings -Snapshot $Snapshot
        return
    }

    Ensure-RuntimeLayout -Snapshot $Snapshot

    $initDbExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'initdb.exe'
    $passwordFile = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    try {
        Set-Content -Path $passwordFile -Value $Snapshot.Password -Encoding ascii
        & $initDbExe -D $Snapshot.ClusterDir -U $Snapshot.User -A scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) {
            throw 'initdb failed'
        }
        Sync-ClusterRuntimeSettings -Snapshot $Snapshot
    }
    finally {
        if (Test-Path $passwordFile) {
            Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-Cluster {
    param([hashtable]$Snapshot)

    if (Test-IsElevatedAdministrator) {
        Write-Host 'Embedded PostgreSQL cannot be started from an elevated Administrator terminal on Windows.'
        Write-Host 'Close the administrator terminal and rerun build\start_project.bat from a normal terminal.'
        return 5
    }

    Initialize-Cluster -Snapshot $Snapshot
    $serverOptions = "-h $($Snapshot.Host) -p $($Snapshot.Port)"
    $exitCode = Invoke-PgCtl -Snapshot $Snapshot -Arguments @(
        '-D', $Snapshot.ClusterDir,
        '-l', $Snapshot.LogFile,
        '-o', $serverOptions,
        'start',
        '-w'
    )
    if ($exitCode -eq 0) {
        return 0
    }

    if (Test-ClusterReady -Snapshot $Snapshot) {
        return 0
    }

    return $exitCode
}

function Stop-Cluster {
    param([hashtable]$Snapshot)

    if (-not (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf)) {
        return 0
    }

    return Invoke-PgCtl -Snapshot $Snapshot -Arguments @(
        '-D', $Snapshot.ClusterDir,
        'stop',
        '-m', 'fast',
        '-w'
    )
}

function Get-ClusterStatus {
    param([hashtable]$Snapshot)

    if (-not (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf)) {
        Write-Host 'Embedded PostgreSQL cluster has not been initialized yet.'
        return 1
    }

    return Invoke-PgCtl -Snapshot $Snapshot -Arguments @(
        '-D', $Snapshot.ClusterDir,
        'status'
    )
}

try {
    $snapshot = Get-RuntimeSnapshot

    if (-not $snapshot.EmbeddedEnabled) {
        Write-Host 'This project is built around embedded PostgreSQL.'
        Write-Host 'The current runtime configuration is not in embedded mode.'
        Write-Host 'If you want to restore the required embedded runtime configuration on this machine,'
        Write-Host 'you can run build\repair_embedded_pg.bat and then rerun this command.'
        exit 2
    }

    if (-not (Test-RuntimeAvailable -Snapshot $snapshot)) {
        Write-Host 'Missing embedded PostgreSQL runtime for this project.'
        Write-Host "Required runtime binaries were not found under $($snapshot.BinDir)."
        Write-Host 'If you want to provision the embedded runtime on this machine,'
        Write-Host 'you can run build\repair_embedded_pg.bat and then rerun this command.'
        exit 2
    }

    switch ($Action) {
        'init' {
            Initialize-Cluster -Snapshot $snapshot
            Write-Host "Embedded PostgreSQL cluster is ready at $($snapshot.ClusterDir)."
            exit 0
        }
        'start' {
            $exitCode = Start-Cluster -Snapshot $snapshot
            if ($exitCode -eq 5) {
                exit 5
            }
            if ($exitCode -ne 0) {
                throw "Failed to start embedded PostgreSQL (exit code $exitCode)."
            }
            Write-Host "Embedded PostgreSQL started on $($snapshot.Host):$($snapshot.Port)."
            exit 0
        }
        'stop' {
            $exitCode = Stop-Cluster -Snapshot $snapshot
            if ($exitCode -ne 0) {
                throw "Failed to stop embedded PostgreSQL (exit code $exitCode)."
            }
            Write-Host 'Embedded PostgreSQL stopped.'
            exit 0
        }
        'restart' {
            $stopCode = Stop-Cluster -Snapshot $snapshot
            if ($stopCode -ne 0) {
                throw "Failed to stop embedded PostgreSQL before restart (exit code $stopCode)."
            }
            $startCode = Start-Cluster -Snapshot $snapshot
            if ($startCode -eq 5) {
                exit 5
            }
            if ($startCode -ne 0) {
                throw "Failed to restart embedded PostgreSQL (exit code $startCode)."
            }
            Write-Host "Embedded PostgreSQL restarted on $($snapshot.Host):$($snapshot.Port)."
            exit 0
        }
        'status' {
            $statusCode = Get-ClusterStatus -Snapshot $snapshot
            exit $statusCode
        }
        'reset' {
            $null = Stop-Cluster -Snapshot $snapshot
            if (Test-Path $snapshot.ClusterDir) {
                Remove-Item $snapshot.ClusterDir -Recurse -Force
            }
            Write-Host 'Embedded PostgreSQL cluster directory removed.'
            exit 0
        }
    }
}
catch {
    Write-Error $_
    exit 3
}