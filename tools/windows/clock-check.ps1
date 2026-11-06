# Fast-forwards the production clock without waiting or taking a screenshot.
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Web.Extensions
Add-Type -Path (Join-Path $workspace 'packages/windows-capture/ScreenCapture.cs') -ReferencedAssemblies System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
$clock=[Momiyu.UseClock]::new(0);$clock.Tick(0,$true)
for($i=1;$i -le 1799;$i++){$clock.Tick($i*1000,$true)}
if($clock.Due(1799000)){throw 'capture_before_30_minutes'}
$clock.Tick(1800000,$true);if(!$clock.Due(1800000)){throw 'capture_not_due_at_30_minutes'}
$clock.Complete();$clock.Tick(1801000,$true);if($clock.Due(1801000)){throw 'success_did_not_restart_interval'}
$before=$clock.Milliseconds;$clock.Tick(1802000,$false);$clock.Tick(1803000,$false);$clock.Tick(1804000,$true)
if($clock.Milliseconds -ne $before){throw 'inactive_time_counted'}
$clock.Tick(2000000,$true);if($clock.Milliseconds -ne $before){throw 'suspend_gap_counted'}
$clock.Milliseconds=1800000;$clock.Fail(2000000);if($clock.Due(2000001) -or $clock.Milliseconds -ne 1800000){throw 'failure_reset_or_immediate_retry'}
$resume=[Momiyu.UseClock]::new(900000);$resume.Tick(0,$true);for($i=1;$i -le 900;$i++){$resume.Tick($i*1000,$true)}
if(!$resume.Due(900000)){throw 'saved_use_time_not_resumed'}
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/independent-check')
@{status='passed';screenshots=0;simulated_time=$true;checks=@('no_capture_before_30m','passive_use_counts','due_at_30m','restart_after_success','inactive_time_pauses','suspend_gap_excluded','failure_does_not_reset_or_spin','resume_checkpoint');generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'clock-report.json') -Encoding utf8
Write-Output 'Production clock passed 8 checks; no screenshots taken.'
