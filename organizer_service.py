import re
from collections import Counter, defaultdict

from app_config import ORGANIZER_MODEL_NAME, RESULT_FILE_PATH, create_openai_client


COMMANDS_BLOCK_RE = re.compile(r"<COMMANDS>(.*?)</COMMANDS>", flags=re.S | re.I)
MOVE_LINE_RE = re.compile(r'^\s*MOVE\s+"(.*?)"\s+"(.*?)"\s*$', flags=re.I)
MKDIR_LINE_RE = re.compile(r'^\s*MKDIR\s+"(.*?)"\s*$', flags=re.I)


PROMPT_TEMPLATE = """你是“文件整理助手”。

你的任务是：
根据输入中的文件/文件夹信息，生成一组整理命令，用于将这些项目移动到更合理的目录中。
你可以输出以下两种回复：
1. COMMANDS：可直接执行的命令流，必须用<COMMANDS> </COMMANDS> 包围
2. MESSAGE：与用户的交互信息，必须用<MESSAGE> </MESSAGE>包围


**关于MESSAGE的格式**：
{
纯文本即可
规则：
获得文件信息后，先在MESSAGE中给用户分析一下文件夹的内容结构，和用户讨论一下如何整理，给出你的建议，待用户确定整理方案后，那么就马上输出对应的COMMANDS。
}

**关于COMMANDS的格式**：
{
一、输入格式
输入内容格式如下：

每一行表示一个待整理项目，格式为：
<文件名或文件夹名> | <可能用途> | <内容摘要>

例如：
截图1.png | 截图记录 | 某软件报错界面
合同.pdf | 财务/合同 | 某项目付款协议

说明：。
- 每一行都必须被处理，不能遗漏。
- 你只能依据输入中提供的信息做决策。
- 不允许虚构不存在的文件、目录、用途或内容。
- 文件和文件夹都视为待移动项目，必须同样处理。

二、整理目标
目标是：在尽量少且合理的目录下，按“用途”而不是按扩展名进行整理。

整理时遵循以下优先级：
1. 优先依据“可能用途”判断归类
2. 若“可能用途”不明确，再结合“内容摘要”判断
3. 若仍无法判断，则归入 Review

注意：
- “目录尽量少”不等于混放无关内容。
- 应在“分类自然清晰”和“目录数量适中”之间取得平衡。
- 同一用途的项目应尽量进入同一目录。。
- 不得为了少建目录而把明显无关的项目混放在一起。

三、推荐使用的目录名
优先从以下目录名中选择：
- Installers
- Screenshots
- Projects
- Study
- Finance
- Documents
- Archives
- Media
- Review

规则：
- 优先复用上述目录名，如果user有自己的想法，可以按照user的想法来个性化定制。
- 只有在确有必要时才新增目录。
- 新增目录名称必须简洁清晰，不得与已有目录语义重复
- 若一个目录下不会有任何项目被移动进去，则不得创建该目录。
- 在保证分类清晰的前提下，尽量减少目录数量，优先复用已有目录，避免过度拆分或混合无关内容。

四、命令格式
创建目录：
MKDIR "<目录名>"

移动项目：
MOVE "<文件名或文件夹名>" "<目标目录>/<原文件名或原文件夹名>"

五、分类原则
请按以下原则整理：

【全局优先规则】
- 必须优先根据“用途”分类，而不是根据文件类型或扩展名分类
- 文件类型（如图片、视频、压缩包）只能作为辅助判断依据，不能单独决定分类
- 若同一项目同时符合多个类别，优先选择“用途更明确、更具体”的分类

【具体分类规则】

- Installers
  安装包、安装程序、软件分发文件
  （即使为 zip / dmg / exe，只要用途是安装，也必须归入此类）

- Screenshots
  截图、屏幕录制、问题记录截图

- Projects
  项目资料、项目代码、项目文档、项目资源
  （只要与某个具体项目相关，即使是文档或图片，也应优先归入此类）

- Study
  课程、学习资料、笔记、教材、学习视频
  （包括课程视频、课件、学习截图等）

- Finance
  发票、账单、合同、报销、付款、财务记录
  （包括扫描件、截图、PDF 等）

- Documents
  通用文档，如说明、简历、报告、表格等
  （仅在不属于 Projects / Study / Finance 时使用）

- Archives
  归档内容、历史资料、备份文件
  （不能仅因“是压缩包”就归入此类，必须具有“归档/备份”语义）

- Media
  图片、音频、视频等媒体内容

- Review
  无法明确判断用途的项目

【冲突处理规则】
- 项目相关 > 文档类型（Projects > Documents）
- 学习相关 > 媒体类型（Study > Media）
- 财务相关 > 一切其他分类（Finance 优先级最高之一）
- Screenshots > Media

若信息冲突，优先采用更具体、更直接反映用途的描述。
如果这些目录无法合理覆盖当前文件，可创建新目录，但必须：
- 名称简洁清晰
- 不与已有目录语义重复
- 能覆盖至少一个文件

六、强制规则
你必须严格满足以下规则：

1. 每个输入项目最多只能生成一条 MOVE 命令
2. 不允许遗漏任何项目
3. 不允许重复处理同一个项目
4. 所有 MKDIR 命令必须放在所有 MOVE 命令之前
5. MKDIR 必须去重
6. MOVE 必须严格按照输入项目的原始顺序输出
7. 路径必须使用相对路径，不得使用绝对路径
8. MOVE 的目标路径必须保留原文件名或原文件夹名
9. 只能输出 MKDIR 和 MOVE 两种命令
10. 一行只能有一条命令
11. 不得输出空行、解释、注释或其他任何文本
12. 若某个输入项目本身是一个文件夹，且其名称已经与推荐目录高度一致（如 Documents、Projects、Finance 等），并且其用途与该目录完全匹配，则视为“已在正确位置”，无需移动。

此时仍必须输出一条 MOVE 命令，但目标路径必须与原路径一致，例如：
mv "Documents" "Documents"

七、输出前自检
在生成最终结果前，你必须自行检查：
- 输入中的每一行是否都对应了且仅对应了一条 MOVE
- MOVE 顺序是否与输入顺序完全一致
- 是否存在重复 MKDIR
- 是否有目录被创建但没有任何项目移动进去
- 是否所有目标路径都保留了原名称
- 是否只输出了合法命令
}

================
八、输入
================
<<<SCAN_LINES>>>
"""


