using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using System.Windows.Forms;
using System.Web.Script.Serialization;
namespace Momiyu {
public class Observer {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEvent callback,uint pid,uint thread,uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int kind,Mouse callback,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  delegate bool EnumChild(IntPtr hwnd,IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr root,EnumChild callback,IntPtr value);
  [StructLayout(LayoutKind.Sequential)] struct Rect{public int left,top,right,bottom;}
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref Rect rect,uint flags);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flag);
  delegate void WinEvent(IntPtr hook,uint ev,IntPtr hwnd,int obj,int child,uint thread,uint time);
  delegate IntPtr Mouse(int code,IntPtr message,IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct MouseData {public int x,y;public uint mouseData,flags,time;public UIntPtr extra;}
  delegate IntPtr Keyboard(int code,IntPtr message,IntPtr data);
  [DllImport("user32.dll",EntryPoint="SetWindowsHookExW")] static extern IntPtr SetKeyboardHook(int kind,Keyboard callback,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  static Keyboard keyboardCallback;static IntPtr keyboardHook;static bool enterPending;static volatile bool dirtyView;static AutomationElement observedRoot;static StructureChangedEventHandler structureChanged;static AutomationPropertyChangedEventHandler propertiesChanged;static DateTime nextView;static readonly SubmissionTracker submissions=new SubmissionTracker();
  static HashSet<string> apps;static int onlyPid;static IntPtr current=IntPtr.Zero,mouseHook;static string processName,windowId,lastContent,lastCoverage;static int pid,sequence,resultCount;static volatile bool changed;static DateTime resultUntil,nextResult;static string actionId;static readonly string sessionId=Guid.NewGuid().ToString();
  static readonly JavaScriptSerializer json=new JavaScriptSerializer();static readonly List<IntPtr> hooks=new List<IntPtr>();
  static readonly Queue<MouseData> clicks=new Queue<MouseData>();static WinEvent windowCallback;static Mouse mouseCallback;static Timer timer;static DateTime heartbeat;static bool foregroundDirty;
  static string Cut(string s,int n){return (s??"").Length>n?s.Substring(0,n):(s??"");}
  static bool Visible(AutomationElement e){
    if(!e.Current.IsOffscreen)return true;
    // Classic proxies can disagree with native visibility. Only a real HWND
    // with independently verified visible, on-screen geometry may override it.
    var h=(IntPtr)e.Current.NativeWindowHandle;Rect r,root;
    return h!=IntPtr.Zero&&IsWindowVisible(h)&&!IsIconic(current)&&GetWindowRect(h,out r)&&GetWindowRect(current,out root)&&r.right>r.left&&r.bottom>r.top&&r.left<root.right&&r.right>root.left&&r.top<root.bottom&&r.bottom>root.top&&MonitorFromRect(ref r,0)!=IntPtr.Zero;
  }
  static void Write(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static bool Browser(string name){return new HashSet<string>{"msedge","chrome","firefox","brave","opera","vivaldi"}.Contains(name);}
  static Dictionary<string,object> Target(AutomationElement e,bool blocked){
    var c=e.Current;string type=c.ControlType.ProgrammaticName;
    var result=new Dictionary<string,object>{{"id",String.Join(".",e.GetRuntimeId())},{"type",type},{"name",blocked||c.IsPassword||c.ControlType.Id==ControlType.Edit.Id?"":Cut(c.Name,180)},{"enabled",c.IsEnabled}};
    object pattern;if(e.TryGetCurrentPattern(TogglePattern.Pattern,out pattern))result["toggle"]=((TogglePattern)pattern).Current.ToggleState.ToString();
    if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern))result["selected"]=((SelectionItemPattern)pattern).Current.IsSelected;
    return result;
  }
  static void ObserveChanges(AutomationElement root){
    if(observedRoot!=null){try{Automation.RemoveStructureChangedEventHandler(observedRoot,structureChanged);}catch{}try{Automation.RemoveAutomationPropertyChangedEventHandler(observedRoot,propertiesChanged);}catch{}observedRoot=null;}
    if(root==null)return;
    observedRoot=root;structureChanged=(sender,args)=>{dirtyView=true;if(DateTime.UtcNow<resultUntil)changed=true;};propertiesChanged=(sender,args)=>{dirtyView=true;if(DateTime.UtcNow<resultUntil)changed=true;};
    try{Automation.AddStructureChangedEventHandler(root,TreeScope.Subtree,structureChanged);Automation.AddAutomationPropertyChangedEventHandler(root,TreeScope.Subtree,propertiesChanged,AutomationElement.NameProperty,AutomationElement.HelpTextProperty,AutomationElement.ItemStatusProperty);}catch{}
  }
  static Dictionary<string,object> View(AutomationElement root,out bool blocked){
    blocked=false;var elements=new List<AutomationElement>();var queue=new Queue<AutomationElement>();queue.Enqueue(root);bool truncated=false;
    // Bound traversal without allocating an unbounded desktop subtree.
    while(queue.Count>0&&elements.Count<240){var e=queue.Dequeue();elements.Add(e);var child=e.Current.ControlType==ControlType.Edit?null:TreeWalker.ControlViewWalker.GetFirstChild(e);int siblings=0;while(child!=null&&siblings++<240){queue.Enqueue(child);if(queue.Count>=480){truncated=true;break;}child=TreeWalker.ControlViewWalker.GetNextSibling(child);}}
    if(queue.Count>0)truncated=true;
    // Some classic Win32 providers expose children by HWND but not through
    // ControlView traversal. Enumerate only this authorized foreground root.
    {var known=new HashSet<string>();foreach(var e in elements)known.Add(String.Join(".",e.GetRuntimeId()));var handles=new List<IntPtr>();EnumChildWindows(current,(h,v)=>{handles.Add(h);return handles.Count<240;},IntPtr.Zero);foreach(var h in handles){if(elements.Count>=240){truncated=true;break;}try{var e=AutomationElement.FromHandle(h);if(e.Current.ProcessId==pid&&known.Add(String.Join(".",e.GetRuntimeId())))elements.Add(e);}catch{}}if(handles.Count>=240)truncated=true;}
    foreach(var e in elements)if(Visible(e)&&e.Current.IsPassword){blocked=true;break;}
    string url="";bool document=false;
    if(Browser(processName)){
      bool privateWindow=System.Text.RegularExpressions.Regex.IsMatch(root.Current.Name,"InPrivate|Incognito|无痕|隐私浏览",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
      foreach(var e in elements){var c=e.Current;
        if(c.ControlType==ControlType.Button&&System.Text.RegularExpressions.Regex.IsMatch(c.Name,"^(InPrivate|Incognito|无痕|隐私浏览)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))privateWindow=true;
        if(c.ControlType==ControlType.Document&&Visible(e)){document=true;object p;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out p))url=Cut(((ValuePattern)p).Current.Value,2048);}
      }
      if(privateWindow)throw new InvalidOperationException("private_window_excluded");
      if(!document||!(processName=="msedge"||processName=="chrome"))throw new InvalidOperationException("browser_interface_unavailable");
    }
    var controls=new List<object>();string text="";
    if(!blocked)foreach(var e in elements){var c=e.Current;if(!Visible(e)||c.IsPassword||c.ControlType.Id==ControlType.Edit.Id)continue;
      if((c.ControlType.Id==ControlType.Text.Id||c.ControlType.Id==ControlType.Hyperlink.Id)&&text.Length<6000){var label=Cut(c.Name,Math.Min(6000-text.Length,1000));if(label.Length>0)text+=(text.Length>0?"\n":"")+label;}
      if(controls.Count<24&&(c.ControlType.Id==ControlType.Button.Id||c.ControlType.Id==ControlType.CheckBox.Id||c.ControlType.Id==ControlType.ListItem.Id||c.ControlType.Id==ControlType.Hyperlink.Id||c.ControlType.Id==ControlType.TabItem.Id))controls.Add(Target(e,false));
    }
    return new Dictionary<string,object>{{"text",Cut(text,6000)},{"structure",blocked?new List<object>():InterfaceStructure.Read(elements,Visible)},{"url",url},{"controls",controls},{"element_count",elements.Count},{"truncated",truncated||text.Length>=6000},{"omission",blocked?"editable_or_password_content_omitted":""}};
  }
  static void Capture(string kind,AutomationElement target,bool injected){
    try{
      if(current==IntPtr.Zero||GetForegroundWindow()!=current)return;
      var root=AutomationElement.FromHandle(current);if(root.Current.ProcessId!=pid)return;
      if(kind=="action"&&(target==null||!SubmissionTracker.Belongs(target,root)))return;
      bool blocked;var view=View(root,out blocked);
      if(blocked){submissions.Clear();}
      if(!blocked&&kind=="action"&&target!=null&&System.Text.RegularExpressions.Regex.IsMatch(target.Current.Name,"发送|提交|搜索|查找|send|submit|search",System.Text.RegularExpressions.RegexOptions.IgnoreCase))submissions.Intent("submit_control",lastContent,target);
      var packet=new Dictionary<string,object>{{"event_id",Guid.NewGuid().ToString()},{"session_id",sessionId},{"sequence",++sequence},{"kind",kind},{"occurred_at",DateTime.UtcNow.ToString("o")},{"process_id",pid},{"app",processName},{"window_id",windowId},{"title",blocked?"":Cut(root.Current.Name,240)},{"foreground",true},{"omission",view["omission"]},{"actor",injected?"injected_input_source_unknown":"input_source_not_attributed"}};
      if(target!=null&&SubmissionTracker.Belongs(target,root))packet["target"]=Target(target,blocked);
      if(kind!="action"){
        string serialized=json.Serialize(view);

        var submission=blocked?null:submissions.Confirm((string)view["text"]);
        if((kind=="result"||kind=="focus")&&serialized==lastContent&&submission==null)return;
        packet["view"]=view;packet["page_url"]=view["url"];
        if(submission!=null){packet["submission"]=submission;packet["kind"]="submission";if(actionId!=null)packet["result_for"]=actionId;packet["outcome"]="submission_intent_with_visible_echo";}
        // Hashing and persisted content IDs belong to the local store. This
        // token only denotes the most recent actually observed native view.
        packet["before_content_id"]=null;lastContent=serialized;
      }
      if(kind=="result"){packet["result_for"]=actionId;packet["outcome"]="visible_change_after_operation_cause_unconfirmed";resultCount++;}
      else if(kind=="action"){actionId=(string)packet["event_id"];resultUntil=DateTime.UtcNow.AddSeconds(15);nextResult=DateTime.UtcNow.AddMilliseconds(400);changed=true;resultCount=0;packet["outcome"]="click_observed_success_unknown";packet["before_content_id"]=null;}
      Write(new {type="event",value=packet});
    }catch(InvalidOperationException error){submissions.Clear();string status=error.Message=="private_window_excluded"?"private_window_excluded":error.Message=="browser_interface_unavailable"?"browser_interface_unavailable":"interface_unavailable";if(lastCoverage!=status){lastCoverage=status;Write(new {type="coverage",status=status});}}catch{submissions.Clear();Write(new {type="coverage",status="interface_unavailable"});}
  }
  static void Tick(object sender,EventArgs args){
    try{
      if(DateTime.UtcNow>=heartbeat){heartbeat=DateTime.UtcNow.AddSeconds(2);Write(new {type="heartbeat"});}
      var inputDesktop=OpenInputDesktop(0,false,1);if(inputDesktop==IntPtr.Zero){if(current!=IntPtr.Zero)ObserveChanges(null);current=IntPtr.Zero;submissions.Clear();enterPending=false;lock(clicks)clicks.Clear();if(lastCoverage!="input_desktop_unavailable"){lastCoverage="input_desktop_unavailable";Write(new {type="coverage",status=lastCoverage});}return;}CloseDesktop(inputDesktop);
      var hwnd=GetForegroundWindow();uint owner;GetWindowThreadProcessId(hwnd,out owner);string name="";try{name=Process.GetProcessById((int)owner).ProcessName.ToLowerInvariant();}catch{}
      bool allowed=owner!=excludePid&&(observeForeground||apps.Contains(name))&&(onlyPid==0||owner==onlyPid)&&(onlyWindow==0||hwnd.ToInt64()==onlyWindow);
      if(!allowed||!IsWindowVisible(hwnd)||IsIconic(hwnd)){string reason=!allowed?"outside_allowed_apps":"window_not_visible";if(current!=IntPtr.Zero)ObserveChanges(null);current=IntPtr.Zero;enterPending=false;lastContent=null;submissions.Clear();lock(clicks)clicks.Clear();if(lastCoverage!=reason){lastCoverage=reason;Write(new {type="coverage",status=reason});}}
      else if(hwnd!=current){lastCoverage=null;foregroundDirty=false;current=hwnd;ObserveChanges(AutomationElement.FromHandle(current));pid=(int)owner;processName=name;windowId=hwnd.ToInt64().ToString();lastContent=null;actionId=null;changed=false;submissions.Clear();dirtyView=true;lock(clicks)clicks.Clear();Capture("foreground",null,false);}
      if(current!=IntPtr.Zero){
        if(foregroundDirty){foregroundDirty=false;dirtyView=true;}
        if(enterPending){enterPending=false;submissions.Intent("enter_with_observed_result",lastContent);Capture("action",AutomationElement.FocusedElement,false);changed=true;resultUntil=DateTime.UtcNow.AddSeconds(8);nextResult=DateTime.UtcNow.AddMilliseconds(400);}
        submissions.Poll(AutomationElement.FromHandle(current));
        if(dirtyView&&DateTime.UtcNow>=nextView&&!(actionId!=null&&DateTime.UtcNow<resultUntil&&resultCount<6)){dirtyView=false;nextView=DateTime.UtcNow.AddSeconds(1);Capture("focus",null,false);}
        while(true){MouseData click;lock(clicks){if(clicks.Count==0)break;click=clicks.Dequeue();}var e=AutomationElement.FromPoint(new System.Windows.Point(click.x,click.y));Capture("action",e,(click.flags&1)!=0);}
        if(changed&&actionId!=null&&DateTime.UtcNow>=nextResult&&DateTime.UtcNow<resultUntil&&resultCount<6){changed=false;Capture("result",null,false);nextResult=DateTime.UtcNow.AddMilliseconds(400);}
      }
      if(DateTime.UtcNow>=heartbeat){heartbeat=DateTime.UtcNow.AddSeconds(2);Write(new {type="heartbeat"});}
    }catch{Write(new {type="coverage",status="interface_unavailable"});}
  }
  static long onlyWindow;
  static bool observeForeground;
  static int excludePid;
  public static void Run(string allowed,int process,long window,bool foreground=false,int excluded=0){
    observeForeground=foreground;excludePid=excluded;
    onlyWindow=window;
    apps=new HashSet<string>((allowed??"").ToLowerInvariant().Split(new[]{','},StringSplitOptions.RemoveEmptyEntries));onlyPid=process;
    windowCallback=(hook,ev,hwnd,obj,child,thread,time)=>{if(ev==3)foregroundDirty=true;else if(current!=IntPtr.Zero&&(hwnd==current||GetAncestor(hwnd,2)==current)){dirtyView=true;if(DateTime.UtcNow<resultUntil)changed=true;}};
    foreach(uint ev in new uint[]{3,0x800A,0x800C,0x8005,0x8002})hooks.Add(SetWinEventHook(ev,ev,IntPtr.Zero,windowCallback,0,0,0));
    mouseCallback=(code,message,data)=>{if(code>=0&&message.ToInt64()==0x202&&current!=IntPtr.Zero&&GetForegroundWindow()==current){lock(clicks){if(clicks.Count<16)clicks.Enqueue((MouseData)Marshal.PtrToStructure(data,typeof(MouseData)));}}return CallNextHookEx(mouseHook,code,message,data);};
    mouseHook=SetWindowsHookEx(14,mouseCallback,IntPtr.Zero,0);
    keyboardCallback=(code,message,data)=>{if(code>=0&&message.ToInt64()==0x100&&current!=IntPtr.Zero&&GetForegroundWindow()==current&&Marshal.ReadInt32(data)==13&&(GetAsyncKeyState(16)&0x8000)==0)enterPending=true;return CallNextHookEx(keyboardHook,code,message,data);};
    keyboardHook=SetKeyboardHook(13,keyboardCallback,IntPtr.Zero,0);
    Write(new {type="ready",mouse_hook=mouseHook!=IntPtr.Zero,submission_hook=keyboardHook!=IntPtr.Zero});timer=new Timer();timer.Interval=250;timer.Tick+=Tick;timer.Start();
    try{Application.Run();}finally{timer.Stop();ObserveChanges(null);submissions.Clear();UnhookWindowsHookEx(keyboardHook);UnhookWindowsHookEx(mouseHook);foreach(var hook in hooks)if(hook!=IntPtr.Zero)UnhookWinEvent(hook);}
  }
}
}
