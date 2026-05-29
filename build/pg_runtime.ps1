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

function Initialize-Cluster {
    param([hashtable]$Snapshot)

    if (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf) {
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

        $postgresqlConfig = Join-Path $Snapshot.ClusterDir 'postgresql.conf'
        Add-Content -Path $postgresqlConfig -Value "listen_addresses = '$($Snapshot.Host)'"
        Add-Content -Path $postgresqlConfig -Value "port = $($Snapshot.Port)"
    }
    finally {
        if (Test-Path $passwordFile) {
            Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-Cluster {
    param([hashtable]$Snapshot)

    Initialize-Cluster -Snapshot $Snapshot
    $pgCtlExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_ctl.exe'
    $serverOptions = "-h $($Snapshot.Host) -p $($Snapshot.Port)"
    & $pgCtlExe -D $Snapshot.ClusterDir -l $Snapshot.LogFile -o $serverOptions start -w
    return $LASTEXITCODE
}

function Stop-Cluster {
    param([hashtable]$Snapshot)

    if (-not (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf)) {
        return 0
    }

    $pgCtlExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_ctl.exe'
    & $pgCtlExe -D $Snapshot.ClusterDir stop -m fast -w
    return $LASTEXITCODE
}

function Get-ClusterStatus {
    param([hashtable]$Snapshot)

    if (-not (Test-Path (Join-Path $Snapshot.ClusterDir 'PG_VERSION') -PathType Leaf)) {
        Write-Host 'Embedded PostgreSQL cluster has not been initialized yet.'
        return 1
    }

    $pgCtlExe = Get-RuntimeBinaryPath -Snapshot $Snapshot -FileName 'pg_ctl.exe'
    & $pgCtlExe -D $Snapshot.ClusterDir status
    return $LASTEXITCODE
}

try {
    $snapshot = Get-RuntimeSnapshot

    if (-not $snapshot.EmbeddedEnabled) {
        Write-Host 'Embedded PostgreSQL is disabled in runtime config.'
        exit 0
    }

    if (-not (Test-RuntimeAvailable -Snapshot $snapshot)) {
        Write-Host "Embedded PostgreSQL binaries not found under $($snapshot.BinDir)."
        Write-Host "Place a portable PostgreSQL + PostGIS runtime there, or update backend/runtime_config.json."
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