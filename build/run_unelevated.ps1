param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath,
    [string[]]$Arguments = @(),
    [switch]$Wait,
    [int]$WaitTimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'

function Convert-ToCommandToken {
    param([string]$Value)

    if ($Value -match '^[A-Za-z0-9._/:=-]+$') {
        return $Value
    }

    return '"' + $Value.Replace('"', '""') + '"'
}

function New-TaskActionArguments {
    param(
        [string]$TargetPath,
        [string[]]$TargetArguments
    )

    $commandParts = @((Convert-ToCommandToken -Value $TargetPath))
    foreach ($argument in $TargetArguments) {
        $commandParts += (Convert-ToCommandToken -Value ([string]$argument))
    }

    return '/c "' + [string]::Join(' ', $commandParts) + '"'
}

try {
    $resolvedCommandPath = (Resolve-Path $CommandPath).Path
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $taskName = 'CopilotRunUnelevated_' + [guid]::NewGuid().ToString('N')
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $root = $service.GetFolder('\')

    $task = $service.NewTask(0)
    $task.RegistrationInfo.Description = 'Copilot temporary unelevated launcher'
    $task.Settings.Enabled = $true
    $task.Settings.Hidden = $true
    $task.Settings.StartWhenAvailable = $true
    $task.Settings.ExecutionTimeLimit = 'PT0S'
    $task.Settings.MultipleInstances = 0
    $task.Principal.UserId = $identity.Name
    $task.Principal.LogonType = 3
    $task.Principal.RunLevel = 0

    $action = $task.Actions.Create(0)
    $action.Path = 'cmd.exe'
    $action.Arguments = New-TaskActionArguments -TargetPath $resolvedCommandPath -TargetArguments $Arguments

    $null = $root.RegisterTaskDefinition($taskName, $task, 6, $null, $null, 3, $null)
    try {
        $registeredTask = $root.GetTask("\$taskName")
        $null = $registeredTask.Run($null)

        if ($Wait) {
            $deadline = (Get-Date).AddSeconds($WaitTimeoutSeconds)
            do {
                Start-Sleep -Milliseconds 200
                $state = $registeredTask.State
                if ($state -ne 4) {
                    break
                }
            } while ((Get-Date) -lt $deadline)
        }
    }
    finally {
        try {
            $root.DeleteTask($taskName, 0)
        }
        catch {
        }
    }
}
catch {
    Write-Error $_
    exit 1
}