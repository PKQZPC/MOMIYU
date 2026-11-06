"""Budgeted project asset work using the unchanged imagegen CLI and no SDK retries."""
import argparse, importlib.util, json, os, sys, hashlib
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/m0/.local/python-deps'))
CLI=Path('D:/codex/codex/skills/.system/imagegen/scripts/image_gen.py')

def now(): return datetime.now(timezone.utc).isoformat()
def save(path,value):
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(temporary,path)
def inside(value):
    p=Path(value).resolve()
    if not p.is_relative_to(ROOT): raise ValueError('path_outside_project')
    return p

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proxy-config',required=True);parser.add_argument('--white-reference',required=True);parser.add_argument('--output',required=True);parser.add_argument('--approval',required=True)
    parser.add_argument('--request-set',choices=['initial','soft-and-pearl-white'],default='initial')
    args=parser.parse_args();out=inside(args.output);out.mkdir(parents=True,exist_ok=True)
    approval=json.loads(inside(args.approval).read_text(encoding='utf-8-sig'))
    limit=4 if args.request_set=='initial' else 5
    allocation=approval['egg_assets'] if args.request_set=='initial' else approval.get('egg_asset_revision')
    if approval.get('approved') is not True or allocation!={'image_calls':limit,'quality':'medium','automatic_retries':0}: raise ValueError('explicit_asset_budget_required')
    spec=importlib.util.spec_from_file_location('existing_m0_image_adapter',ROOT/'tools/m0/probe-images.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
    from openai import OpenAI
    base,key=adapter.config(args.proxy_config);client=OpenAI(api_key=key,base_url=base,max_retries=0,timeout=240)
    spec=importlib.util.spec_from_file_location('bundled_imagegen_cli',CLI);cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
    ledger_path=out/'ledger.json';ledger=json.loads(ledger_path.read_text()) if ledger_path.exists() else {'image_limit':limit,'request_set':args.request_set,'automatic_retries':0,'model':'gpt-image-1.5','calls':[]}
    if ledger['image_limit']!=limit: raise ValueError('ledger_budget_mismatch')
    lock=out/'request.lock';descriptor=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.close(descriptor)
    white=inside(args.white_reference);references=ROOT/'.local/artwork/egg-palette/v001/references'
    try:
        requests=[(c,'v001',c,c) for c in ['green','purple','red','blue']] if args.request_set=='initial' else [('soft-'+c,'v002',c,c) for c in ['green','purple','red','blue']]+[('pearl-white','v003','white','white')]
        for color,version,prompt_name,reference_name in requests:
            previous=next((x for x in ledger['calls'] if x['color']==color),None)
            if previous:
                if previous['status']=='completed': continue
                raise ValueError('previous_attempt_not_retryable')
            if len(ledger['calls'])>=limit: raise ValueError('asset_budget_exhausted')
            prompt=ROOT/f'apps/desktop/assets/eggs/requests/{version}/{prompt_name}.txt';reference=references/f'{reference_name}.png'
            entry={'color':color,'status':'reserved','at':now(),'quality':'medium','max_retries':0,'prompt_sha256':hashlib.sha256(prompt.read_bytes()).hexdigest(),'references_sha256':[hashlib.sha256(p.read_bytes()).hexdigest() for p in [white,reference]]};ledger['calls'].append(entry);save(ledger_path,ledger)
            class Images:
                def edit(self,**kwargs):
                    if kwargs.get('n')!=1: raise ValueError('one_image_required')
                    result=client.images.edit(**kwargs);entry['usage']=result.usage.model_dump() if getattr(result,'usage',None) else None
                    if len(result.data)!=1: raise ValueError('unexpected_image_count')
                    return result
            class ConfiguredClient: images=Images()
            cli._create_client=lambda:ConfiguredClient()
            sys.argv=[str(CLI),'edit','--model','gpt-image-1.5','--image',str(white),'--image',str(reference),'--prompt-file',str(prompt),'--no-augment','--n','1','--size','1024x1024','--quality','medium','--background','transparent','--output-format','png','--out',str(out/f'{color}.png')]
            old=os.environ.get('OPENAI_API_KEY');os.environ['OPENAI_API_KEY']=key
            try:
                cli.main();entry['status']='completed';entry['sha256']=hashlib.sha256((out/f'{color}.png').read_bytes()).hexdigest();print('Egg asset completed: '+color,flush=True)
            except BaseException as error:
                entry['status']='failed_or_unknown';entry['error_type']=type(error).__name__;entry['http_status']=getattr(error,'status_code',None);print(json.dumps({'color':color,'status':entry['status'],'error_type':entry['error_type'],'http_status':entry['http_status']}),flush=True);raise SystemExit(1)
            finally:
                if old is None: os.environ.pop('OPENAI_API_KEY',None)
                else: os.environ['OPENAI_API_KEY']=old
                entry['ended_at']=now();save(ledger_path,ledger)
    finally: client.close();lock.unlink(missing_ok=True)

if __name__=='__main__': main()
