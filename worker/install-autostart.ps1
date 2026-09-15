<#
.SYNOPSIS
  Registers the copier supervisor to start automatically at logon.

.DESCRIPTION
  Creates a Scheduled Task that runs run.ps1 when the chosen user logs
  in. Combined with auto-login, that means the machine comes back on its own
  after a power cut or an update reboot with no one at the keyboard.

  A logon task, not a service, on purpose: MT5 needs a real desktop session (see
  run.ps1). The task therefore runs interactively as the logged-in user,
  not as SYSTEM.

.PARAMETER WorkerRoot
  This folder. Defaults to wherever this script lives.

.PARAMETER TaskName
  Name of the scheduled task.

.PARAMETER Remove
  Unregister the task instead of creating it.

.EXAMPLE
  .\install-autostart.ps1
  .\install-autostart.ps1 -Remove
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot,
    [string]$TaskName = "EagleCapitalCopier",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "No scheduled task named '$TaskName'." -ForegroundColor Yellow
    }
    exit 0
}

if (-not $WorkerRoot) {
    Write-Host "-WorkerRoot is required (or pass -Remove)." -ForegroundColor Red
    exit 1
}

$supervisor = Join-Path $PSScriptRoot "run.ps1"
if (-not (Test-Path $supervisor)) {
    Write-Host "run.ps1 not found next to this script." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $WorkerRoot "scripts\run_copier.py"))) {
    Write-Host "That does not look like the worker directory: $WorkerRoot" -ForegroundColor Red
    exit 1
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized " +
               "-File `"$supervisor`" -WorkerRoot `"$WorkerRoot`"")

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Interactive, so MT5 gets a desktop session. Not "Highest" — the worker needs no
# elevation, and a task that runs elevated at logon is a standing risk for no gain.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

# ExecutionTimeLimit of zero means "never kill it". The default is 3 days, which
# would stop the copier without explanation on day four.

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Replaced the existing task." -ForegroundColor Yellow
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Delta Engine trade copier supervisor. Starts at logon, restarts on crash." | Out-Null

Write-Host "Registered scheduled task '$TaskName'." -ForegroundColor Green
Write-Host @"

  Runs as       : $env:USERDOMAIN\$env:USERNAME (interactive)
  Starts        : at logon
  Restarts      : yes, and the supervisor restarts the loop itself
  Time limit    : none

  Start it now without rebooting:
      Start-ScheduledTask -TaskName $TaskName

  Watch it:
      Get-Content "$WorkerRoot\logs\supervisor.log" -Wait -Tail 20

  Stop it:
      Stop-ScheduledTask -TaskName $TaskName

  Remove it:
      .\install-autostart.ps1 -Remove

  For this to survive a reboot with nobody present, the machine must auto-login:
      netplwiz  ->  untick "Users must enter a user name and password"

"@ -ForegroundColor Gray
