from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import app_config as config


@dataclass
class ExecutionAction:
    type: str
    target: Path
    source: Path | None = None
    raw: str = ""


@dataclass
class ExecutionPlan:
    base_dir: Path
    mkdir_actions: list[ExecutionAction] = field(default_factory=list)
    move_actions: list[ExecutionAction] = field(default_factory=list)
    all_actions: list[ExecutionAction] = field(default_factory=list)


@dataclass
class PrecheckResult:
    can_execute: bool
    blocking_errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ExecutionItemResult:
    action: ExecutionAction
    status: str
    message: str


@dataclass
class ExecutionReport:
    success_count: int
    failure_count: int
    results: list[ExecutionItemResult] = field(default_factory=list)


@dataclass
class ExecutionJournalItem:
    action_type: str
    status: str
    message: str
    raw: str = ""
    source_before: str | None = None
    target_after: str | None = None
    created_path: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "ExecutionJournalItem":
        return cls(**data)


@dataclass
class ExecutionJournal:
    execution_id: str
    target_dir: str
    created_at: str
    status: str
    items: list[ExecutionJournalItem] = field(default_factory=list)
    rollback_attempts: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["items"] = [asdict(item) for item in self.items]
        return payload

    @classmethod
    def from_dict(cls, data: dict) -> "ExecutionJournal":
        return cls(
            execution_id=data["execution_id"],
            target_dir=data["target_dir"],
            created_at=data["created_at"],
            status=data["status"],
            items=[ExecutionJournalItem.from_dict(item) for item in data.get("items", [])],
            rollback_attempts=list(data.get("rollback_attempts", [])),
        )


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _relative_display(path: Path, base_dir: Path) -> str:
    try:
        return path.resolve(strict=False).relative_to(base_dir.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _ensure_history_dirs() -> None:
    config.HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    config.EXECUTION_LOG_DIR.mkdir(parents=True, exist_ok=True)
    if not config.LATEST_BY_DIRECTORY_PATH.exists():
        config.LATEST_BY_DIRECTORY_PATH.write_text("{}", encoding="utf-8")


def _read_latest_index() -> dict[str, str]:
    _ensure_history_dirs()
    return json.loads(config.LATEST_BY_DIRECTORY_PATH.read_text(encoding="utf-8") or "{}")


def _write_latest_index(index: dict[str, str]) -> None:
    _ensure_history_dirs()
    config.LATEST_BY_DIRECTORY_PATH.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _journal_path(execution_id: str) -> Path:
    _ensure_history_dirs()
    return config.EXECUTION_LOG_DIR / f"{execution_id}.json"


def save_execution_journal(journal: ExecutionJournal) -> Path:
    path = _journal_path(journal.execution_id)
    path.write_text(
        json.dumps(journal.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def update_latest_execution_pointer(target_dir: Path, execution_id: str) -> None:
    latest_index = _read_latest_index()
    latest_index[str(target_dir.resolve())] = execution_id
    _write_latest_index(latest_index)


def load_execution_journal(execution_id: str) -> ExecutionJournal | None:
    path = _journal_path(execution_id)
    if not path.exists():
        return None
    return ExecutionJournal.from_dict(json.loads(path.read_text(encoding="utf-8")))


def build_execution_plan(parsed_commands: dict, base_dir: Path) -> ExecutionPlan:
    base_dir = Path(base_dir).resolve()
    mkdir_actions: list[ExecutionAction] = []
    move_actions: list[ExecutionAction] = []
    all_actions: list[ExecutionAction] = []

    for command in parsed_commands.get("commands", []):
        if command["type"] == "MKDIR":
            action = ExecutionAction(
                type="MKDIR",
                target=base_dir / command["name"],
                raw=command["raw"],
            )
            mkdir_actions.append(action)
            all_actions.append(action)
        elif command["type"] == "MOVE":
            action = ExecutionAction(
                type="MOVE",
                source=base_dir / command["source"],
                target=base_dir / command["target"],
                raw=command["raw"],
            )
            move_actions.append(action)
            all_actions.append(action)

    return ExecutionPlan(
        base_dir=base_dir,
        mkdir_actions=mkdir_actions,
        move_actions=move_actions,
        all_actions=all_actions,
    )


def validate_execution_preconditions(plan: ExecutionPlan) -> PrecheckResult:
    blocking_errors: list[str] = []
    warnings: list[str] = []
    planned_dirs = {action.target.resolve(strict=False) for action in plan.mkdir_actions}

    for action in plan.move_actions:
        assert action.source is not None
        source = action.source
        target = action.target

        if not source.exists():
            blocking_errors.append(f"源项目不存在: {_relative_display(source, plan.base_dir)}")
            continue

        if target.exists():
            blocking_errors.append(f"目标已存在: {_relative_display(target, plan.base_dir)}")
            continue

        source_abs = source.resolve()
        target_abs = target.resolve(strict=False)
        if source_abs == target_abs or source_abs in target_abs.parents:
            blocking_errors.append(f"不能移动到自身子路径: {_relative_display(target, plan.base_dir)}")

        parent_dir = target.parent.resolve(strict=False)
        if not parent_dir.exists() and parent_dir not in planned_dirs:
            blocking_errors.append(f"目标父目录不存在: {_relative_display(target.parent, plan.base_dir)}")

    return PrecheckResult(
        can_execute=not blocking_errors,
        blocking_errors=blocking_errors,
        warnings=warnings,
    )


def render_execution_preview(plan: ExecutionPlan, precheck: PrecheckResult) -> str:
    lines = ["即将执行以下整理方案：", ""]

    lines.append("创建目录：")
    if plan.mkdir_actions:
        lines.extend(f"- {_relative_display(action.target, plan.base_dir)}" for action in plan.mkdir_actions)
    else:
        lines.append("- 无")

    lines.append("")
    lines.append("移动项目：")
    if plan.move_actions:
        for index, action in enumerate(plan.move_actions, start=1):
            assert action.source is not None
            lines.append(
                f'{index}. "{_relative_display(action.source, plan.base_dir)}" -> '
                f'"{_relative_display(action.target, plan.base_dir)}"'
            )
    else:
        lines.append("- 无")

    lines.append("")
    lines.append("统计：")
    lines.append(f"- 新建目录：{len(plan.mkdir_actions)} 个")
    lines.append(f"- 移动项目：{len(plan.move_actions)} 个")
    lines.append(f"- 阻断问题：{len(precheck.blocking_errors)} 个")

    if precheck.blocking_errors:
        lines.append("")
        lines.append("阻断问题：")
        lines.extend(f"- {item}" for item in precheck.blocking_errors)

    if precheck.warnings:
        lines.append("")
        lines.append("提示：")
        lines.extend(f"- {item}" for item in precheck.warnings)

    return "\n".join(lines)


def _build_running_journal(plan: ExecutionPlan) -> ExecutionJournal:
    return ExecutionJournal(
        execution_id=uuid.uuid4().hex,
        target_dir=str(plan.base_dir.resolve()),
        created_at=_utc_now_iso(),
        status="running",
        items=[],
        rollback_attempts=[],
    )


def _append_journal_item(
    journal: ExecutionJournal,
    *,
    action_type: str,
    status: str,
    message: str,
    raw: str,
    source_before: Path | None = None,
    target_after: Path | None = None,
    created_path: Path | None = None,
) -> None:
    journal.items.append(
        ExecutionJournalItem(
            action_type=action_type,
            status=status,
            message=message,
            raw=raw,
            source_before=str(source_before.resolve()) if source_before else None,
            target_after=str(target_after.resolve(strict=False)) if target_after else None,
            created_path=str(created_path.resolve()) if created_path else None,
        )
    )
    save_execution_journal(journal)


def execute_plan(plan: ExecutionPlan) -> ExecutionReport:
    results: list[ExecutionItemResult] = []
    success_count = 0
    failure_count = 0
    journal = _build_running_journal(plan)
    save_execution_journal(journal)

    for action in plan.mkdir_actions:
        try:
            created_now = not action.target.exists()
            action.target.mkdir(parents=True, exist_ok=True)
            message = "目录已创建" if created_now else "目录已存在"
            results.append(ExecutionItemResult(action=action, status="success", message=message))
            success_count += 1
            _append_journal_item(
                journal,
                action_type="MKDIR",
                status="success",
                message=message,
                raw=action.raw,
                created_path=action.target if created_now else None,
            )
        except Exception as exc:  # pragma: no cover - defensive branch
            message = str(exc)
            results.append(ExecutionItemResult(action=action, status="failed", message=message))
            failure_count += 1
            _append_journal_item(
                journal,
                action_type="MKDIR",
                status="failed",
                message=message,
                raw=action.raw,
            )

    for action in plan.move_actions:
        try:
            assert action.source is not None
            shutil.move(str(action.source), str(action.target))
            results.append(ExecutionItemResult(action=action, status="success", message="移动成功"))
            success_count += 1
            _append_journal_item(
                journal,
                action_type="MOVE",
                status="success",
                message="移动成功",
                raw=action.raw,
                source_before=action.source,
                target_after=action.target,
            )
        except Exception as exc:
            message = str(exc)
            results.append(ExecutionItemResult(action=action, status="failed", message=message))
            failure_count += 1
            _append_journal_item(
                journal,
                action_type="MOVE",
                status="failed",
                message=message,
                raw=action.raw,
                source_before=action.source,
                target_after=action.target,
            )

    journal.status = "completed" if failure_count == 0 else "partial_failure"
    save_execution_journal(journal)
    update_latest_execution_pointer(plan.base_dir, journal.execution_id)

    return ExecutionReport(
        success_count=success_count,
        failure_count=failure_count,
        results=results,
    )


def render_execution_report(report: ExecutionReport) -> str:
    lines = ["执行结果：", ""]
    lines.append(f"- 成功：{report.success_count}")
    lines.append(f"- 失败：{report.failure_count}")
    lines.append("")

    if report.results:
        for item in report.results:
            action = item.action
            if action.type == "MKDIR":
                target = action.target.as_posix()
                lines.append(f"[{item.status}] MKDIR {target} - {item.message}")
            else:
                assert action.source is not None
                lines.append(
                    f"[{item.status}] MOVE {action.source.as_posix()} -> {action.target.as_posix()} - {item.message}"
                )

    return "\n".join(lines)
