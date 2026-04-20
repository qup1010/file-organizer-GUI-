import unittest

from file_organizer.app.task_planner_adapter import TaskPlannerAdapter
from file_organizer.domain.models import MappingEntry, OrganizeTask, SourceRef, TargetSlot


class TaskPlannerAdapterTests(unittest.TestCase):
    def setUp(self):
        self.adapter = TaskPlannerAdapter("D:/workspace/Inbox")
        self.base_task = OrganizeTask(
            task_id="task-1",
            sources=[
                SourceRef(
                    ref_id="F001",
                    display_name="md",
                    entry_type="file",
                    origin="D:/workspace/Inbox",
                    relpath="md",
                    suggested_purpose="学习资料",
                )
            ],
            targets=[
                TargetSlot(
                    slot_id="D001",
                    display_name="Docs",
                    real_path="D:/workspace/Inbox/Docs",
                    depth=0,
                    is_new=False,
                )
            ],
            mappings=[
                MappingEntry(
                    source_ref_id="F001",
                    target_slot_id="D001",
                    status="assigned",
                    user_overridden=False,
                )
            ],
            strategy={},
            user_constraints=[],
            phase="planning",
        )

    def test_roundtrip_pending_plan_preserves_target_slot(self):
        pending = self.adapter.to_pending_plan(self.base_task)
        rebuilt = self.adapter.apply_pending_plan(self.base_task, pending)

        self.assertEqual(pending.moves[0].target, "Docs/md")
        self.assertEqual(rebuilt.mappings[0].target_slot_id, "D001")
        self.assertEqual(rebuilt.mappings[0].status, "assigned")

    def test_assign_mapping_creates_new_slot_and_review_mapping(self):
        updated = self.adapter.assign_mapping(self.base_task, source_relpath="md", target_dir="Docs/Notes")
        self.assertEqual(updated.mappings[0].status, "assigned")
        self.assertEqual(updated.mappings[0].target_slot_id, "D002")
        self.assertEqual(updated.targets[-1].real_path.replace("\\", "/"), "D:/workspace/Inbox/Docs/Notes")

        review_task = self.adapter.assign_mapping(updated, source_relpath="md", target_dir="Review")
        review_pending = self.adapter.to_pending_plan(review_task)

        self.assertEqual(review_task.mappings[0].target_slot_id, "Review")
        self.assertEqual(review_task.mappings[0].status, "review")
        self.assertEqual(review_pending.moves[0].target, "Review/md")


if __name__ == "__main__":
    unittest.main()
