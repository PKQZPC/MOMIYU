"""Opt-in native COM/UIA probe against one owned invisible fixture only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / '.local' / 'python-deps'))

def main():
    if sys.platform != 'win32':
        raise SystemExit('Windows required.')
    import comtypes.client
    module = comtypes.client.GetModule('UIAutomationCore.dll')
    uia = comtypes.client.CreateObject('{FF48DBA4-60EF-4201-AA87-54103EEF594E}', interface=module.IUIAutomation)
    output = HERE / '.local'
    output.mkdir(exist_ok=True)
    manifest = output / 'native-fixture-com.json'
    manifest.unlink(missing_ok=True)
    process = subprocess.Popen(['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-STA', '-File', str(HERE / 'fixtures/native-window.ps1'), '-ManifestPath', str(manifest)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    report = {'synthetic_only': True, 'status': 'limited', 'checks': [], 'limits': ['Invisible controlled WinForms fixture only; not real-app coverage.', 'Only explicitly supplied handles belonging to the fixture are read.', 'No proof of Electron rendering/packaging or all Windows providers.']}
    try:
        for _ in range(100):
            if manifest.exists():
                break
            time.sleep(.1)
        fixture = json.loads(manifest.read_text(encoding='utf-8-sig'))
        assert fixture['pid'] == process.pid and fixture['synthetic_only']
        root = uia.ElementFromHandle(fixture['root_handle'])
        assert root.CurrentProcessId == process.pid
        field = uia.ElementFromHandle(fixture['field_handle'])
        button = uia.ElementFromHandle(fixture['save_handle'])
        result = uia.ElementFromHandle(fixture['result_handle'])
        report['field'] = {'name': field.CurrentName, 'control_type': field.CurrentControlType, 'automation_id': field.CurrentAutomationId}
        pattern = field.GetCurrentPattern(10002).QueryInterface(module.IUIAutomationValuePattern)
        report['before'] = pattern.CurrentValue
        pattern.SetValue('controlled saved value')
        button.GetCurrentPattern(10000).QueryInterface(module.IUIAutomationInvokePattern).Invoke()
        for _ in range(30):
            if result.CurrentName == 'Saved: controlled saved value':
                break
            time.sleep(.1)
        assert result.CurrentName == 'Saved: controlled saved value'
        report['after'] = result.CurrentName
        report['checks'] = [{'name': name, 'passed': True} for name in ['owned process handles', 'native UIA value read', 'native UIA edit/invoke', 'observed result', 'native transparent fixture']]
        report['checks'].append({'name': 'edit role and accessible label', 'passed': field.CurrentControlType == 50004 and field.CurrentName == 'MOMIYU_M0_FIELD'})
    except Exception as exc:
        report['error_type'] = type(exc).__name__
        report['error'] = str(exc)[:350]
        report['status'] = 'failed'
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        (output / 'windows-com.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'report': str(output / 'windows-com.json'), 'status': report['status'], 'checks': len(report['checks'])}))

if __name__ == '__main__':
    main()
