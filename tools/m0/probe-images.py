"""M0 bounded harness delegating generation/editing to the unchanged imagegen CLI."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime,timezone

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'.local/python-deps'))
OUT=HERE/'.local/image-validation-20261030'
CLI=Path('D:/codex/codex/skills/.system/imagegen/scripts/image_gen.py')
FIXTURES=HERE.parents[1]/'tests/fixtures/m0/image-validation'
def now():return datetime.now(timezone.utc).isoformat()
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2,ensure_ascii=False),encoding='utf-8');os.replace(temp,path)
def config(filename):
    lines=Path(filename).read_text(encoding='utf-8-sig').splitlines()
    host='127.0.0.1';port=None;keys=[];inside=False
    def scalar(value):return value.strip().strip('\"\'')
    for line in lines:
        if line.startswith('host:'):host=scalar(line[5:])
        if line.startswith('port:'):port=int(line[5:].strip())
        if re.fullmatch(r'api-keys:\s*',line):inside=True;continue
        if inside and line and not line[0].isspace():inside=False
        if inside and re.match(r'\s+-\s+',line):keys.append(scalar(re.sub(r'^\s+-\s+','',line)))
    if host not in ['localhost','127.0.0.1','::1'] or not port or not 1<=port<=65535 or not keys:raise ValueError('Invalid loopback configuration.')
    return f'http://{("[::1]" if host=="::1" else host)}:{port}/v1',keys[0]
def reserve(ledger,stage):
    stages=ledger['image_attempts']
    if len(stages)>=3 or any(item['stage']==stage for item in stages):raise ValueError('Budget exhausted or stage already attempted; no retries.')
    previous={'evolution':'baby','transparent':'evolution'}.get(stage)
    if previous and not any(item['stage']==previous and item['status']=='completed' for item in stages):raise ValueError('Required previous image missing.')
    entry={'stage':stage,'started_at':now(),'status':'reserved','model':'gpt-image-1.5','n':1,'max_retries':0}
    stages.append(entry)
    return entry,previous
def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proxy-config',required=True)
    parser.add_argument('--stage',choices=['preflight','baby','evolution','transparent','judge'],required=True)
    args=parser.parse_args()
    from openai import OpenAI
    base,key=config(args.proxy_config)
    client=OpenAI(api_key=key,base_url=base,max_retries=0,timeout=240)
    OUT.mkdir(parents=True,exist_ok=True)
    if args.stage=='preflight':
        models=sorted(item.id for item in client.models.list().data)
        write(OUT/'preflight.json',{'generated_at':now(),'model_ids':models,'max_retries':client.max_retries,'image_model':'gpt-image-1.5','image_model_listed':'gpt-image-1.5' in models})
        print(json.dumps({'image_model_listed':'gpt-image-1.5' in models,'max_retries':client.max_retries}));return
    ledger_path=OUT/'ledger.json'
    ledger=json.loads(ledger_path.read_text()) if ledger_path.exists() else {'image_limit':3,'image_attempts':[],'judgment_attempts':[]}
    if args.stage=='judge':
        judge(client,ledger,ledger_path);return
    entry,previous=reserve(ledger,args.stage)
    write(ledger_path,ledger) # Reserve before any network side effect.
    spec=importlib.util.spec_from_file_location('bundled_imagegen_cli',CLI)
    cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
    class Images:
        def call(self,method,**kwargs):
            if kwargs.get('n')!=1:raise ValueError('Exactly one image per stage.')
            result=getattr(client.images,method)(**kwargs)
            entry['usage']=result.usage.model_dump() if getattr(result,'usage',None) else None
            entry['returned_images']=len(result.data)
            if len(result.data)!=1:raise ValueError('Unexpected image count; stop the round.')
            return result
        def generate(self,**kwargs):return self.call('generate',**kwargs)
        def edit(self,**kwargs):return self.call('edit',**kwargs)
    class ConfiguredClient:images=Images()
    cli._create_client=lambda:ConfiguredClient()
    output=OUT/f'{args.stage}.png'
    sys.argv=[str(CLI),'generate' if args.stage=='baby' else 'edit','--model','gpt-image-1.5','--prompt-file',str(FIXTURES/f'{args.stage}.txt'),'--no-augment','--n','1','--size','1024x1024','--quality','low','--output-format','png','--out',str(output)]
    if previous:sys.argv+=['--image',str(OUT/f'{previous}.png'),'--input-fidelity','high']
    if args.stage=='transparent':sys.argv+=['--background','transparent']
    old=os.environ.get('OPENAI_API_KEY');os.environ['OPENAI_API_KEY']=key
    try:
        cli.main();entry['status']='completed';entry['output']=output.name
    except Exception as error:
        entry['status']='failed_or_unknown';entry['error_type']=type(error).__name__
        entry['http_status']=getattr(error,'status_code',None)
        print(json.dumps({'stage':args.stage,'status':entry['status'],'http_status':entry['http_status'],'error_type':entry['error_type']}))
    finally:
        if old is None:os.environ.pop('OPENAI_API_KEY',None)
        else:os.environ['OPENAI_API_KEY']=old
        entry['ended_at']=now();write(ledger_path,ledger);client.close()
    if entry['status']!='completed':raise SystemExit(1)
    print(json.dumps({'stage':args.stage,'status':entry['status'],'output':str(output)}))
def judge(client,ledger,path):
    import base64
    if ledger['judgment_attempts']:raise ValueError('Judgment already attempted; no retries.')
    for name in ['baby','evolution','transparent']:
        if not (OUT/f'{name}.png').exists():raise ValueError('Required actual image missing.')
    entry={'status':'reserved','started_at':now(),'model':'gpt-5.6-terra'};ledger['judgment_attempts'].append(entry);write(path,ledger)
    prompt='M0 synthetic visual continuity evaluation. Inspect the actual images in order: hatchling, evolved candidate, runtime transparent derivative. The experiences/context for the first two follow. Judge contextual continuity without a universal similarity threshold or fixed anatomy checklist. Be willing to reject or express uncertainty; style change alone is not a rejection. Separate (1) candidate identity relative to hatchling and (2) runtime fidelity to evolved candidate. This is one sample, not proof of model reliability or accepted pet growth. Return JSON with identity_judgment, visual_evidence, experience_relation, runtime_fidelity, decision (accept_candidate/reject_candidate/uncertain), limitations. Do not claim animation from still images.\n'+(FIXTURES/'baby.txt').read_text()+'\n'+(FIXTURES/'evolution.txt').read_text()
    content=[{'type':'input_text','text':prompt}]
    for name in ['baby','evolution','transparent']:content.append({'type':'input_image','image_url':'data:image/png;base64,'+base64.b64encode((OUT/f'{name}.png').read_bytes()).decode()})
    try:
        result=client.responses.create(model=entry['model'],store=False,input=[{'role':'user','content':content}],max_output_tokens=1800,reasoning={'effort':'low'})
        entry.update(status=result.status,usage=result.usage.model_dump() if result.usage else None)
        write(OUT/'judgment.json',{'generated_at':now(),'model':result.model,'output':result.output_text,'image_order':['baby.png','evolution.png','transparent.png'],'synthetic_only':True})
        print(json.dumps({'judgment_status':result.status,'usage':entry['usage']}))
    except Exception as error:
        entry.update(status='failed_or_unknown',error_type=type(error).__name__,http_status=getattr(error,'status_code',None));print(json.dumps(entry))
    finally:entry['ended_at']=now();write(path,ledger);client.close()
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    # Fail closed on concurrent or interrupted invocations. No stale-lock recovery
    # or API retry is automatic; completed stage IDs remain consumed in the ledger.
    lock=OUT/'request.lock'
    descriptor=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    try:
        os.write(descriptor,str(os.getpid()).encode());os.close(descriptor)
        run()
    finally:lock.unlink(missing_ok=True)
if __name__=='__main__':main()
