<#
.SYNOPSIS
  One-time preparation of a Windows machine to run the Delta Engine copier worker.

.DESCRIPTION
  Configures the handful of Windows defaults that silently stop a copier: sleep,
  USB power management, Defender scanning the worker's own files, and update
  reboots landing in the middle of a session.

  Everything here is reversible and printed as it happens. Nothing is installed
  and nothing is exposed to the network — the worker only ever dials OUT, so no
  firewall rule, port forward or static IP is needed or created.

  Run this on the test PC now and, unchanged, on the VPS later. That is the point
  of it being a script rather than a checklist: the move should be a re-run, not
  a rediscovery.

.PARAMETER WorkerRoot
  This folder. Defaults to wherever this script lives.

.PARAMETER Mt5Root
  Folder holding the per-account MT5 installs, e.g. C:\MT5

.EXAMPLE
  .\prepare-host.ps1 -Mt5Root "C:\Program Files"

.NOTES
  Must be run as Administrator. Written against Windows 10/11.
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot,
    [string]$Mt5Root = "C:\MT5"
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "   [ok]   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   [warn] $text" -ForegroundColor Yellow }

# --- Administrator check ----------------------------------------------------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script must run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell -> Run as administrator, then run it again." -ForegroundColor Red
    exit 1
}

Write-Host "=== Preparing this machine as a copier worker host ===" -ForegroundColor White
Write-Host "Worker root : $WorkerRoot"
Write-Host "MT5 root    : $Mt5Root"

# --- Power ------------------------------------------------------------------
# Sleep is the single most common cause of a copier that "just stopped
# overnight". On AC power this machine should never sleep, never hibernate, and
# never turn the disks off.
Step "Power: disabling sleep, hibernate and disk spin-down on AC"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 15   # screen may sleep; the machine may not
powercfg /hibernate off
Ok "machine will stay awake on mains power"

# USB selective suspend can drop a USB ethernet adapter or a licence dongle
# mid-session. Harmless to disable on an always-on box.
Step "Power: disabling USB selective suspend"
try {
    $scheme = (powercfg /getactivescheme) -replace '.*GUID: ([0-9a-fA-F-]+).*', '$1'
    powercfg /setacvalueindex $scheme 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
    powercfg /setactive $scheme
    Ok "USB selective suspend off"
} catch {
    Warn "could not change USB suspend setting: $($_.Exception.Message)"
}

# --- Windows Update ---------------------------------------------------------
# A forced reboot mid-session is the second most common killer. Active Hours
# stops automatic restarts inside the window — it does NOT stop updates
# downloading or installing, and on Home edition it is most of what you get.
Step "Windows Update: setting active hours to 00:00-23:00"
try {
    $key = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name "ActiveHoursStart" -Value 0    -Type DWord
    Set-ItemProperty -Path $key -Name "ActiveHoursEnd"   -Value 23   -Type DWord
    Set-ItemProperty -Path $key -Name "IsActiveHoursEnabled" -Value 1 -Type DWord
    Ok "active hours 00:00-23:00 (the widest Windows allows)"
    Warn "This reduces surprise reboots. It cannot prevent them entirely."
    Warn "Windows Pro can defer feature updates properly; Home cannot."
} catch {
    Warn "could not set active hours: $($_.Exception.Message)"
}

# --- Defender exclusions ----------------------------------------------------
# Real-time scanning of a process that opens hundreds of files per second adds
# latency, and AV has been known to quarantine terminal64.exe outright.
Step "Defender: excluding the worker and MT5 installs"
foreach ($path in @($WorkerRoot, $Mt5Root)) {
    if (Test-Path $path) {
        try {
            Add-MpPreference -ExclusionPath $path -ErrorAction Stop
            Ok "excluded $path"
        } catch {
            Warn "could not exclude $path : $($_.Exception.Message)"
        }
    } else {
        Warn "$path does not exist yet — re-run this after creating it"
    }
}

# --- Network sanity ---------------------------------------------------------
Step "Network: checking the connection type"
$wifi = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -match 'Wireless|Wi-Fi|802\.11' }
$eth  = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Wireless|Wi-Fi|802\.11|Loopback|Virtual' }
if ($eth)  { Ok "wired adapter up: $($eth[0].Name)" }
if ($wifi -and -not $eth) {
    Warn "This machine is on Wi-Fi with no wired link."
    Warn "Use ethernet. Wi-Fi drops are brief but a dropped copy is not."
}

# --- Python -----------------------------------------------------------------
Step "Python: checking for a usable interpreter"
$pythonOk = $false
$probe = "import sys; print('.'.join(map(str, sys.version_info[:2])))"
$candidates = @(
    @{ exe = "py";     args = @("-3.12", "-c", $probe) },
    @{ exe = "py";     args = @("-3.11", "-c", $probe) },
    @{ exe = "python"; args = @("-c", $probe) }
)
foreach ($c in $candidates) {
    if (-not (Get-Command $c.exe -ErrorAction SilentlyContinue)) { continue }
    try {
        $ver = & $c.exe @($c.args) 2>$null
        if ($LASTEXITCODE -eq 0 -and $ver) {
            Ok ("{0} {1} -> Python {2}" -f $c.exe, ($c.args[0]), $ver)
            $pythonOk = $true; break
        }
    } catch {
        Warn "probing $($c.exe) failed: $($_.Exception.Message)"
    }
}
if (-not $pythonOk) {
    Warn "No Python found. Install 3.12 from python.org, then run .\setup.ps1"
}

# --- Worker venv ------------------------------------------------------------
Step "Worker: checking the virtual environment"
$venvPython = Join-Path $WorkerRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    Ok "venv present"
    try {
        & $venvPython -c "import MetaTrader5; print('MetaTrader5', MetaTrader5.__version__)" 2>$null
        if ($LASTEXITCODE -eq 0) { Ok "MetaTrader5 module importable" }
        else { Warn "MetaTrader5 not importable in the venv - run .\setup.ps1 in this folder" }
    } catch {
        Warn "could not check MetaTrader5 import"
    }
} else {
    Warn "No venv at $venvPython - run .\setup.ps1 in this folder first"
}

# --- Summary ----------------------------------------------------------------
Write-Host "`n=== Done ===" -ForegroundColor White
Write-Host @"

Deliberately NOT done, because the worker only dials out:
  - no port forwarding
  - no inbound firewall rule
  - no static IP or dynamic DNS
  - nothing exposed to the internet

Still yours to do by hand:
  1. Auto-login, so the machine comes back by itself after a reboot:
       netplwiz  ->  untick "Users must enter a user name and password"
     Enable BitLocker if the machine is anywhere someone could walk off with it.
  2. Install Tailscale on this PC and your laptop/phone for remote access.
     Do NOT port-forward RDP — exposed 3389 gets brute-forced within hours.
  3. Fill in worker\.env  (see WINDOWS-SETUP.md)
  4. .\install-autostart.ps1   to start the copier at logon

"@ -ForegroundColor Gray
