<#
.SYNOPSIS
  Supervises the copier: starts it, restarts it if it dies,
  and writes a rotating log.

.DESCRIPTION
  The upstream ops runbook listed "process supervisor restarts worker on
  crash" as a checklist item but never provided one. This is it.

  Deliberately NOT a Windows Service. MT5 is a GUI application that expects a
  real desktop session; services run in Session 0 with no window station, and
  MT5 under that is a well-known source of flaky, hard-to-diagnose behaviour.
  So this runs as a scheduled task in the logged-in session instead — see
  install-autostart.ps1.

  The worker launches and logs into the MT5 terminals itself via
  mt5.initialize(path, login, password, server), so there is nothing to start
  first and no terminal to log in by hand.

.PARAMETER WorkerRoot
  This folder. Defaults to wherever this script lives, so you can just run
  .\run.ps1 with no arguments.

.PARAMETER MaxBackoffSeconds
  Ceiling on the restart delay. Backoff doubles from 5s up to this.

.EXAMPLE
  .\run.ps1
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot,
    [int]$MaxBackoffSeconds = 120
)

$ErrorActionPreference = "Continue"

$venvPython = Join-Path $WorkerRoot "venv\Scripts\python.exe"
$entrypoint = Join-Path $WorkerRoot "scripts\run_copier.py"
$logDir     = Join-Path $WorkerRoot "logs"
$logFile    = Join-Path $logDir "supervisor.log"

if (-not (Test-Path $venvPython)) {
    Write-Host "Worker venv missing at $venvPython" -ForegroundColor Red
    Write-Host "Run .\setup.ps1 in this folder first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $entrypoint)) {
    Write-Host "Entrypoint missing at $entrypoint" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-CopierLog($message, $colour = "Gray") {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Write-Host $line -ForegroundColor $colour
    Add-Content -Path $logFile -Value $line
}

# Keep the supervisor log from growing without bound. The worker writes its own
# structured logs separately; this file is only the restart history.
if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 5MB)) {
    Move-Item $logFile "$logFile.1" -Force
    Write-CopierLog "rotated supervisor log"
}

Write-CopierLog "supervisor starting" "Cyan"
Write-CopierLog "worker root : $WorkerRoot"
Write-CopierLog "python      : $venvPython"

# A machine that has just booted often has no network for a few seconds. Trying
# immediately produces a confusing first failure in the log every single time.
# A TCP connect to the gateway itself, not an ICMP ping: many networks and most
# VPS providers drop ICMP, so a ping test would report "no network" on a machine
# that is perfectly fine. This also checks the thing we actually depend on.
Write-CopierLog "waiting for network..."
$probeHost = "onbirijlwcxykdgxxsvy.supabase.co"
$networkUp = $false
foreach ($attempt in 1..30) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async  = $client.BeginConnect($probeHost, 443, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne(2000, $false) -and $client.Connected) {
            $client.Close(); $networkUp = $true; break
        }
        $client.Close()
    } catch {
        # Deliberately swallowed: this is a retry loop and a single failed
        # attempt during boot carries no information worth logging 30 times.
    }
    Start-Sleep -Seconds 2
}
if ($networkUp) { Write-CopierLog "network up" "Green" }
else { Write-CopierLog "no network after 60s — starting anyway, the worker retries" "Yellow" }

$backoff  = 5
$restarts = 0
$startedAt = Get-Date

while ($true) {
    Write-CopierLog "starting copier loop (restart #$restarts)" "Cyan"
    $runStart = Get-Date

    Push-Location $WorkerRoot
    try {
        & $venvPython $entrypoint
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = -1
        Write-CopierLog "launch threw: $($_.Exception.Message)" "Red"
    } finally {
        Pop-Location
    }

    $ranFor = [int]((Get-Date) - $runStart).TotalSeconds
    Write-CopierLog "copier loop exited with code $exitCode after ${ranFor}s" "Yellow"

    # A process that ran for a while and then died is a transient fault: reset
    # the backoff so the next restart is immediate. A process that dies in
    # seconds is misconfigured, and hammering it just fills the log — that is
    # the case the growing delay is for.
    if ($ranFor -ge 60) {
        $backoff = 5
    } else {
        $backoff = [Math]::Min($backoff * 2, $MaxBackoffSeconds)
        Write-CopierLog "died quickly - check logs\ and .env" "Red"
    }

    $restarts++
    $uptime = [int]((Get-Date) - $startedAt).TotalMinutes
    Write-CopierLog "restarting in ${backoff}s  (supervisor up ${uptime}m, $restarts restarts)"
    Start-Sleep -Seconds $backoff
}
