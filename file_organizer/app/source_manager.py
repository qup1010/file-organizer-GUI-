from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from file_organizer.app.models import OrganizerSession
    from file_organizer.app.session_service import OrganizerSessionService


class SourceManager:
    def __init__(self, helpers: "OrganizerSessionService"):
        self.helpers = helpers

    def scan_entries(self, scan_lines: str) -> list[dict]:
        entries = []
        for line in (scan_lines or "").splitlines():
            if not line.strip():
                continue
            entry_path = ""
            entry_type = ""
            suggested_purpose = ""
            summary = ""
            confidence = None
            if "|" in line:
                parts = [part.strip() for part in line.split("|", 3)]
                entry_path = parts[0] if parts else ""
                if len(parts) >= 4:
                    entry_type = parts[1].lower()
                    suggested_purpose = parts[2]
                    summary = parts[3]
                else:
                    suggested_purpose = parts[1] if len(parts) > 1 else ""
                    summary = parts[2] if len(parts) > 2 else ""
            else:
                parts = line.split(":", 1)
                if len(parts) >= 2:
                    entry_path = parts[1].split("(")[0].strip()
            if not entry_path:
                continue
            entries.append(
                {
                    "item_id": entry_path,
                    "display_name": Path(entry_path).name,
                    "source_relpath": entry_path,
                    "suggested_purpose": suggested_purpose,
                    "summary": summary,
                    "confidence": confidence,
                    "entry_type": entry_type,
                    "ext": self.helpers._entry_extension(entry_path),
                }
            )
        return entries

    def build_planner_items(self, scan_lines: str, existing_items: list[dict] | None = None) -> list[dict]:
        entries = self.scan_entries(scan_lines)
        existing_by_source = {
            str(item.get("source_relpath") or "").replace("\\", "/"): dict(item)
            for item in (existing_items or [])
            if str(item.get("source_relpath") or "").strip()
        }
        next_id = max((self.helpers._planner_id_number(item.get("planner_id")) for item in (existing_items or [])), default=0)
        basename_counts: dict[str, int] = {}
        for entry in entries:
            basename = str(entry.get("display_name") or "").strip().lower()
            if basename:
                basename_counts[basename] = basename_counts.get(basename, 0) + 1

        planner_items: list[dict] = []
        for entry in entries:
            source_relpath = str(entry.get("source_relpath") or "").replace("\\", "/").strip()
            if not source_relpath:
                continue
            existing = existing_by_source.get(source_relpath)
            if existing:
                planner_id = str(existing.get("planner_id") or "").strip()
            else:
                next_id += 1
                planner_id = f"F{next_id:03d}"
            parent_hint = ""
            if basename_counts.get(str(entry.get("display_name") or "").strip().lower(), 0) > 1:
                parent_hint = str(Path(source_relpath).parent).replace("\\", "/")
                if parent_hint == ".":
                    parent_hint = ""
            planner_items.append(
                {
                    "planner_id": planner_id,
                    "source_relpath": source_relpath,
                    "display_name": entry.get("display_name") or Path(source_relpath).name,
                    "suggested_purpose": entry.get("suggested_purpose", ""),
                    "summary": entry.get("summary", ""),
                    "confidence": entry.get("confidence", existing.get("confidence") if existing else None),
                    "entry_type": entry.get("entry_type", ""),
                    "ext": entry.get("ext") or self.helpers._entry_extension(source_relpath),
                    "parent_hint": parent_hint,
                }
            )
        planner_items.sort(key=lambda item: self.helpers._planner_id_number(item.get("planner_id", "")))
        return planner_items

    def build_source_tree_entries(
        self,
        target_dir: Path,
        scan_lines: str,
        planner_items: list[dict] | None = None,
    ) -> list[dict]:
        scan_entries = self.scan_entries(scan_lines)
        if not scan_entries:
            return []

        planner_by_source = {
            str(item.get("source_relpath") or "").replace("\\", "/").strip(): dict(item)
            for item in (planner_items or [])
            if str(item.get("source_relpath") or "").strip()
        }
        entries_by_path: dict[str, dict] = {}

        def normalize_entry_type(source_relpath: str, raw_entry_type: str | None) -> str:
            normalized = str(raw_entry_type or "").strip().lower()
            if normalized in {"dir", "directory", "folder"}:
                return "directory"
            if normalized == "file":
                return "file"
            source_prefix = f"{source_relpath}/"
            if any(
                str(entry.get("source_relpath") or "").replace("\\", "/").strip().startswith(source_prefix)
                for entry in scan_entries
            ):
                return "directory"
            detected = self.helpers._detect_entry_type(target_dir, source_relpath)
            if detected == "dir":
                return "directory"
            return "file"

        def remember_entry(source_relpath: str, display_name: str, entry_type: str) -> None:
            if not source_relpath:
                return
            entries_by_path[source_relpath] = {
                "source_relpath": source_relpath,
                "display_name": display_name or Path(source_relpath).name,
                "entry_type": entry_type,
            }

        for entry in scan_entries:
            source_relpath = str(entry.get("source_relpath") or "").replace("\\", "/").strip()
            if not source_relpath:
                continue
            planner_meta = planner_by_source.get(source_relpath, {})
            normalized_type = normalize_entry_type(source_relpath, entry.get("entry_type") or planner_meta.get("entry_type"))
            parts = [part for part in source_relpath.split("/") if part]
            parent_path = ""
            for parent in parts[:-1]:
                parent_path = f"{parent_path}/{parent}" if parent_path else parent
                remember_entry(parent_path, parent, "directory")
            remember_entry(source_relpath, str(entry.get("display_name") or Path(source_relpath).name), normalized_type)

        return sorted(
            entries_by_path.values(),
            key=lambda item: (
                str(item.get("source_relpath") or "").count("/"),
                str(item.get("source_relpath") or "").lower(),
            ),
        )

    def ensure_planner_items(self, session: "OrganizerSession", scan_lines: str | None = None) -> bool:
        source_scan_lines = scan_lines if scan_lines is not None else session.scan_lines
        next_items = self.build_planner_items(source_scan_lines or "", existing_items=session.planner_items)
        changed = False
        if next_items != (session.planner_items or []):
            session.planner_items = next_items
            changed = True
        next_source_tree = self.build_source_tree_entries(Path(session.target_dir), source_scan_lines or "", planner_items=next_items)
        if next_source_tree != (session.source_tree_entries or []):
            session.source_tree_entries = next_source_tree
            changed = True
        return changed
