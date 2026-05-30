param(
    [string]$SourceRoot,
    [switch]$Force,
    [switch]$DryRun
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
        RuntimeConfigPath = [string]$snapshot.SURVEY_RUNTIME_CONFIG_PATH
        EmbeddedEnabled = [bool]$snapshot.SURVEY_EMBEDDED_POSTGRES_ENABLED
        Host = [string]$snapshot.SURVEY_POSTGRES_HOST
        Port = [int]$snapshot.SURVEY_POSTGRES_PORT
        RuntimeDir = [string]$snapshot.SURVEY_POSTGRES_RUNTIME_DIR
        BinDir = [string]$snapshot.SURVEY_POSTGRES_BIN_DIR
        ClusterDir = [string]$snapshot.SURVEY_POSTGRES_CLUSTER_DIR
        LogFile = [string]$snapshot.SURVEY_POSTGRES_LOG_FILE
    }
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string[]]$Names
    )

    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -eq $property) {
            continue
        }

        $value = [string]$property.Value
        if ($value.Trim()) {
            return $value.Trim()
        }
    }

    return ''
}

function Set-PropertyValue {
    param(
        [object]$Object,
        [string]$Name,
        $Value
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
        return
    }

    $Object.$Name = $Value
}

function Ensure-ChildObject {
    param(
        [object]$Object,
        [string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property -and $null -ne $property.Value) {
        return $property.Value
    }

    $child = [pscustomobject]@{}
    if ($null -eq $property) {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $child
    }
    else {
        $Object.$Name = $child
    }
    return $child
}

function Get-DefaultRuntimeConfig {
    return [pscustomobject]@{
        backend = [pscustomobject]@{
            host = '127.0.0.1'
            port = 8000
        }
        database = [pscustomobject]@{
            embedded = $true
            driver = 'postgresql+psycopg'
            host = '127.0.0.1'
            port = 5432
            user = 'postgres'
            password = 'postgres123'
            database = 'survey_potrol_system'
            admin_database = 'postgres'
            runtime_dir = 'runtime/postgresql'
            bin_dir = 'runtime/postgresql/bin'
            cluster_dir = 'data/postgresql/cluster'
            log_file = 'data/postgresql/log/postgresql.log'
        }
    }
}

function Load-RuntimeConfig {
    param([string]$Path)

    if (-not (Test-Path $Path -PathType Leaf)) {
        return Get-DefaultRuntimeConfig
    }

    $rawText = Get-Content -Path $Path -Raw -Encoding utf8
    if (-not $rawText.Trim()) {
        return Get-DefaultRuntimeConfig
    }

    return $rawText | ConvertFrom-Json
}

function Save-RuntimeConfig {
    param(
        [object]$Config,
        [string]$Path
    )

    $parentDir = Split-Path -Parent $Path
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    $json = $Config | ConvertTo-Json -Depth 6
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Convert-ToVersion {
    param([string]$Text)

    $match = [regex]::Match([string]$Text, '(?<major>\d+)(?:\.(?<minor>\d+))?')
    if (-not $match.Success) {
        return [version]'0.0'
    }

    $major = $match.Groups['major'].Value
    $minor = if ($match.Groups['minor'].Success) { $match.Groups['minor'].Value } else { '0' }
    return [version]"$major.$minor"
}

function Normalize-PostgresRoot {
    param([string]$Path)

    if (-not $Path) {
        return ''
    }

    $resolved = (Resolve-Path $Path).Path
    if ((Split-Path -Leaf $resolved).ToLowerInvariant() -eq 'bin') {
        return Split-Path -Parent $resolved
    }
    return $resolved
}

function Test-PostgresRuntimeRoot {
    param([string]$Root)

    if (-not $Root) {
        return $false
    }

    $requiredPaths = @(
        'bin\pg_ctl.exe',
        'bin\initdb.exe',
        'bin\postgres.exe',
        'share'
    )

    foreach ($relativePath in $requiredPaths) {
        if (-not (Test-Path (Join-Path $Root $relativePath))) {
            return $false
        }
    }

    return $true
}

function Get-PostgresRuntimeVersion {
    param([string]$Root)

    $postgresExe = Join-Path $Root 'bin\postgres.exe'
    if (-not (Test-Path $postgresExe -PathType Leaf)) {
        return ''
    }

    $versionOutput = & $postgresExe --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ''
    }

    $match = [regex]::Match([string]$versionOutput, '(?<major>\d+)(?:\.(?<minor>\d+))?')
    if (-not $match.Success) {
        return ''
    }

    if ($match.Groups['minor'].Success) {
        return "$($match.Groups['major'].Value).$($match.Groups['minor'].Value)"
    }
    return $match.Groups['major'].Value
}

function New-PostgresCandidate {
    param(
        [string]$Root,
        [string]$Version,
        [string]$Source
    )

    try {
        $normalizedRoot = Normalize-PostgresRoot -Path $Root
    }
    catch {
        return $null
    }

    if (-not (Test-PostgresRuntimeRoot -Root $normalizedRoot)) {
        return $null
    }

    $resolvedVersion = $Version
    if (-not [string]::IsNullOrWhiteSpace($resolvedVersion)) {
        $resolvedVersion = $resolvedVersion.Trim()
    }
    if (-not $resolvedVersion) {
        $resolvedVersion = Get-PostgresRuntimeVersion -Root $normalizedRoot
    }

    return [pscustomobject]@{
        Root = $normalizedRoot
        Version = $resolvedVersion
        SortVersion = Convert-ToVersion -Text $resolvedVersion
        Source = $Source
    }
}

function Get-PostgresInstallCandidates {
    $candidates = New-Object System.Collections.Generic.List[object]

    if (Test-Path 'HKLM:\SOFTWARE\PostgreSQL\Installations') {
        foreach ($key in Get-ChildItem 'HKLM:\SOFTWARE\PostgreSQL\Installations') {
            $props = Get-ItemProperty $key.PSPath
            $baseDir = Get-PropertyValue -Object $props -Names @(
                'Base Directory',
                'Base_Directory',
                'BaseDirectory',
                'Installation Directory',
                'Installation_Directory',
                'InstallationDirectory'
            )
            $version = Get-PropertyValue -Object $props -Names @('Version', 'Version Number')
            $candidate = New-PostgresCandidate -Root $baseDir -Version $version -Source 'registry'
            if ($null -ne $candidate) {
                $candidates.Add($candidate)
            }
        }
    }

    if (Test-Path 'C:\Program Files\PostgreSQL') {
        foreach ($dir in Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory) {
            $candidate = New-PostgresCandidate -Root $dir.FullName -Version $dir.Name -Source 'program-files'
            if ($null -ne $candidate) {
                $candidates.Add($candidate)
            }
        }
    }

    $pgCtlCommand = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $pgCtlCommand) {
        $candidate = New-PostgresCandidate -Root (Split-Path -Parent $pgCtlCommand.Source) -Version '' -Source 'path'
        if ($null -ne $candidate) {
            $candidates.Add($candidate)
        }
    }

    $deduped = @{}
    foreach ($candidate in $candidates | Sort-Object -Property SortVersion, Root -Descending) {
        if (-not $deduped.ContainsKey($candidate.Root)) {
            $deduped[$candidate.Root] = $candidate
        }
    }

    return $deduped.Values | Sort-Object -Property SortVersion, Root -Descending
}

