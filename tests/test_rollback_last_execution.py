import shutil
import unittest
from pathlib import Path
from unittest import mock

import rollback_last_execution
import rollback_service


class RollbackLastExecutionScriptTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = Path("test_temp_rollback_script_dir")
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)
        self.base_dir.mkdir()

    def tearDown(self):
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)

    def test_script_only_executes_after_yes_confirmation(self):
        journal = rollback_service.ExecutionJournal(
            execution_id="exec-1",
            target_dir=str(self.base_dir.resolve()),
            created_at="2026-03-19T12:00:00",
            status="completed",
            items=[],
            rollback_attempts=[],
        )
        plan = mock.Mock()
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock()
        report.failure_count = 0

        with mock.patch.object(rollback_last_execution.rollback, "load_latest_execution_for_directory", return_value=journal), \
             mock.patch.object(rollback_last_execution.rollback, "build_rollback_plan", return_value=plan), \
             mock.patch.object(rollback_last_execution.rollback, "validate_rollback_preconditions", return_value=precheck), \
             mock.patch.object(rollback_last_execution.rollback, "render_rollback_preview", return_value="preview"), \
             mock.patch.object(rollback_last_execution.rollback, "execute_rollback_plan", return_value=report) as execute_mock, \
             mock.patch.object(rollback_last_execution.rollback, "render_rollback_report", return_value="report"), \
             mock.patch.object(rollback_last_execution.rollback, "finalize_rollback_state") as finalize_mock, \
             mock.patch("builtins.input", side_effect=["YES"]), \
             mock.patch("builtins.print") as print_mock:
            exit_code = rollback_last_execution.main([str(self.base_dir)])

        self.assertEqual(exit_code, 0)
        execute_mock.assert_called_once_with(plan)
        finalize_mock.assert_called_once()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("preview", printed)
        self.assertIn("report", printed)

    def test_script_exits_without_execution_when_no_latest_journal(self):
        with mock.patch.object(rollback_last_execution.rollback, "load_latest_execution_for_directory", return_value=None), \
             mock.patch("builtins.print") as print_mock:
            exit_code = rollback_last_execution.main([str(self.base_dir)])

        self.assertEqual(exit_code, 1)
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("没有可回退记录", printed)


if __name__ == "__main__":
    unittest.main()
