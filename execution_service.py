import sys

from file_organizer.execution import service as _module
from file_organizer.execution.models import (
    ExecutionAction,
    ExecutionItemResult,
    ExecutionJournal,
    ExecutionJournalItem,
    ExecutionPlan,
    ExecutionReport,
    PrecheckResult,
)

for name, value in {
    "ExecutionAction": ExecutionAction,
    "ExecutionItemResult": ExecutionItemResult,
    "ExecutionJournal": ExecutionJournal,
    "ExecutionJournalItem": ExecutionJournalItem,
    "ExecutionPlan": ExecutionPlan,
    "ExecutionReport": ExecutionReport,
    "PrecheckResult": PrecheckResult,
}.items():
    setattr(_module, name, value)

sys.modules[__name__] = _module
