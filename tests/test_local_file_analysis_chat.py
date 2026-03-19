import shutil
import unittest
from pathlib import Path
from unittest import mock

from file_organizer.analysis import service as scanner_service


class ScannerServiceTests(unittest.TestCase):
    def test_build_system_prompt_requires_output_format(self):
        system_prompt = scanner_service.build_system_prompt("示例文件列表")

        self.assertIn("<output>", system_prompt)
        self.assertIn("</output>", system_prompt)
        self.assertIn("<文件名/文件夹名> | <可能用途> | <内容摘要>", system_prompt)

    def test_tool_list_contains_local_file_and_listing_tools(self):
        tool_names = [tool["function"]["name"] for tool in scanner_service.tools]

        self.assertIn("read_local_file", tool_names)
        self.assertIn("list_local_files", tool_names)

    def test_append_output_result_extracts_output_block(self):
        output_dir = Path("test_temp_scanner_output")
        result_file = output_dir / "result.txt"
        if output_dir.exists():
            shutil.rmtree(output_dir)
        output_dir.mkdir()
        content = "前缀说明\n<output>\n第一段结果\n</output>\n尾部说明"

        try:
            with mock.patch.object(scanner_service, "RESULT_FILE_PATH", result_file):
                saved_path = scanner_service.append_output_result(content)

            self.assertEqual(saved_path, result_file)
            self.assertTrue(result_file.exists())
            saved_text = result_file.read_text(encoding="utf-8")
            self.assertIn("第一段结果", saved_text)
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)


if __name__ == "__main__":
    unittest.main()

