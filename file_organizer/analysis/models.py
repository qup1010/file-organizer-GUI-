from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AnalysisItem:
    entry_name: str
    suggested_purpose: str
    summary: str

    @classmethod
    def from_dict(cls, data: dict) -> "AnalysisItem":
        return cls(
            entry_name=data.get("entry_name", ""),
            suggested_purpose=data.get("suggested_purpose", "待判断"),
            summary=data.get("summary", ""),
        )

    def to_scan_line(self) -> str:
        return f"{self.entry_name} | {self.suggested_purpose} | {self.summary}"
