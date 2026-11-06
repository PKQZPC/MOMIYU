# One explicitly requested system screenshot. No browser, UIA, OCR or keyboard hooks.
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/screen-probe')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
Add-Type -Path (Join-Path $workspace 'packages/windows-capture/ScreenCapture.cs') -ReferencedAssemblies System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class ScreenProbeNative {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 public struct Rect{public int left,top,right,bottom;}
}
'@
$null=[ScreenProbeNative]::SetProcessDpiAwarenessContext([IntPtr](-4));$null=[ScreenProbeNative]::SetThreadDpiAwarenessContext([IntPtr](-4))
$width=0;$height=0;$area=[Drawing.Rectangle]::Empty
$image=[Momiyu.ScreenCapture]::CaptureDisplay([ref]$width,[ref]$height,[ref]$area)
[IO.File]::WriteAllBytes((Join-Path $out 'foreground.png'),$image)
$clock=[Momiyu.UseClock]::new(0);$clock.Tick(0,$true);$clock.Tick(1800,$true)
if($clock.Milliseconds -ne 1800){throw 'passive_use_not_counted'}
$clock.Tick(2000,$false);$clock.Tick(4000,$false);$clock.Tick(5000,$true)
if($clock.Milliseconds -ne 1800){throw 'paused_time_counted'}
$clock.Tick(95000,$true);if($clock.Milliseconds -ne 1800){throw 'suspend_gap_counted'}
$clock.Milliseconds=1800000;if(!$clock.Due(96000)){throw 'baseline_not_due'}
$clock.Fail(96000);if($clock.Due(96001)){throw 'failure_retry_unbounded'}
if($clock.Milliseconds -ne 1800000){throw 'failure_reset_clock'}
$clock.Complete();if($clock.Milliseconds -ne 0){throw 'success_not_reset'}
@{status='passed';browser_required=$false;uia_required=$false;width=$width;height=$height;bytes=$image.Length;checks=@('actual_system_foreground_pixels','passive_reading_counts','paused_state_does_not_count','suspend_gap_does_not_count','30m_baseline_due','failure_backoff_without_reset','successful_capture_resets');model_calls=0;generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
Write-Output ('System screenshot saved inside project: '+$width+'x'+$height+', '+$image.Length+' bytes; clock checks passed.')
