<#
.SYNOPSIS
  One-time setup: create the venv, install dependencies, create .env.

.DESCRIPTION
  Run this once on a new machine. It is safe to re-run -- an existing venv is
  reused and an existing .env is never overwritten.

  MetaTrader5 is a Windows-only package. This will fail anywhere else, which is
  correct: the worker drives MT5 terminals and has nothing to do on Linux.

.EXAMPLE
  .\setup.ps1
#>
[CmdletBinding()]
param(
    [string]$WorkerRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "   [ok]   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   [warn] $text" -ForegroundColor Yellow }

Step "Locating Python"
$python = $null
foreach ($candidate in @("py -3.12", "py -3", "python")) {
    $exe, $arg = $candidate -split " ", 2
    try {
        $version = if ($arg) { & $exe $arg --version 2>$null } else { & $exe --version 2>$null }
        if ($LASTEXITCODE -eq 0 -and $version) {
            $python = $candidate
            Ok "$candidate -> $version"
            break
        }
    } catch {
        # Candidate not on PATH. Try the next one rather than failing here --
        # "py" is absent on plenty of working Python installs.
    }
}
if (-not $python) {
    Write-Host "No Python found. Install 3.12 from python.org (tick 'Add to PATH')." -ForegroundColor Red
    exit 1
}

Step "Creating venv"
$venvPython = Join-Path $WorkerRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    Ok "venv already exists (reusing)"
} else {
    $exe, $arg = $python -split " ", 2
    if ($arg) { & $exe $arg -m venv (Join-Path $WorkerRoot "venv") }
    else      { & $exe -m venv (Join-Path $WorkerRoot "venv") }
    if (-not (Test-Path $venvPython)) {
        Write-Host "venv creation failed." -ForegroundColor Red
        exit 1
    }
    Ok "created"
}

Step "Installing dependencies"
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r (Join-Path $WorkerRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "pip install failed." -ForegroundColor Red
    exit 1
}
Ok "installed"

Step "Checking MetaTrader5 import"
& $venvPython -c "import MetaTrader5; print('MetaTrader5', MetaTrader5.__version__)"
if ($LASTEXITCODE -ne 0) {
    Warn "MetaTrader5 did not import. The worker cannot trade until it does."
}

Step "Environment file"
$envFile    = Join-Path $WorkerRoot ".env"
$envExample = Join-Path $WorkerRoot ".env.example"
if (Test-Path $envFile) {
    Ok ".env already exists (left untouched)"
} elseif (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Ok "created .env from .env.example"
    Warn "Fill in WORKER_API_KEY and WORKER_USER_ID before starting the worker."
} else {
    Warn "No .env.example found -- create .env by hand."
}

Write-Host "`nNext:" -ForegroundColor Cyan
Write-Host "  1. Edit .env             (API_URL, WORKER_API_KEY, WORKER_USER_ID)"
Write-Host "  2. .\show-config.ps1     (confirms the control plane sees you)"
Write-Host "  3. .\test-connections.ps1 (verify every broker login)"
Write-Host "  4. .\run.ps1             (start copying, once a link is armed)"
