"""Read three pixels/hit-test targets only after verifying owned fixture handles."""
import ctypes as c
from ctypes import wintypes as w
import json
import sys

user=c.WinDLL('user32',use_last_error=True)
gdi=c.WinDLL('gdi32',use_last_error=True)
user.SetProcessDpiAwarenessContext.argtypes=[w.HANDLE]
user.SetProcessDpiAwarenessContext(w.HANDLE(-4))
user.WindowFromPoint.argtypes=[w.POINT];user.WindowFromPoint.restype=w.HWND
user.GetAncestor.argtypes=[w.HWND,w.UINT];user.GetAncestor.restype=w.HWND
user.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
user.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
user.GetDC.argtypes=[w.HWND];user.GetDC.restype=w.HDC
user.ReleaseDC.argtypes=[w.HWND,w.HDC]
gdi.GetPixel.argtypes=[w.HDC,c.c_int,c.c_int];gdi.GetPixel.restype=w.DWORD
request=json.loads(sys.stdin.readline())
assert len(request['points'])==2
allowed=set(request['handles'])
for handle in allowed:
    pid=w.DWORD();user.GetWindowThreadProcessId(handle,c.byref(pid))
    assert pid.value==request['pid'], 'Handle must belong to the probe process.'
backdrop=w.RECT()
assert user.GetWindowRect(request['backdrop'],c.byref(backdrop))
samples=[]
for point in request['points']:
    x,y=point['x'],point['y']
    assert backdrop.left<=x<backdrop.right and backdrop.top<=y<backdrop.bottom
    handle=user.GetAncestor(user.WindowFromPoint(w.POINT(x,y)),2)
    assert handle in allowed, 'Probe area is obscured; no pixel read permitted.'
    dc=user.GetDC(None)
    try: color=gdi.GetPixel(dc,x,y)
    finally:user.ReleaseDC(None,dc)
    assert color!=0xFFFFFFFF
    samples.append({'role':point['role'],'rgb':[color&255,(color>>8)&255,(color>>16)&255],'hit_handle':handle})
print(json.dumps({'samples':samples,'owned_only':True}))
