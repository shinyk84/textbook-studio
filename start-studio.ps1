param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$studioRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthUrl = "http://127.0.0.1:8000/api/health"
$siteUrl = "http://127.0.0.1:8000/"

function Test-StudioRunning {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        return $health.status -eq "ok"
    }
    catch {
        return $false
    }
}

if (-not (Test-StudioRunning)) {
    $occupied = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if ($occupied) {
        throw "Port 8000 is already in use by another program."
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw "Python was not found. Check the Python installation and PATH."
    }

    $dataDir = Join-Path $studioRoot "data"
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    $outputLog = Join-Path $dataDir "server-output.log"
    $errorLog = Join-Path $dataDir "server-error.log"

    Start-Process `
        -FilePath $python.Source `
        -ArgumentList @("app.py", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $studioRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outputLog `
        -RedirectStandardError $errorLog

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        if (Test-StudioRunning) {
            $ready = $true
            break
        }
    }
    if (-not $ready) {
        throw "The service did not start. Check data\server-error.log."
    }
}

if (-not $NoBrowser) {
    Start-Process $siteUrl
}

Write-Host "Textbook Studio is running: $siteUrl"
