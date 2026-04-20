from __future__ import annotations
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from file_organizer.app.models import CreateSessionResult
from file_organizer.organize import service as organize_service
from file_organizer.organize.models import PendingPlan
from file_organizer.organize.strategy_templates import normalize_strategy_selection

if TYPE_CHECKING:
    from file_organizer.app.session_service import OrganizerSessionService

logger = logging.getLogger(__name__)


class SessionOrchestrator:
    def __init__(self, helpers: "OrganizerSessionService"):
        self.helpers = helpers

    def run_planner_cycle_for_session(
        self,
        session,
        *,
        source: str,
        pending_plan: PendingPlan | None = None,
        preserving_previous_plan: bool | None = None,
    ) -> None:
        self.helpers._seed_initial_messages(session)
        active_pending = pending_plan or self.helpers._pending_plan_from_session(session)
        task, _ = self.helpers._build_organize_task(session, active_pending)
        adapter = self.helpers._task_planner_adapter(session)

        def on_plan_event(event_type: str, data: dict):
            self.helpers._forward_runtime_event("plan", session.session_id, event_type, data, session=session)

        self.helpers._begin_planner_progress(session, preserving_previous_plan=preserving_previous_plan)
        try:
            assistant_message, cycle_result = organize_service.run_organizer_cycle(
                messages=list(session.messages),
                scan_lines=session.scan_lines,
                planner_items=session.planner_items,
                pending_plan=active_pending,
                user_constraints=list(session.user_constraints),
                strategy_instructions=self.helpers._strategy_prompt_fragment(session),
                planning_context=self.helpers._planning_context(session),
                event_handler=on_plan_event,
            )
        except Exception as exc:
            session.last_error = str(exc)
            self.helpers._fail_planner_progress(session, str(exc))
            raise

        updated_pending = cycle_result.get("pending_plan", active_pending) if cycle_result else active_pending
        session.user_constraints = list(updated_pending.user_constraints or session.user_constraints)
        updated_task = adapter.apply_pending_plan(task, updated_pending)
        self.helpers._apply_task_state(session, updated_task, cycle_result, prefer_local_summary=False)
        session.assistant_message, assistant_context_messages = self.helpers._assistant_messages_from_cycle(assistant_message, cycle_result)
        self.helpers._clear_manual_sync_messages(session)
        session.messages.extend(assistant_context_messages)
        self.helpers._set_last_ai_pending_state(session, updated_pending, task=updated_task)
        self.helpers._complete_planner_progress(session)
        self.helpers._log_runtime_event("plan.updated", session, source=source)
        self.helpers._write_session_debug_event(
            "plan.updated",
            session,
            payload={"source": source, "summary": session.summary},
        )

    def maybe_run_auto_plan_after_scan(self, session) -> None:
        if (
            self.helpers._normalize_organize_mode(session.organize_mode) != "initial"
            or session.assistant_message
            or self.helpers._plan_snapshot_has_moves(session.plan_snapshot)
        ):
            return

        try:
            self.helpers._log_runtime_event("plan.auto_started", session)
            self.helpers._write_session_debug_event("plan.auto_started", session)
            self.run_planner_cycle_for_session(
                session,
                source="auto_scan",
                pending_plan=self.helpers._pending_plan_from_session(session),
                preserving_previous_plan=self.helpers._has_existing_plan_content(session),
            )
            self.helpers._sync_session_views(session)
            self.helpers.store.save(session)
            self.helpers._log_runtime_event("plan.auto_completed", session, summary=session.summary)
            self.helpers._write_session_debug_event(
                "plan.auto_completed",
                session,
                payload={"summary": session.summary},
            )
            self.helpers._record_event("plan.updated", session)
        except Exception as exc:
            logger.exception(
                "plan.auto_failed session_id=%s target_dir=%s",
                session.session_id,
                session.target_dir,
            )
            session.last_error = f"自动规划失败: {str(exc)}"
            self.helpers._fail_planner_progress(session, session.last_error)
            session.stage = "interrupted"
            self.helpers._sync_session_views(session)
            self.helpers.store.save(session)
            self.helpers._log_runtime_event("plan.auto_failed", session, level=logging.ERROR, error=str(exc))
            self.helpers._write_session_debug_event(
                "plan.auto_failed",
                session,
                level="ERROR",
                payload={"error": str(exc)},
            )
            self.helpers._record_event("plan.updated", session)

    def create_session(self, target_dir: str, resume_if_exists: bool, strategy: dict | None = None) -> CreateSessionResult:
        path = Path(target_dir)
        latest = self.helpers.store.find_latest_by_directory(path)
        if latest is not None and latest.stage not in self.helpers._TERMINAL_STAGES:
            if resume_if_exists:
                self.helpers._log_runtime_event(
                    "session.resume_available",
                    latest,
                    existing_session_id=latest.session_id,
                )
                return CreateSessionResult(mode="resume_available", restorable_session=latest)
            raise RuntimeError("SESSION_LOCKED")

        session = self.helpers.store.create(path)
        normalized_strategy = normalize_strategy_selection(strategy)
        session.strategy_template_id = normalized_strategy["template_id"]
        session.strategy_template_label = normalized_strategy["template_label"]
        session.organize_mode = self.helpers._normalize_organize_mode(normalized_strategy.get("organize_mode"))
        session.destination_index_depth = self.helpers._normalize_destination_index_depth(
            normalized_strategy.get("destination_index_depth")
        )
        session.language = normalized_strategy["language"]
        session.density = normalized_strategy["density"]
        session.prefix_style = normalized_strategy["prefix_style"]
        session.caution_level = normalized_strategy["caution_level"]
        session.strategy_note = normalized_strategy["note"]
        session.user_constraints = [normalized_strategy["note"]] if normalized_strategy["note"] else []
        session.incremental_selection = self.helpers._incremental_selection_defaults(session)
        self.helpers._sync_session_views(session)
        lock_result = self.helpers.store.acquire_directory_lock(path, session.session_id)
        if not lock_result.acquired:
            raise RuntimeError("SESSION_LOCKED")

        self.helpers.store.save(session)
        self.helpers._log_runtime_event("session.created", session, strategy=self.helpers._strategy_runtime_summary(session))
        self.helpers._write_session_debug_event("session.created", session, payload={"strategy": self.helpers._strategy_runtime_summary(session)})
        self.helpers._record_event("session.created", session)
        return CreateSessionResult(mode="created", session=session)
