import unittest
from pathlib import Path
from unittest import mock

from file_organizer.workflows import organize_pipeline, rollback_flow


class RichWorkflowIntegrationTests(unittest.TestCase):
    def test_run_organize_chat_uses_cli_preview_and_report_methods(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock()
        plan = mock.Mock(base_dir=Path("D:/demo"), mkdir_actions=[], move_actions=[])

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.return_value = ("<COMMANDS></COMMANDS>", {"is_valid": True})
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = plan
        execution_module.validate_execution_preconditions.return_value = precheck
        execution_module.execute_plan.return_value = report
        cli.prompt.return_value = "YES"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.Mock(return_value="YES"),
            cli=cli,
        )

        cli.show_execution_preview.assert_called_once_with(plan, precheck)
        cli.show_execution_report.assert_called_once_with(report, plan.base_dir)

    def test_run_rollback_last_execution_uses_cli_methods(self):
        rollback_module = mock.Mock()
        cli = mock.Mock()
        journal = mock.Mock()
        plan = mock.Mock(target_dir=Path("D:/demo"), actions=[])
        precheck = mock.Mock(can_execute=True)
        report = mock.Mock(failure_count=0)

        rollback_module.load_latest_execution_for_directory.return_value = journal
        rollback_module.build_rollback_plan.return_value = plan
        rollback_module.validate_rollback_preconditions.return_value = precheck
        rollback_module.execute_rollback_plan.return_value = report
        cli.prompt.return_value = "YES"

        rollback_flow.run_rollback_last_execution(
            ["D:/demo"],
            rollback_module=rollback_module,
            input_func=mock.Mock(return_value="YES"),
            cli=cli,
        )

        cli.show_rollback_preview.assert_called_once_with(plan, precheck)
        cli.show_rollback_report.assert_called_once_with(report, plan.target_dir)


if __name__ == "__main__":
    unittest.main()
