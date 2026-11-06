"""Encode already-rendered application frames; no art generation or editing."""
from pathlib import Path
import json,sys
from PIL import Image
root=Path(__file__).resolve().parents[2]
directory=Path(sys.argv[1]).resolve()
if not directory.is_relative_to(root/'demo_data/.local/runs'): raise ValueError('invalid_showcase_path')
manifest=json.loads((directory/'manifest.json').read_text())
files=sorted((directory/'frames').glob('*.png'))
if len(files)!=manifest['frames']: raise ValueError('incomplete_recording')
output=directory/'growth-actions.gif'
if output.exists(): raise ValueError('recording_version_exists')
frames=[]
for file in files:
    with Image.open(file) as image:
        width=960;height=round(image.height*width/image.width)
        frames.append(image.convert('RGB').resize((width,height),Image.Resampling.LANCZOS).quantize(colors=192))
frames[0].save(output,save_all=True,append_images=frames[1:],duration=manifest['frame_delay_ms'],loop=0,optimize=False)
print(json.dumps({'frames':len(frames),'bytes':output.stat().st_size,'output':str(output)},ensure_ascii=False))
