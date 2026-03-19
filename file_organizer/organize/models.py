from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PlanMove:
    source: str
    target: str
    raw: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "PlanMove":
        return cls(
            source=data.get("source", ""),
            target=data.get("target", ""),
            raw=data.get("raw", ""),
        )

    def to_move_command(self) -> str:
        return self.raw or f'MOVE "{self.source}" "{self.target}"'


@dataclass
class PendingPlan:
    directories: list[str] = field(default_factory=list)
    moves: list[PlanMove] = field(default_factory=list)
    user_constraints: list[str] = field(default_factory=list)
    unresolved_items: list[str] = field(default_factory=list)
    summary: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "PendingPlan":
        return cls(
            directories=list(data.get("directories", [])),
            moves=[PlanMove.from_dict(item) for item in data.get("moves", [])],
            user_constraints=list(data.get("user_constraints", [])),
            unresolved_items=list(data.get("unresolved_items", [])),
            summary=data.get("summary", ""),
        )


@dataclass
class FinalPlan:
    directories: list[str] = field(default_factory=list)
    moves: list[PlanMove] = field(default_factory=list)
    unresolved_items: list[str] = field(default_factory=list)
    summary: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "FinalPlan":
        return cls(
            directories=list(data.get("directories", [])),
            moves=[PlanMove.from_dict(item) for item in data.get("moves", [])],
            unresolved_items=list(data.get("unresolved_items", [])),
            summary=data.get("summary", ""),
        )


@dataclass
class PlanDisplayRequest:
    focus: str = "full"
    summary: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "PlanDisplayRequest":
        return cls(
            focus=data.get("focus", "full"),
            summary=data.get("summary", ""),
        )

    def to_dict(self) -> dict:
        return {"focus": self.focus, "summary": self.summary}