def emit(handler, event_type: str, data: dict | None = None):
    if handler:
        handler(event_type, data or {})


def get_scan_content() -> str:
    """从标准输出读取扫描数据。"""
    if not RESULT_FILE_PATH.exists():
        raise FileNotFoundError(f"未找到扫描结果：{RESULT_FILE_PATH}")
    return RESULT_FILE_PATH.read_text(encoding="utf-8").strip()


def build_initial_messages(scan_lines: str) -> list:
    """构建初始系统提示语。"""
    return [{"role": "system", "content": PROMPT_TEMPLATE.replace("<<<SCAN_LINES>>>", scan_lines)}]


def chat_one_round(messages: list, event_handler=None, model: str = ORGANIZER_MODEL_NAME):
    """进行一轮 AI 对话，支持流式和推理链输出。"""
    client = create_openai_client()
    full_content = ""
    stream = client.chat.completions.create(model=model, messages=messages, stream=True)

    emit(event_handler, "ai_streaming_start")
    for chunk in stream:
        delta = chunk.choices[0].delta
        reasoning = getattr(delta, "reasoning_content", None) or (
            delta.model_extra.get("reasoning_content")
            if hasattr(delta, "model_extra") and delta.model_extra
            else None
        )
        if reasoning:
            emit(event_handler, "ai_reasoning", {"content": reasoning})

        if delta.content:
            full_content += delta.content
            emit(event_handler, "ai_chunk", {"content": delta.content})

    emit(event_handler, "ai_streaming_end", {"full_content": full_content})
    return full_content


def extract_commands(content: str) -> str | None:
    """提取 <COMMANDS> 块内容。"""
    match = re.search(r"<COMMANDS>(.*?)</COMMANDS>", content, flags=re.S | re.I)
    return match.group(1).strip() if match else None


def extract_scan_items(scan_lines: str) -> list[str]:
    """从扫描结果提取当前层条目名，保持原始顺序。"""
    items = []
    for raw_line in scan_lines.splitlines():
        line = raw_line.strip()
        if not line or re.match(r"^分析目录路径[:：]", line):
            continue
        if "|" not in line:
            continue

        name = _normalize_source_name(line.split("|", 1)[0].strip())
        if name:
            items.append(name)
    return items


