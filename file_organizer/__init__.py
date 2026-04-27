"""Compatibility alias for the renamed file_pilot package."""

from __future__ import annotations

from importlib import import_module
import sys

_file_pilot = import_module("file_pilot")
sys.modules[__name__] = _file_pilot
