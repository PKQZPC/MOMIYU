# Native mouse/keyboard operations on the ACTUAL running default-profile app.
# Read-only inspection metadata is used only to locate and verify controls.
param([ValidateSet('inspect','run','quit')][string]$Stage='inspect')
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/desktop/live-audit')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $out 'tmp');$env:TMP=$env:TEMP
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Drawing;using System.Runtime.InteropServices;
public class LiveMouse {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flag);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,Input[] inputs,int size);
 [StructLayout(LayoutKind.Sequential)] struct Input{public uint type;public Union u;}
 [StructLayout(LayoutKind.Explicit)] struct Union{[FieldOffset(0)]public KeyInput key;[FieldOffset(0)]public MouseInput mouse;}
 [StructLayout(LayoutKind.Sequential)] struct KeyInput{public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct MouseInput{public int x,y;public uint data,flags,time;public UIntPtr extra;}
 public static void TypeText(string text){foreach(char c in text){var a=new Input[2];a[0].type=a[1].type=1;a[0].u.key.scan=a[1].u.key.scan=c;a[0].u.key.flags=4;a[1].u.key.flags=6;if(SendInput(2,a,Marshal.SizeOf(typeof(Input)))!=2)throw new Exception("native_text_input_failed");}}
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,int data,UIntPtr extra);
 public struct Rect{public int left,top,right,bottom;}
}
'@ -ReferencedAssemblies System.Drawing
$null=[LiveMouse]::SetProcessDpiAwarenessContext([IntPtr](-4));$null=[LiveMouse]::SetThreadDpiAwarenessContext([IntPtr](-4))
function State {Get-Content -LiteralPath (Join-Path $out 'state.json') -Raw|ConvertFrom-Json}
function Wait([scriptblock]$condition,[string]$checkLabel){for($i=0;$i -lt 60;$i++){$s=State;if(&$condition $s){return $s};Start-Sleep -Milliseconds 100};throw ('actual_ui_check_failed: '+$checkLabel)}
function MoveCursor([Drawing.Point]$p){[void][LiveMouse]::SetCursorPos($p.X,$p.Y);[LiveMouse]::mouse_event(1,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 240}
function PointFor($view,$rect){$client=New-Object LiveMouse+Rect;$origin=[Drawing.Point]::new(0,0);$h=[IntPtr]([long]$view.hwnd);[void][LiveMouse]::GetClientRect($h,[ref]$client);[void][LiveMouse]::ClientToScreen($h,[ref]$origin);[Drawing.Point]::new([int]($origin.X+($rect.x+$rect.width/2)*$client.right/$view.viewport.width),[int]($origin.Y+($rect.y+$rect.height/2)*$client.bottom/$view.viewport.height))}
function ClickPoint([Drawing.Point]$point,[long]$handle,[switch]$Double){MoveCursor $point;if([LiveMouse]::GetAncestor([LiveMouse]::WindowFromPoint($point),2).ToInt64() -ne $handle){throw 'target_is_not_owned_or_not_interactive'};[LiveMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 50;[LiveMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);if($Double){Start-Sleep -Milliseconds 80;[LiveMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 50;[LiveMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
function Body { $s=State;$b=$s.pet.actor.paintBounds;$c=$s.pet.canvas;$r=@{x=$c.x+($b.x+$b.width*.5)*$c.width/520;y=$c.y+($b.y+$b.height*.62)*$c.height/440;width=0;height=0};PointFor $s.pet $r }
function HoverBody {$point=Body;MoveCursor $point;try{Wait {param($s)$s.pet.controlsVisible} 'actual hover reveals controls'|Out-Null}catch{$actual=[Drawing.Point]::new(0,0);[void][LiveMouse]::GetCursorPos([ref]$actual);Write-Output ('Native hover expected='+$point+' actual='+$actual+' root='+[LiveMouse]::GetAncestor([LiveMouse]::WindowFromPoint($actual),2).ToInt64());throw}}
function Control([string]$name){HoverBody;$s=State;ClickPoint (PointFor $s.pet $s.pet.controls.$name) ([long]$s.pet.hwnd)}
function Page([string]$name){$s=State;ClickPoint (PointFor $s.panel $s.panel.controls.$name) ([long]$s.panel.hwnd);Wait {param($s)$s.panel.page -eq $name} ('page '+$name)|Out-Null;[Windows.Forms.SendKeys]::SendWait('^{HOME}');Start-Sleep -Milliseconds 250}
function Capture([string]$name,[string]$window='pet'){$s=State;& (Join-Path $PSScriptRoot 'capture-window.ps1') -WindowHandle ([long]$s.$window.hwnd) -OutputPath (Join-Path $out ($name+'.png'))}
function HidePanel {$s=State;if(!$s.panel.visible){return};if([LiveMouse]::GetForegroundWindow().ToInt64() -ne [long]$s.panel.hwnd){Control 'open';Start-Sleep -Milliseconds 350;$s=State};$h=[IntPtr]([long]$s.panel.hwnd);$r=New-Object LiveMouse+Rect;$origin=[Drawing.Point]::new(0,0);[void][LiveMouse]::GetWindowRect($h,[ref]$r);[void][LiveMouse]::ClientToScreen($h,[ref]$origin);$scale=($r.right-$r.left)/$s.panel.bounds.width;ClickPoint ([Drawing.Point]::new([int]($r.right-23*$scale),[int](($r.top+$origin.Y)/2))) ([long]$s.panel.hwnd);Wait {param($s)!$s.panel.visible} 'native panel close hides it'|Out-Null}
$live=State;$processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+$live.process_id)
if(!$processInfo -or !$processInfo.ExecutablePath.StartsWith($workspace+'\',[StringComparison]::OrdinalIgnoreCase) -or !$processInfo.CommandLine.Contains('--inspect-ui') -or ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($live.generated_at)).TotalSeconds -gt 3){throw 'live_inspection_missing_or_stale'}
if($live.busy){throw 'actual_profile_busy_not_interrupted'}
if($Stage -eq 'inspect'){State|ConvertTo-Json -Depth 10;exit}
if($Stage -eq 'quit'){$previousCursor=[Drawing.Point]::new(0,0);[void][LiveMouse]::GetCursorPos([ref]$previousCursor);try{Control 'quit'}finally{[void][LiveMouse]::SetCursorPos($previousCursor.X,$previousCursor.Y)};exit}
$original=State;$checks=New-Object Collections.Generic.List[object];$cursor=[Drawing.Point]::new(0,0);[void][LiveMouse]::GetCursorPos([ref]$cursor)
function Check([string]$name){$checks.Add(@{name=$name;status='passed';at=[DateTime]::UtcNow.ToString('o')});Write-Output ('Actual UI: '+$name)}
try {
 # The interactive audit is deliberately local: do not submit material to a provider.
 if($original.settings.modelEnabled){throw 'Disable model calls in the real settings before this interaction-only audit; original value has not been changed.'}
 HidePanel;MoveCursor ([Drawing.Point]::new(20,20));Wait {param($s)!$s.pet.controlsVisible} 'controls hidden at idle'|Out-Null;Capture 'idle';Check 'idle controls hidden'
 $s=State;$clearPoint=PointFor $s.pet @{x=1;y=1;width=0;height=0};MoveCursor $clearPoint;if([LiveMouse]::GetAncestor([LiveMouse]::WindowFromPoint($clearPoint),2).ToInt64() -eq [long]$s.pet.hwnd){throw 'transparent_area_blocks_underlying_window'};Check 'transparent empty area passes through without clicking another app'
 HoverBody;Capture 'hover';Check 'native cursor hover reveals controls'
 if((State).settings.resting){Control 'rest';Wait {param($s)!$s.settings.resting} 'wake initial state'|Out-Null}
 Start-Sleep -Milliseconds 350;Capture 'awake';$awake=State;$awakeFloor=$awake.pet.actor.paintBounds.y+$awake.pet.actor.paintBounds.height
 Control 'rest';$sleep=Wait {param($s)$s.settings.resting} 'sleep button';Start-Sleep -Milliseconds 350;Capture 'sleep';$sleep=State;$sleepFloor=$sleep.pet.actor.paintBounds.y+$sleep.pet.actor.paintBounds.height
 if([Math]::Abs($sleepFloor-$awakeFloor) -gt 1 -or $sleep.pet.bounds.x -ne $awake.pet.bounds.x -or $sleep.pet.bounds.y -ne $awake.pet.bounds.y){throw 'sleep_body_or_window_jumped'};Check 'sleep retains same window position and visible body floor'
 Control 'rest';Wait {param($s)!$s.settings.resting} 'wake button'|Out-Null;Check 'native wake button'
 $point=Body;$s=State;ClickPoint $point ([long]$s.pet.hwnd);Wait {param($s)$s.panel.visible -and $s.panel.page -eq 'chat'} 'single click chat'|Out-Null;Capture 'chat' 'panel';Check 'native single click opens visible chat'
 HidePanel;$s=State;ClickPoint (Body) ([long]$s.pet.hwnd) -Double;Wait {param($s)$s.panel.visible -and $s.panel.page -eq 'growth'} 'double click details'|Out-Null;Check 'native double click opens details'
 HidePanel;Control 'open';Wait {param($s)$s.panel.visible -and $s.panel.page -eq 'growth'} 'details button'|Out-Null;Check 'native details button';HidePanel
 $before=State;$point=Body;MoveCursor $point;[LiveMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);for($i=1;$i -le 12;$i++){[void][LiveMouse]::SetCursorPos($point.X-8*$i,$point.Y-3*$i);[LiveMouse]::mouse_event(1,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 35};[LiveMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 800;$after=State;if($after.pet.bounds.x -eq $before.pet.bounds.x -or $after.panel.visible){throw 'drag_did_not_move_or_opened_panel'};Check 'actual drag moves pet without opening panel';Capture 'dragged'
 $s=State;ClickPoint (Body) ([long]$s.pet.hwnd);Wait {param($s)$s.panel.visible} 'open panel for settings'|Out-Null;Page 'settings'
 $s=State;ClickPoint (PointFor $s.panel $s.panel.controls.size) ([long]$s.panel.hwnd);[Windows.Forms.SendKeys]::SendWait('{HOME}');Wait {param($s)$s.settings.petScale -eq 60} 'minimum size'|Out-Null;$small=State
 [Windows.Forms.SendKeys]::SendWait('{END}');Wait {param($s)$s.settings.petScale -eq 160} 'maximum size'|Out-Null;$large=State;if($small.pet.bounds.width -ge $large.pet.bounds.width){throw 'native_size_did_not_change'};Check 'native slider keyboard min/max resize actual pet';Capture 'size-settings' 'panel'
 $s=State;ClickPoint (PointFor $s.panel $s.panel.controls.reset) ([long]$s.panel.hwnd);Wait {param($s)$s.settings.petScale -eq 100} 'reset size button'|Out-Null;Check 'native reset size button'
 $s=State;$r=$s.panel.controls.size;$from=PointFor $s.panel @{x=$r.x+$r.width*.3;y=$r.y+$r.height/2;width=0;height=0};$to=PointFor $s.panel @{x=$r.x+$r.width*.7;y=$r.y+$r.height/2;width=0;height=0};MoveCursor $from;if([LiveMouse]::GetAncestor([LiveMouse]::WindowFromPoint($from),2).ToInt64() -ne [long]$s.panel.hwnd){throw 'slider_not_owned'};[LiveMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);for($i=1;$i -le 10;$i++){[void][LiveMouse]::SetCursorPos([int]($from.X+($to.X-$from.X)*$i/10),$from.Y);[LiveMouse]::mouse_event(1,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 35};[LiveMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Wait {param($s)$s.settings.petScale -gt 110 -and $s.settings.petScale -lt 160} 'physical slider drag'|Out-Null;Check 'native mouse dragging size slider resizes pet'
 [Windows.Forms.SendKeys]::SendWait('{HOME}');$steps=[int](($original.settings.petScale-60)/5);if($steps -gt 0){[Windows.Forms.SendKeys]::SendWait('{RIGHT '+$steps+'}')};Wait {param($s)$s.settings.petScale -eq $original.settings.petScale} 'restore size'|Out-Null;Check 'original size restored'
 Page 'chat';$s=State;if(!$s.panel.editorEmpty){throw 'chat_has_existing_unsent_draft_not_overwritten'};ClickPoint (PointFor $s.panel $s.panel.controls.editor) ([long]$s.panel.hwnd);if([LiveMouse]::GetForegroundWindow().ToInt64() -ne [long]$s.panel.hwnd){throw 'owned_panel_lost_focus_before_typing'};[LiveMouse]::TypeText('[UI audit] interaction verification only');Start-Sleep -Milliseconds 100;[Windows.Forms.SendKeys]::SendWait('+{ENTER}');[LiveMouse]::TypeText('second line');Start-Sleep -Milliseconds 250;$typed=State;if($typed.panel.editorEmpty -or $typed.panel.messages -ne $s.panel.messages){throw 'multiline_typing_failed'};Check 'native keyboard text and Shift+Enter remain unsent'
 [Windows.Forms.SendKeys]::SendWait('{ENTER}');Wait {param($s)$s.panel.editorEmpty -and $s.panel.messages -ge $typed.panel.messages+2} 'native chat send and local reply'|Out-Null;Capture 'chat-result' 'panel';Check 'native Enter sends and receives visible local reply'
 HidePanel;Check 'native titlebar close hides panel while pet remains'
 if($original.settings.resting){Control 'rest';Wait {param($s)$s.settings.resting} 'restore original rest state'|Out-Null}
 MoveCursor $cursor;$report=@{status='passed';actual_profile=$true;input_method='Windows native cursor/mouse/keyboard';synthetic_dom_events=$false;model_calls=0;checks=$checks;generated_at=[DateTime]::UtcNow.ToString('o')};$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
} catch {
 @{status='failed';actual_profile=$true;error=$_.Exception.Message;checks=$checks;generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
 throw
} finally {[LiveMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);[void][LiveMouse]::SetCursorPos($cursor.X,$cursor.Y)}
