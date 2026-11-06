param([string]$ManifestPath)
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form;$form.Text='MOMIYU owned chat fixture';$form.Width=850;$form.Height=800;$form.TopMost=$true;$form.StartPosition='CenterScreen'
$history=New-Object Windows.Forms.GroupBox;$history.Text='Conversation: Route team';$history.AccessibleName=$history.Text;$history.SetBounds(20,20,780,540)
$edit=New-Object Windows.Forms.TextBox;$edit.SetBounds(20,580,550,32)
$send=New-Object Windows.Forms.Button;$send.Text='Send message';$send.SetBounds(590,580,190,40)
$switch=New-Object Windows.Forms.Button;$switch.Text='Open workshop group';$switch.SetBounds(20,640,250,40)
$script:row=0;$script:sent=0
function AddMessage([string]$header,[string]$body,[string[]]$extras=@()){
 $group=New-Object Windows.Forms.GroupBox;$group.Text=$header;$group.AccessibleName=$header;$group.SetBounds(15,25+$script:row*110,740,105)
 $lines=@($body)+$extras;for($i=0;$i -lt $lines.Count;$i++){$label=New-Object Windows.Forms.Label;$label.Text=$lines[$i];$label.SetBounds(12,22+$i*24,715,24);$group.Controls.Add($label)}
 $history.Controls.Add($group);$script:row++
}
AddMessage 'Received from Jordan at 10:01' 'Could you bring the route map?'
$timer=New-Object Windows.Forms.Timer;$timer.Interval=1200;$timer.Add_Tick({$timer.Stop();AddMessage 'Received from Jordan at 10:03' 'Map received. Please use the sheltered route.' @('Reply to: I can bring the route map.','Attachment: route.pdf')})
$send.Add_Click({if($edit.Text){AddMessage 'Sent by You at 10:02' $edit.Text;$edit.Clear();$script:sent++;if($script:sent -eq 1){$timer.Start()}}})
$switch.Add_Click({$history.Controls.Clear();$script:row=0;$history.Text='Conversation: Workshop team';$history.AccessibleName=$history.Text;AddMessage 'Received from Casey at 11:01' 'The workshop starts at noon.'})
$form.Controls.AddRange(@($history,$edit,$send,$switch))
$form.Add_Shown({@{pid=$PID;root=$form.Handle.ToInt64();edit=$edit.Handle.ToInt64();send=$send.Handle.ToInt64();switch=$switch.Handle.ToInt64()}|ConvertTo-Json|Set-Content -LiteralPath $ManifestPath -Encoding utf8;$form.Activate()})
try{[Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose()}
