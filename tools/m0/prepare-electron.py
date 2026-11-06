"""Download a checksum-verified isolated Electron runtime for M0, not globally."""
import hashlib
import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen
import zipfile

HERE=Path(__file__).resolve().parent
OUT=HERE/'.local/electron-runtime'
def fetch(url):
 with urlopen(Request(url,headers={'User-Agent':'MOMIYU-M0-runtime-probe'}),timeout=120) as response:return response.read()
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--version',default='v45.1.0',help='Pinned official release tag.')
 args=parser.parse_args()
 if not __import__('re').fullmatch(r'v\d+\.\d+\.\d+',args.version):raise ValueError('Expected a stable release tag.')
 OUT.mkdir(parents=True,exist_ok=True)
 release=json.loads(fetch(f'https://api.github.com/repos/electron/electron/releases/tags/{args.version}'))
 tag=release['tag_name'];name=f'electron-{tag}-win32-x64.zip'
 assets={item['name']:item['browser_download_url'] for item in release['assets']}
 checksums=fetch(assets['SHASUMS256.txt']).decode()
 digest=next(line.split()[0] for line in checksums.splitlines() if line.split()[-1].lstrip('*')==name)
 archive=OUT/name
 if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:
  archive.write_bytes(fetch(assets[name]))
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise ValueError('Electron archive checksum mismatch.')
 target=OUT/tag;target.mkdir(exist_ok=True)
 with zipfile.ZipFile(archive) as zipped:
  for member in zipped.infolist():
   resolved=(target/member.filename).resolve()
   if not resolved.is_relative_to(target.resolve()):raise ValueError('Unsafe archive member.')
  zipped.extractall(target)
 metadata={'version':tag,'archive':name,'sha256':digest,'source':assets[name],'executable':str(target/'electron.exe'),'global_install':False}
 (OUT/'runtime.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
 print(json.dumps(metadata))
if __name__=='__main__':main()
