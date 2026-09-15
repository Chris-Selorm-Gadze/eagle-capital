<#
.SYNOPSIS
  Answer "Test connection" from the dashboard. Run this while setting accounts up.

.DESCRIPTION
  A newly connected account reads "Disconnected" in the dashboard. That is the
  column default, not a verdict: nothing in the browser and nothing in the
  gateway can reach a broker, so only this worker can ever change it.

  This registers, heartbeats, and services commands -- none of which needs an
  armed copy link. Use it to verify every login BEFORE arming anything, because
  arming is the step that starts placing real orders.

  Ctrl+C to stop. Once every account reads Connected, arm a link and use
  .\run.ps1 instead, which services commands itself.

.EXAMPLE
  .\test-connections.ps1
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

$venvPython = Join-Path $WorkerRoot "venv\Scripts\python.exe"
$entrypoint = Join-Path $WorkerRoot "scripts\poll_commands.py"

if (-not (Test-Path $venvPython)) {
    Write-Host "Worker venv missing. Run .\setup.ps1 in this folder first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $WorkerRoot ".env"))) {
    Write-Host "No .env in this folder. Run .\setup.ps1, then fill it in." -ForegroundColor Red
    exit 1
}

Push-Location $WorkerRoot
try {
    & $venvPython $entrypoint
} finally {
    Pop-Location
}
