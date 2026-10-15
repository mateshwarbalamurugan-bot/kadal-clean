param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$OpenBrowser = $true
)

$ErrorActionPreference = 'Stop'
$backendDir = Join-Path $ProjectRoot 'backend'
$frontendDir = Join-Path $ProjectRoot 'frontend'
$weights = Join-Path $ProjectRoot 'models\clean_kadal_bottle_v2.pt'
$backendPython = Join-Path $backendDir '.venv\Scripts\python.exe'

if (-not (Test-Path $backendDir)) { throw "Backend folder not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend folder not found: $frontendDir" }
if (-not (Test-Path $backendPython)) {
  throw "Backend virtual environment missing. Run: cd `"$backendDir`"; py -3.11 -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
}
if (-not (Test-Path $weights)) {
  Write-Warning "Custom checkpoint missing at $weights. The backend will report/fall back to its baseline model. Copy clean_kadal_bottle_v2.pt into the models folder for the custom bottle detector."
}

$env:ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000,https://clean-kadal.vercel.app'
$env:CLEAN_KADAL_MODEL_PATH = $weights
$env:CLEAN_KADAL_IMAGE_SIZE = '1024'

$backendCommand = "Set-Location -LiteralPath `"$backendDir`"; & `"$backendPython`" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location -LiteralPath `"$frontendDir`"; npm run dev -- --host 127.0.0.1"

Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $backendCommand)
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $frontendCommand)

if ($OpenBrowser) {
  Start-Sleep -Seconds 3
  Start-Process 'http://localhost:3000'
}

Write-Host 'Clean Kadal local demo started.'
Write-Host 'Backend health: http://127.0.0.1:8000/health'
Write-Host 'Local dashboard: http://localhost:3000'
Write-Host 'Keep both terminal windows open during the demo.'
