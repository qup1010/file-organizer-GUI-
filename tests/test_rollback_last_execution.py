import shutil
import unittest
from pathlib import Path
from unittest import mock

from file_organizer.execution.models import ExecutionJournal
from file_organizer.workflows import rollback_flow


class RollbackLastExecutionWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = Path("test_temp_rollback_script_dir")
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)
        self.base_dir.mkdir()

    def tearDown(self):
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)

    def test_workflow_only_executes_after_yes_confirmation(self):
        rollback_module = mock.Mock()
        print_mock = mock.Mock()
        journal = ExecutionJournal(
            execution_id="exec-1",
            target_dir=str(self.base_dir.resolve()),
            created_at="2026-03-19T12:00:00",
            status="completed",
            items=[],
            rollback_attempts=[],
        )
        plan = mock.Mock()
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock(failure_count=0)

        rollback_module.load_latest_execution_for_directory.return_value = journal
        rollback_module.build_rollback_plan.return_value = plan
        rollback_module.validate_rollback_preconditions.return_value = precheck
        rollback_module.render_rollback_preview.return_value = "preview"
        rollback_module.execute_rollback_plan.return_value = report
        rollback_module.render_rollback_report.return_value = "report"

        exit_code = rollback_flow.run_rollback_last_execution(
            [str(self.base_dir)],
            rollback_module=rollback_module,
            input_func=mock.Mock(return_value="YES"),
            print_func=print_mock,
        )

        self.assertEqual(exit_code, 0)
        rollback_module.execute_rollback_plan.assert_called_once_with(plan)
        rollback_module.finalize_rollback_state.assert_called_once()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("preview", printed)
        self.assertIn("report", printed)

    def test_workflow_exits_without_execution_when_no_latest_journal(self):
        rollback_module = mock.Mock()
        rollback_module.load_latest_execution_for_directory.return_value = None
        print_mock = mock.Mock()

        exit_code = rollback_flow.run_rollback_last_execution(
            [str(self.base_dir)],
            rollback_module=rollback_module,
            print_func=print_mock,
        )

        self.assertEqual(exit_code, 1)
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("没有可回退记录", printed)


if __name__ == "__main__":
    unittest.main()
