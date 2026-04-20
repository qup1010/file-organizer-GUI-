from __future__ import annotations

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path


_CATALOG_PATH = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "strategy-catalog.json"


@lru_cache(maxsize=1)
def _load_strategy_catalog() -> dict:
    payload = json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))

    defaults = payload.get("defaults", {})
    strategy_templates = {
        item["id"]: {
            "id": item["id"],
            "label": item["label"],
            "description": item["description"],
            "applicable_scenarios": item.get("applicableScenarios", ""),
            "default_language": item.get("defaultLanguage"),
            "default_density": item.get("defaultDensity"),
            "default_prefix_style": item.get("defaultPrefixStyle"),
            "default_caution_level": item.get("defaultCautionLevel"),
            "directory_sets": deepcopy(item.get("directorySets", {})),
            "prompt_fragment": item.get("promptFragment", ""),
        }
        for item in payload.get("strategyTemplates", [])
    }
    languages = {
        item["id"]: {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "prompt_fragment": item.get("promptFragment", ""),
        }
        for item in payload.get("languages", [])
    }
    densities = {
        item["id"]: {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "prompt_fragment": item.get("promptFragment", ""),
        }
        for item in payload.get("densities", [])
    }
    prefix_styles = {
        item["id"]: {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "prompt_fragment": item.get("promptFragment", ""),
        }
        for item in payload.get("prefixStyles", [])
    }
    caution_levels = {
        item["id"]: {
            "id": item["id"],
            "label": item["label"],
            "description": item.get("description", ""),
            "prompt_fragment": item.get("promptFragment", ""),
        }
        for item in payload.get("cautionLevels", [])
    }
    return {
        "defaults": defaults,
        "strategy_templates": strategy_templates,
        "languages": languages,
        "densities": densities,
        "prefix_styles": prefix_styles,
        "caution_levels": caution_levels,
    }


_CATALOG = _load_strategy_catalog()

DEFAULT_TEMPLATE_ID = str(_CATALOG["defaults"].get("templateId", "general_downloads") or "general_downloads")
DEFAULT_LANGUAGE = str(_CATALOG["defaults"].get("language", "zh") or "zh")
DEFAULT_DENSITY = str(_CATALOG["defaults"].get("density", "normal") or "normal")
DEFAULT_PREFIX_STYLE = str(_CATALOG["defaults"].get("prefixStyle", "none") or "none")
DEFAULT_CAUTION_LEVEL = str(_CATALOG["defaults"].get("cautionLevel", "balanced") or "balanced")
DEFAULT_ORGANIZE_MODE = "initial"
DEFAULT_DESTINATION_INDEX_DEPTH = 2
TASK_TYPE_ORGANIZE_FULL_DIRECTORY = "organize_full_directory"
TASK_TYPE_ORGANIZE_INTO_EXISTING = "organize_into_existing"
DEFAULT_TASK_TYPE = TASK_TYPE_ORGANIZE_FULL_DIRECTORY

STRATEGY_TEMPLATES = deepcopy(_CATALOG["strategy_templates"])
LANGUAGES = deepcopy(_CATALOG["languages"])
DENSITIES = deepcopy(_CATALOG["densities"])
PREFIX_STYLES = deepcopy(_CATALOG["prefix_styles"])
CAUTION_LEVELS = deepcopy(_CATALOG["caution_levels"])


def task_type_for_organize_mode(organize_mode: str | None) -> str:
    normalized = str(organize_mode or DEFAULT_ORGANIZE_MODE).strip().lower()
    if normalized == "incremental":
        return TASK_TYPE_ORGANIZE_INTO_EXISTING
    return TASK_TYPE_ORGANIZE_FULL_DIRECTORY


def organize_mode_for_task_type(task_type: str | None) -> str:
    normalized = str(task_type or DEFAULT_TASK_TYPE).strip().lower()
    if normalized == TASK_TYPE_ORGANIZE_INTO_EXISTING:
        return "incremental"
    return "initial"


def task_type_label(task_type: str | None) -> str:
    normalized = str(task_type or DEFAULT_TASK_TYPE).strip().lower()
    if normalized == TASK_TYPE_ORGANIZE_INTO_EXISTING:
        return "归入已有目录"
    return "整理整个目录"


