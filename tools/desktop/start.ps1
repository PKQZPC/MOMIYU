param([string]$ElectronPath, [string]$DataDirectory, [switch]$Smoke, [switch]$VisibleCheck,[switch]$InspectUI)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'project-paths.ps1')
if (-not $ElectronPath) {
    $metadata = Join-Path $workspace 'tools/m0/.local/electron-runtime/runtime.json'
    if (-not (Test-Path -LiteralPath $metadata)) { throw 'Set -ElectronPath to an existing Electron 45.1.0 executable. See apps/desktop/README.md.' }
    $ElectronPath = (Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json).executable
}
if (-not (Test-Path -LiteralPath $ElectronPath -PathType Leaf)) { throw 'Electron executable not found.' }
$ElectronPath = (Resolve-Path -LiteralPath $ElectronPath).Path
if (-not $ElectronPath.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Keep the Electron runtime inside the project.' }
$profile = New-ProjectDirectory $workspace $(if ($Smoke) { Join-Path $workspace '.local/desktop/smoke-data' } elseif ($DataDirectory) { $DataDirectory } else { Join-Path $workspace '.local/desktop/profiles/default' })
$appDirectory = Join-Path $workspace 'apps/desktop'
$arguments = '"' + $appDirectory + '" "--user-data-dir=' + $profile + '"'
if ($Smoke) { $arguments += ' --smoke' }
if ($VisibleCheck) {if (-not $Smoke) {throw '-VisibleCheck requires -Smoke'};$arguments += ' --visible-check'}
if($InspectUI){if($Smoke){throw '-InspectUI is for the actual profile, not smoke'};$arguments+=' --inspect-ui'}
$previousDirectory = $env:MOMIYU_DATA_DIR
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    if ($Smoke -or $DataDirectory) { $env:MOMIYU_DATA_DIR = $profile }
    else { Remove-Item Env:MOMIYU_DATA_DIR -ErrorAction SilentlyContinue }
    $env:TEMP = New-ProjectDirectory $workspace (Join-Path $profile 'tmp')
    $env:TMP = $env:TEMP
    $logDirectory = New-ProjectDirectory $workspace (Join-Path $workspace '.local/desktop')
    $logPrefix = if ($Smoke) { '' } else { [Guid]::NewGuid().ToString('N') + '-' }
    $process = Start-Process -FilePath $ElectronPath -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory ($logPrefix + 'stdout.log')) -RedirectStandardError (Join-Path $logDirectory ($logPrefix + 'stderr.log'))
    if ($Smoke) {
        # Windows PowerShell 5.1 needs a cached handle to retain ExitCode.
        $null = $process.Handle
        if (-not $process.WaitForExit(45000)) { Stop-Process -Id $process.Id -Force; throw 'Owned smoke process exceeded its deadline.' }
        $process.Refresh()
        if ($null -eq $process.ExitCode) { throw 'Owned process exit code is unavailable.' }
        if ($process.ExitCode -ne 0) { throw 'Desktop smoke failed. Inspect .local/desktop/smoke.json and stderr.log.' }
        $reportText = Get-Content -LiteralPath (Join-Path $logDirectory 'smoke.json') -Raw
        $report = $reportText | ConvertFrom-Json
        if ($report.process_id -ne $process.Id -or $report.status -ne 'passed') { throw 'Stale or failed smoke report.' }
        $reportText
    } else { Write-Output ('MOMIYU started. Process ID: ' + $process.Id) }
} finally {
    if ($null -eq $previousDirectory) { Remove-Item Env:MOMIYU_DATA_DIR -ErrorAction SilentlyContinue } else { $env:MOMIYU_DATA_DIR = $previousDirectory }
    if ($null -eq $previousNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
    $env:TEMP=$previousTemp
    $env:TMP=$previousTmp
}
