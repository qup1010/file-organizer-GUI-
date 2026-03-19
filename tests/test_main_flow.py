import unittest
from pathlib import Path
from unittest import mock

import main


class RunOrganizeChatTests(unittest.TestCase):
    def test_run_organize_chat_executes_after_yes_confirmation(self):
        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock()

        with mock.patch.object(main.organizer, "build_initial_messages", return_value=[]), \
             mock.patch.object(main.organizer, "run_organizer_cycle", return_value=("<COMMANDS></COMMANDS>", {"is_valid": True})), \
             mock.patch.object(main.organizer, "parse_commands_block", return_value=parsed_commands), \
             mock.patch.object(main.execution, "build_execution_plan", return_value=mock.Mock()), \
             mock.patch.object(main.execution, "validate_execution_preconditions", return_value=precheck), \
             mock.patch.object(main.execution, "render_execution_preview", return_value="preview"), \
             mock.patch.object(main.execution, "execute_plan", return_value=report) as execute_mock, \
             mock.patch.object(main.execution, "render_execution_report", return_value="report"), \
             mock.patch("builtins.input", side_effect=["YES"]), \
             mock.patch("builtins.print") as print_mock:
            main.run_organize_chat("scan lines", Path("D:/demo"))

        execute_mock.assert_called_once()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("preview", printed)
        self.assertIn("report", printed)

    def test_run_organize_chat_does_not_execute_when_precheck_blocks(self):
        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=False, blocking_errors=["目标已存在: Finance/合同.pdf"], warnings=[])

        with mock.patch.object(main.organizer, "build_initial_messages", return_value=[]), \
             mock.patch.object(main.organizer, "run_organizer_cycle", return_value=("<COMMANDS></COMMANDS>", {"is_valid": True})), \
             mock.patch.object(main.organizer, "parse_commands_block", return_value=parsed_commands), \
             mock.patch.object(main.execution, "build_execution_plan", return_value=mock.Mock()), \
             mock.patch.object(main.execution, "validate_execution_preconditions", return_value=precheck), \
             mock.patch.object(main.execution, "render_execution_preview", return_value="preview"), \
             mock.patch.object(main.execution, "execute_plan") as execute_mock, \
             mock.patch("builtins.input", side_effect=["quit"]), \
             mock.patch("builtins.print") as print_mock:
            main.run_organize_chat("scan lines", Path("D:/demo"))

        execute_mock.assert_not_called()
        printed = "\n".join(str(call.args[0]) for call in print_mock.call_args_list if call.args)
        self.assertIn("目标已存在", printed)

    def test_run_organize_chat_returns_to_dialogue_when_input_is_not_yes(self):
        parsed_commands = {"has_commands": True, "mkdirs": [], "moves": [], "commands": []}
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        seen_messages = []

        def fake_run_cycle(messages, scan_lines, event_handler=None):
            seen_messages.append(list(messages))
            if len(seen_messages) == 1:
                return "<COMMANDS></COMMANDS>", {"is_valid": True}
            raise KeyboardInterrupt

        with mock.patch.object(main.organizer, "build_initial_messages", return_value=[]), \
             mock.patch.object(main.organizer, "run_organizer_cycle", side_effect=fake_run_cycle), \
             mock.patch.object(main.organizer, "parse_commands_block", return_value=parsed_commands), \
             mock.patch.object(main.execution, "build_execution_plan", return_value=mock.Mock()), \
             mock.patch.object(main.execution, "validate_execution_preconditions", return_value=precheck), \
             mock.patch.object(main.execution, "render_execution_preview", return_value="preview"), \
             mock.patch.object(main.execution, "execute_plan") as execute_mock, \
             mock.patch("builtins.input", side_effect=["再调整一下"]), \
             mock.patch("builtins.print"):
            main.run_organize_chat("scan lines", Path("D:/demo"))

        execute_mock.assert_not_called()
        self.assertTrue(any(msg.get("content") == "再调整一下" for msg in seen_messages[1]))


if __name__ == "__main__":
    unittest.main()
