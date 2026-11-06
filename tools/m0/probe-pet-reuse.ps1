$ErrorActionPreference = 'Stop'
if (-not $env:MOMIYU_NODE) { throw 'Set MOMIYU_NODE to the existing Node executable.' }
if (-not $env:MOMIYU_QA_MODULES) { throw 'Set MOMIYU_QA_MODULES.' }
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fixtureModule = Join-Path $root 'tests/fixtures/m0/pet-pack.cjs'
$env:MOMIYU_M0_FIXTURE_MODULE = $fixtureModule
$env:MOMIYU_M0_PACK_ROOT = Join-Path $PSScriptRoot '.local/pet-reuse-packs'
try {
    & $env:MOMIYU_NODE -e 'const {createPack}=require(process.env.MOMIYU_M0_FIXTURE_MODULE),p=require("path"),fs=require("fs");for(const [name,version] of [["v1",1],["v2",2],["broken",2]])createPack(p.join(process.env.MOMIYU_M0_PACK_ROOT,name),version);fs.unlinkSync(p.join(process.env.MOMIYU_M0_PACK_ROOT,"broken","skill.png"));'
    if ($LASTEXITCODE -ne 0) { throw 'Fixture preparation failed.' }
    $runtime = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.local/electron-runtime/runtime.json') -Raw | ConvertFrom-Json
    $fixture = Join-Path $PSScriptRoot 'fixtures/pet-reuse-main.cjs'
    $started = [DateTime]::UtcNow
    $process = Start-Process -FilePath $runtime.executable -ArgumentList ('"' + $fixture + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot '.local/pet-reuse.stdout.log') -RedirectStandardError (Join-Path $PSScriptRoot '.local/pet-reuse.stderr.log')
    if (-not $process.WaitForExit(25000)) { Stop-Process -Id $process.Id -Force; throw 'Owned reuse probe timed out.' }
    $report = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.local/pet-reuse-window.json') -Raw | ConvertFrom-Json
    if (([DateTime]$report.generated_at).ToUniversalTime() -lt $started.AddSeconds(-2)) { throw 'Stale report.' }
    $report | Select-Object status,checks,error | ConvertTo-Json -Depth 5
    if ($process.ExitCode -ne 0) { exit 1 }
} finally {
    Remove-Item Env:MOMIYU_M0_FIXTURE_MODULE -ErrorAction SilentlyContinue
    Remove-Item Env:MOMIYU_M0_PACK_ROOT -ErrorAction SilentlyContinue
}
