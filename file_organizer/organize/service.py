import re
from collections import Counter, defaultdict

from file_organizer.organize.prompts import build_prompt
from file_organizer.shared.config import ORGANIZER_MODEL_NAME, RESULT_FILE_PATH, create_openai_client
from file_organizer.shared.events import emit
from file_organizer.shared.path_utils import is_absolute_path, normalize_path, normalize_source_name, split_relative_parts


COMMANDS_BLOCK_RE = re.compile(r"<COMMANDS>(.*?)</COMMANDS>", flags=re.S | re.I)
MOVE_LINE_RE = re.compile(r'^\s*MOVE\s+"(.*?)"\s+"(.*?)"\s*$', flags=re.I)
MKDIR_LINE_RE = re.compile(r'^\s*MKDIR\s+"(.*?)"\s*$', flags=re.I)


def get_scan_content() -> str:
    """从标准输出读取扫描数据。"""
    if not RESULT_FILE_PATH.exists():
        raise FileNotFoundError(f"未找到扫描结果：{RESULT_FILE_PATH}")
    return RESULT_FILE_PATH.read_text(encoding="utf-8").strip()


def build_initial_messages(scan_lines: str) -> list:
    """构建初始系统提示语。"""
    return [{"role": "system", "content": build_prompt(scan_lines)}]


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

        name = normalize_source_name(line.split("|", 1)[0].strip())
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
        source_name = normalize_source_name(move["source"])
        if not source_name:
            result["path_errors"].append(f"非法源路径: {move['raw']}")
            continue

        actual_sources.append(source_name)
        if source_name not in expected_set:
            continue

        target_parts = split_relative_parts(move["target"])
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

# 兼容旧模块内部辅助函数命名
_normalize_path = normalize_path
_is_absolute_path = is_absolute_path
_split_relative_parts = split_relative_parts
_normalize_source_name = normalize_source_name
