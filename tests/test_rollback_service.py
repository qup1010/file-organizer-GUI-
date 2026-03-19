import json
import shutil
import unittest
from pathlib import Path
from unittest import mock

import execution_service
import organizer_service
import rollback_service


class RollbackServiceTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = Path("test_temp_rollback_dir")
        self.history_root = Path("test_temp_rollback_history")
        for path in [self.base_dir, self.history_root]:
            if path.exists():
                shutil.rmtree(path)
            path.mkdir()
        self.executions_dir = self.history_root / "executions"
        self.executions_dir.mkdir()
        self.latest_path = self.history_root / "latest_by_directory.json"

    def tearDown(self):
        for path in [self.base_dir, self.history_root]:
            if path.exists():
                shutil.rmtree(path)

    def _write_execution_journal(self, commands: str, flaky_name: str | None = None):
        parsed = organizer_service.parse_commands_block(commands)
        plan = execution_service.build_execution_plan(parsed, self.base_dir)

        with mock.patch.object(execution_service.config, "EXECUTION_LOG_DIR", self.executions_dir), \
             mock.patch.object(execution_service.config, "LATEST_BY_DIRECTORY_PATH", self.latest_path):
            if flaky_name:
                original_move = shutil.move

                def flaky_move(src, dst):
                    if Path(src).name == flaky_name:
                        raise OSError("mock move failure")
                    return original_move(src, dst)

                with mock.patch("execution_service.shutil.move", side_effect=flaky_move):
                    execution_service.execute_plan(plan)
            else:
                execution_service.execute_plan(plan)

        latest_index = json.loads(self.latest_path.read_text(encoding="utf-8"))
        execution_id = latest_index[str(self.base_dir.resolve())]
        return json.loads((self.executions_dir / f"{execution_id}.json").read_text(encoding="utf-8"))

    def test_load_latest_execution_for_directory_uses_directory_specific_pointer(self):
        other_dir = Path("test_temp_other_dir")
        if other_dir.exists():
            shutil.rmtree(other_dir)
        other_dir.mkdir()
        try:
            (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
            (other_dir / "other.txt").write_text("other", encoding="utf-8")

            self._write_execution_journal('<COMMANDS>\nMKDIR "Docs"\nMOVE "demo.txt" "Docs/demo.txt"\n</COMMANDS>')

            other_parsed = organizer_service.parse_commands_block(
                '<COMMANDS>\nMKDIR "Review"\nMOVE "other.txt" "Review/other.txt"\n</COMMANDS>'
            )
            other_plan = execution_service.build_execution_plan(other_parsed, other_dir)
            with mock.patch.object(execution_service.config, "EXECUTION_LOG_DIR", self.executions_dir), \
                 mock.patch.object(execution_service.config, "LATEST_BY_DIRECTORY_PATH", self.latest_path):
                execution_service.execute_plan(other_plan)

            with mock.patch.object(rollback_service.config, "EXECUTION_LOG_DIR", self.executions_dir), \
                 mock.patch.object(rollback_service.config, "LATEST_BY_DIRECTORY_PATH", self.latest_path):
                journal = rollback_service.load_latest_execution_for_directory(self.base_dir)

            self.assertEqual(journal.target_dir, str(self.base_dir.resolve()))
        finally:
            if other_dir.exists():
                shutil.rmtree(other_dir)

    def test_build_rollback_plan_only_uses_successful_items_in_reverse_order(self):
        (self.base_dir / "broken.txt").write_text("broken", encoding="utf-8")
        (self.base_dir / "ok.txt").write_text("ok", encoding="utf-8")
        journal = self._write_execution_journal(
            '<COMMANDS>\n'
            'MKDIR "Review"\n'
            'MOVE "broken.txt" "Review/broken.txt"\n'
            'MOVE "ok.txt" "Review/ok.txt"\n'
            '</COMMANDS>',
            flaky_name="broken.txt",
        )

        plan = rollback_service.build_rollback_plan(rollback_service.ExecutionJournal.from_dict(journal))

        self.assertEqual([action.type for action in plan.actions], ["MOVE", "RMDIR"])
        self.assertEqual(plan.actions[0].source, (self.base_dir / "Review" / "ok.txt").resolve())
        self.assertEqual(plan.actions[0].target, (self.base_dir / "ok.txt").resolve())

    def test_validate_rollback_preconditions_blocks_when_target_exists(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        journal = self._write_execution_journal('<COMMANDS>\nMKDIR "Docs"\nMOVE "demo.txt" "Docs/demo.txt"\n</COMMANDS>')
        plan = rollback_service.build_rollback_plan(rollback_service.ExecutionJournal.from_dict(journal))
        (self.base_dir / "demo.txt").write_text("new", encoding="utf-8")

        precheck = rollback_service.validate_rollback_preconditions(plan)

        self.assertFalse(precheck.can_execute)
        self.assertTrue(any("目标已存在" in item for item in precheck.blocking_errors))

    def test_validate_rollback_preconditions_allows_rmdir_after_prior_move_empties_directory(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        journal = self._write_execution_journal('<COMMANDS>\nMKDIR "Docs"\nMOVE "demo.txt" "Docs/demo.txt"\n</COMMANDS>')
        plan = rollback_service.build_rollback_plan(rollback_service.ExecutionJournal.from_dict(journal))

        precheck = rollback_service.validate_rollback_preconditions(plan)

        self.assertTrue(precheck.can_execute)
        self.assertEqual(precheck.blocking_errors, [])

    def test_execute_rollback_plan_moves_back_and_removes_empty_created_dir(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        journal = self._write_execution_journal('<COMMANDS>\nMKDIR "Docs"\nMOVE "demo.txt" "Docs/demo.txt"\n</COMMANDS>')
        rollback_plan = rollback_service.build_rollback_plan(rollback_service.ExecutionJournal.from_dict(journal))

        report = rollback_service.execute_rollback_plan(rollback_plan)

        self.assertEqual(report.failure_count, 0)
        self.assertTrue((self.base_dir / "demo.txt").exists())
        self.assertFalse((self.base_dir / "Docs").exists())

    def test_finalize_rollback_state_clears_latest_pointer_after_success(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        journal = self._write_execution_journal('<COMMANDS>\nMKDIR "Docs"\nMOVE "demo.txt" "Docs/demo.txt"\n</COMMANDS>')
        execution_journal = rollback_service.ExecutionJournal.from_dict(journal)
        rollback_plan = rollback_service.build_rollback_plan(execution_journal)
        report = rollback_service.execute_rollback_plan(rollback_plan)

        with mock.patch.object(rollback_service.config, "EXECUTION_LOG_DIR", self.executions_dir), \
             mock.patch.object(rollback_service.config, "LATEST_BY_DIRECTORY_PATH", self.latest_path):
            rollback_service.finalize_rollback_state(execution_journal, report)

        latest_index = json.loads(self.latest_path.read_text(encoding="utf-8"))
        self.assertNotIn(str(self.base_dir.resolve()), latest_index)


if __name__ == "__main__":
    unittest.main()
