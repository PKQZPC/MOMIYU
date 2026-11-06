using System;
using System.Collections.Generic;
using System.Windows.Automation;
namespace Momiyu {
public static class InterfaceStructure {
  static string Cut(string s,int n){s=s??"";return s.Length>n?s.Substring(0,n):s;}
  public static List<object> Read(List<AutomationElement> elements,Func<AutomationElement,bool> visible){
    var nodes=new List<object>();int remaining=10000;
    foreach(var e in elements){if(nodes.Count>=160||remaining<=0)break;try{
      var c=e.Current;if(!visible(e)||c.IsPassword||c.ControlType==ControlType.Edit)continue;
      var parent=TreeWalker.ControlViewWalker.GetParent(e);
      if(parent!=null&&(parent.Current.ControlType==ControlType.Edit||parent.Current.IsPassword))continue;
      string name=Cut(c.Name,Math.Min(800,remaining));remaining-=name.Length;
      string help=Cut(c.HelpText,Math.Min(240,remaining));remaining-=help.Length;
      string status=Cut(c.ItemStatus,Math.Min(120,remaining));remaining-=status.Length;
      nodes.Add(new Dictionary<string,object>{{"id",String.Join(".",e.GetRuntimeId())},{"parent",parent==null?"":String.Join(".",parent.GetRuntimeId())},{"type",c.ControlType.ProgrammaticName},{"name",name},{"name_truncated",(c.Name??"").Length>name.Length},{"help",help},{"status",status},{"localized_type",Cut(c.LocalizedControlType,60)}});
    }catch{}}
    return nodes;
  }
}
}
