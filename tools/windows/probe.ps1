$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/probe')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
$env:PSModuleAnalysisCachePath=Join-Path $env:TEMP 'module-analysis-cache'
$manifest=Join-Path $out ('fixture-'+[Guid]::NewGuid().ToString('N')+'.json')
$fixture=$null;$observer=$null
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class NativeProbe {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int mode);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h,uint message,IntPtr w,string value);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flag);
 public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public struct Point{public int X,Y;}
}
'@
$previousWindow=[NativeProbe]::GetForegroundWindow();$previousPoint=New-Object NativeProbe+Point;[void][NativeProbe]::GetCursorPos([ref]$previousPoint)
try{
 $shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
 $fixture=Start-Process -FilePath $shell -ArgumentList "-NoProfile -STA -File `"$workspace/tests/windows/fixture.ps1`" -ManifestPath `"$manifest`"" -WindowStyle Hidden -PassThru
 for($n=0;$n -lt 60 -and -not(Test-Path -LiteralPath $manifest);$n++){Start-Sleep -Milliseconds 100}
 $owned=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json;if($owned.pid -ne $fixture.Id){throw 'fixture_owner_mismatch'}
 $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$shell;$info.Arguments="-NoProfile -STA -File `"$workspace/packages/windows-capture/observer.ps1`" -AllowedApps powershell -OnlyProcessId $($fixture.Id)";$info.WorkingDirectory=$workspace;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 $observer=New-Object Diagnostics.Process;$observer.StartInfo=$info;[void]$observer.Start();$pendingLine=$observer.StandardOutput.ReadLineAsync();$events=New-Object Collections.Generic.List[object];$checks=New-Object Collections.Generic.List[string]
 function Pump([int]$milliseconds){$until=[DateTime]::UtcNow.AddMilliseconds($milliseconds);while([DateTime]::UtcNow -lt $until){if($pendingLine.IsCompleted){$line=$pendingLine.Result;if($line){$events.Add(($line|ConvertFrom-Json))};$script:pendingLine=$observer.StandardOutput.ReadLineAsync()};if($observer.HasExited){throw ('helper_failed: '+$observer.StandardError.ReadToEnd())};Start-Sleep -Milliseconds 30}}
 Pump 3000
 [void][NativeProbe]::ShowWindow([IntPtr]$owned.root,9);[void][NativeProbe]::ShowWindow([IntPtr]$owned.root,5);[void][NativeProbe]::SetForegroundWindow([IntPtr]$owned.root)
 $rect=New-Object NativeProbe+Rect;[void][NativeProbe]::GetWindowRect([IntPtr]$owned.root,[ref]$rect);$point=New-Object NativeProbe+Point;$point.X=$rect.Left+100;$point.Y=$rect.Top+15
 if([NativeProbe]::GetAncestor([NativeProbe]::WindowFromPoint($point),2).ToInt64() -ne $owned.root){throw 'owned_window_covered'}
 [void][NativeProbe]::SetCursorPos($point.X,$point.Y);[NativeProbe]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[NativeProbe]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Pump 900
 $rootElement=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$owned.root);$editElement=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$owned.edit)
 @{root_offscreen=$rootElement.Current.IsOffscreen;edit_offscreen=$editElement.Current.IsOffscreen;root_rect=$rootElement.Current.BoundingRectangle.ToString();foreground_matches=([NativeProbe]::GetForegroundWindow().ToInt64() -eq $owned.root)}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'visibility.json') -Encoding utf8
 if(-not ($events|Where-Object {$_.type -eq 'ready' -and $_.mouse_hook})){throw 'native_mouse_hook_not_ready'};$checks.Add('native_helper_and_mouse_hook')
 if(-not ($events|Where-Object {$_.type -eq 'event' -and $_.value.kind -eq 'foreground' -and $_.value.view.text -like '*Initial readable*'})){throw 'foreground_text_missing'};$checks.Add('real_foreground_and_interface_text')
 [void][NativeProbe]::SendMessage([IntPtr]$owned.edit,12,[IntPtr]::Zero,'UNSUBMITTED_NATIVE_SENTINEL')
 function ClickOwned([long]$handle){$element=[Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle);$r=$element.Current.BoundingRectangle;[void][NativeProbe]::SetCursorPos([int]($r.Left+$r.Width/2),[int]($r.Top+$r.Height/2));[NativeProbe]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[NativeProbe]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 ClickOwned $owned.error;Pump 1000
 if(($events|ConvertTo-Json -Depth 12) -like '*UNSUBMITTED_NATIVE_SENTINEL*'){throw 'draft_leaked'};$checks.Add('nonempty_edit_content_not_persisted')
 ClickOwned $owned.button;Pump 1400
 if(-not ($events|Where-Object {$_.type -eq 'event' -and $_.value.kind -eq 'action' -and $_.value.target.name -eq 'Apply choice' -and $_.value.actor -eq 'injected_input_source_unknown'})){throw 'semantic_target_missing'};$checks.Add('real_click_target_and_injected_attribution')
 if(-not ($events|Where-Object {$_.type -eq 'event' -and $_.value.kind -eq 'result' -and $_.value.view.text -like '*choice applied*' -and $_.value.result_for})){throw 'separate_result_missing'};$checks.Add('separate_observed_result_link')
 ClickOwned $owned.protect;Pump 1000
 if(($events|ConvertTo-Json -Depth 12) -like '*PROTECTED_NATIVE_SENTINEL*'){throw 'protected_content_leaked'};$checks.Add('password_and_visible_echo_omitted')
 if($events|Where-Object {$_.type -eq 'event' -and $_.value.process_id -ne $fixture.Id}){throw 'outside_fixture_collected'};$checks.Add('only_explicit_fixture_pid')
 $events|ConvertTo-Json -Depth 14|Set-Content -LiteralPath (Join-Path $out 'events.json') -Encoding utf8
 @{status='passed';checks=$checks;synthetic_only=$true;model_calls=0;captured_events=@($events|Where-Object type -eq event).Count;generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
 Write-Output ('Windows collector passed '+$checks.Count+' checks.')
}finally{
 if($events){$events|ConvertTo-Json -Depth 14|Set-Content -LiteralPath (Join-Path $out 'events.json') -Encoding utf8}
 if($observer -and -not $observer.HasExited){$observer.Kill();$observer.WaitForExit()}
 if($fixture -and -not $fixture.HasExited){[void]$fixture.CloseMainWindow();if(-not $fixture.WaitForExit(2000)){$fixture.Kill()}}
 [void][NativeProbe]::SetCursorPos($previousPoint.X,$previousPoint.Y);[void][NativeProbe]::SetForegroundWindow($previousWindow)
}
