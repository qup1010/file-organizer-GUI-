import unittest

from file_pilot.organize import service as organizer_service
from file_pilot.organize.prompts import build_prompt
from file_pilot.organize.strategy_templates import build_preview_directories


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

    def test_build_prompt_injects_selected_strategy_rules(self):
        prompt = build_prompt(
            "合同.pdf | 财务/合同 | 付款协议",
            {
                "template_id": "office_admin",
                "language": "en",
                "density": "minimal",
                "prefix_style": "category",
                "caution_level": "conservative",
                "note": "票据优先归财务目录",
            },
        )

        self.assertIn("办公事务", prompt)
        self.assertIn("英文目录", prompt)
        self.assertIn("分类粒度：极简", prompt)
        self.assertIn("类别标签前缀", prompt)
        self.assertIn("整理保守度：保守", prompt)
        self.assertIn("票据优先归财务目录", prompt)

    def test_build_preview_directories_applies_density_and_prefix_style(self):
        preview = build_preview_directories(
            "media_assets",
            language="zh",
            density="minimal",
            prefix_style="numeric",
        )

        self.assertEqual(preview[:3], ["01_截图", "02_媒体", "03_设计"])


if __name__ == "__main__":
    unittest.main()
