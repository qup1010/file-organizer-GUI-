import unittest

import organizer_service


class OrganizerServiceTests(unittest.TestCase):
    def test_parse_commands_block_extracts_mkdir_and_move(self):
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Finance"\nMOVE "合同.pdf" "Finance/合同.pdf"\n</COMMANDS>'
        )

        self.assertTrue(parsed["has_commands"])
        self.assertEqual(parsed["mkdirs"], ["Finance"])
        self.assertEqual(len(parsed["moves"]), 1)
        self.assertEqual(parsed["moves"][0]["source"], "合同.pdf")
        self.assertEqual(parsed["moves"][0]["target"], "Finance/合同.pdf")

    def test_validate_command_flow_accepts_valid_command_sequence(self):
        scan_lines = "合同.pdf | 财务/合同 | 付款协议\n截图1.png | 截图记录 | 报错界面"
        content = (
            "<COMMANDS>\n"
            'MKDIR "Finance"\n'
            'MKDIR "Screenshots"\n'
            'MOVE "合同.pdf" "Finance/合同.pdf"\n'
            'MOVE "截图1.png" "Screenshots/截图1.png"\n'
            "</COMMANDS>"
        )

        validation = organizer_service.validate_command_flow(scan_lines, content)

        self.assertTrue(validation["is_valid"])

    def test_validate_command_flow_rejects_rename(self):
        scan_lines = "合同.pdf | 财务/合同 | 付款协议"
        content = '<COMMANDS>\nMKDIR "Finance"\nMOVE "合同.pdf" "Finance/已改名.pdf"\n</COMMANDS>'

        validation = organizer_service.validate_command_flow(scan_lines, content)

        self.assertFalse(validation["is_valid"])
        self.assertTrue(validation["rename_errors"])


if __name__ == "__main__":
    unittest.main()
