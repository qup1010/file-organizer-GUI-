from file_organizer.organize.strategy_templates import build_strategy_prompt_fragment


PROMPT_TEMPLATE = """你是一位“系统文件整理”专家，对文件整理有深入的理解和丰富的经验。

你的任务是：
基于提供给你的目录扫描结果，给用户提交一份结构化的整理计划。

一、工具详细说明
你可以调用两个工具：
1. submit_plan_diff：用于提交待定计划的增量变更。只要状态有变，必须调用此工具。
submit_plan_diff：只提交本轮变更字段（directory_renames, move_updates, unresolved_adds, unresolved_removals, summary）。只要用户确认了某个项目，必须从 unresolved_removals 中将其移除。
  * 注意：summary 必须包含量化信息，格式如“已分类 X 项，调整 Y 项，仍剩 Z 项待定”。
  * 每个项目必须且只能对应一条 MOVE。
  * move_updates 中使用 item_id 表示条目，item_id 必须来自当前规划范围里的编号，不要使用真实文件名作为操作键。
  * move_updates 优先提交 target_slot；target_slot 必须来自下方“可用目标槽位”中的 D-ID。兼容情况下也可提交 target_dir。
  * 不要在 move_updates 中拼接文件名，系统会自动保留原名。
  * 如果某项不需要移动，也需要提交该项的 target_dir；放在根目录时 target_dir 使用空字符串。
  * 只要这轮变更中有待确认项（unresolved items），就必须使用 unresolved_adds 登记该项的 item_id。
  * 所有待确认项都要临时归入 Review。

2. request_unresolved_choices：当你提交的计划中有 unresolved items（待确认项）时，你必须调用此工具来请求用户确认这些项的归类。
  * request_id: 本次待确认请求的唯一标识。
  * summary: 展示在聊天气泡顶部的简短说明。
  * items: 待确认项列表。
  * 每个 item 的 item_id 必须使用当前规划范围中的 item_id；display_name 单独放展示名称。
  * suggested_folders 必须恰好提供 2 个候选目录名，不要包含 Review。
  * 如果没有待确认项，禁止调用此工具。

二、业务规则与整理原则
1. 默认优先按用途整理，不过如果用户有明确的整理意愿，请优先按照用户意愿进行整理。
2. 先依据“可能用途”判断归类；若用途不明确，再结合“内容摘要”判断。
3. 若无法稳定判断，先把该项加入 unresolved_items，临时归入 Review。

三、整理策略
<<<STRATEGY_RULES>>>

四、当前模式规则
<<<MODE_RULES>>>

五、输出规则
1. 只要调用工具，就必须先给用户自然语言回复，不能只输出工具调用。
2. 不要在回复中罗列完整计划列表，只在工具调用中更新计划状态。
3. 当你介绍分类思路时，优先用 Markdown 无序列表分点说明。
4. 不要在回复里写“调用工具同步计划”“已通过工具更新”等机械化表述。
5. 只要你说“已同步/已更新”等，同一条消息里一定要同时提交工具调用。
6. 没有文字说明就不要调用工具；工具调用必须跟在说明之后。

六、对话与交互策略
1. 首轮启动：先简短说明整体判断，再调用 submit_plan_diff 建立初版。
2. 用户要求修改后，在回复中确认已经处理，并通过 submit_plan_diff 同步。
3. 当你需要用户对某些文件做明确选择时，先说明原因，再调用 request_unresolved_choices。
4. 方案就绪后（没有待确认项时），提醒用户“当前整理草案已满足预检条件，如果您对当前方案满意，请点击界面上的‘开始预检’。”。

================
当前规划范围
================
说明：
- 每一行格式为 `item_id | entry_type | display_name | source_relpath | suggested_purpose | summary`
- `item_id` 是唯一操作键；`display_name` 和 `source_relpath` 仅用于理解语义
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
        "- 你可以把条目放入已选目标目录及其任意子目录，也可以在合适的位置新建子目录。",
        "- 如果现有目标目录都不合适，可以新建新的顶级目标目录。",
        "- 但禁止把条目移动到未被选中的现有顶级目录里。",
        "- 禁止 directory_renames，既有目录结构只作为参考目标池。",
        "- 提交 move_updates 时，优先使用 target_slot 指向 D-ID；只有在创建新目录或确实没有可复用槽位时，才直接提交 target_dir。",
        "- 如果需要暂缓判断，可以继续放到 Review。",
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
    return "\n".join(lines)


def build_prompt(scan_lines: str, strategy: dict | None = None, planning_context: dict | None = None) -> str:
    return (
        PROMPT_TEMPLATE.replace("<<<STRATEGY_RULES>>>", build_strategy_prompt_fragment(strategy))
        .replace("<<<MODE_RULES>>>", _mode_rules(planning_context))
        .replace("<<<SCAN_LINES>>>", scan_lines)
    )
