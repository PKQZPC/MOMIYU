Option Explicit
Dim shell, fso, directory, script, command, quote
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
directory = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(directory, "start.ps1")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(directory))
quote = Chr(34)
command = quote & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe" & quote & " -NoProfile -ExecutionPolicy Bypass -File " & quote & script & quote
If WScript.Arguments.Count = 0 Then
  shell.Run command, 0, False
ElseIf WScript.Arguments.Count = 1 Then
  If WScript.Arguments(0) = "--smoke" Then
    WScript.Quit shell.Run(command & " -Smoke", 0, True)
  ElseIf WScript.Arguments(0) = "--demo" Then
    shell.Run command, 0, False
  Else
    WScript.Quit 2
  End If
Else
  WScript.Quit 2
End If
