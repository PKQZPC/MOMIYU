param([ValidateSet('offscreen','desktop')][string]$Mode = 'offscreen')
$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$runtime = Get-Content -LiteralPath (Join-Path $toolRoot '.local/electron-runtime/runtime.json') -Raw | ConvertFrom-Json
if (-not $env:MOMIYU_PYTHON) { throw 'Set MOMIYU_PYTHON to the probe Python executable.' }
$env:MOMIYU_ELECTRON_MODE = $Mode
$reportPath = Join-Path $toolRoot ('.local/electron-' + $Mode + '.json')
$outputPath = Join-Path $toolRoot ('.local/electron-' + $Mode + '.stdout.log')
$errorPath = Join-Path $toolRoot ('.local/electron-' + $Mode + '.stderr.log')
$fixture = Join-Path $toolRoot 'fixtures/electron-main.cjs'
$process = Start-Process -FilePath $runtime.executable -ArgumentList ('"' + $fixture + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput $outputPath -RedirectStandardError $errorPath
try {
    if (-not $process.WaitForExit(35000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw 'Owned Electron probe exceeded its deadline.'
    }
    if (-not (Test-Path -LiteralPath $reportPath)) { throw "Probe produced no report; inspect $errorPath" }
    $result = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($result.mode -ne $Mode -or ([DateTime]$result.generated_at).ToUniversalTime() -lt $process.StartTime.ToUniversalTime().AddSeconds(-2)) { throw 'Stale or mismatched report.' }
    $result | Select-Object mode,status,checks,pixels,elapsed_ms | ConvertTo-Json -Depth 5
    if ($process.ExitCode -ne 0) { exit 1 }
} finally {
    Remove-Item Env:MOMIYU_ELECTRON_MODE -ErrorAction SilentlyContinue
}
