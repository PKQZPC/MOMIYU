param([Parameter(Mandatory=$true)][string]$ManifestPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object System.Windows.Forms.Form
$form.Text='MOMIYU_M0_SYNTHETIC_WINDOW'
$form.ShowInTaskbar=$false
$form.Opacity=0
$form.Width=400
$form.Height=180
$field=New-Object System.Windows.Forms.TextBox
$field.Name='MOMIYU_M0_FIELD'
$field.AccessibleName='MOMIYU_M0_FIELD'
$field.Text='synthetic initial text'
$field.Width=250
$field.Top=10
$save=New-Object System.Windows.Forms.Button
$save.Text='Save synthetic document'
$save.AccessibleName='MOMIYU_M0_SAVE'
$save.Top=45
$save.Width=250
$result=New-Object System.Windows.Forms.Label
$result.Text='Not saved'
$result.Top=80
$result.Width=350
$save.Add_Click({$result.Text='Saved: '+$field.Text})
$form.Controls.AddRange(@($field,$save,$result))
$form.Add_Shown({
  @{pid=$PID;root_handle=$form.Handle.ToInt64();field_handle=$field.Handle.ToInt64();save_handle=$save.Handle.ToInt64();result_handle=$result.Handle.ToInt64();opacity=$form.Opacity;synthetic_only=$true}|ConvertTo-Json|Set-Content -LiteralPath $ManifestPath -Encoding UTF8
})
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=30000
$timer.Add_Tick({$form.Close()})
$timer.Start()
try{[System.Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose()}
