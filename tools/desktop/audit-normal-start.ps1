# Operates only the normal project's visible windows, without inspection or mocks.
param([Parameter(Mandatory=$true)][int]$RootProcessId,[ValidateRange(60,160)][int]$ExpectedScale=85)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'project-paths.ps1')
$out=New-ProjectDirectory $workspace (Join-Path $workspace '.local/desktop/live-audit')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $out 'tmp');$env:TMP=$env:TEMP
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Drawing;using System.Collections.Generic;using System.Runtime.InteropServices;
public class NormalUI {
 public struct Rect{public int left,top,right,bottom;}
 delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr p);
 public static IntPtr[] Visible(uint pid){var l=new List<IntPtr>();EnumWindows((h,p)=>{uint n;GetWindowThreadProcessId(h,out n);if(n==pid&&IsWindowVisible(h))l.Add(h);return true;},IntPtr.Zero);return l.ToArray();}
}
'@ -ReferencedAssemblies System.Drawing
$null=[NormalUI]::SetThreadDpiAwarenessContext([IntPtr](-4))
$appId=$RootProcessId
$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$appId"
if(!$proc -or !$proc.ExecutablePath.StartsWith($workspace+'\',[StringComparison]::OrdinalIgnoreCase) -or !$proc.CommandLine.Contains('main.cjs') -or $proc.CommandLine.Contains('--inspect-ui') -or $proc.CommandLine.Contains('--smoke')){throw 'not_normal_app'}
$windows=@([NormalUI]::Visible($appId));if($windows.Count -ne 1){throw 'normal_start_not_pet_only'};$petHandle=$windows[0]
$r=New-Object NormalUI+Rect;$origin=[Drawing.Point]::new(0,0);$saved=[Drawing.Point]::new(0,0);[void][NormalUI]::GetClientRect($petHandle,[ref]$r);[void][NormalUI]::ClientToScreen($petHandle,[ref]$origin);[void][NormalUI]::GetCursorPos([ref]$saved)
$dpi=[NormalUI]::GetDpiForWindow($petHandle)/96
if($r.right -ne [Math]::Round(180*$ExpectedScale/100)*$dpi -or $r.bottom -ne ([Math]::Round(152*$ExpectedScale/100)+38)*$dpi){throw 'saved_scale_not_restored'}
function NativeClick([Drawing.Point]$p,[IntPtr]$h){[void][NormalUI]::SetCursorPos($p.X,$p.Y);[NormalUI]::mouse_event(1,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 350;if([NormalUI]::GetAncestor([NormalUI]::WindowFromPoint($p),2) -ne $h){throw 'not_owned'};[NormalUI]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 50;[NormalUI]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
try {
 [void][NormalUI]::SetCursorPos(20,20);Start-Sleep -Milliseconds 350
 & (Join-Path $PSScriptRoot 'capture-window.ps1') -WindowHandle $petHandle.ToInt64() -OutputPath (Join-Path $out 'normal-idle.png')
 NativeClick ([Drawing.Point]::new([int]($origin.X+$r.right*.5),[int]($origin.Y+$r.bottom*.47))) $petHandle
 Start-Sleep -Milliseconds 900;$windows=@([NormalUI]::Visible($appId));if($windows.Count -ne 2){throw 'normal_first_click_did_not_show_chat'};$panelHandle=@($windows|Where-Object {$_ -ne $petHandle})[0]
 & (Join-Path $PSScriptRoot 'capture-window.ps1') -WindowHandle $panelHandle.ToInt64() -OutputPath (Join-Path $out 'normal-chat.png')
 $pr=New-Object NormalUI+Rect;$pc=New-Object NormalUI+Rect;$po=[Drawing.Point]::new(0,0);[void][NormalUI]::GetWindowRect($panelHandle,[ref]$pr);[void][NormalUI]::GetClientRect($panelHandle,[ref]$pc);[void][NormalUI]::ClientToScreen($panelHandle,[ref]$po)
 NativeClick ([Drawing.Point]::new($pr.right-23*[NormalUI]::GetDpiForWindow($panelHandle)/96,[int](($pr.top+$po.Y)/2))) $panelHandle
 Start-Sleep -Milliseconds 250;if(@([NormalUI]::Visible($appId)).Count -ne 1){throw 'normal_panel_close_failed'}
 @{status='passed';process_id=$appId;expected_scale=$ExpectedScale;inspection_enabled=$false;checks=@('normal start shows only pet at saved size','native click opens visible chat','native panel close leaves pet running');generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $out 'normal-start-report.json') -Encoding utf8
 Write-Output ('Actual UI: normal app, '+$ExpectedScale+'% size, native click chat and panel close passed')
} finally {[NormalUI]::mouse_event(4,0,0,0,[UIntPtr]::Zero);[void][NormalUI]::SetCursorPos($saved.X,$saved.Y)}
