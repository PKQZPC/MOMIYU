"""M0 schema validation with an explicit timestamp checker (no optional extras)."""
from datetime import datetime
import json
from pathlib import Path
import re

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA = json.loads(Path(__file__).with_name('domain.schema.json').read_text(encoding='utf-8'))
CHECKER = FormatChecker()

@CHECKER.checks('date-time')
def is_timestamp(value):
    if not isinstance(value, str):
        return True  # JSON Schema's type keyword handles non-strings.
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', value):
        return False
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None
    except ValueError:
        return False

VALIDATOR = Draft202012Validator(SCHEMA, format_checker=CHECKER)

def validate_record(record):
    VALIDATOR.validate(record)
