<#
.SYNOPSIS
  Clone a broker's MT5 install so each account gets its own terminal.

.DESCRIPTION
  MT5 allows ONE login per terminal instance. Accounts sharing a terminal64.exe
  therefore queue behind each other, and the worker must switch login between
  them -- roughly 2.6s per switch, so the fifth follower on a shared install
  fires about 13 seconds after the master.

  Worse, a master and a follower sharing an install race over that single login,
  and a lost race sends the copy to the wrong account.

  Give every account its own folder and both problems disappear: each gets a
  dedicated pool worker with a warm session that never logs out. Login switching
  drops to 0 ms and copies run in parallel.

  MT5 keys its data directory off the install path, so separate folders are
  genuinely separate instances. No /portable flag is used, because the worker
  launches terminal64.exe without one and the two must agree.

  Safe to re-run: an existing destination is skipped, never overwritten.

.PARAMETER Broker
  moneta, ftmo, exness, fusion, or all. Uses the known install paths.

.PARAMETER Source
  Override the source folder if your install is somewhere else.

.PARAMETER Count
  How many copies per broker. Default 5.

.PARAMETER Destination
  Where clones go. Default C:\MT5.

.EXAMPLE
  .\clone-terminals.ps1 -Broker exness -Count 5

.EXAMPLE
  .\clone-terminals.ps1 -Broker all -Count 5
#>
[CmdletBinding()]
param(
    [ValidateSet("moneta", "ftmo", "exness", "fusion", "all")]
    [string]$Broker = "all",
    [string]$Source,
    [ValidateRange(1, 20)]
    [int]$Count = 5,
    [string]$Destination = "C:\MT5"
)

$ErrorActionPreference = "Stop"

function Step($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "   [ok]   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   [warn] $text" -ForegroundColor Yellow }
function Bad($text)  { Write-Host "   [fail] $text" -ForegroundColor Red }

# Must match src/features/copier/brokerPresets.ts.
$known = [ordered]@{
    moneta = "C:\Program Files\Moneta Markets MT5 Terminal"
    ftmo   = "C:\Program Files\FTMO Global Markets MT5 Terminal"
    exness = "C:\Program Files\MetaTrader 5 EXNESS"
    fusion = "C:\Program Files\Fusion Markets MetaTrader 5"
}

$targets = if ($Broker -eq "all") { $known.Keys } else { @($Broker) }
$created = New-Object System.Collections.ArrayList

foreach ($name in $targets) {
    $src = if ($Source -and $Broker -ne "all") { $Source } else { $known[$name] }

    Step "$name  <-  $src"

    if (-not (Test-Path (Join-Path $src "terminal64.exe"))) {
        Bad "no terminal64.exe here - skipping. Pass -Source if it is installed elsewhere."
        continue
    }

    $sizeBytes = (Get-ChildItem $src -Recurse -File -ErrorAction SilentlyContinue |
                  Measure-Object -Property Length -Sum).Sum
    $sizeMb = [math]::Round($sizeBytes / 1MB)
    Ok "source is $sizeMb MB"

    $driveLetter = (Split-Path -Qualifier $Destination).TrimEnd(":")
    $free = (Get-PSDrive -Name $driveLetter).Free
    $needed = $sizeBytes * $Count
    if ($free -lt $needed) {
        Bad ("needs {0} MB, only {1} MB free on {2}: - skipping" -f `
             [math]::Round($needed / 1MB), [math]::Round($free / 1MB), $driveLetter)
        continue
    }

    for ($i = 1; $i -le $Count; $i++) {
        $dst = Join-Path $Destination "$name-$i"

        if (Test-Path (Join-Path $dst "terminal64.exe")) {
            Ok "$dst already exists - left alone"
            [void]$created.Add([pscustomobject]@{ Broker = $name; Path = (Join-Path $dst "terminal64.exe"); New = $false })
            continue
        }

        Write-Host "   copying -> $dst ..." -NoNewline
        # robocopy rather than Copy-Item: an MT5 tree is thousands of small
        # files and this is several times faster. /XD logs skips the one folder
        # that is large and regenerates itself.
        $null = robocopy $src $dst /E /XD logs /NFL /NDL /NJH /NJS /NP /R:1 /W:1
        # robocopy exit codes below 8 are success; 8+ means files were missed.
        if ($LASTEXITCODE -ge 8) {
            Write-Host ""
            Bad "robocopy reported errors (exit $LASTEXITCODE) for $dst"
            continue
        }
        if (-not (Test-Path (Join-Path $dst "terminal64.exe"))) {
            Write-Host ""
            Bad "copy finished but terminal64.exe is missing in $dst"
            continue
        }
        Write-Host " done" -ForegroundColor Green
        [void]$created.Add([pscustomobject]@{ Broker = $name; Path = (Join-Path $dst "terminal64.exe"); New = $true })
    }
}

if ($created.Count -eq 0) {
    Warn "nothing was created."
    exit 1
}

Step "Terminal paths - paste these into the app"
Write-Host "   Trade Copier -> the account -> Fix credentials -> Terminal path`n"
foreach ($row in $created) {
    $tag = if ($row.New) { "new " } else { "kept" }
    Write-Host ("   [{0}] {1}" -f $tag, $row.Path)
}

Step "Before these will trade"
Write-Host "   For EACH folder above, once:"
Write-Host "     1. Launch its terminal64.exe"
Write-Host "     2. Log in to the account that will use it"
Write-Host "     3. Turn AutoTrading ON (Ctrl+E) - it is per terminal, and a"
Write-Host "        fresh copy defaults to OFF. This is the single most common"
Write-Host "        reason a copy fails with the order never being placed."
Write-Host "     4. Set that account's Terminal path in the app to match"
Write-Host "`n   Then restart the worker. Login switching should read 0 ms."