def parse_commands_block(content: str) -> dict:
    """提取并解析唯一的 <COMMANDS> 块。"""
    blocks = COMMANDS_BLOCK_RE.findall(content or "")
    result = {
        "has_commands": bool(blocks),
        "mkdirs": [],
        "moves": [],
        "invalid_lines": [],
        "raw_lines": [],
        "commands": [],
        "parse_errors": [],
    }

    if not blocks:
        return result
    if len(blocks) != 1:
        result["parse_errors"].append("必须且只能有一个 <COMMANDS> 块")
        return result

    for raw_line in blocks[0].splitlines():
        line = raw_line.strip()
        if not line:
            continue

        result["raw_lines"].append(line)

        move_match = MOVE_LINE_RE.match(raw_line)
        if move_match:
            move = {
                "source": move_match.group(1),
                "target": move_match.group(2),
                "raw": line,
            }
            result["moves"].append(move)
            result["commands"].append({"type": "MOVE", **move})
            continue

        mkdir_match = MKDIR_LINE_RE.match(raw_line)
        if mkdir_match:
            mkdir_name = mkdir_match.group(1)
            result["mkdirs"].append(mkdir_name)
            result["commands"].append({"type": "MKDIR", "name": mkdir_name, "raw": line})
            continue

        result["invalid_lines"].append(line)

    return result


def _normalize_path(value: str) -> str:
    return (value or "").strip().replace("\\", "/")


def _is_absolute_path(value: str) -> bool:
    normalized = _normalize_path(value)
    return bool(re.match(r"^[A-Za-z]:/", normalized)) or normalized.startswith("/")


def _split_relative_parts(value: str) -> list[str] | None:
    normalized = _normalize_path(value)
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if not normalized or _is_absolute_path(normalized):
        return None

    parts = normalized.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return None
    return parts


def _normalize_source_name(raw_source: str) -> str | None:
    parts = _split_relative_parts(raw_source)
    if not parts or len(parts) != 1:
        return None
    return parts[0]


def validate_command_flow(scan_lines: str, content: str) -> dict:
    """对命令流执行静态校验。"""
    parsed = parse_commands_block(content)
    result = {
        "is_valid": False,
        "missing": [],
        "extra": [],
        "duplicates": [],
        "order_errors": [],
        "invalid_lines": list(parsed["invalid_lines"]) + list(parsed["parse_errors"]),
        "path_errors": [],
        "rename_errors": [],
        "duplicate_mkdirs": [],
        "missing_mkdirs": [],
        "unused_mkdirs": [],
        "conflicting_targets": [],
    }

    if not parsed["has_commands"]:
        result["invalid_lines"].append("缺少 <COMMANDS> 块")
        return result

    scan_items = extract_scan_items(scan_lines)
    expected_set = set(scan_items)
    actual_sources = []
    required_mkdirs = set()
    normalized_targets = defaultdict(set)

    move_seen = False
    for command in parsed["commands"]:
        if command["type"] == "MOVE":
            move_seen = True
        elif move_seen:
            result["invalid_lines"].append(f"MKDIR 必须位于 MOVE 之前: {command['raw']}")

    mkdir_counter = Counter(parsed["mkdirs"])
    result["duplicate_mkdirs"] = sorted(name for name, count in mkdir_counter.items() if count > 1)

    for move in parsed["moves"]:
        source_name = _normalize_source_name(move["source"])
        if not source_name:
            result["path_errors"].append(f"非法源路径: {move['raw']}")
            continue

        actual_sources.append(source_name)
        if source_name not in expected_set:
            continue

        target_parts = _split_relative_parts(move["target"])
        if not target_parts:
            result["path_errors"].append(f"非法目标路径: {move['raw']}")
            continue

        normalized_target = "/".join(target_parts)
        if len(target_parts) > 1 and target_parts[0] == source_name:
            result["path_errors"].append(f"不能移动到自身子路径: {move['raw']}")
            continue

        if target_parts[-1] != source_name:
            result["rename_errors"].append(f"{source_name} -> {normalized_target}")
            continue

        normalized_targets[normalized_target].add(source_name)
        if len(target_parts) > 1:
            required_mkdirs.add(target_parts[0])

    actual_set = set(actual_sources)
    actual_counter = Counter(actual_sources)
    result["duplicates"] = sorted(name for name, count in actual_counter.items() if count > 1)
    result["missing"] = sorted(expected_set - actual_set)
    result["extra"] = sorted(actual_set - expected_set)

    for index, expected_name in enumerate(scan_items):
        if index >= len(actual_sources):
            break
        actual_name = actual_sources[index]
        if expected_name != actual_name:
            result["order_errors"].append(
                f"第 {index + 1} 项应为 {expected_name}，实际为 {actual_name}"
            )

    mkdir_set = set(parsed["mkdirs"])
    result["missing_mkdirs"] = sorted(required_mkdirs - mkdir_set)
    result["unused_mkdirs"] = sorted(mkdir_set - required_mkdirs)
    result["conflicting_targets"] = sorted(
        target for target, sources in normalized_targets.items() if len(sources) > 1
    )

    result["is_valid"] = not any(
        [
            result["missing"],
            result["extra"],
            result["duplicates"],
            result["order_errors"],
            result["invalid_lines"],
            result["path_errors"],
            result["rename_errors"],
            result["duplicate_mkdirs"],
            result["missing_mkdirs"],
            result["unused_mkdirs"],
            result["conflicting_targets"],
        ]
    )
    return result


