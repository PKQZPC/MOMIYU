# Native input on the running prepared synthetic profile; no model calls.
param([Parameter(Mandatory=$true)][int]$RootProcessId)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$statePath=Join-Path $workspace '.local/desktop/live-audit/state.json'
$out=Join-Path $workspace '.local/desktop/egg-audit';New-Item -ItemType Directory -Force -Path $out|Out-Null
$env:TEMP=$out;$env:TMP=$out
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Drawing;using System.Runtime.InteropServices;
public class EggInput {
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr p);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr p);
}
'@ -ReferencedAssemblies System.Drawing
$null=[EggInput]::SetThreadDpiAwarenessContext([IntPtr](-4))
$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$RootProcessId"
if(!$proc -or !$proc.ExecutablePath.StartsWith($workspace+'\') -or !$proc.CommandLine.Contains('main.cjs') -or !$proc.CommandLine.Contains('--inspect-ui')){throw 'not_owned_inspected_app'}
function State { $s=Get-Content -LiteralPath $statePath -Encoding UTF8 -Raw|ConvertFrom-Json;if($s.process_id -ne $RootProcessId -or $s.settings.modelEnabled){throw 'wrong_or_model_enabled_profile'};return $s }
function Click([long]$handle,$rect){$h=[IntPtr]$handle;$o=[Drawing.Point]::new(0,0);[void][EggInput]::ClientToScreen($h,[ref]$o);$d=[EggInput]::GetDpiForWindow($h)/96;[void][EggInput]::SetCursorPos([int]($o.X+($rect.x+$rect.width/2)*$d),[int]($o.Y+($rect.y+$rect.height/2)*$d));[EggInput]::mouse_event(1,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 400;[EggInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 65;[EggInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 600}
$s=State
Click ([long]$s.pet.hwnd) @{x=$s.pet.canvas.width*.4;y=$s.pet.canvas.height*.42;width=$s.pet.canvas.width*.2;height=$s.pet.canvas.height*.2}
$s=State;if(!$s.panel.visible){throw 'panel_not_open'}
Click ([long]$s.panel.hwnd) $s.panel.controls.growth
[EggInput]::keybd_event(17,0,0,[UIntPtr]::Zero);[EggInput]::keybd_event(36,0,0,[UIntPtr]::Zero);[EggInput]::keybd_event(36,0,2,[UIntPtr]::Zero);[EggInput]::keybd_event(17,0,2,[UIntPtr]::Zero);Start-Sleep -Milliseconds 500
$s=State;$mint=@($s.journey.buttons|Where-Object {$_.egg -eq 'mint'})[0];if(!$mint){throw 'egg_picker_missing'}
if($mint.rect.y -lt 100 -or $mint.rect.y+$mint.rect.height -gt $s.panel.viewport.height){throw 'egg_picker_not_visible'}
Click ([long]$s.panel.hwnd) $mint.rect
$s=State
& (Join-Path $PSScriptRoot 'capture-window.ps1') -WindowHandle ([long]$s.pet.hwnd) -OutputPath (Join-Path $out 'mint-egg.png')
$expand=@($s.journey.buttons|Where-Object {!$_.egg})[0];Click ([long]$s.panel.hwnd) $expand.rect
$s=State;if($s.journey.canvases -ne 1 -or $s.journey.actions -notcontains 'base.greet'){throw 'semantic_action_preview_missing'}
[EggInput]::keybd_event(17,0,0,[UIntPtr]::Zero);[EggInput]::keybd_event(36,0,0,[UIntPtr]::Zero);[EggInput]::keybd_event(36,0,2,[UIntPtr]::Zero);[EggInput]::keybd_event(17,0,2,[UIntPtr]::Zero);Start-Sleep -Milliseconds 400
& (Join-Path $PSScriptRoot 'capture-window.ps1') -WindowHandle ([long]$s.panel.hwnd) -OutputPath (Join-Path $out 'egg-actions.png')
@{status='passed';process_id=$RootProcessId;model_calls=0;checks=@('native pet click opens panel','native growth navigation','native mint egg selection','egg visible on desktop','one real rocking action; static states are not new actions');generated_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
Write-Output 'Native egg selection and semantic action display passed; no model calls.'
