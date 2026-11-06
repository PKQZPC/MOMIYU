using System;
using System.Collections.Generic;
using System.Windows.Automation;
namespace Momiyu {
// A single volatile field snapshot, never a keystroke log. Only corroborated
// submission evidence can leave this object. All methods run on the UI thread.
public class SubmissionTracker {
  AutomationElement field,watched;AutomationPropertyChangedEventHandler valueChanged;volatile string latestValue; string value,id; DateTime seen;
  string pending,pendingId,method,baseline,inputName; AutomationElement pendingField; DateTime expires;
  void Unwatch(){if(watched!=null&&valueChanged!=null)try{Automation.RemoveAutomationPropertyChangedEventHandler(watched,valueChanged);}catch{}watched=null;latestValue=null;}
  public void Clear(){Unwatch();field=null;value=null;pending=null;pendingField=null;pendingId=null;baseline=null;inputName=null;}
  static string Id(AutomationElement e){return String.Join(".",e.GetRuntimeId());}
  static string ReadEditor(AutomationElement editor){
    var properties=editor.Current;
    if(properties.IsPassword||properties.ControlType!=ControlType.Edit)return null;
    object pattern;
    if(editor.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)){
      var value=((ValuePattern)pattern).Current;
      return value.IsReadOnly?null:value.Value;
    }
    if(!editor.TryGetCurrentPattern(TextPattern.Pattern,out pattern))return null;
    var range=((TextPattern)pattern).DocumentRange;
    var readOnly=range.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
    if(!(readOnly is bool)|| (bool)readOnly)return null;
    return range.GetText(4001);
  }
  public static bool Belongs(AutomationElement e,AutomationElement root){try{for(int i=0;e!=null&&i<40;i++,e=TreeWalker.ControlViewWalker.GetParent(e))if(Automation.Compare(e,root))return true;}catch{}return false;}
  public void Poll(AutomationElement root){try{
    if(pending!=null&&DateTime.UtcNow>expires){pending=null;pendingField=null;}
    var e=AutomationElement.FocusedElement;
    if(e!=null&&e.Current.IsPassword){Clear();return;}
    if(e==null||!Belongs(e,root)||e.Current.ControlType!=ControlType.Edit){if(DateTime.UtcNow-seen>TimeSpan.FromSeconds(1)){Unwatch();field=null;value=null;}return;}
    var text=ReadEditor(e);
    if(text==null||text.Length>4000){Unwatch();field=null;value=null;return;}
    if(watched==null||!Automation.Compare(watched,e)){
      Unwatch();watched=e;value=null;field=null;
      valueChanged=(sender,args)=>{var updated=args.NewValue as string;if(updated!=null&&updated.Length>0&&updated.Length<=4000)latestValue=updated;};
      Automation.AddAutomationPropertyChangedEventHandler(e,TreeScope.Element,valueChanged,ValuePattern.ValueProperty);
    }
    field=e;id=Id(e);if(text.Length>0){value=text;latestValue=text;seen=DateTime.UtcNow;}else if(DateTime.UtcNow-seen>TimeSpan.FromSeconds(1)){value=null;latestValue=null;}
  }catch{field=null;value=null;}}
  static AutomationElement Document(AutomationElement e){for(int i=0;e!=null&&i<40;i++,e=TreeWalker.ControlViewWalker.GetParent(e))if(e.Current.ControlType==ControlType.Document)return e;return null;}
  public void Intent(string source,string before,AutomationElement trigger=null){if(latestValue!=null)value=latestValue;if(field==null||String.IsNullOrWhiteSpace(value)||DateTime.UtcNow-seen>TimeSpan.FromSeconds(1))return;
    if(source=="submit_control"&&trigger!=null){var document=Document(field);var targetDocument=Document(trigger);if(document!=null&&(targetDocument==null||!Automation.Compare(document,targetDocument)))return;}
    pending=value;inputName=field.Current.Name;baseline=before??"";pendingId=id;pendingField=field;method=source;expires=DateTime.UtcNow.AddSeconds(8);
  }
  public Dictionary<string,object> Confirm(string visibleText){
    if(pending==null)return null;if(DateTime.UtcNow>expires){pending=null;pendingField=null;return null;}
    // Clearing alone (or pressing Enter alone) is not proof. The submitted text
    // must reappear in non-editable visible result/message content.
    if(String.IsNullOrWhiteSpace(visibleText)||visibleText.IndexOf(pending,StringComparison.Ordinal)<0)return null;
    string current=null;try{current=ReadEditor(pendingField);}catch{}
    if(current==pending&&baseline.IndexOf(pending,StringComparison.Ordinal)>=0)return null;
    var result=new Dictionary<string,object>{{"text",pending},{"input_id",pendingId},{"input_name",inputName.Length>180?inputName.Substring(0,180):inputName},{"method",method},{"confirmation","submission_intent_and_new_visible_echo"}};
    pending=null;pendingField=null;return result;
  }
}
}
