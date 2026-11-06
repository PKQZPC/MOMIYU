param([string]$DestinationDirectory = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$destination = (Resolve-Path -LiteralPath $DestinationDirectory).Path
$shortcutPath = [IO.Path]::GetFullPath((Join-Path $destination 'MOMIYU.lnk'))
if ([IO.Path]::GetDirectoryName($shortcutPath) -ne $destination) { throw 'Unexpected shortcut location.' }
$launcher = Join-Path $PSScriptRoot 'launch.vbs'
$target = Join-Path $env:SystemRoot 'System32/wscript.exe'
$arguments = '//B //Nologo "' + $launcher + '"'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
    $existing = $shell.CreateShortcut($shortcutPath)
    if ($existing.TargetPath -ne $target -or $existing.Arguments -ne $arguments) { throw 'An unrelated MOMIYU shortcut already exists; it was not overwritten.' }
}
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $workspace
$shortcut.WindowStyle = 7
$shortcut.Hotkey = 'CTRL+ALT+M'
$shortcut.Description = 'MOMIYU desktop companion'
$iconPath=Join-Path $workspace 'apps/desktop/assets/brand/momiyu.ico'
if(-not (Test-Path -LiteralPath $iconPath -PathType Leaf)){throw 'Project icon is missing. Export the brand assets first.'}
$shortcut.IconLocation=$iconPath+',0'
$shortcut.Save()
$verified = $shell.CreateShortcut($shortcutPath)
if ($verified.TargetPath -ne $target -or $verified.Arguments -ne $arguments -or $verified.WorkingDirectory -ne $workspace) { throw 'Shortcut verification failed.' }
if($verified.IconLocation -ne ($iconPath+',0')){throw 'Shortcut icon verification failed.'}
[PSCustomObject]@{ Shortcut = $shortcutPath; Project = $workspace; Hotkey = $verified.Hotkey; Icon=$verified.IconLocation } | ConvertTo-Json
