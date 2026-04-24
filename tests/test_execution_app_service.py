import shutil
import time
import unittest
from pathlib import Path

from file_organizer.app.session_service import OrganizerSessionService
from file_organizer.app.session_store import SessionStore


class ExecutionAppServiceTests(unittest.TestCase):
    def setUp(self):
        self.root = Path("test_temp_execution_app_service")
        if self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)
        self.target_dir = self.root / "Inbox"
        self.target_dir.mkdir(parents=True, exist_ok=True)
        self.store = SessionStore(self.root / "sessions")
        self.service = OrganizerSessionService(self.store)

    def tearDown(self):
        if self.root.exists():
            last_error = None
            for _ in range(5):
                try:
                    shutil.rmtree(self.root)
                    return
                except PermissionError as exc:
                    last_error = exc
                    time.sleep(0.1)
            if last_error is not None:
                raise last_error

    def test_run_precheck_via_execution_app_sets_ready_to_execute(self):
        (self.target_dir / "a.txt").write_text("hello", encoding="utf-8")
        created = self.service.create_session(str(self.target_dir), resume_if_exists=False)
        session = created.session
        assert session is not None
        session.stage = "planning"
        session.pending_plan = {
            "directories": ["Docs"],
            "moves": [{"source": "a.txt", "target": "Docs/a.txt"}],
            "unresolved_items": [],
            "summary": "move to docs",
        }
        self.store.save(session)

        result = self.service.execution_app.run_precheck(session.session_id)

        self.assertEqual(result.session_snapshot["stage"], "ready_to_execute")
        self.assertTrue(result.session_snapshot["precheck_summary"]["can_execute"])

    def test_execute_and_rollback_via_execution_app_updates_session_stages(self):
        (self.target_dir / "a.txt").write_text("hello", encoding="utf-8")
        created = self.service.create_session(str(self.target_dir), resume_if_exists=False)
        session = created.session
        assert session is not None
        session.stage = "ready_to_execute"
        session.pending_plan = {
            "directories": ["Docs"],
            "moves": [{"source": "a.txt", "target": "Docs/a.txt"}],
            "unresolved_items": [],
            "summary": "move to docs",
        }
        self.store.save(session)

        executed = self.service.execution_app.execute(session.session_id, confirm=True)
        rolled_back = self.service.execution_app.rollback(session.session_id, confirm=True)

        self.assertEqual(executed.session_snapshot["stage"], "completed")
        self.assertEqual(rolled_back.session_snapshot["stage"], "stale")
        self.assertTrue((self.target_dir / "a.txt").exists())
