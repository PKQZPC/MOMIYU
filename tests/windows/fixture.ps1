param([string]$ManifestPath)
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form
$form.Text='MOMIYU owned collection fixture';$form.Width=620;$form.Height=330;$form.StartPosition='CenterScreen';$form.TopMost=$true
$label=New-Object Windows.Forms.Label;$label.Text='Initial readable interface';$label.SetBounds(20,20,550,30)
$edit=New-Object Windows.Forms.TextBox;$edit.SetBounds(20,60,400,30)
$button=New-Object Windows.Forms.Button;$button.Text='Apply choice';$button.SetBounds(20,110,160,40)
$errorButton=New-Object Windows.Forms.Button;$errorButton.Text='Show error';$errorButton.SetBounds(200,110,160,40)
$protect=New-Object Windows.Forms.Button;$protect.Text='Protect input';$protect.SetBounds(380,110,160,40)
$button.Add_Click({$edit.Clear();$label.Text='Visible result: choice applied'})
$errorButton.Add_Click({$label.Text='Error: missing selection'})
$protect.Add_Click({$edit.UseSystemPasswordChar=$true;$edit.Text='PROTECTED_NATIVE_SENTINEL';$label.Text='PROTECTED_NATIVE_SENTINEL'})
$form.Controls.AddRange(@($label,$edit,$button,$errorButton,$protect))
$form.Add_Shown({@{pid=$PID;root=$form.Handle.ToInt64();edit=$edit.Handle.ToInt64();button=$button.Handle.ToInt64();error=$errorButton.Handle.ToInt64();protect=$protect.Handle.ToInt64()}|ConvertTo-Json|Set-Content -LiteralPath $ManifestPath -Encoding utf8;$form.Activate()})
[Windows.Forms.Application]::Run($form)
