"""Structural schema checks; semantic access boundaries are tested separately."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/m0/.local/python-deps'))
from jsonschema import Draft202012Validator
sys.path.insert(0,str(ROOT/'packages/contracts'))
from validation import VALIDATOR as V

SCHEMA=json.loads((ROOT/'packages/contracts/domain.schema.json').read_text(encoding='utf-8'))
R={'id':'source-object','version':1}
AT='2026-10-27T09:00:00Z'
BODIES={
 'raw_observation':{'source_id':'fixture','actor':'user','observed_at':AT,'sequence':0,'operation':'text_submitted','object_ref':R,'content_refs':[R]},
 'content_version':{'source_id':'fixture','available_at':AT,'created_at':AT,'dependencies':[],'representation':'text','blob_ref':'sha256:fixture','completeness':'complete'},
 'process_evidence':{'observation_ref':R,'before_refs':[R],'after_refs':[],'gaps':['result not observed']},
 'workflow_attribution':{'evidence_refs':[R],'workflow_ids':[],'reason':'insufficient goal evidence','certainty':'unresolved'},
 'user_understanding':{'claim':'tentative understanding','state':'candidate','evidence_refs':[R],'supersedes':[]},
 'shared_memory':{'event_description':'shared synthetic event','state':'effective','evidence_refs':[R]},
 'skill_version':{'state':'candidate','scope':'supported scope','method_ref':R,'evidence_uses':[{'ref':R,'use':'learning'}],'tool_requirements':['read_content']},
 'pet_asset_version':{'state':'candidate','pet_state_ref':R,'reference_ref':R,'action_refs':[R],'runtime_ref':R},
 'analysis_work':{'batch_id':'batch-a','role':'skill_comparison','state':'pending','input_refs':[R],'dependency_refs':[],'checkpoint_ref':None,'reserved_tokens':1000},
 'task_execution':{'skill_ref':R,'authority_ref':R,'state':'partial','result_refs':[R],'actor':'pet'},
 'model_manifest':{'purpose':'next action comparison','checkpoint':AT,'skill_ref':R,'input_refs':[R],'mode':'prediction'}
}
def envelope(kind):return {'schema_version':'0.1.0','kind':kind,'id':'synthetic-record','version':1,'body':copy.deepcopy(BODIES[kind])}

class ContractsTest(unittest.TestCase):
 def test_schema_is_valid(self):Draft202012Validator.check_schema(SCHEMA)
 def test_separated_entities(self):
  for kind in BODIES:
   with self.subTest(kind=kind):V.validate(envelope(kind))
 def test_cross_entity_fields_are_rejected(self):
  for kind in BODIES:
   record=envelope(kind);record['body']['arbitrary_other_domain']={}
   with self.subTest(kind=kind):self.assertTrue(list(V.iter_errors(record)))
 def test_unknown_version_and_kind_rejected(self):
  for field,value in [('schema_version','9.0.0'),('kind','mixed_state'),('version',0)]:
   record=envelope('content_version');record[field]=value;self.assertTrue(list(V.iter_errors(record)))
 def test_reference_requires_explicit_version(self):
  record=envelope('process_evidence');record['body']['before_refs']=[{'id':'latest'}];self.assertTrue(list(V.iter_errors(record)))
 def test_timestamp_is_not_free_text(self):
  record=envelope('raw_observation');record['body']['observed_at']='yesterday';self.assertTrue(list(V.iter_errors(record)))
 def test_draft_key_history_not_an_observation_operation(self):
  record=envelope('raw_observation');record['body']['operation']='raw_keystroke';self.assertTrue(list(V.iter_errors(record)))

if __name__=='__main__':unittest.main(verbosity=2)
