import logging
from pathlib import Path
from typing import TYPE_CHECKING

from file_organizer.app.models import SessionMutationResult
from file_organizer.execution import service as execution_service
from file_organizer.rollback import service as rollback_service

if TYPE_CHECKING:
    from file_organizer.app.session_service import OrganizerSessionService


class ExecutionAppService:
    def __init__(self, helpers: "OrganizerSessionService"):
        self.helpers = helpers

    def run_precheck(self, session_id: str) -> SessionMutationResult:
        session = self.helpers._load_or_raise(session_id)
        self.helpers._ensure_mutable_stage(session)
        self.helpers._log_runtime_event("precheck.started", session)
        self.helpers._write_session_debug_event("precheck.started", session)
        final_plan = self.helpers._final_plan_from_session(session)
        task, registry = self.helpers._build_organize_task(session, final_plan)
        if self.helpers._normalize_organize_mode(session.organize_mode) == "incremental":
            selection = self.helpers._incremental_selection_snapshot(session)
            incremental_target_errors = []
            source_by_id = {item.ref_id: item for item in task.sources}
            target_by_id = {item.slot_id: item for item in task.targets}
            for mapping in task.mappings:
                if mapping.target_slot_id in {"", "Review"}:
                    continue
                source_ref = source_by_id.get(mapping.source_ref_id)
                target_slot = target_by_id.get(mapping.target_slot_id)
                if source_ref is None or target_slot is None:
                    continue
                resolved_target = registry.resolve_target(mapping.target_slot_id, Path(source_ref.relpath).name)
                try:
                    target_dir = resolved_target.parent.relative_to(Path(session.target_dir).resolve()).as_posix()
                except ValueError:
                    target_dir = target_slot.real_path
                if not self.helpers._validate_incremental_target_dir(target_dir, selection):
                    incremental_target_errors.append(
                        f"“归入已有目录”任务的目标超出允许范围：{source_ref.relpath} -> {target_dir or '(root)'}"
                    )
        else:
            incremental_target_errors = []
        plan = execution_service.build_execution_plan(final_plan, Path(session.target_dir))
        precheck = execution_service.validate_execution_preconditions(plan)
        if incremental_target_errors:
            precheck.can_execute = False
            precheck.blocking_errors = list(precheck.blocking_errors) + incremental_target_errors
        planner_by_source = self.helpers._planner_items_by_source(session)
        move_preview = [
            {
                "item_id": str(planner_by_source.get(action.source.relative_to(plan.base_dir).as_posix(), {}).get("planner_id") or action.source.relative_to(plan.base_dir).as_posix()),
                "source": action.source.relative_to(plan.base_dir).as_posix(),
                "target": action.target.relative_to(plan.base_dir).as_posix(),
            }
            for action in plan.move_actions
            if action.source is not None
        ]
        session.precheck_summary = {
            "can_execute": precheck.can_execute,
            "blocking_errors": list(precheck.blocking_errors),
            "warnings": list(precheck.warnings),
            "mkdir_preview": [action.target.relative_to(plan.base_dir).as_posix() for action in plan.mkdir_actions],
            "move_preview": move_preview,
            "issues": self.helpers._precheck_issues(
                list(precheck.blocking_errors),
                list(precheck.warnings),
                final_plan.moves,
                planner_by_source,
            ),
        }
        session.stage = "ready_to_execute" if precheck.can_execute else "planning"
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event(
            "precheck.completed",
            session,
            can_execute=precheck.can_execute,
            blocking_error_count=len(precheck.blocking_errors),
            warning_count=len(precheck.warnings),
        )
        self.helpers._write_session_debug_event(
            "precheck.completed",
            session,
            payload=session.precheck_summary,
        )
        self.helpers._record_event("precheck.ready", session)
        return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))

    def return_to_planning(self, session_id: str) -> SessionMutationResult:
        session = self.helpers._load_or_raise(session_id)
        if session.stage != "ready_to_execute":
            raise RuntimeError("SESSION_STAGE_CONFLICT")

        pending = self.helpers._pending_plan_from_session(session)
        session.precheck_summary = None
        session.stage = self.helpers._planning_stage_for(pending, session.scan_lines)
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._record_event("plan.updated", session)
        return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))

    def execute(self, session_id: str, confirm: bool) -> SessionMutationResult:
        if not confirm:
            raise ValueError("confirmation_required")

        session = self.helpers._load_or_raise(session_id)
        if session.stage != "ready_to_execute":
            raise RuntimeError("SESSION_STAGE_CONFLICT")

        session.stage = "executing"
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event("execution.started", session)
        self.helpers._write_session_debug_event("execution.started", session)
        self.helpers._record_event("execution.started", session)

        final_plan = self.helpers._final_plan_from_session(session)
        plan = execution_service.build_execution_plan(final_plan, Path(session.target_dir))
        report = execution_service.execute_plan(plan)
        journal_id = self.helpers._latest_execution_id(Path(session.target_dir))
        if not journal_id:
            session.stage = "interrupted"
            session.last_error = "missing_execution_journal"
            self.helpers._sync_session_views(session)
            self.helpers.store.save(session)
            self.helpers._log_runtime_event("execution.failed", session, reason="missing_execution_journal", level=logging.ERROR)
            self.helpers._write_session_debug_event(
                "execution.failed",
                session,
                level="ERROR",
                payload={"reason": "missing_execution_journal"},
            )
            self.helpers._record_event("session.interrupted", session)
            return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))

        session.execution_report = {
            "execution_id": journal_id,
            "journal_id": journal_id,
            "success_count": report.success_count,
            "failure_count": report.failure_count,
            "status": "success" if report.failure_count == 0 else "partial_failure",
            "has_cleanup_candidates": False,
            "cleanup_candidate_count": 0,
        }
        session.last_journal_id = journal_id
        session.stage = "completed"
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers.store.release_directory_lock(Path(session.target_dir), session.session_id)
        self.helpers._log_runtime_event(
            "execution.completed",
            session,
            execution_id=journal_id,
            success_count=report.success_count,
            failure_count=report.failure_count,
        )
        self.helpers._write_session_debug_event(
            "execution.completed",
            session,
            payload=session.execution_report,
        )
        self.helpers._record_event("execution.completed", session)
        return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))

    def rollback(self, session_id: str, confirm: bool) -> SessionMutationResult:
        if not confirm:
            raise ValueError("confirmation_required")

        session = self.helpers.store.load(session_id)
        if session is None:
            journal = execution_service.load_execution_journal(session_id)
            if journal is None:
                raise KeyError(f"Session {session_id} not found")
            return self.rollback_execution_journal(journal)

        if session.stage not in {"completed", "interrupted"}:
            raise RuntimeError("SESSION_STAGE_CONFLICT")

        lock_result = self.helpers.store.acquire_directory_lock(Path(session.target_dir), session.session_id)
        if not lock_result.acquired:
            raise RuntimeError("SESSION_LOCKED")

        session.stage = "rolling_back"
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event("rollback.started", session)
        self.helpers._write_session_debug_event("rollback.started", session)
        self.helpers._record_event("rollback.started", session)

        journal = rollback_service.load_latest_execution_for_directory(Path(session.target_dir))
        if journal is None:
            raise FileNotFoundError("latest_execution")

        plan = rollback_service.build_rollback_plan(journal)
        report = rollback_service.execute_rollback_plan(plan)
        rollback_service.finalize_rollback_state(journal, report)
        session.rollback_report = {
            "journal_id": journal.execution_id,
            "restored_from_execution_id": journal.execution_id,
            "success_count": report.success_count,
            "failure_count": report.failure_count,
            "status": "success" if report.failure_count == 0 else "partial_failure",
        }
        session.last_journal_id = journal.execution_id
        session.stage = "stale"
        session.integrity_flags["is_stale"] = True
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event(
            "rollback.completed",
            session,
            journal_id=journal.execution_id,
            success_count=report.success_count,
            failure_count=report.failure_count,
        )
        self.helpers._write_session_debug_event(
            "rollback.completed",
            session,
            payload=session.rollback_report,
        )
        self.helpers._record_event("rollback.completed", session)
        return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))

    def rollback_execution_journal(self, journal) -> SessionMutationResult:
        if journal.status not in {"completed", "partial_failure"}:
            raise RuntimeError("SESSION_STAGE_CONFLICT")

        target_dir = Path(journal.target_dir)
        lock_result = self.helpers.store.acquire_directory_lock(target_dir, journal.execution_id)
        if not lock_result.acquired:
            raise RuntimeError("SESSION_LOCKED")

        try:
            plan = rollback_service.build_rollback_plan(journal)
            report = rollback_service.execute_rollback_plan(plan)
            rollback_service.finalize_rollback_state(journal, report)
        finally:
            self.helpers.store.release_directory_lock(target_dir, journal.execution_id)

        return SessionMutationResult(
            session_snapshot={
                "session_id": journal.execution_id,
                "target_dir": journal.target_dir,
                "stage": "stale",
                "execution_report": {
                    "execution_id": journal.execution_id,
                    "journal_id": journal.execution_id,
                    "status": journal.status,
                },
                "rollback_report": {
                    "journal_id": journal.execution_id,
                    "restored_from_execution_id": journal.execution_id,
                    "success_count": report.success_count,
                    "failure_count": report.failure_count,
                    "status": "success" if report.failure_count == 0 else "partial_failure",
                },
                "integrity_flags": {
                    "is_stale": True,
                },
            }
        )

    def cleanup_empty_dirs(self, session_id: str) -> dict:
        session = self.helpers._load_or_raise(session_id)
        if session.stage != "completed":
            raise RuntimeError("SESSION_STAGE_CONFLICT")
        final_plan = self.helpers._final_plan_from_session(session)
        plan = execution_service.build_execution_plan(final_plan, Path(session.target_dir))
        empty_dirs = execution_service.get_empty_source_dirs(plan)
        if not empty_dirs:
            empty_dirs = [
                path
                for path in (plan.base_dir / directory for directory in final_plan.directories)
                if path.exists() and path.is_dir() and not any(path.iterdir())
            ]
        cleaned = execution_service.cleanup_empty_dirs(empty_dirs)
        if session.execution_report is not None:
            session.execution_report["has_cleanup_candidates"] = False
            session.execution_report["cleanup_candidate_count"] = max(0, len(empty_dirs) - len(cleaned))
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event(
            "cleanup.completed",
            session,
            cleaned_count=len(cleaned),
            candidate_count=len(empty_dirs),
        )
        self.helpers._write_session_debug_event(
            "cleanup.completed",
            session,
            payload={
                "candidate_count": len(empty_dirs),
                "cleaned_count": len(cleaned),
                "cleaned_dirs": [str(path) for path in cleaned],
            },
        )
        self.helpers._record_event("cleanup.completed", session, cleaned_count=len(cleaned))
        return {
            "session_id": session_id,
            "cleaned_count": len(cleaned),
            "session_snapshot": self.helpers._build_snapshot(session),
        }
