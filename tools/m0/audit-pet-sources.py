"""Verify or explicitly fetch the pinned interactive-pet source review inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/m0/.local/pet-reuse'
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true')
    args=parser.parse_args()
    lock=json.loads((ROOT/'third-party/m0-pet-sources.lock.json').read_text(encoding='utf-8'))
    count=0
    for source in lock['sources']:
        repo=source['repository'].removeprefix('https://github.com/')
        assert re.fullmatch(r'[\w.-]+/[\w.-]+',repo)
        assert re.fullmatch(r'[a-f0-9]{40}',source['commit'])
        for entry in source['files']:
            relative=Path(entry['path'])
            assert not relative.is_absolute() and '..' not in relative.parts
            target=OUT/repo.split('/')[-1]/relative
            if args.fetch:
                url=f"https://raw.githubusercontent.com/{repo}/{source['commit']}/{entry['path']}"
                with urlopen(Request(url,headers={'User-Agent':'MOMIYU-M0-source-review'}),timeout=30) as response:content=response.read(1_000_001)
                assert len(content)<=1_000_000
                assert hashlib.sha256(content).hexdigest()==entry['sha256']
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            assert hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256'],f'Source mismatch: {relative}'
            count+=1
    print(json.dumps({'status':'passed','sources':len(lock['sources']),'verified_files':count,'network':args.fetch}))
if __name__=='__main__':main()
