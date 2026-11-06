# Unpacked fixture-directory smoke test, not an installer or self-contained Python bundle.
param([ValidateSet('offscreen','desktop')][string]$Mode = 'offscreen')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stage = Join-Path $PSScriptRoot '.local/package-smoke'
$files = @('tools/m0/fixtures/electron-main.cjs','tools/m0/fixtures/probe_composition.py','tools/m0/lib/render-pixels.cjs','tests/fixtures/m0/transparent-window.html','tests/fixtures/m0/backdrop-window.html')
foreach ($relative in $files) {
    $destination = Join-Path $stage $relative
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $relative) -Destination $destination
}
'{"name":"momiyu-m0-package-smoke","version":"0.0.0","main":"tools/m0/fixtures/electron-main.cjs","private":true}' | Set-Content -LiteralPath (Join-Path $stage 'package.json') -Encoding UTF8
$runtime = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.local/electron-runtime/runtime.json') -Raw | ConvertFrom-Json
if (-not $env:MOMIYU_PYTHON) { throw 'Set MOMIYU_PYTHON.' }
$env:MOMIYU_ELECTRON_MODE = $Mode
$stageOutput = Join-Path $stage 'tools/m0/.local'
New-Item -ItemType Directory -Path $stageOutput -Force | Out-Null
$started = [DateTime]::UtcNow
$process = Start-Process -FilePath $runtime.executable -ArgumentList ('"' + $stage + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stageOutput 'stdout.log') -RedirectStandardError (Join-Path $stageOutput 'stderr.log')
try {
    if (-not $process.WaitForExit(35000)) { Stop-Process -Id $process.Id -Force; throw 'Owned smoke-test deadline exceeded.' }
    $report = Get-Content -LiteralPath (Join-Path $stageOutput ('electron-' + $Mode + '.json')) -Raw | ConvertFrom-Json
    if (([DateTime]$report.generated_at).ToUniversalTime() -lt $started.AddSeconds(-2)) { throw 'Stale stage report.' }
    $runtimeBytes = (Get-ChildItem -LiteralPath (Split-Path $runtime.executable) -File -Recurse | Measure-Object Length -Sum).Sum
    $result = [pscustomobject][ordered]@{schema_version='0.1.0';synthetic_only=$true;status=$report.status;mode=$Mode;launch_form='unpacked fixture directory with external Electron runtime';runtime_bytes=$runtimeBytes;python_bundled=$false;checks=$report.checks;app_metrics=$report.app_metrics}
    $result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $PSScriptRoot '.local/package-smoke.json') -Encoding UTF8
    $result | Select-Object status,launch_form,runtime_bytes,python_bundled,checks | ConvertTo-Json -Depth 5
    if ($process.ExitCode -ne 0) { exit 1 }
} finally { Remove-Item Env:MOMIYU_ELECTRON_MODE -ErrorAction SilentlyContinue }
