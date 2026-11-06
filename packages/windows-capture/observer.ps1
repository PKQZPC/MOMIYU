param([string]$AllowedApps,[int]$OnlyProcessId=0,[long]$OnlyWindow=0,[switch]$ObserveForeground,[int]$ExcludeProcessId=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
. (Join-Path $workspace 'tools/desktop/project-paths.ps1')
$env:TEMP=New-ProjectDirectory $workspace (Join-Path $workspace '.local/windows-capture/tmp');$env:TMP=$env:TEMP
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class CaptureDpi{[DllImport("user32.dll")]public static extern bool SetProcessDpiAwarenessContext(IntPtr context);[DllImport("user32.dll")]public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);}'
$null=[CaptureDpi]::SetProcessDpiAwarenessContext([IntPtr](-4));$null=[CaptureDpi]::SetThreadDpiAwarenessContext([IntPtr](-4))
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
$provider=Join-Path $env:SystemRoot 'Microsoft.NET/assembly/GAC_MSIL/UIAutomationClientsideProviders/v4.0_4.0.0.0__31bf3856ad364e35/UIAutomationClientsideProviders.dll'
if(Test-Path -LiteralPath $provider){$null=[System.Windows.Automation.AutomationElement]::RootElement;[System.Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly([Reflection.AssemblyName]::GetAssemblyName($provider))}
$references=@('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Web.Extensions.dll',[System.Windows.Automation.AutomationElement].Assembly.Location,[System.Windows.Automation.ControlType].Assembly.Location,[System.Windows.Point].Assembly.Location)
Add-Type -Path @((Join-Path $PSScriptRoot 'InterfaceStructure.cs'),(Join-Path $PSScriptRoot 'SubmissionTracker.cs'),(Join-Path $PSScriptRoot 'Observer.cs')) -ReferencedAssemblies $references
[Momiyu.Observer]::Run($AllowedApps,$OnlyProcessId,$OnlyWindow,$ObserveForeground.IsPresent,$ExcludeProcessId)
