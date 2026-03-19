import shutil
import unittest
from pathlib import Path
from unittest import mock

from file_organizer.workflows import organize_pipeline


class OrganizeWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.target_dir = Path("test_temp_workflow_dir")
        if self.target_dir.exists():
            shutil.rmtree(self.target_dir)
        self.target_dir.mkdir()

    def tearDown(self):
        if self.target_dir.exists():
            shutil.rmtree(self.target_dir)

    def test_run_pipeline_uses_explicit_target_path_without_chdir(self):
        scanner_module = mock.Mock()
        scanner_module.run_analysis_cycle.return_value = "<output>ok</output>"

        organizer_module = mock.Mock()
        organizer_module.get_scan_content.return_value = "scan lines"

        execution_module = mock.Mock()

        with mock.patch.object(organize_pipeline, "run_organize_chat") as run_chat_mock, \
             mock.patch.object(organize_pipeline.os, "chdir") as chdir_mock:
            organize_pipeline.run_pipeline(
                input_func=mock.Mock(return_value=str(self.target_dir)),
                scanner_module=scanner_module,
                organizer_module=organizer_module,
                execution_module=execution_module,
            )

        scanner_module.run_analysis_cycle.assert_called_once_with(
            self.target_dir,
            event_handler=organize_pipeline.scanner_ui_handler,
        )
        scanner_module.append_output_result.assert_called_once_with("<output>ok</output>")
        run_chat_mock.assert_called_once_with(
            "scan lines",
            self.target_dir.resolve(),
            organizer_module=organizer_module,
            execution_module=execution_module,
            input_func=mock.ANY,
            print_func=mock.ANY,
            event_handler=organize_pipeline.scanner_ui_handler,
        )
        chdir_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
