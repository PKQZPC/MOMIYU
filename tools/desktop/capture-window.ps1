# Visible acceptance only: capture one owned application's client area.
param([long]$WindowHandle,[string]$OutputPath)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $PSScriptRoot 'project-paths.ps1')
$directory=New-ProjectDirectory $workspace (Split-Path -Parent $OutputPath)
if([IO.Path]::GetFileName($OutputPath) -notmatch '^[a-z-]+\.png$'){throw 'invalid_capture_name'}
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/desktop/capture-tmp');$env:TMP=$env:TEMP
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
if(-not ('WindowPixels' -as [type])){Add-Type -TypeDefinition @'
using System;using System.Drawing;using System.Runtime.InteropServices;
public class WindowPixels {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public struct Rect{public int left,top,right,bottom;}
}
'@ -ReferencedAssemblies System.Drawing}
$null=[WindowPixels]::SetProcessDpiAwarenessContext([IntPtr](-4));$null=[WindowPixels]::SetThreadDpiAwarenessContext([IntPtr](-4))
$handle=[IntPtr]$WindowHandle;$rect=New-Object WindowPixels+Rect;$point=[Drawing.Point]::new(0,0)
if(![WindowPixels]::IsWindowVisible($handle) -or ![WindowPixels]::GetClientRect($handle,[ref]$rect) -or ![WindowPixels]::ClientToScreen($handle,[ref]$point)){throw 'owned_window_not_visible'}
$size=[Drawing.Size]::new($rect.right,$rect.bottom)
if(![Windows.Forms.SystemInformation]::VirtualScreen.Contains([Drawing.Rectangle]::new($point,$size))){throw 'window_outside_screen'}
$image=[Drawing.Bitmap]::new($size.Width,$size.Height);$graphics=[Drawing.Graphics]::FromImage($image)
try{$graphics.CopyFromScreen($point,[Drawing.Point]::Empty,$size);$image.Save((Join-Path $directory ([IO.Path]::GetFileName($OutputPath))),[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$image.Dispose()}
