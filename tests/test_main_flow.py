import unittest
from pathlib import Path
from unittest import mock

from file_organizer.workflows import organize_pipeline


class RunOrganizeChatTests(unittest.TestCase):
    def test_run_organize_chat_executes_after_yes_confirmation(self):
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
        execution_module.get_empty_source_dirs.return_value = []
        cli.prompt.return_value = "YES"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        execution_module.execute_plan.assert_called_once()
        cli.show_execution_preview.assert_called_once_with(plan, precheck)
        cli.show_execution_report.assert_called_once_with(report, plan.base_dir)
        cli.prompt_confirmation.assert_called_once()

    def test_run_organize_chat_does_not_execute_when_precheck_blocks(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=False, blocking_errors=["目标已存在: Finance/合同.pdf"], warnings=[])
        plan = mock.Mock(base_dir=Path("D:/demo"), mkdir_actions=[], move_actions=[])

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.return_value = ("<COMMANDS></COMMANDS>", {"is_valid": True})
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = plan
        execution_module.validate_execution_preconditions.return_value = precheck
        cli.prompt.return_value = "quit"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        execution_module.execute_plan.assert_not_called()
        cli.show_execution_preview.assert_called_once_with(plan, precheck)
        cli.prompt_feedback.assert_called_once()

    def test_run_organize_chat_returns_to_dialogue_when_input_is_not_yes(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        plan = mock.Mock(base_dir=Path("D:/demo"), mkdir_actions=[], move_actions=[])
        seen_messages = []

        def fake_run_cycle(messages, scan_lines, event_handler=None):
            seen_messages.append(list(messages))
            if len(seen_messages) == 1:
                return "<COMMANDS></COMMANDS>", {"is_valid": True}
            raise KeyboardInterrupt

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.side_effect = fake_run_cycle
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = plan
        execution_module.validate_execution_preconditions.return_value = precheck
        cli.prompt.return_value = "再调整一下"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        execution_module.execute_plan.assert_not_called()
        cli.prompt_confirmation.assert_called_once()
        self.assertTrue(any(msg.get("content") == "再调整一下" for msg in seen_messages[1]))


if __name__ == "__main__":
    unittest.main()
