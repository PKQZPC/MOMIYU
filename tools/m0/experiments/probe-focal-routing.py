"""M0 adaptation experiment; never a skill predictor or production task router."""
import hashlib
import importlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'tools/m0/.local'
vendor=OUT/'upstream/focal'
lock=json.loads((ROOT/'third-party/m0-sources.lock.json').read_text(encoding='utf-8'))
for source in lock['focal_files']:
    assert hashlib.sha256((vendor/source['path']).read_bytes()).hexdigest()==source['sha256'], 'Cached source differs from reviewed version.'
sys.path.insert(0,str(vendor))
core=importlib.import_module('experiments_window_based.core')
base=importlib.import_module('experiments_window_based.focal_method').FocalSessionMethod

class ExplicitIdentityExperiment(base):
    def _match_existing_task(self,requested_task_id,action):
        # Upstream aliases already handle known planner IDs before this hook.
        # Never override a distinct explicit ID merely because the app is the same.
        return requested_task_id if requested_task_id in self.tasks else None

class Plans(core.LLMBackendInterface):
    def __init__(self,ids):self.ids=ids
    def generate_text_summary(self,prompt,context,role='brain'):
        if role!='planner':return 'Synthetic routing test only.'
        return json.dumps({'action_plans':[{'stream_index':i,'decision':'existing_task' if task in self.ids[:i] else 'new_task','task_id':task,'task_label':task,'should_sample':False,'reason':'explicit synthetic task identity'} for i,task in enumerate(self.ids)]})
    def generate_multimodal_summary(self,*args):raise AssertionError('No image calls.')
    def generate_embedding(self,*args):raise AssertionError('No embedding calls.')

cases=[('same-app-distinct-goals',[('Browser','修改文档配色'),('Browser','选择生日礼物')],['A','B']),
       ('cross-app-return',[('Editor','文档'),('Browser','礼物'),('Editor','文档')],['A','B','A']),
       ('same-goal-across-apps',[('Editor','文档'),('Browser','参考页面'),('Editor','保存')],['A','A','A'])]
results=[]
for name,metadata,ids in cases:
    actions=[core.SessionAction(name,i,app,title,None) for i,(app,title) in enumerate(metadata)]
    result=ExplicitIdentityExperiment(Plans(ids)).process_session(name,actions)
    actual=sorted(sorted(task['action_indices']) for task in result['tasks'])
    expected=sorted([i for i,value in enumerate(ids) if value==task] for task in dict.fromkeys(ids))
    results.append({'id':name,'passed':actual==expected,'expected':expected,'actual':actual,
                    'evidence_refs':[{'id':f'{name}-observation-{i}','version':1} for i in range(len(ids))]})
report={'schema_version':'0.1.0','synthetic_only':True,'status':'passed' if all(r['passed'] for r in results) else 'failed',
        'cases':results,'limits':['Explicit supplied identities only; no semantic task recognition claim.',
        'Full-session upstream planning is retrospective only; forbidden as independent skill prediction input.',
        'Missing/uncertain identity must remain unresolved in the future adapter; this experiment is not that adapter.',
        'Upstream cache is hash-checked and never modified. No production code or background recorder started.']}
(OUT/'focal-routing-experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
assert report['status']=='passed'
