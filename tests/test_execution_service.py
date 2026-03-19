import json
import shutil
import unittest
from pathlib import Path
from unittest import mock

from file_organizer.execution import service as execution_service
from file_organizer.organize import service as organizer_service


class ExecutionServiceTests(unittest.TestCase):
    def setUp(self):
        self.base_dir = Path("test_temp_execution_service")
        self.history_root = Path("test_temp_execution_history")
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)
        if self.history_root.exists():
            shutil.rmtree(self.history_root)
        self.base_dir.mkdir()
        self.history_root.mkdir()

    def tearDown(self):
        if self.base_dir.exists():
            shutil.rmtree(self.base_dir)
        if self.history_root.exists():
            shutil.rmtree(self.history_root)

    def test_build_execution_plan_uses_absolute_paths(self):
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Projects"\nMOVE "demo.txt" "Projects/demo.txt"\n</COMMANDS>'
        )

        plan = execution_service.build_execution_plan(parsed, self.base_dir)

        self.assertEqual(plan.base_dir, self.base_dir.resolve())
        self.assertEqual(plan.mkdir_actions[0].target, self.base_dir.resolve() / "Projects")
        self.assertEqual(plan.move_actions[0].source, self.base_dir.resolve() / "demo.txt")
        self.assertEqual(plan.move_actions[0].target, self.base_dir.resolve() / "Projects" / "demo.txt")

    def test_validate_execution_preconditions_blocks_existing_target(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        (self.base_dir / "Projects").mkdir()
        (self.base_dir / "Projects" / "demo.txt").write_text("exists", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Projects"\nMOVE "demo.txt" "Projects/demo.txt"\n</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)

        precheck = execution_service.validate_execution_preconditions(plan)

        self.assertFalse(precheck.can_execute)
        self.assertTrue(any("Projects/demo.txt" in error for error in precheck.blocking_errors))

    def test_render_execution_preview_lists_summary_and_targets(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Projects"\nMOVE "demo.txt" "Projects/demo.txt"\n</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)
        precheck = execution_service.validate_execution_preconditions(plan)

        preview = execution_service.render_execution_preview(plan, precheck)

        self.assertIn("创建目录", preview)
        self.assertIn("移动项目", preview)
        self.assertIn("Projects/demo.txt", preview)

    def test_execute_plan_moves_directory_tree(self):
        source_dir = self.base_dir / "demo-folder"
        source_dir.mkdir()
        (source_dir / "nested.txt").write_text("nested", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Projects"\nMOVE "demo-folder" "Projects/demo-folder"\n</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)

        report = execution_service.execute_plan(plan)

        self.assertEqual(report.failure_count, 0)
        self.assertFalse(source_dir.exists())
        self.assertTrue((self.base_dir / "Projects" / "demo-folder" / "nested.txt").exists())

    def test_execute_plan_continues_after_single_move_failure(self):
        (self.base_dir / "broken.txt").write_text("broken", encoding="utf-8")
        (self.base_dir / "ok.txt").write_text("ok", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\n'
            'MKDIR "Review"\n'
            'MOVE "broken.txt" "Review/broken.txt"\n'
            'MOVE "ok.txt" "Review/ok.txt"\n'
            '</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)

        original_move = shutil.move

        def flaky_move(src, dst):
            if Path(src).name == "broken.txt":
                raise OSError("mock move failure")
            return original_move(src, dst)

        with mock.patch("file_organizer.execution.service.shutil.move", side_effect=flaky_move):
            report = execution_service.execute_plan(plan)

        self.assertEqual(report.success_count, 2)
        self.assertEqual(report.failure_count, 1)
        self.assertTrue((self.base_dir / "Review" / "ok.txt").exists())
        self.assertTrue(any(item.status == "failed" for item in report.results))

    def test_execute_plan_persists_latest_execution_journal(self):
        (self.base_dir / "demo.txt").write_text("demo", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Projects"\nMOVE "demo.txt" "Projects/demo.txt"\n</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)
        executions_dir = self.history_root / "executions"
        latest_path = self.history_root / "latest_by_directory.json"

        with mock.patch.object(execution_service.config, "EXECUTION_LOG_DIR", executions_dir), \
             mock.patch.object(execution_service.config, "LATEST_BY_DIRECTORY_PATH", latest_path):
            report = execution_service.execute_plan(plan)

        self.assertEqual(report.failure_count, 0)
        latest_index = json.loads(latest_path.read_text(encoding="utf-8"))
        execution_id = latest_index[str(self.base_dir.resolve())]
        journal_path = executions_dir / f"{execution_id}.json"
        journal = json.loads(journal_path.read_text(encoding="utf-8"))

        self.assertEqual(journal["status"], "completed")
        self.assertEqual(journal["target_dir"], str(self.base_dir.resolve()))
        self.assertEqual(len(journal["items"]), 2)
        self.assertEqual(journal["items"][1]["status"], "success")

    def test_latest_execution_pointer_is_overwritten_for_same_directory(self):
        (self.base_dir / "first.txt").write_text("first", encoding="utf-8")
        parsed = organizer_service.parse_commands_block(
            '<COMMANDS>\nMKDIR "Docs"\nMOVE "first.txt" "Docs/first.txt"\n</COMMANDS>'
        )
        plan = execution_service.build_execution_plan(parsed, self.base_dir)
        executions_dir = self.history_root / "executions"
        latest_path = self.history_root / "latest_by_directory.json"

        with mock.patch.object(execution_service.config, "EXECUTION_LOG_DIR", executions_dir), \
             mock.patch.object(execution_service.config, "LATEST_BY_DIRECTORY_PATH", latest_path):
            execution_service.execute_plan(plan)

            (self.base_dir / "second.txt").write_text("second", encoding="utf-8")
            second_parsed = organizer_service.parse_commands_block(
                '<COMMANDS>\nMKDIR "Review"\nMOVE "second.txt" "Review/second.txt"\n</COMMANDS>'
            )
            second_plan = execution_service.build_execution_plan(second_parsed, self.base_dir)
            execution_service.execute_plan(second_plan)

        latest_index = json.loads(latest_path.read_text(encoding="utf-8"))
        latest_execution_id = latest_index[str(self.base_dir.resolve())]
        latest_journal = json.loads((executions_dir / f"{latest_execution_id}.json").read_text(encoding="utf-8"))

        self.assertEqual(
            latest_journal["items"][-1]["target_after"],
            str((self.base_dir / "Review" / "second.txt").resolve()),
        )


if __name__ == "__main__":
    unittest.main()


