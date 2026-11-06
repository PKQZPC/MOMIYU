using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Momiyu {
// A hidden message recipient, never a visible overlay or desktop border.
public sealed class ScreenState : NativeWindow, IDisposable {
  [DllImport("user32.dll")] static extern IntPtr RegisterPowerSettingNotification(IntPtr h,ref Guid setting,uint flags);
  [DllImport("user32.dll")] static extern bool UnregisterPowerSettingNotification(IntPtr h);
  [DllImport("wtsapi32.dll")] static extern bool WTSRegisterSessionNotification(IntPtr h,uint flags);
  [DllImport("wtsapi32.dll")] static extern bool WTSUnRegisterSessionNotification(IntPtr h);
  IntPtr notification; bool sessionRegistered;
  public bool DisplayKnown,DisplayOn,Locked,Suspended;
  public ScreenState(){
    CreateHandle(new CreateParams{Caption="MOMIYU power notifications",Style=0});
    Guid display=new Guid("2B84C20E-AD23-4DDF-93DB-05FFBD7EFCA5");
    notification=RegisterPowerSettingNotification(Handle,ref display,0);
    sessionRegistered=WTSRegisterSessionNotification(Handle,0);
  }
  protected override void WndProc(ref Message m){
    if(m.Msg==0x218){
      int kind=m.WParam.ToInt32();
      if(kind==4)Suspended=true;
      if(kind==7||kind==18)Suspended=false;
      if(kind==0x8013&&m.LParam!=IntPtr.Zero){DisplayKnown=true;DisplayOn=Marshal.ReadInt32(m.LParam,20)!=0;}
    }
    if(m.Msg==0x2B1){if(m.WParam.ToInt32()==7)Locked=true;if(m.WParam.ToInt32()==8)Locked=false;}
    base.WndProc(ref m);
  }
  public bool Usable {get{return notification!=IntPtr.Zero&&sessionRegistered&&DisplayKnown&&DisplayOn&&!Locked&&!Suspended;}}
  public void Dispose(){if(notification!=IntPtr.Zero)UnregisterPowerSettingNotification(notification);if(sessionRegistered)WTSUnRegisterSessionNotification(Handle);DestroyHandle();}
}

public sealed class UseClock {
  public double Milliseconds;double previous=-1;bool previousUsable;public double RetryAt;
  public UseClock(double initial){Milliseconds=Math.Max(0,Math.Min(1800000,initial));}
  public void Tick(double now,bool usable){if(previous>=0&&usable&&previousUsable&&now-previous>=0&&now-previous<=3000)Milliseconds+=now-previous;previous=now;previousUsable=usable;}
  public bool Due(double now){return Milliseconds>=1800000&&now>=RetryAt;}
  public void Complete(){Milliseconds=0;RetryAt=0;}
  public void Fail(double now){RetryAt=now+60000;}
}

public static class ScreenCapture {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static byte[] CaptureDisplay(out int width,out int height,out Rectangle area){
    area=Screen.FromHandle(GetForegroundWindow()).Bounds;
    return Pixels(area,out width,out height);
  }
  static byte[] Pixels(Rectangle area,out int width,out int height){
    using(var raw=new Bitmap(area.Width,area.Height)){
      using(var g=Graphics.FromImage(raw))g.CopyFromScreen(area.Location,Point.Empty,area.Size,CopyPixelOperation.SourceCopy);
      double scale=Math.Min(1,960.0/Math.Max(area.Width,area.Height));width=Math.Max(1,(int)(area.Width*scale));height=Math.Max(1,(int)(area.Height*scale));
      using(var image=new Bitmap(raw,new Size(width,height)))using(var output=new MemoryStream()){image.Save(output,ImageFormat.Png);if(output.Length>4194304)throw new Exception("screen_too_large");return output.ToArray();}
    }
  }
}

public static class ScreenLoop {
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  static volatile bool saved;
  public static void Run(double initial){
    var json=new System.Web.Script.Serialization.JavaScriptSerializer{MaxJsonLength=8388608};
    Action<object> write=value=>{Console.WriteLine(json.Serialize(value));Console.Out.Flush();};
    var clock=new UseClock(initial);var time=System.Diagnostics.Stopwatch.StartNew();
    var reader=new System.Threading.Thread(()=>{string line;while((line=Console.ReadLine())!=null)if(line=="saved")saved=true;});reader.IsBackground=true;reader.Start();
    using(var state=new ScreenState())using(var timer=new Timer()){
      timer.Interval=1000;
      timer.Tick+=(sender,args)=>{
        if(saved){clock.Complete();saved=false;}
        var desktop=OpenInputDesktop(0,false,1);bool usable=desktop!=IntPtr.Zero&&state.Usable;if(desktop!=IntPtr.Zero)CloseDesktop(desktop);
        double now=time.Elapsed.TotalMilliseconds;clock.Tick(now,usable);
        write(new {type="heartbeat",use_ms=clock.Milliseconds,usable=usable});
        if(!usable||!clock.Due(now))return;
        // Only the 30-minute clock can reach this branch. No window/click hooks.
        clock.Fail(now);
        try{int width,height;Rectangle area;var bytes=ScreenCapture.CaptureDisplay(out width,out height,out area);
          write(new {type="screen",event_id=Guid.NewGuid().ToString(),occurred_at=DateTime.UtcNow.ToString("o"),screenshot=new {png=Convert.ToBase64String(bytes),width=width,height=height,reason="baseline_30m",area=new {x=area.X,y=area.Y,width=area.Width,height=area.Height},accumulated_use_ms=clock.Milliseconds}});
        }catch{write(new {type="coverage",status="screenshot_failed"});}
      };
      write(new {type="ready"});timer.Start();try{Application.Run();}finally{timer.Stop();}
    }
  }
}
}
