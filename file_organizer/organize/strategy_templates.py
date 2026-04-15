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

STRATEGY_TEMPLATES = deepcopy(_CATALOG["strategy_templates"])
LANGUAGES = deepcopy(_CATALOG["languages"])
DENSITIES = deepcopy(_CATALOG["densities"])
PREFIX_STYLES = deepcopy(_CATALOG["prefix_styles"])
CAUTION_LEVELS = deepcopy(_CATALOG["caution_levels"])


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
        "note": note,
        "preview_directories": preview_directories,
    }


def build_strategy_prompt_fragment(selection: dict | None = None) -> str:
    normalized = normalize_strategy_selection(selection)
    template = STRATEGY_TEMPLATES[normalized["template_id"]]
    language = LANGUAGES[normalized["language"]]
    density = DENSITIES[normalized["density"]]
    prefix_style = PREFIX_STYLES[normalized["prefix_style"]]
    caution = CAUTION_LEVELS[normalized["caution_level"]]

    lines = [
        "当前固定整理策略（必须优先遵守）：",
        f"- 主模板：{normalized['template_label']}。{template['description']}",
        template["prompt_fragment"],
        language["prompt_fragment"],
        density["prompt_fragment"],
        prefix_style["prompt_fragment"],
        caution["prompt_fragment"],
    ]
    if normalized["note"]:
        lines.append(f"用户补充说明：{normalized['note']}")
    return "\n".join(lines)
