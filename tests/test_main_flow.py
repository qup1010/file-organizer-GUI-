import unittest
from pathlib import Path
from unittest import mock

from file_organizer.workflows import organize_pipeline


class RunOrganizeChatTests(unittest.TestCase):
    def test_run_organize_chat_executes_after_yes_confirmation(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        print_mock = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock()

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.return_value = ("<COMMANDS></COMMANDS>", {"is_valid": True})
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = mock.Mock()
        execution_module.validate_execution_preconditions.return_value = precheck
        execution_module.render_execution_preview.return_value = "preview"
        execution_module.execute_plan.return_value = report
        execution_module.render_execution_report.return_value = "report"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.Mock(return_value="YES"),
            print_func=print_mock,
        )

        execution_module.execute_plan.assert_called_once()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("preview", printed)
        self.assertIn("report", printed)

    def test_run_organize_chat_does_not_execute_when_precheck_blocks(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        print_mock = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=False, blocking_errors=["目标已存在: Finance/合同.pdf"], warnings=[])

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.return_value = ("<COMMANDS></COMMANDS>", {"is_valid": True})
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = mock.Mock()
        execution_module.validate_execution_preconditions.return_value = precheck
        execution_module.render_execution_preview.return_value = "preview"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.Mock(return_value="quit"),
            print_func=print_mock,
        )

        execution_module.execute_plan.assert_not_called()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("目标已存在", printed)

    def test_run_organize_chat_returns_to_dialogue_when_input_is_not_yes(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()

        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        seen_messages = []

        def fake_run_cycle(messages, scan_lines, event_handler=None):
            seen_messages.append(list(messages))
            if len(seen_messages) == 1:
                return "<COMMANDS></COMMANDS>", {"is_valid": True}
            raise KeyboardInterrupt

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.side_effect = fake_run_cycle
        organizer_module.parse_commands_block.return_value = parsed_commands
        execution_module.build_execution_plan.return_value = mock.Mock()
        execution_module.validate_execution_preconditions.return_value = precheck
        execution_module.render_execution_preview.return_value = "preview"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.Mock(return_value="再调整一下"),
            print_func=mock.Mock(),
        )

        execution_module.execute_plan.assert_not_called()
        self.assertTrue(any(msg.get("content") == "再调整一下" for msg in seen_messages[1]))


if __name__ == "__main__":
    unittest.main()
