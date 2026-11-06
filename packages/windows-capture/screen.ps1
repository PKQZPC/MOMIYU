param([double]$AccumulatedUseMs=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
$env:PSModuleAnalysisCachePath=Join-Path $env:TEMP 'module-analysis-cache'
Add-Type -AssemblyName System.Drawing,System.Windows.Forms,System.Web.Extensions
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class ScreenDpi{[DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr h);}'
$null=[ScreenDpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
Add-Type -Path (Join-Path $PSScriptRoot 'ScreenCapture.cs') -ReferencedAssemblies System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll
[Momiyu.ScreenLoop]::Run($AccumulatedUseMs)
