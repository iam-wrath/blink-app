# Blink: start everything with one command (Windows PowerShell).
#   .\start.ps1            start detector (:8000), api (:3000) and web (:5173), each in its own window
#   .\start.ps1 -Prebake   same, then search the five challenge targets once so they are cached
#                          (they will then load with no internet and with the detector stopped)
# First run installs dependencies (needs internet). If scripts are blocked, run:
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
param([switch]$Prebake)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# ---- one-time setup ----
if (-not (Test-Path "$root\detector\.venv\Scripts\python.exe")) {
    Write-Host 'Setting up detector/.venv ...'
    Push-Location "$root\detector"
    py -m venv .venv
    .\.venv\Scripts\python -m pip install -r requirements.txt
    Pop-Location
}
foreach ($dir in 'api', 'web') {
    if (-not (Test-Path "$root\$dir\node_modules")) {
        Write-Host "Installing $dir dependencies ..."
        Push-Location "$root\$dir"
        npm install
        Pop-Location
    }
}

# ---- start the three services, each in its own window ----
Start-Process powershell -WorkingDirectory "$root\detector" -ArgumentList '-NoExit', '-Command',
    '$Host.UI.RawUI.WindowTitle = ''Blink detector :8000''; .\.venv\Scripts\python -m uvicorn main:app --port 8000'
Start-Process powershell -WorkingDirectory "$root\api" -ArgumentList '-NoExit', '-Command',
    '$Host.UI.RawUI.WindowTitle = ''Blink api :3000''; npx prisma generate; npx prisma migrate deploy; npm run build; node dist/main.js'
Start-Process powershell -WorkingDirectory "$root\web" -ArgumentList '-NoExit', '-Command',
    '$Host.UI.RawUI.WindowTitle = ''Blink web :5173''; npm run dev'

Write-Host 'Waiting for the API ...'
$up = $false
for ($i = 0; $i -lt 90 -and -not $up; $i++) {
    try { Invoke-RestMethod 'http://localhost:3000/api/targets' -TimeoutSec 2 | Out-Null; $up = $true }
    catch { Start-Sleep -Seconds 2 }
}
if (-not $up) { Write-Warning 'The API did not come up; check the "Blink api" window.'; exit 1 }

if ($Prebake) {
    $targets = Invoke-RestMethod 'http://localhost:3000/api/targets'   # assign first: PowerShell 5.1 would treat the array as one item
    $inv = [Globalization.CultureInfo]::InvariantCulture                # always a dot as decimal separator
    foreach ($t in $targets) {
        $det = if ($t.detector) { $t.detector } else { 'D2' }
        $coadd = if ($t.coadd) { $t.coadd } else { 'none' }   # same defaults the web app uses for this preset
        foreach ($mode in 'raw', 'diff') {
            $url = 'http://localhost:3000/api/frames?ra={0}&dec={1}&fov={2}&detector={3}&mode={4}&coadd={5}' -f `
                $t.ra.ToString($inv), $t.dec.ToString($inv), $t.fov.ToString($inv), $det, $mode, $coadd
            try {
                $r = Invoke-RestMethod $url -TimeoutSec 600
                Write-Host ('{0,-15} {1} {2,-4} coadd={3}: {4} frames' -f $t.name, $det, $mode, $coadd, $r.frames.Count)
            } catch {
                Write-Warning "$($t.name) $mode failed: $($_.Exception.Message)"
            }
        }
    }
}

Write-Host 'Blink is running: http://localhost:5173'
Start-Process 'http://localhost:5173'