def _normalize_task_type(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {TASK_TYPE_ORGANIZE_FULL_DIRECTORY, TASK_TYPE_ORGANIZE_INTO_EXISTING}:
        return normalized
    return ""


def _directory_entries_for(template: dict, density: str) -> list[dict]:
    directory_sets = template.get("directory_sets", {})
    return list(directory_sets.get(density) or directory_sets.get(DEFAULT_DENSITY) or [])


def _format_directory_name(entry: dict, *, index: int, language: str, prefix_style: str) -> str:
    labels = dict(entry.get("labels", {}))
    category_labels = dict(entry.get("categoryLabels", {}))
    base_label = str(labels.get(language) or labels.get(DEFAULT_LANGUAGE) or "").strip()
    if not base_label:
        return ""
    if prefix_style == "numeric":
        return f"{index + 1:02d}_{base_label}"
    if prefix_style == "category":
        category_label = str(category_labels.get(language) or category_labels.get(DEFAULT_LANGUAGE) or base_label).strip()
        return f"[{category_label}] {base_label}"
    return base_label


def build_preview_directories(template_id: str, *, language: str, density: str, prefix_style: str) -> list[str]:
    template = STRATEGY_TEMPLATES.get(template_id)
    if not template:
        return []

    directories: list[str] = []
    for index, entry in enumerate(_directory_entries_for(template, density)):
        directory_name = _format_directory_name(entry, index=index, language=language, prefix_style=prefix_style)
        if directory_name:
            directories.append(directory_name)
    return directories


def list_strategy_templates() -> list[dict]:
    return [deepcopy(template) for template in STRATEGY_TEMPLATES.values()]


def normalize_strategy_selection(raw: dict | None = None) -> dict:
    payload = raw or {}
    template_id = payload.get("template_id")
    if template_id not in STRATEGY_TEMPLATES:
        template_id = DEFAULT_TEMPLATE_ID

    template = STRATEGY_TEMPLATES[template_id]

    language = payload.get("language") or template.get("default_language") or DEFAULT_LANGUAGE
    if language not in LANGUAGES:
        language = template.get("default_language") or DEFAULT_LANGUAGE

    density = payload.get("density") or template.get("default_density") or DEFAULT_DENSITY
    if density not in DENSITIES:
        density = template.get("default_density") or DEFAULT_DENSITY

    prefix_style = payload.get("prefix_style") or template.get("default_prefix_style") or DEFAULT_PREFIX_STYLE
    if prefix_style not in PREFIX_STYLES:
        prefix_style = template.get("default_prefix_style") or DEFAULT_PREFIX_STYLE

    caution_level = payload.get("caution_level") or template.get("default_caution_level") or DEFAULT_CAUTION_LEVEL
    if caution_level not in CAUTION_LEVELS:
        caution_level = template.get("default_caution_level") or DEFAULT_CAUTION_LEVEL

    requested_task_type = _normalize_task_type(payload.get("task_type"))
    requested_organize_mode = str(payload.get("organize_mode") or "").strip().lower()
    if requested_organize_mode not in {"initial", "incremental"}:
        requested_organize_mode = ""
    if requested_task_type and requested_organize_mode:
        expected_mode = organize_mode_for_task_type(requested_task_type)
        if expected_mode != requested_organize_mode:
            raise ValueError("TASK_TYPE_CONFLICT")
    organize_mode = (
        organize_mode_for_task_type(requested_task_type)
        if requested_task_type
        else (requested_organize_mode or DEFAULT_ORGANIZE_MODE)
    )
    task_type = requested_task_type or task_type_for_organize_mode(organize_mode)

    try:
        destination_index_depth = int(payload.get("destination_index_depth") or DEFAULT_DESTINATION_INDEX_DEPTH)
    except (TypeError, ValueError):
        destination_index_depth = DEFAULT_DESTINATION_INDEX_DEPTH
    destination_index_depth = max(1, min(3, destination_index_depth))

    note = str(payload.get("note") or "").strip()
    preview_directories = build_preview_directories(
        template_id,
        language=language,
        density=density,
        prefix_style=prefix_style,
    )

    return {
        "template_id": template_id,
        "template_label": template["label"],
        "template_description": template["description"],
        "language": language,
        "language_label": LANGUAGES[language]["label"],
        "density": density,
        "density_label": DENSITIES[density]["label"],
        "prefix_style": prefix_style,
        "prefix_style_label": PREFIX_STYLES[prefix_style]["label"],
        "caution_level": caution_level,
        "caution_level_label": CAUTION_LEVELS[caution_level]["label"],
        "task_type": task_type,
        "task_type_label": task_type_label(task_type),
        "organize_mode": organize_mode,
        "organize_mode_label": task_type_label(task_type),
        "destination_index_depth": destination_index_depth,
        "note": note,
        "preview_directories": preview_directories,
    }


def build_strategy_prompt_fragment(selection: dict | None = None) -> str:
    normalized = normalize_strategy_selection(selection)
    template = STRATEGY_TEMPLATES[normalized["template_id"]]
    caution = CAUTION_LEVELS[normalized["caution_level"]]
    if normalized["organize_mode"] == "initial":
        language = LANGUAGES[normalized["language"]]
        density = DENSITIES[normalized["density"]]
        prefix_style = PREFIX_STYLES[normalized["prefix_style"]]
        lines = [
            "当前固定整理策略（必须优先遵守）：",
            f"- 主模板：{normalized['template_label']}。{template['description']}",
            template["prompt_fragment"],
            language["prompt_fragment"],
            density["prompt_fragment"],
            prefix_style["prompt_fragment"],
            caution["prompt_fragment"],
            "当前任务类型：整理整个目录。只整理当前目录这一层的条目，可以创建新的目标目录。",
        ]
    else:
        lines = [
            "当前固定整理策略（必须优先遵守）：",
            "- 当前任务类型：归入已有目录。优先复用已有目录结构，不要把任务理解成重新设计分类体系。",
            caution["prompt_fragment"],
            f"- 目标目录可见深度为 {normalized['destination_index_depth']}。",
        ]
    if normalized["note"]:
        lines.append(f"用户补充说明：{normalized['note']}")
    return "\n".join(lines)
