import sys

from file_organizer.organize import service as _module

sys.modules[__name__] = _module
