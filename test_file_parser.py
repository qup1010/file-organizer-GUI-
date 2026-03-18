import os
import shutil
import unittest

from file_parser import list_local_files


class FileParserDirectoryListingTests(unittest.TestCase):
    def setUp(self):
        self.root_dir = "test_temp_list_dir"
        self.child_dir = os.path.join(self.root_dir, "nested")
        self.grandchild_dir = os.path.join(self.child_dir, "deep")
        os.makedirs(self.grandchild_dir, exist_ok=True)

        with open(os.path.join(self.root_dir, "root.txt"), "w", encoding="utf-8") as file:
            file.write("root")
        with open(os.path.join(self.child_dir, "child.md"), "w", encoding="utf-8") as file:
            file.write("child")
        with open(os.path.join(self.grandchild_dir, "deep.txt"), "w", encoding="utf-8") as file:
            file.write("deep")

    def tearDown(self):
        if os.path.exists(self.root_dir):
            shutil.rmtree(self.root_dir)

    def test_list_local_files_returns_one_level_directory_summary(self):
        result = list_local_files(self.root_dir)
        self.assertIn("路径 | 类型 | 说明", result)
        self.assertIn(f"{self.root_dir} | dir", result)
        self.assertIn(f"{self.root_dir}/root.txt | file | .txt", result)
        self.assertIn(f"{self.root_dir}/nested | dir", result)
        self.assertIn(f"{self.root_dir}/nested/child.md | file | .md", result)
        self.assertNotIn("deep.txt", result)

    def test_list_local_files_rejects_directories_outside_allowed_scope(self):
        result = list_local_files("../outside")
        self.assertIn("错误", result)


if __name__ == "__main__":
    unittest.main()
