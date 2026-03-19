import unittest
from pathlib import Path
from unittest import mock

from file_organizer.organize.models import FinalPlan, PendingPlan, PlanMove
from file_organizer.workflows import organize_pipeline


class StructuredOrganizeWorkflowTests(unittest.TestCase):
    def test_run_organize_chat_shows_diff_summary_for_pending_patch(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.side_effect = [
            (
                "先把 PDF 整理进 Finance。",
                {
                    "is_valid": False,
                    "pending_plan": PendingPlan(
                        directories=["Finance"],
                        moves=[PlanMove(source="合同.pdf", target="Finance/合同.pdf")],
                        user_constraints=[],
                        unresolved_items=["截图1.png"],
                        summary="已将 PDF 调整到 Finance",
                    ),
                    "diff_summary": ["新增目录：Finance", "新增移动：合同.pdf -> Finance/合同.pdf"],
                    "display_plan": None,
                    "final_plan": None,
                    "repair_mode": False,
                    "user_constraints": [],
                },
            ),
            KeyboardInterrupt,
        ]
        cli.prompt_feedback.return_value = "继续保留截图待确认"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        execution_module.build_execution_plan.assert_not_called()
        cli.show_plan_diff.assert_called_once()
        cli.prompt_feedback.assert_called()

    def test_run_organize_chat_shows_pending_plan_when_requested_by_tool(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()
        pending_plan = PendingPlan(
            directories=["Finance"],
            moves=[PlanMove(source="合同.pdf", target="Finance/合同.pdf")],
            unresolved_items=["截图1.png"],
            summary="已形成初版计划",
        )

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.side_effect = [
            (
                "我先展示当前计划。",
                {
                    "is_valid": False,
                    "pending_plan": pending_plan,
                    "diff_summary": [],
                    "display_plan": {"focus": "full", "summary": "请先确认目录结构"},
                    "final_plan": None,
                    "repair_mode": False,
                    "user_constraints": [],
                },
            ),
            KeyboardInterrupt,
        ]
        cli.prompt_feedback.return_value = "继续调整"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        cli.show_pending_plan.assert_called_once_with(pending_plan, focus="full", summary="请先确认目录结构")
        cli.prompt_feedback.assert_called()

    def test_run_organize_chat_builds_execution_plan_from_structured_final_plan(self):
        organizer_module = mock.Mock()
        execution_module = mock.Mock()
        cli = mock.Mock()
        final_plan = FinalPlan(
            directories=["Finance"],
            moves=[PlanMove(source="合同.pdf", target="Finance/合同.pdf")],
            unresolved_items=[],
            summary="已完成财务整理",
        )
        precheck = mock.Mock(can_execute=True, blocking_errors=[], warnings=[])
        report = mock.Mock()
        built_plan = mock.Mock(base_dir=Path("D:/demo"), mkdir_actions=[], move_actions=[])

        organizer_module.build_initial_messages.return_value = []
        organizer_module.run_organizer_cycle.return_value = (
            "建议已经确认。",
            {
                "is_valid": True,
                "pending_plan": PendingPlan(),
                "diff_summary": ["新增目录：Finance"],
                "display_plan": None,
                "final_plan": final_plan,
                "repair_mode": False,
                "user_constraints": [],
            },
        )
        execution_module.build_execution_plan.return_value = built_plan
        execution_module.validate_execution_preconditions.return_value = precheck
        execution_module.execute_plan.return_value = report
        cli.prompt_confirmation.return_value = "YES"

        organize_pipeline.run_organize_chat(
            "scan lines",
            Path("D:/demo"),
            organizer_module=organizer_module,
            execution_module=execution_module,
            cli=cli,
        )

        execution_module.build_execution_plan.assert_called_once_with(final_plan, Path("D:/demo"))
        cli.show_plan_diff.assert_called_once()
        cli.show_execution_preview.assert_called_once_with(built_plan, precheck)
        cli.show_execution_report.assert_called_once_with(report, built_plan.base_dir)


if __name__ == "__main__":
    unittest.main()