function Test-PortAvailable {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Select-EmbeddedPort {
    param([int]$RequestedPort)

    $candidatePorts = @($RequestedPort, 55432, 55433, 55434, 15432, 25432) | Select-Object -Unique
    foreach ($candidatePort in $candidatePorts) {
        if (Test-PortAvailable -Port $candidatePort) {
            return $candidatePort
        }
    }

    throw 'No available TCP port was found for the embedded PostgreSQL runtime.'
}

function Update-EmbeddedRuntimeConfig {
    param(
        [string]$ConfigPath,
        [int]$SelectedPort,
        [switch]$ApplyChanges
    )

    $config = Load-RuntimeConfig -Path $ConfigPath
    $databaseConfig = Ensure-ChildObject -Object $config -Name 'database'

    $currentPort = 5432
    $rawPort = Get-PropertyValue -Object $databaseConfig -Names @('port')
    if ($rawPort) {
        try {
            $currentPort = [int]$rawPort
        }
        catch {
            $currentPort = 5432
        }
    }

    $embeddedChanged = -not [bool](Get-PropertyValue -Object $databaseConfig -Names @('embedded'))
    $portChanged = $currentPort -ne $SelectedPort

    Set-PropertyValue -Object $databaseConfig -Name 'embedded' -Value $true
    Set-PropertyValue -Object $databaseConfig -Name 'port' -Value $SelectedPort

    if ($ApplyChanges -and ($embeddedChanged -or $portChanged)) {
        Save-RuntimeConfig -Config $config -Path $ConfigPath
    }

    return [pscustomobject]@{
        EmbeddedChanged = $embeddedChanged
        PortChanged = $portChanged
        PreviousPort = $currentPort
        SelectedPort = $SelectedPort
    }
}

function Copy-EmbeddedRuntime {
    param(
        [string]$Source,
        [string]$Destination,
        [switch]$ForceCopy
    )

    if ((Test-PostgresRuntimeRoot -Root $Destination) -and -not $ForceCopy) {
        return $false
    }

    $destinationParent = Split-Path -Parent $Destination
    if (-not (Test-Path $destinationParent)) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    if ($ForceCopy -and (Test-Path $Destination)) {
        Remove-Item $Destination -Recurse -Force
    }

    if (-not (Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -ItemType Directory -Force | Out-Null
    }

    foreach ($directoryName in @('bin', 'lib', 'share')) {
        $sourceDir = Join-Path $Source $directoryName
        if (-not (Test-Path $sourceDir -PathType Container)) {
            throw "Missing required directory in PostgreSQL source runtime: $sourceDir"
        }

        $destinationDir = Join-Path $Destination $directoryName
        if (Test-Path $destinationDir) {
            Remove-Item $destinationDir -Recurse -Force
        }
        Copy-Item $sourceDir -Destination $Destination -Recurse -Force
    }

    return $true
}

function Get-ClusterMajorVersion {
    param([string]$ClusterDir)

    $versionFile = Join-Path $ClusterDir 'PG_VERSION'
    if (-not (Test-Path $versionFile -PathType Leaf)) {
        return ''
    }

    return (Get-Content -Path $versionFile -TotalCount 1 -Encoding ascii).Trim()
}

function Assert-ClusterCompatibility {
    param(
        [string]$ClusterDir,
        [string]$RuntimeVersion,
        [switch]$ForceReset,
        [switch]$DryRunOnly
    )

    $clusterVersion = Get-ClusterMajorVersion -ClusterDir $ClusterDir
    if (-not $clusterVersion -or -not $RuntimeVersion) {
        return
    }

    $clusterMajor = $clusterVersion.Split('.')[0]
    $runtimeMajor = $RuntimeVersion.Split('.')[0]
    if ($clusterMajor -eq $runtimeMajor) {
        return
    }

    $message = "Existing embedded cluster version $clusterVersion is incompatible with runtime $RuntimeVersion."
    if (-not $ForceReset) {
        throw "$message Re-run build\\repair_embedded_pg.bat -Force to recreate backend/data/postgresql/cluster."
    }

    if ($DryRunOnly) {
        Write-Host "$message Dry run: the cluster would be recreated because -Force was supplied."
        return
    }

    if (Test-Path $ClusterDir) {
        Remove-Item $ClusterDir -Recurse -Force
    }
    Write-Host "Recreated incompatible embedded cluster directory: $ClusterDir"
}

function Invoke-PgRuntimeAction {
    param([string]$Action)

    $pgRuntimeScript = Join-Path $PSScriptRoot 'pg_runtime.ps1'
    powershell -NoProfile -ExecutionPolicy Bypass -File $pgRuntimeScript $Action
    if ($LASTEXITCODE -ne 0) {
        throw "build/pg_runtime.ps1 $Action failed with exit code $LASTEXITCODE."
    }
}

try {
    $snapshot = Get-RuntimeSnapshot
    $candidates = @()

    if ($SourceRoot) {
        $specifiedCandidate = New-PostgresCandidate -Root $SourceRoot -Version '' -Source 'argument'
        if ($null -eq $specifiedCandidate) {
            throw "The specified PostgreSQL source path is invalid or incomplete: $SourceRoot"
        }
        $candidates = @($specifiedCandidate)
    }
    else {
        $candidates = @(Get-PostgresInstallCandidates)
    }

    if ($candidates.Count -eq 0) {
        throw 'No local PostgreSQL installation was found. Install PostgreSQL locally or rerun build\\repair_embedded_pg.bat -SourceRoot "<PostgreSQL安装目录>".'
    }

    $selectedCandidate = $candidates[0]
    $selectedPort = Select-EmbeddedPort -RequestedPort $snapshot.Port
    $configUpdate = Update-EmbeddedRuntimeConfig -ConfigPath $snapshot.RuntimeConfigPath -SelectedPort $selectedPort -ApplyChanges:(-not $DryRun)

    if ($DryRun) {
        Write-Host "Dry run: selected PostgreSQL source [$($selectedCandidate.Source)] $($selectedCandidate.Root)"
        if ($configUpdate.EmbeddedChanged) {
            Write-Host 'Dry run: database.embedded would be forced to true.'
        }
        if ($configUpdate.PortChanged) {
            Write-Host "Dry run: embedded PostgreSQL port would change from $($configUpdate.PreviousPort) to $($configUpdate.SelectedPort)."
        }
        Write-Host "Dry run: runtime files would be copied to $($snapshot.RuntimeDir)"
        Write-Host "Dry run: embedded cluster would be initialized at $($snapshot.ClusterDir)"
        exit 0
    }

    $snapshot = Get-RuntimeSnapshot
    $runtimeVersion = Get-PostgresRuntimeVersion -Root $selectedCandidate.Root
    Assert-ClusterCompatibility -ClusterDir $snapshot.ClusterDir -RuntimeVersion $runtimeVersion -ForceReset:$Force -DryRunOnly:$DryRun

    $copied = Copy-EmbeddedRuntime -Source $selectedCandidate.Root -Destination $snapshot.RuntimeDir -ForceCopy:$Force
    if ($copied) {
        Write-Host "Copied PostgreSQL runtime from $($selectedCandidate.Root) to $($snapshot.RuntimeDir)."
    }
    else {
        Write-Host "Embedded PostgreSQL runtime already exists at $($snapshot.RuntimeDir); skipping copy."
    }

    if ($configUpdate.EmbeddedChanged) {
        Write-Host "Forced embedded PostgreSQL mode in $($snapshot.RuntimeConfigPath)."
    }
    if ($configUpdate.PortChanged) {
        Write-Host "Updated embedded PostgreSQL port from $($configUpdate.PreviousPort) to $($configUpdate.SelectedPort) in $($snapshot.RuntimeConfigPath)."
    }

    Invoke-PgRuntimeAction -Action 'init'
    Write-Host 'Embedded PostgreSQL repair completed.'
    Write-Host 'Next step: run build\start_project.bat'
    exit 0
}
catch {
    Write-Error $_
    exit 1
}