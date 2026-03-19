import unittest
from unittest import mock

import file_organizer.__main__ as package_main
import file_organizer.rollback.__main__ as rollback_main


class PackageEntrypointTests(unittest.TestCase):
    def test_python_m_file_organizer_runs_pipeline(self):
        with mock.patch.object(package_main, "run_pipeline") as run_pipeline_mock:
            package_main.main()

        run_pipeline_mock.assert_called_once_with()

    def test_python_m_file_organizer_rollback_exits_with_workflow_result(self):
        with mock.patch.object(rollback_main, "run_rollback_last_execution", return_value=3) as rollback_mock:
            exit_code = rollback_main.main(["D:/demo"])

        self.assertEqual(exit_code, 3)
        rollback_mock.assert_called_once_with(["D:/demo"])


if __name__ == "__main__":
    unittest.main()