def build_command_retry_message(validation: dict) -> str:
    """构造命令流校验失败后的重试提示。"""
    details = [
        "你刚才输出的 <COMMANDS> 未通过校验，请重新输出完整命令流。",
        "要求：只能输出完整的 <COMMANDS> 内容；每个条目必须且只能对应一条 MOVE；所有 MKDIR 必须位于 MOVE 之前；目标路径必须是相对路径且保留原始名称。",
    ]

    if validation["missing"]:
        details.append(f"缺少 MOVE：{', '.join(validation['missing'])}")
    if validation["extra"]:
        details.append(f"多余 MOVE：{', '.join(validation['extra'])}")
    if validation["duplicates"]:
        details.append(f"重复处理：{', '.join(validation['duplicates'])}")
    if validation["order_errors"]:
        details.append("顺序错误：")
        details.extend(validation["order_errors"])
    if validation["invalid_lines"]:
        details.append("非法命令行：")
        details.extend(validation["invalid_lines"])
    if validation["path_errors"]:
        details.append("路径错误：")
        details.extend(validation["path_errors"])
    if validation["rename_errors"]:
        details.append("禁止重命名：")
        details.extend(validation["rename_errors"])
    if validation["duplicate_mkdirs"]:
        details.append(f"重复 MKDIR：{', '.join(validation['duplicate_mkdirs'])}")
    if validation["missing_mkdirs"]:
        details.append(f"缺少 MKDIR：{', '.join(validation['missing_mkdirs'])}")
    if validation["unused_mkdirs"]:
        details.append(f"未使用 MKDIR：{', '.join(validation['unused_mkdirs'])}")
    if validation["conflicting_targets"]:
        details.append(f"目标冲突：{', '.join(validation['conflicting_targets'])}")

    details.append("请重新输出完整的 <COMMANDS> 内容，不要补充解释。")
    return "\n".join(details)


def run_organizer_cycle(
    messages: list,
    scan_lines: str,
    event_handler=None,
    model: str = ORGANIZER_MODEL_NAME,
    max_retries: int = 3,
) -> tuple[str, dict | None]:
    """单轮整理回复，若输出命令流则自动校验并重试。"""
    for attempt in range(1, max_retries + 1):
        full_content = chat_one_round(messages, event_handler=event_handler, model=model)
        messages.append({"role": "assistant", "content": full_content})

        parsed = parse_commands_block(full_content)
        if not parsed["has_commands"]:
            return full_content, None

        validation = validate_command_flow(scan_lines, full_content)
        if validation["is_valid"]:
            emit(event_handler, "command_validation_pass", {"attempt": attempt, "details": validation})
            return full_content, validation

        emit(event_handler, "command_validation_fail", {"attempt": attempt, "details": validation})
        if attempt >= max_retries:
            emit(event_handler, "command_retry_exhausted", {"attempt": attempt, "details": validation})
            return full_content, validation

        messages.append({"role": "user", "content": build_command_retry_message(validation)})

    return "", None
