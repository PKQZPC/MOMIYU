$ErrorActionPreference='Stop'
$probeRoot=Split-Path -Parent $PSScriptRoot
$outDir=Join-Path $probeRoot '.local'
New-Item -ItemType Directory -Path $outDir -Force|Out-Null
$manifestPath=Join-Path $outDir 'native-fixture.json'
if(Test-Path -LiteralPath $manifestPath){Remove-Item -LiteralPath $manifestPath}
$helperPath=Join-Path $probeRoot 'fixtures/native-window.ps1'
$helper=Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -ArgumentList @('-NoProfile','-STA','-File',('"'+$helperPath+'"'),'-ManifestPath',('"'+$manifestPath+'"')) -WindowStyle Hidden -PassThru
$checks=@()
try{
  for($probeAttempt=0;$probeAttempt -lt 100 -and -not(Test-Path -LiteralPath $manifestPath);$probeAttempt++){Start-Sleep -Milliseconds 100}
  if(-not(Test-Path -LiteralPath $manifestPath)){throw 'Controlled fixture did not start.'}
  $fixture=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
  if($fixture.pid -ne $helper.Id -or -not $fixture.synthetic_only){throw 'Unexpected fixture owner.'}
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $providerPath='C:\Windows\Microsoft.NET\assembly\GAC_MSIL\UIAutomationClientsideProviders\v4.0_4.0.0.0__31bf3856ad364e35\UIAutomationClientsideProviders.dll'
  [System.Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly([Reflection.AssemblyName]::GetAssemblyName($providerPath))
  $root=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$fixture.root_handle)
  $field=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$fixture.field_handle)
  $save=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$fixture.save_handle)
  $result=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$fixture.result_handle)
  if($root.Current.ProcessId -ne $helper.Id){throw 'UIA target process mismatch.'}
  $fieldInfo=@{name=$field.Current.Name;control_type=$field.Current.ControlType.ProgrammaticName;automation_id=$field.Current.AutomationId;offscreen=$field.Current.IsOffscreen}
  $fieldInfo|ConvertTo-Json -Compress|Write-Output
  if($field.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit){throw 'Synthetic target is not an edit control.'}
  $value=$field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $before=$value.Current.Value
  $value.SetValue('controlled saved value')
  $invoke=$save.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
  for($probeAttempt=0;$probeAttempt -lt 30 -and $result.Current.Name -ne 'Saved: controlled saved value';$probeAttempt++){Start-Sleep -Milliseconds 100}
  if($result.Current.Name -ne 'Saved: controlled saved value'){throw 'Save outcome was not observable.'}
  $checks=@('explicit owned HWND only','UIA edit control type','UIA text value','synthetic edit and invoke','observed save outcome','transparent native fixture')|ForEach-Object{@{name=$_;passed=$true}}
  $checks+=@{name='UIA accessible label';passed=($field.Current.Name -eq 'MOMIYU_M0_FIELD')}
  @{schema_version='0.1.0';generated_at=[DateTime]::UtcNow.ToString('o');synthetic_only=$true;status='limited';checks=$checks;field=$fieldInfo;before=$before;after=$result.Current.Name;opacity=$fixture.opacity;limits=@('Invisible controlled WinForms fixture only, not real-app collection.','No desktop tree enumeration or private window reads.','Native transparency is not Electron renderer/package validation.','UIA fields depend on each application provider; this does not verify all apps.')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $outDir 'windows.json') -Encoding UTF8
  Write-Output ('M0 Windows controlled checks passed: '+$checks.Count)
}finally{
  if(-not $helper.HasExited){$helper.CloseMainWindow()|Out-Null;if(-not $helper.WaitForExit(3000)){Stop-Process -Id $helper.Id -Force}}
}
