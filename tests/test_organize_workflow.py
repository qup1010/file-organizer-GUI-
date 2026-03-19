import shutil
import unittest
from pathlib import Path
from unittest import mock

from file_organizer.execution.models import ExecutionJournal
from file_organizer.workflows import organize_pipeline, rollback_flow


class OrganizeWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.target_dir = Path("test_temp_workflow_dir")
        if self.target_dir.exists():
            shutil.rmtree(self.target_dir)
        self.target_dir.mkdir()

    def tearDown(self):
        if self.target_dir.exists():
            shutil.rmtree(self.target_dir)

    def test_run_pipeline_uses_explicit_target_path_without_chdir(self):
        scanner_module = mock.Mock()
        scanner_module.run_analysis_cycle.return_value = "<output>ok</output>"

        organizer_module = mock.Mock()
        organizer_module.get_scan_content.return_value = "scan lines"

        execution_module = mock.Mock()
        cli = mock.Mock()
        cli.prompt.return_value = str(self.target_dir)

        with mock.patch.object(organize_pipeline, "run_organize_chat") as run_chat_mock, \
             mock.patch.object(organize_pipeline.os, "chdir") as chdir_mock:
            organize_pipeline.run_pipeline(
                input_func=mock.Mock(return_value=str(self.target_dir)),
                scanner_module=scanner_module,
                organizer_module=organizer_module,
                execution_module=execution_module,
                cli=cli,
            )

        scanner_module.run_analysis_cycle.assert_called_once_with(
            self.target_dir,
            event_handler=organize_pipeline.scanner_ui_handler,
        )
        scanner_module.append_output_result.assert_called_once_with("<output>ok</output>")
        run_chat_mock.assert_called_once_with(
            "scan lines",
            self.target_dir.resolve(),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.ANY,
            print_func=mock.ANY,
            event_handler=organize_pipeline.scanner_ui_handler,
            cli=cli,
        )
        cli.prompt_path.assert_called_once()
        chdir_mock.assert_not_called()


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
        cli = mock.Mock()
        journal = ExecutionJournal(
            execution_id="exec-1",
            target_dir=str(self.base_dir.resolve()),
            created_at="2026-03-19T12:00:00",
            status="completed",
            items=[],
            rollback_attempts=[],
        )
        plan = mock.Mock(target_dir=self.base_dir.resolve(), actions=[])
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock(failure_count=0)

        rollback_module.load_latest_execution_for_directory.return_value = journal
        rollback_module.build_rollback_plan.return_value = plan
        rollback_module.validate_rollback_preconditions.return_value = precheck
        rollback_module.execute_rollback_plan.return_value = report
        cli.prompt.return_value = "YES"

        exit_code = rollback_flow.run_rollback_last_execution(
            [str(self.base_dir)],
            rollback_module=rollback_module,
            cli=cli,
        )

        self.assertEqual(exit_code, 0)
        rollback_module.execute_rollback_plan.assert_called_once_with(plan)
        rollback_module.finalize_rollback_state.assert_called_once()
        cli.show_rollback_preview.assert_called_once_with(plan, precheck)
        cli.show_rollback_report.assert_called_once_with(report, plan.target_dir)
        cli.prompt_confirmation.assert_called_once()

    def test_workflow_exits_without_execution_when_no_latest_journal(self):
        rollback_module = mock.Mock()
        rollback_module.load_latest_execution_for_directory.return_value = None
        cli = mock.Mock()

        exit_code = rollback_flow.run_rollback_last_execution(
            [str(self.base_dir)],
            rollback_module=rollback_module,
            cli=cli,
        )

        self.assertEqual(exit_code, 1)
        cli.warning.assert_called_once()


if __name__ == "__main__":
    unittest.main()
