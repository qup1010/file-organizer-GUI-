import shutil
import unittest
from pathlib import Path
from unittest import mock

import organize_commands_cli


class ReadScanLinesTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path("test_temp_organize_output")
        self.temp_dir.mkdir(exist_ok=True)

    def tearDown(self):
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)

    def test_read_scan_lines_rejects_missing_file(self):
        missing_path = self.temp_dir / "missing.txt"

        with self.assertRaisesRegex(ValueError, "不存在"):
            organize_commands_cli.read_scan_lines(missing_path)

    def test_read_scan_lines_rejects_empty_file(self):
        scan_path = self.temp_dir / "result.txt"
        scan_path.write_text("", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "为空"):
            organize_commands_cli.read_scan_lines(scan_path)

    def test_read_scan_lines_requires_analysis_header(self):
        scan_path = self.temp_dir / "result.txt"
        scan_path.write_text("./demo.txt | 未知 | 示例", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "分析目录路径"):
            organize_commands_cli.read_scan_lines(scan_path)

    def test_read_scan_lines_returns_original_content(self):
        scan_path = self.temp_dir / "result.txt"
        content = "分析目录路径:D:/demo\n./a.txt | Documents | sample"
        scan_path.write_text(content, encoding="utf-8")

        result = organize_commands_cli.read_scan_lines(scan_path)

        self.assertEqual(result, content)


class PromptAndGenerationTests(unittest.TestCase):
    def test_build_command_prompt_includes_scan_lines(self):
        scan_lines = "分析目录路径:D:/demo\n./a.txt | Documents | sample"

        prompt = organize_commands_cli.build_command_prompt(scan_lines)

        self.assertIn("文件整理命令生成器", prompt)
        self.assertIn(scan_lines, prompt)
        self.assertNotIn("<<<SCAN_LINES>>>", prompt)

    def test_generate_commands_uses_model_response_content(self):
        fake_response = mock.Mock()
        fake_response.choices = [mock.Mock(message=mock.Mock(content="MKDIR Review\nMOVE a.txt Review/a.txt"))]
        fake_client = mock.Mock()
        fake_client.chat.completions.create.return_value = fake_response

        result = organize_commands_cli.generate_commands(
            "分析目录路径:D:/demo\n./a.txt | 未知 | sample",
            client=fake_client,
        )

        self.assertEqual(result, "MKDIR Review\nMOVE a.txt Review/a.txt")
        call_kwargs = fake_client.chat.completions.create.call_args.kwargs
        self.assertEqual(call_kwargs["model"], organize_commands_cli.MODEL_NAME)
        self.assertEqual(call_kwargs["messages"][0]["role"], "system")
        self.assertIn("分析目录路径:D:/demo", call_kwargs["messages"][0]["content"])

    def test_main_prints_generated_commands(self):
        with mock.patch.object(
            organize_commands_cli,
            "read_scan_lines",
            return_value="分析目录路径:D:/demo\n./a.txt | 未知 | sample",
        ), mock.patch.object(
            organize_commands_cli,
            "generate_commands",
            return_value="MKDIR Review\nMOVE a.txt Review/a.txt",
        ), mock.patch("builtins.print") as mock_print:
            organize_commands_cli.main()

        mock_print.assert_called_with("MKDIR Review\nMOVE a.txt Review/a.txt")
