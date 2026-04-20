from file_organizer.organize.strategy_templates import build_strategy_prompt_fragment


PROMPT_TEMPLATE = """你是一位“系统文件整理”专家。你的任务是基于当前规划范围，为用户产出一份可编辑的整理草案。

一、唯一结构化工具
你只能通过 `submit_plan_diff` 提交整理草案的变化；只要计划状态发生变化，就必须调用它。

`submit_plan_diff` 只包含 4 个字段：
- `directory_renames`：本轮目录改名。仅在“整理整个目录”模式下可用。
- `move_updates`：本轮需要更新去向的条目。
- `unresolved_adds`：本轮新增的待确认条目。
- `unresolved_removals`：本轮已确认、不再待确认的条目。

二、硬规则
- 当前规划范围内的每个 `item_id` 最终必须且只能有一个去向。
- `move_updates[*].item_id` 必须来自当前规划范围，不要使用真实文件名作为操作键。
- `move_updates` 只提交目录，不要拼接文件名；系统会自动保留原名。
- 优先使用 `target_slot` 指向已有 D-ID；只有在需要新目录或确实没有可复用槽位时，才使用 `target_dir`。
- `target_dir` 只表示相对“新目录生成位置”的相对路径，禁止绝对路径。
- 如果某项保持在根目录，`target_dir` 使用空字符串。
- 如果拿不准，必须同时做两件事：
  1. 在 `unresolved_adds` 中登记该项的 `item_id`
  2. 如有必要再提交其他确定项的 `move_updates`
- 一旦用户已经确认某项去向，就要在 `unresolved_removals` 中移除该项。
- 不要生成候选目录、问题文案、request_id、理由说明或摘要统计；用户会在右侧预览区手动确认。不要输出 `Review/...` 路径。

三、整理原则
- 默认优先按用途整理；如果用户有明确整理意愿，优先遵守用户意愿。
- 先依据“可能用途”判断归类；若用途仍不明确，再结合“内容摘要”判断。
- 如果无法稳定判断，不要勉强猜测，先放入 `Review`。
- 系统会提供“新目录生成位置”和“Review 目录位置”；你只需要表达目录语义，不需要输出绝对路径。

四、整理策略
<<<STRATEGY_RULES>>>

五、当前模式规则
<<<MODE_RULES>>>

六、回复规则
- 先给用户自然语言回复，再调用工具；不能只输出工具调用。
- 回复只说明本轮判断和变化，不要罗列完整计划列表。
- 介绍分类思路时，优先使用 Markdown 无序列表。
- 不要写“调用工具同步计划”“已通过工具更新”等机械化表述。
- 当仍有待确认项时，只需简短提示：“仍有 N 项暂放 Review，请在右侧预览区确认”。
- 当没有待确认项时，提醒用户：“当前整理草案已满足预检条件，如果您对当前方案满意，请点击界面上的‘开始预检’。”

================
当前规划范围
================
说明：
- 每一行格式为 `item_id | entry_type | display_name | suggested_purpose | summary`
- `item_id` 是唯一操作键；`display_name` 仅用于理解语义
- `entry_type` 只可能是 `file` 或 `dir`
- 你只能处理这里出现的 item_id

<<<SCAN_LINES>>>
"""


def _mode_rules(planning_context: dict | None = None) -> str:
    context = planning_context or {}
    mode = str(context.get("organize_mode") or "initial").strip().lower()
    if mode != "incremental":
        return "\n".join(
            [
                "- 当前任务类型为“整理整个目录”。你需要覆盖当前规划范围内的全部条目。",
                "- 可以新建目标目录，也可以调整目录命名，但仍必须保证每个 item_id 最终只有一个去向。",
                "- 最终方案需要覆盖当前规划范围内的全部 item_id。",
            ]
        )

    target_directories = [
        str(path).strip()
        for path in (context.get("target_directories") or [])
        if str(path).strip()
    ]
    target_slots = [
        dict(item)
        for item in (context.get("target_slots") or [])
        if isinstance(item, dict) and str(item.get("slot_id") or "").strip()
    ]
    root_directory_options = [
        str(path).strip()
        for path in (context.get("root_directory_options") or [])
        if str(path).strip()
    ]
    target_directory_tree = list(context.get("target_directory_tree") or [])

    def render_tree(nodes: list[dict], indent: int = 0) -> list[str]:
        lines: list[str] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            name = str(node.get("name") or node.get("relpath") or "").strip()
            if not name:
                continue
            lines.append(f"{'  ' * indent}- {name}/")
            lines.extend(render_tree(list(node.get("children") or []), indent + 1))
        return lines

    lines = [
        "- 当前任务类型为“归入已有目录”。你只能处理当前规划范围内的已选条目，禁止修改未选条目。",
        "- 你可以把条目放入已选目标目录及其任意子目录，也可以在“新目录生成位置”下新建子目录。",
        "- 不要把新目录理解成挂在任意已选目标目录下面；新目录统一创建在“新目录生成位置”下。",
        "- 但禁止把条目移动到未被选中的现有顶级目录里。",
        "- 禁止 directory_renames，既有目录结构只作为参考目标池。",
        "- 提交 move_updates 时，优先使用 target_slot 指向 D-ID；只有在创建新目录或确实没有可复用槽位时，才直接提交 target_dir。",
        "- target_dir 只写相对“新目录生成位置”的目录路径，禁止绝对路径。",
        "- 如果需要暂缓判断，可以继续放到 Review；不要输出 Review 子目录。",
        "已选目标目录：",
    ]
    if target_directories:
        lines.extend(f"- {path}" for path in target_directories)
    else:
        lines.append("- （当前尚未选定目标目录。）")
    if target_directory_tree:
        lines.append("已探索到的目标目录结构：")
        lines.extend(render_tree(target_directory_tree))
    if target_slots:
        lines.append("可用目标槽位：")
        for slot in target_slots:
            slot_id = str(slot.get("slot_id") or "").strip()
            relpath = str(slot.get("relpath") or "").strip()
            display_name = str(slot.get("display_name") or "").strip()
            depth = max(0, int(slot.get("depth") or 0))
            label = relpath or display_name or slot_id
            lines.append(f"{'  ' * depth}- {slot_id} -> {label}")
    if root_directory_options:
        blocked_roots = [item for item in root_directory_options if item not in target_directories]
        if blocked_roots:
            lines.append("禁止使用的既有顶级目录：")
            lines.extend(f"- {path}" for path in blocked_roots)
    new_directory_root = str(context.get("new_directory_root") or "").strip()
    review_root = str(context.get("review_root") or "").strip()
    if new_directory_root:
        lines.append(f"新目录生成位置：{new_directory_root}")
    if review_root:
        lines.append(f"Review 目录位置：{review_root}")
    return "\n".join(lines)


def build_prompt(scan_lines: str, strategy: dict | None = None, planning_context: dict | None = None) -> str:
    return (
        PROMPT_TEMPLATE.replace("<<<STRATEGY_RULES>>>", build_strategy_prompt_fragment(strategy))
        .replace("<<<MODE_RULES>>>", _mode_rules(planning_context))
        .replace("<<<SCAN_LINES>>>", scan_lines)
    )
