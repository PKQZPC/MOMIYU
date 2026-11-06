$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class MomiyuRawInput : Form {
    [StructLayout(LayoutKind.Sequential)]
    struct Device { public ushort Page, Usage; public uint Flags; public IntPtr Window; }

    [DllImport("user32.dll", SetLastError=true)]
    static extern bool RegisterRawInputDevices(Device[] devices, uint count, uint size);
    [DllImport("user32.dll")]
    static extern uint GetRawInputData(IntPtr handle, uint command, byte[] data, ref uint size, uint headerSize);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);

    readonly uint excluded;
    readonly byte[] bytes = new byte[64];
    MomiyuRawInput(uint excluded) { this.excluded = excluded; }

    protected override void WndProc(ref Message message) {
        if (message.Msg == 0xFF) {
            var foreground = GetForegroundWindow();
            uint process;
            GetWindowThreadProcessId(foreground, out process);
            uint size = (uint)bytes.Length, header = (uint)(8 + 2 * IntPtr.Size);
            uint read = GetRawInputData(message.LParam, 0x10000003, bytes, ref size, header);
            if (process != 0 && process != excluded && read >= header + 16 && read <= bytes.Length
                && BitConverter.ToUInt32(bytes, 0) == 1 && (BitConverter.ToUInt16(bytes, (int)header + 2) & 1) == 0) {
                var key = BitConverter.ToUInt16(bytes, (int)header + 6);
                if (key > 0 && key < 255) Console.WriteLine(key);
            }
        }
        base.WndProc(ref message);
    }

    public static void Run(uint excluded) {
        using (var form = new MomiyuRawInput(excluded)) {
            var device = new Device { Page = 1, Usage = 6, Flags = 0x100, Window = form.Handle };
            if (!RegisterRawInputDevices(new[]{device}, 1, (uint)Marshal.SizeOf(typeof(Device))))
                throw new System.ComponentModel.Win32Exception();
            Console.WriteLine("ready");
            Application.Run();
        }
    }
}
"@ -ReferencedAssemblies System.Windows.Forms
[MomiyuRawInput]::Run([uint32]$env:MOMIYU_INPUT_OWNER)
