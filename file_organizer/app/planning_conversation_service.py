from typing import TYPE_CHECKING

from file_organizer.app.models import SessionMutationResult

if TYPE_CHECKING:
    from file_organizer.app.session_service import OrganizerSessionService


class PlanningConversationService:
    def __init__(self, helpers: "OrganizerSessionService"):
        self.helpers = helpers

    @staticmethod
    def _message_blocks(message: dict) -> list[dict]:
        blocks = message.get("blocks")
        return blocks if isinstance(blocks, list) else []

    def _find_unresolved_request_message(self, session, request_id: str) -> tuple[dict | None, dict | None]:
        for message in reversed(session.messages):
            if message.get("role") != "assistant":
                continue
            for block in self._message_blocks(message):
                if block.get("type") == "unresolved_choices" and block.get("request_id") == request_id:
                    return message, block
        return None, None

    @staticmethod
    def _set_unresolved_request_status(message: dict, request_id: str, submitted_resolutions: list[dict]) -> bool:
        updated = False
        blocks = message.get("blocks")
        if not isinstance(blocks, list):
            return updated
        for block in blocks:
            if block.get("type") != "unresolved_choices" or block.get("request_id") != request_id:
                continue
            block["status"] = "submitted"
            block["submitted_resolutions"] = [dict(item) for item in submitted_resolutions]
            updated = True
        return updated

    def _mark_unresolved_request_submitted(self, session, request_id: str, submitted_resolutions: list[dict]) -> None:
        for message in session.messages:
            self._set_unresolved_request_status(message, request_id, submitted_resolutions)
        if session.assistant_message:
            self._set_unresolved_request_status(session.assistant_message, request_id, submitted_resolutions)

    @staticmethod
    def _resolution_summary_lines(resolutions: list[dict]) -> list[str]:
        lines = ["我已提交以下待确认项选择："]
        for item in resolutions:
            label = item.get("display_name") or item.get("item_id", "")
            selected_folder = (item.get("selected_folder") or "").strip()
            note = (item.get("note") or "").strip()
            if selected_folder:
                lines.append(f"- {label} -> {selected_folder}")
            if note:
                lines.append(f"- {label} 备注：{note}")
        return lines

    def get_snapshot(self, session_id: str) -> dict:
        session = self.helpers._load_or_raise(session_id)
        self.helpers._recover_orphaned_locked_session(session)

        changed = self.helpers._ensure_message_ids(session.messages)
        if session.assistant_message and not session.assistant_message.get("id"):
            self.helpers._ensure_message_id(session.assistant_message)
            changed = True
        if self.helpers._normalize_last_ai_pending_plan(session):
            changed = True

        if changed:
            self.helpers._sync_session_views(session)
            self.helpers.store.save(session)

        return self.helpers._build_snapshot(session)

    def submit_user_intent(self, session_id: str, content: str) -> SessionMutationResult:
        session = self.helpers._load_or_raise(session_id)
        self.helpers._ensure_mutable_stage(session)
        if session.stage == "selecting_incremental_scope":
            raise RuntimeError("SESSION_STAGE_CONFLICT")
        self.helpers._seed_initial_messages(session)
        session.messages.append(self.helpers._ensure_message_id({"role": "user", "content": content}))
        pending_plan = self.helpers._pending_plan_from_session(session)
        self.helpers._log_runtime_event(
            "plan.user_intent_submitted",
            session,
            message_count=len(session.messages),
            content_preview=content[:120],
        )
        self.helpers._write_session_debug_event(
            "plan.user_intent_submitted",
            session,
            payload={"content": content},
        )

        try:
            self.helpers.orchestrator.run_planner_cycle_for_session(
                session,
                source="user_intent",
                pending_plan=pending_plan,
            )
        except Exception:
            self.helpers._sync_session_views(session)
            self.helpers.store.save(session)
            raise
        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._record_event("plan.updated", session)
        return SessionMutationResult(
            session_snapshot=self.helpers._build_snapshot(session),
            assistant_message=session.assistant_message,
        )

    def resolve_unresolved_choices(self, session_id: str, request_id: str, resolutions: list[dict]) -> SessionMutationResult:
        session = self.helpers._load_or_raise(session_id)
        self.helpers._ensure_mutable_stage(session)
        self.helpers._log_runtime_event(
            "plan.unresolved_choices_submitted",
            session,
            request_id=request_id,
            resolution_count=len(resolutions or []),
        )
        self.helpers._write_session_debug_event(
            "plan.unresolved_choices_submitted",
            session,
            payload={"request_id": request_id, "resolutions": resolutions or []},
        )

        message, request_block = self._find_unresolved_request_message(session, request_id)
        if request_block is None or message is None:
            raise RuntimeError("UNRESOLVED_REQUEST_NOT_FOUND")
        if request_block.get("status") == "submitted":
            return SessionMutationResult(
                session_snapshot=self.helpers._build_snapshot(session),
                assistant_message=session.assistant_message,
                changed=False,
            )

        request_items = request_block.get("items") or []
        item_map = {
            item.get("item_id"): dict(item)
            for item in request_items
            if isinstance(item, dict) and item.get("item_id")
        }
        if not item_map:
            raise ValueError("UNRESOLVED_REQUEST_INVALID")

        pending = self.helpers._pending_plan_from_session(session)
        move_map = {
            self.helpers._normalize_relpath(move.source): move
            for move in pending.moves
            if self.helpers._normalize_relpath(move.source)
        }
        unresolved_set = {
            self.helpers._normalize_relpath(item)
            for item in pending.unresolved_items
            if self.helpers._normalize_relpath(item)
        }

        submitted_map: dict[str, dict] = {}
        request_item_sources: dict[str, str] = {}
        for resolution in resolutions or []:
            item_id = str(resolution.get("item_id") or "").strip()
            if not item_id or item_id not in item_map:
                raise RuntimeError("UNRESOLVED_ITEM_CONFLICT")
            real_item_id = self.helpers._resolve_request_item_source(session, pending, item_id)
            if not real_item_id:
                raise RuntimeError("UNRESOLVED_ITEM_CONFLICT")

            selected_folder = str(resolution.get("selected_folder") or "").strip()
            note = str(resolution.get("note") or "").strip()
            allowed_folders = set(item_map[item_id].get("suggested_folders") or [])
            if selected_folder and selected_folder not in allowed_folders and selected_folder != "Review":
                raise ValueError("UNRESOLVED_RESOLUTION_INVALID_FOLDER")
            if not selected_folder and not note:
                raise ValueError("UNRESOLVED_RESOLUTION_EMPTY")

            submitted_map[real_item_id] = {
                "item_id": item_id,
                "display_name": item_map[item_id].get("display_name", self.helpers._planner_display_name(session, item_id)),
                "selected_folder": selected_folder,
                "note": note,
            }
            request_item_sources[item_id] = real_item_id

        if len(submitted_map) != len(item_map):
            raise ValueError("UNRESOLVED_RESOLUTION_INCOMPLETE")

        for mid in submitted_map:
            is_unresolved = mid in unresolved_set
            request_block_item_id = submitted_map[mid]["item_id"]
            request_source = request_item_sources.get(request_block_item_id)
            if not is_unresolved and request_source == mid:
                if mid not in [self.helpers._normalize_relpath(value) for value in pending.unresolved_items]:
                    pending.unresolved_items.append(mid)
                unresolved_set.add(mid)
                is_unresolved = True

            if mid not in move_map and request_source == mid:
                move_map[mid] = self.helpers._ensure_pending_move_for_source(pending, mid)

            if not is_unresolved:
                raise RuntimeError("UNRESOLVED_ITEM_CONFLICT")

        has_note = False
        task, _ = self.helpers._build_organize_task(session, pending)
        adapter = self.helpers._task_planner_adapter(session)
        for item_id, resolution in submitted_map.items():
            selected_folder = resolution["selected_folder"]
            note = resolution["note"]
            if note:
                has_note = True
            if not selected_folder:
                continue
            destination_dir = self.helpers._normalized_target_directory(
                session,
                pending,
                target_dir=selected_folder,
            )
            task = adapter.assign_mapping(
                task,
                source_relpath=item_id,
                target_dir=destination_dir,
                user_overridden=True,
            )
        pending = self.helpers._pending_plan_from_task(session, task)

        self._mark_unresolved_request_submitted(session, request_id, list(submitted_map.values()))
        summary_message = self.helpers._ensure_message_id(
            {
                "role": "user",
                "content": "\n".join(self._resolution_summary_lines(list(submitted_map.values()))),
                "visibility": "internal",
            }
        )
        session.messages.append(summary_message)

        if has_note:
            try:
                self.helpers.orchestrator.run_planner_cycle_for_session(
                    session,
                    source="resolve_unresolved_choices",
                    pending_plan=pending,
                )
            except Exception:
                self.helpers._sync_session_views(session)
                self.helpers.store.save(session)
                raise
        else:
            pending = self.helpers._apply_task_state(
                session,
                task,
                {"diff_summary": ["resolve_unresolved_choices"]},
                prefer_local_summary=True,
            )
            self.helpers._sync_manual_diff_from_last_ai(session, pending)

        self.helpers._sync_session_views(session)
        self.helpers.store.save(session)
        self.helpers._log_runtime_event("plan.updated", session, source="resolve_unresolved_choices")
        self.helpers._write_session_debug_event(
            "plan.updated",
            session,
            payload={"source": "resolve_unresolved_choices", "summary": session.summary},
        )
        self.helpers._record_event("plan.updated", session)
        return SessionMutationResult(
            session_snapshot=self.helpers._build_snapshot(session),
            assistant_message=session.assistant_message,
        )

    def update_item_target(
        self,
        session_id: str,
        item_id: str,
        target_dir: str | None,
        target_slot: str | None,
        move_to_review: bool,
    ) -> SessionMutationResult:
        session = self.helpers._load_or_raise(session_id)
        self.helpers._ensure_mutable_stage(session)

        pending = self.helpers._pending_plan_from_session(session)
        source_relpath = self.helpers._planner_source_for_item_id(session, item_id)
        if not source_relpath and any(move.source == item_id for move in pending.moves):
            source_relpath = item_id
        if not source_relpath:
            raise RuntimeError("ITEM_NOT_FOUND")

        if move_to_review or target_dir is not None or target_slot is not None:
            destination_dir = self.helpers._normalized_target_directory(
                session,
                pending,
                target_dir=target_dir,
                target_slot=target_slot,
                move_to_review=move_to_review,
            )
            task, _ = self.helpers._build_organize_task(session, pending)
            adapter = self.helpers._task_planner_adapter(session)
            task = adapter.assign_mapping(
                task,
                source_relpath=source_relpath,
                target_dir=destination_dir,
                user_overridden=True,
            )
            pending = self.helpers._pending_plan_from_task(session, task)
        else:
            raise RuntimeError("ITEM_NOT_FOUND")

        pending = self.helpers._apply_task_state(
            session,
            task,
            {"diff_summary": ["update_item"]},
            prefer_local_summary=True,
        )
        self.helpers._sync_manual_diff_from_last_ai(session, pending)
        self.helpers._sync_session_views(session)

        self.helpers.store.save(session)
        self.helpers._record_event("plan.updated", session)
        return SessionMutationResult(session_snapshot=self.helpers._build_snapshot(session))
