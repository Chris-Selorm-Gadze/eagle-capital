<#
.SYNOPSIS
  Print what the control plane hands this worker. The first thing to run when
  something looks wrong.

.DESCRIPTION
  Separates the three failures that look identical from the dashboard:
  a wrong API_URL (connection refused), a wrong WORKER_API_KEY (401), and a
  wrong WORKER_USER_ID -- which connects, authenticates, and then reports zero
  accounts, looking nothing like a misconfiguration.

.EXAMPLE
  .\show-config.ps1
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

$venvPython = Join-Path $WorkerRoot "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Worker venv missing. Run .\setup.ps1 in this folder first." -ForegroundColor Red
    exit 1
}

Push-Location $WorkerRoot
try {
    & $venvPython (Join-Path $WorkerRoot "scripts\show_config.py")
} finally {
    Pop-Location
}
