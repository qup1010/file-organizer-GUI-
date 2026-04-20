import shutil
import time
import unittest
from pathlib import Path

from file_organizer.app.session_service import OrganizerSessionService
from file_organizer.app.session_store import SessionStore


class HistoryAppServiceTests(unittest.TestCase):
    def setUp(self):
        self.root = Path("test_temp_history_app_service")
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

    def test_list_history_via_history_app_recovers_orphaned_locked_session(self):
        created = self.service.create_session(str(self.target_dir), resume_if_exists=False)
        session = created.session
        assert session is not None
        session.stage = "executing"
        self.store.save(session)

        history = self.service.history_app.list_history()
        reloaded = self.store.load(session.session_id)

        self.assertTrue(any(entry["execution_id"] == session.session_id for entry in history))
        self.assertIsNotNone(reloaded)
        assert reloaded is not None
        self.assertEqual(reloaded.stage, "interrupted")

    def test_get_journal_summary_via_history_app_returns_execution_details(self):
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
        self.service.execute(session.session_id, confirm=True)

        summary = self.service.history_app.get_journal_summary(session.session_id)

        self.assertEqual(summary["status"], "completed")
        self.assertEqual(summary["item_count"], 2)
