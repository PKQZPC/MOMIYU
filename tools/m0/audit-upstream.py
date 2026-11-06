"""Fetch reviewed source snapshots and probe FOCAL with synthetic metadata."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

HERE=Path(__file__).resolve().parent
OUT=HERE/'.local'
PIN='0ce2eae723efc144249aa84e447e6e16351752c2'
SOURCES=[
 ('focal','Haoran2099/focal',PIN,'LICENSE'),
 ('activitywatch-window','ActivityWatch/aw-watcher-window','10638b2c94e46195f709abd8626cb15f911e99f8','LICENSE.txt'),
 ('activitywatch-web','ActivityWatch/aw-watcher-web','fb17330e4e702c4a770a117674e7ac598b68fe3f','LICENSE'),
 ('openadapt-capture','OpenAdaptAI/OpenAdapt','a016fd67ed28a14ef624f765840b9ab92448e8cc','packages/capture/LICENSE'),
 ('rrweb','rrweb-io/rrweb','339683f34bf2dd5df2e7cc18fe59fb924b65661b','LICENSE'),
 ('ufo','microsoft/UFO','eae3c0a8d168c47cb10df0652e293e092eda1078','LICENSE'),
]
def fetch(url):
 with urlopen(Request(url,headers={'User-Agent':'MOMIYU-M0-source-audit'}),timeout=40) as reply:return reply.read()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--fetch',action='store_true');args=parser.parse_args()
 vendor=OUT/'upstream/focal';vendor.mkdir(parents=True,exist_ok=True)
 files=['experiments_window_based/__init__.py','experiments_window_based/core.py','experiments_window_based/config.py','experiments_window_based/focal_method.py','LICENSE']
 inventory=[]
 if args.fetch:
  for name,repo,revision,license_path in SOURCES:
   commit=json.loads(fetch(f'https://api.github.com/repos/{repo}/commits/{revision}'))['sha']
   license_data=fetch(f'https://raw.githubusercontent.com/{repo}/{commit}/{license_path}')
   license_dir=OUT/'upstream/licenses';license_dir.mkdir(parents=True,exist_ok=True)
   (license_dir/f'{name}.txt').write_bytes(license_data)
   inventory.append({'name':name,'repository':f'https://github.com/{repo}','commit':commit,'license_path':license_path,'license_sha256':hashlib.sha256(license_data).hexdigest(),'license_heading':license_data.decode('utf-8-sig').splitlines()[0]})
  for filename in files:
   target=vendor/filename;target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(fetch(f'https://raw.githubusercontent.com/Haoran2099/focal/{PIN}/{filename}'))
  (OUT/'upstream-lock.json').write_text(json.dumps({'schema_version':'0.1.0','purpose':'M0 source audit; not installed production dependencies','sources':inventory,'focal_files':[{ 'path':name,'sha256':hashlib.sha256((vendor/name).read_bytes()).hexdigest()} for name in files]},indent=2),encoding='utf-8')
 elif not (vendor/'experiments_window_based/focal_method.py').exists():raise SystemExit('Use --fetch once to cache reviewed sources.')
 sys.path.insert(0,str(vendor))
 core=importlib.import_module('experiments_window_based.core')
 method=importlib.import_module('experiments_window_based.focal_method').FocalSessionMethod
 class Backend(core.LLMBackendInterface):
  def __init__(self,plans):self.plans=plans
  def generate_text_summary(self,prompt,context,role='brain'):
   return json.dumps({'action_plans':self.plans}) if role=='planner' else 'No visual observations in this controlled routing probe.'
  def generate_multimodal_summary(self,*args):raise AssertionError('No VLM calls allowed in source audit.')
  def generate_embedding(self,*args):raise AssertionError('No embedding calls allowed in source audit.')
 def run_case(name,metadata,ids):
  plans=[{'stream_index':i,'decision':'new_task' if task not in ids[:i] else 'existing_task','task_id':task,'task_label':title,'should_sample':False,'reason':'synthetic explicit goal'} for i,((app,title),task) in enumerate(zip(metadata,ids))]
  actions=[core.SessionAction(name,i,app,title,None) for i,(app,title) in enumerate(metadata)]
  result=method(Backend(plans)).process_session(name,actions)
  groups=sorted(sorted(task['action_indices']) for task in result['tasks'])
  expected=sorted([i for i,value in enumerate(ids) if value==task] for task in dict.fromkeys(ids))
  return {'id':name,'expected_groups':expected,'actual_groups':groups,'passed':groups==expected,'traces':result['action_trace']}
 cases=[run_case('cross-app-aba',[('Editor','Document Alpha'),('Browser','Gift Beta'),('Editor','Document Alpha')],['task_a','task_b','task_a']),run_case('same-app-chinese-distinct-goals',[('Browser','修改文档配色'),('Browser','选择生日礼物')],['task_a','task_b'])]
 report={'schema_version':'0.1.0','synthetic_only':True,'status':'passed' if all(case['passed'] for case in cases) else 'limited','focal_commit':PIN,'cases':cases,'source_hashes':[{ 'path':name,'sha256':hashlib.sha256((vendor/name).read_bytes()).hexdigest()} for name in files],'limits':['Deterministic supplied plans test upstream grouping logic, not LLM quality.','No production dependency is installed; source snapshots are ignored audit cache.','Known attribution fallback may merge explicit new goals in the same app.']}
 (OUT/'upstream-audit.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
 print(json.dumps({'report':str(OUT/'upstream-audit.json'),'status':report['status'],'cases':[{k:v for k,v in case.items() if k!='traces'} for case in cases]},ensure_ascii=False))
if __name__=='__main__':main()
