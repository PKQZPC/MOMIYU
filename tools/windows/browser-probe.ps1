# Real Edge window, native input and the production UI Automation collector.
param([switch]$Private,[ValidatePattern('^[a-z0-9-]+$')][string]$RunName='browser-live',[ValidateSet('page','chat')][string]$Scenario='page')
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace ('.local/windows-capture/'+$RunName))
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
$env:PSModuleAnalysisCachePath=Join-Path $env:TEMP 'module-analysis-cache'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase,System.Windows.Forms
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class BrowserProbe {
 [DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,Input[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)] struct Input{public uint type;public Union u;}
 [StructLayout(LayoutKind.Explicit)] struct Union{[FieldOffset(0)]public KeyInput key;[FieldOffset(0)]public MouseInput mouse;}
 [StructLayout(LayoutKind.Sequential)] struct KeyInput{public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct MouseInput{public int x,y;public uint data,flags,time;public UIntPtr extra;}
 public static void TypeText(string text){foreach(char c in text){var a=new Input[2];a[0].type=a[1].type=1;a[0].u.key.scan=a[1].u.key.scan=c;a[0].u.key.flags=4;a[1].u.key.flags=6;if(SendInput(2,a,Marshal.SizeOf(typeof(Input)))!=2)throw new Exception("native_text_input_failed");}}
 public static void Key(ushort key,bool up){var a=new Input[1];a[0].type=1;a[0].u.key.vk=key;a[0].u.key.flags=up?2u:0u;SendInput(1,a,Marshal.SizeOf(typeof(Input)));}
 public static void SelectAll(){Key(17,false);Key(65,false);Key(65,true);Key(17,true);}
 public struct Point{public int X,Y;}
}
'@
$privacyFlag=if($Private){'--inprivate'}else{''}
if($Private){$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/browser-private')}
$observer=$null;$owned=$null;$events=New-Object Collections.Generic.List[object];$checks=New-Object Collections.Generic.List[string]
$null=[BrowserProbe]::SetProcessDpiAwarenessContext([IntPtr](-4))
$previous=[BrowserProbe]::GetForegroundWindow()
try {
 $edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
 $profile=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/browser-probe/profile')
 $page=Join-Path $workspace $(if($Scenario -eq 'chat'){'tests/windows/chat-evidence.html'}else{'tests/windows/browser-evidence.html'})
 $windowTitle=if($Scenario -eq 'chat'){'MOMIYU Chat Verification*'}else{'MOMIYU Capture Verification*'}
 $null=Start-Process -FilePath $edge -ArgumentList "--user-data-dir=`"$profile`" --no-first-run --no-default-browser-check $privacyFlag --disable-features=Translate,msEdgeTranslate --new-window `"$page`"" -WindowStyle Hidden -PassThru
 for($i=0;$i -lt 60;$i++){$owned=Get-Process msedge -ErrorAction SilentlyContinue|Where-Object {$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $windowTitle}|Select-Object -First 1;if($owned){break};Start-Sleep -Milliseconds 200}
 if(!$owned){throw 'owned_edge_window_not_found'}
 $hwnd=$owned.MainWindowHandle
 [void][BrowserProbe]::ShowWindow($hwnd,9);[void][BrowserProbe]::ShowWindow($hwnd,5);[void][BrowserProbe]::SetForegroundWindow($hwnd)
 $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe';$info.Arguments="-NoProfile -STA -ExecutionPolicy Bypass -File `"$workspace/packages/windows-capture/observer.ps1`" -AllowedApps msedge -OnlyProcessId $($owned.Id)";$info.WorkingDirectory=$workspace;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 $observer=New-Object Diagnostics.Process;$observer.StartInfo=$info;[void]$observer.Start();$script:pending=$observer.StandardOutput.ReadLineAsync()
 function Pump([int]$ms){$until=[DateTime]::UtcNow.AddMilliseconds($ms);while([DateTime]::UtcNow -lt $until){if($script:pending.IsCompleted){$line=$script:pending.Result;if($line){$events.Add(($line|ConvertFrom-Json))};$script:pending=$observer.StandardOutput.ReadLineAsync()};if($observer.HasExited){throw ('observer_failed: '+$observer.StandardError.ReadToEnd())};Start-Sleep -Milliseconds 20}}
 function Element([string]$name){$root=[Windows.Automation.AutomationElement]::FromHandle($hwnd);$condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$name);$e=$root.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition);if(!$e){$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)|Select-Object -First 120|ForEach-Object {@{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;offscreen=$_.Current.IsOffscreen}}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $out 'missing-control.json') -Encoding utf8;throw "missing_control: $name"};return $e}
 function Click([string]$name){$null=[BrowserProbe]::SetThreadDpiAwarenessContext([IntPtr](-4));$e=Element $name;if($name -in @("Route query","Message input")){$root=[Windows.Automation.AutomationElement]::FromHandle($hwnd);$e=$root.FindFirst([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Edit)));$edits=$root.FindAll([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$name)));foreach($item in $edits){if($item.Current.ControlType -eq [Windows.Automation.ControlType]::Edit){$e=$item;break}}};[void][BrowserProbe]::SetForegroundWindow($hwnd);$e.SetFocus();Pump 150;$r=$e.Current.BoundingRectangle;$p=New-Object BrowserProbe+Point;$p.X=[int]($r.Left+$r.Width/2);$p.Y=[int]($r.Top+$r.Height/2);if([BrowserProbe]::GetAncestor([BrowserProbe]::WindowFromPoint($p),2) -ne $hwnd){throw ("owned_browser_covered: "+$name+" point="+$p.X+","+$p.Y+" hit="+[BrowserProbe]::GetAncestor([BrowserProbe]::WindowFromPoint($p),2)+" expected="+$hwnd+" rect="+$r.ToString())};[void][BrowserProbe]::SetCursorPos($p.X,$p.Y);[BrowserProbe]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[BrowserProbe]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 function TypeOwned([string]$value){if([BrowserProbe]::GetForegroundWindow() -ne $hwnd){throw 'browser_lost_focus'};[BrowserProbe]::TypeText($value);Pump 700}
 Pump 5000
 [void][BrowserProbe]::ShowWindow($hwnd,9);[void][BrowserProbe]::ShowWindow($hwnd,5);[void][BrowserProbe]::SetForegroundWindow($hwnd)
 $rootRect=[Windows.Automation.AutomationElement]::FromHandle($hwnd).Current.BoundingRectangle
 [void][BrowserProbe]::SetCursorPos([int]($rootRect.Left+220),[int]($rootRect.Top+12));[BrowserProbe]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[BrowserProbe]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Pump 1800
 if($Private){if($events|Where-Object type -eq event){throw 'private_window_content_collected'};if(!($events|Where-Object {$_.type -eq 'coverage' -and $_.status -eq 'private_window_excluded'})){throw 'private_window_not_identified'};@{status='passed';private_window_excluded=$true;model_calls=0}|ConvertTo-Json|Set-Content (Join-Path $out 'report.json') -Encoding utf8;Write-Output 'Private browser exclusion passed.';return}
 if($Scenario -eq 'chat'){
   Click 'Message input';TypeOwned 'UNSENT_CHAT_DRAFT_SENTINEL'
   if(($events|ConvertTo-Json -Depth 18) -like '*UNSENT_CHAT_DRAFT_SENTINEL*'){throw 'chat_draft_leaked'};$checks.Add('unsubmitted_chat_draft_excluded')
   [BrowserProbe]::SelectAll();Pump 150;TypeOwned 'I can bring the route map.';Click 'Send message';Pump 3000
   if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.view.text -like '*I can bring the route map.*' -and ($_.value.view.structure|Where-Object {$_.name -eq 'Sent by You at 10:02'})})){throw 'chat_send_not_captured'};$checks.Add('sent_message_visible_outside_editor')
   if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.view.text -like '*Map received*'})){throw 'passive_received_message_not_captured'};$checks.Add('received_message_without_extra_input')
   Click 'Open workshop group';Pump 3000
   if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.view.text -like '*workshop starts at noon*'})){throw 'switched_chat_passive_message_missing'};$checks.Add('second_conversation_and_group_layout')
   foreach($n in 1..2){Click 'Message input';TypeOwned 'Noted.';[BrowserProbe]::Key(13,$false);[BrowserProbe]::Key(13,$true);Pump 1300}
   if(($events|ConvertTo-Json -Depth 18) -like '*HIDDEN_CHAT_SENTINEL*'){throw 'hidden_chat_collected'};$checks.Add('hidden_messages_excluded')
   @{status='passed';checks=$checks;scenario='chat';native_input=$true;model_calls=0;created_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out 'report.json') -Encoding utf8
   Write-Output ('Native browser chat capture passed '+$checks.Count+' checks.');return
 }
 if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.view.text -like '*Compare routes*'})){throw 'browser_page_text_not_captured'};$checks.Add('actual_edge_page_text_and_url')
 Click 'Route query';TypeOwned 'UNSENT_DRAFT_SENTINEL'
 if(($events|ConvertTo-Json -Depth 14) -like '*UNSENT_DRAFT_SENTINEL*'){throw 'unsent_draft_leaked'};$checks.Add('draft_not_persisted')
 [BrowserProbe]::SelectAll();Pump 150;TypeOwned 'riverside accessible route';Click 'Submit search';Pump 2200
 if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.kind -eq 'submission' -and $_.value.submission.text -eq 'riverside accessible route'})){throw 'click_submission_not_captured'};$checks.Add('native_click_confirmed_submission')
 Click 'Route query';TypeOwned 'woodland shelter route';[BrowserProbe]::Key(13,$false);[BrowserProbe]::Key(13,$true);Pump 2200
 if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.kind -eq 'submission' -and $_.value.submission.text -eq 'woodland shelter route'})){throw 'enter_submission_not_captured'};$checks.Add('native_enter_confirmed_submission')
 Click 'Only accessible routes';Pump 1500
 if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.view.text -like '*Filter applied*'})){throw 'filter_result_not_captured'};$checks.Add('operation_object_and_result')
 Click 'Open route details';Pump 1500
 if(!($events|Where-Object {$_.type -eq 'event' -and $_.value.page_url -like '*route-details'})){throw 'navigation_url_not_captured'};$checks.Add('navigation_identity')
 Click 'Show protected input';Pump 1500
 if(($events|ConvertTo-Json -Depth 14) -like '*PASSWORD_CAPTURE_SENTINEL*'){throw 'password_leaked'};$checks.Add('protected_input_omitted')
 @{status='passed';checks=$checks;browser='Microsoft Edge';native_input=$true;model_calls=0;created_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out 'report.json') -Encoding utf8
 Write-Output ('Actual browser capture passed '+$checks.Count+' checks.')
} finally {
 $events|ConvertTo-Json -Depth 16|Set-Content (Join-Path $out 'events.json') -Encoding utf8
 if($observer -and !$observer.HasExited){$observer.Kill();$observer.WaitForExit()}
 if($owned){try{$root=[Windows.Automation.AutomationElement]::FromHandle($hwnd);$pattern=$root.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern);$pattern.Close()}catch{}}
 [void][BrowserProbe]::SetForegroundWindow($previous)
}
