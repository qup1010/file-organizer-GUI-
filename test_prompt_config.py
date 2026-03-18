import shutil
import unittest
from pathlib import Path
from unittest import mock

import ai_template


class PromptConfigTests(unittest.TestCase):
    def test_tool_description_lists_supported_file_types(self):
        description = ai_template.tools[0]["function"]["description"]
        self.assertIn("PDF", description)
        self.assertIn("Word", description)
        self.assertIn("Excel", description)
        self.assertIn("图片文件当前不支持解析", description)

    def test_system_prompt_requires_pipe_delimited_summary_format(self):
        system_prompt = ai_template.build_system_prompt("示例文件列表")
        self.assertIn("路径 | 可能用途 | 内容摘要", system_prompt)
        self.assertIn("<output>", system_prompt)
        self.assertIn("</output>", system_prompt)
        self.assertIn("分析目录 | 目录路径 | 目录说明", system_prompt)
        self.assertIn("如果当前分析的是单个目录，请在最前面先输出该目录的完整路径信息。", system_prompt)
        self.assertIn("不要编造", system_prompt)
        self.assertIn("一行一个文件", system_prompt)
        self.assertIn("默认只总结当前层文件和当前层文件夹", system_prompt)

    def test_directory_listing_tool_is_registered(self):
        tool_names = [tool["function"]["name"] for tool in ai_template.tools]
        self.assertIn("list_local_files", tool_names)

    def test_get_workdir_files_does_not_recurse(self):
        result = ai_template.get_workdir_files()
        self.assertIn("路径 | 类型 | 说明", result)
        self.assertNotIn("test/", result)

    def test_append_output_result_extracts_output_block_and_records_analysis_dir(self):
        output_dir = Path("test_temp_output_dir")
        try:
            if output_dir.exists():
                shutil.rmtree(output_dir)

            with mock.patch.object(ai_template, "OUTPUT_DIR", output_dir, create=True):
                content = "前缀说明\n<output>\n第一段结果\n</output>\n尾部说明"
                saved_path = ai_template.append_output_result(content, analysis_dir=Path("demo/dir"))

                self.assertEqual(saved_path, output_dir / "result.txt")
                self.assertTrue(saved_path.exists())
                saved_text = saved_path.read_text(encoding="utf-8")
                self.assertIn("[分析目录]", saved_text)
                self.assertIn("demo", saved_text)
                self.assertIn("第一段结果", saved_text)
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)

    def test_append_output_result_ignores_content_without_output_block(self):
        output_dir = Path("test_temp_output_dir")
        try:
            if output_dir.exists():
                shutil.rmtree(output_dir)

            with mock.patch.object(ai_template, "OUTPUT_DIR", output_dir, create=True):
                saved_path = ai_template.append_output_result("没有标签的普通回复")

                self.assertIsNone(saved_path)
                self.assertFalse(output_dir.exists())
        finally:
            if output_dir.exists():
                shutil.rmtree(output_dir)


if __name__ == "__main__":
    unittest.main()
