import shutil
import unittest
from pathlib import Path
from unittest import mock

import local_file_analysis_chat


class PromptConfigTests(unittest.TestCase):
    def test_tool_description_lists_supported_file_types(self):
        description = local_file_analysis_chat.tools[0]["function"]["description"]
        self.assertIn("PDF", description)
        self.assertIn("Word", description)
        self.assertIn("Excel", description)

    def test_system_prompt_requires_output_format(self):
        system_prompt = local_file_analysis_chat.build_system_prompt("示例文件列表")
        self.assertIn("<output>", system_prompt)
        self.assertIn("</output>", system_prompt)
        self.assertIn("分析目录路径", system_prompt)
        self.assertIn("一行一个文件", system_prompt)

    def test_directory_listing_tool_is_registered(self):
        tool_names = [tool["function"]["name"] for tool in local_file_analysis_chat.tools]
        self.assertIn("list_local_files", tool_names)

    def test_get_workdir_files_does_not_recurse(self):
        result = local_file_analysis_chat.get_workdir_files()
        self.assertNotIn("test/", result)

    def test_append_output_result_extracts_output_block(self):
        output_dir = Path("test_temp_output_dir")
        try:
            if output_dir.exists():
                shutil.rmtree(output_dir)

            with mock.patch.object(local_file_analysis_chat, "OUTPUT_DIR", output_dir, create=True):
                content = "前缀说明\n<output>\n第一段结果\n</output>\n尾部说明"
                saved_path = local_file_analysis_chat.append_output_result(content, analysis_dir=Path("demo/dir"))

                self.assertEqual(saved_path, output_dir / "result.txt")
                self.assertTrue(saved_path.exists())
                saved_text = saved_path.read_text(encoding="utf-8")
                self.assertIn("第一段结果", saved_text)
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)

    def test_append_output_result_ignores_content_without_output_block(self):
        output_dir = Path("test_temp_output_dir")
        try:
            if output_dir.exists():
                shutil.rmtree(output_dir)

            with mock.patch.object(local_file_analysis_chat, "OUTPUT_DIR", output_dir, create=True):
                saved_path = local_file_analysis_chat.append_output_result("没有标签的普通回复")

                self.assertIsNone(saved_path)
                self.assertFalse(output_dir.exists())
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)


if __name__ == "__main__":
    unittest.main()
