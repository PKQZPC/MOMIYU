"""Offline budget regression. No SDK calls, external config or credentials."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('image_probe',ROOT/'tools/m0/probe-images.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
class ImageBudget(unittest.TestCase):
    def test_unknown_completion_consumes_stage(self):
        ledger={'image_attempts':[]}
        probe.reserve(ledger,'baby')
        with self.assertRaises(ValueError):probe.reserve(ledger,'baby')
        with self.assertRaises(ValueError):probe.reserve(ledger,'evolution')
    def test_three_calls_only_and_previous_must_succeed(self):
        ledger={'image_attempts':[]}
        for stage in ['baby','evolution','transparent']:
            entry,previous=probe.reserve(ledger,stage)
            self.assertEqual(entry['n'],1);self.assertEqual(entry['max_retries'],0)
            entry['status']='completed'
        with self.assertRaises(ValueError):probe.reserve(ledger,'baby')
        self.assertEqual(len(ledger['image_attempts']),3)
    def test_failed_reference_cannot_start_next_stage(self):
        ledger={'image_attempts':[{'stage':'baby','status':'failed_or_unknown'}]}
        with self.assertRaises(ValueError):probe.reserve(ledger,'evolution')
if __name__=='__main__':unittest.main()
