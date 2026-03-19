import sys

from file_organizer.execution.models import ExecutionJournal, ExecutionJournalItem
from file_organizer.rollback import service as _module
from file_organizer.rollback.models import (
    RollbackAction,
    RollbackItemResult,
    RollbackPlan,
    RollbackPrecheckResult,
    RollbackReport,
)

for name, value in {
    "ExecutionJournal": ExecutionJournal,
    "ExecutionJournalItem": ExecutionJournalItem,
    "RollbackAction": RollbackAction,
    "RollbackItemResult": RollbackItemResult,
    "RollbackPlan": RollbackPlan,
    "RollbackPrecheckResult": RollbackPrecheckResult,
    "RollbackReport": RollbackReport,
}.items():
    setattr(_module, name, value)

sys.modules[__name__] = _module
