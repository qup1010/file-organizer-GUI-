import json
import re
from collections import Counter
from pathlib import Path

from file_organizer.analysis.file_reader import list_local_files, read_local_file
from file_organizer.analysis.prompts import build_system_prompt
from file_organizer.shared.config import ANALYSIS_MODEL_NAME, RESULT_FILE_PATH, create_openai_client
from file_organizer.shared.events import emit
from file_organizer.shared.path_utils import normalize_entry_name, resolve_tool_path

MAX_ANALYSIS_RETRIES = 3
WORKDIR_PATH = Path.cwd().resolve()


def get_client():
    return create_openai_client()


def append_output_result(content: str):
    """提取 <output> 块并追加到标准结果文件中。"""
    extracted = extract_output_content(content)
    if not extracted:
        return None

    record = f"{extracted}\n"
    if RESULT_FILE_PATH.exists() and RESULT_FILE_PATH.stat().st_size > 0:
        record = "\n" + record

    with RESULT_FILE_PATH.open("a", encoding="utf-8") as file:
        file.write(record)

    return RESULT_FILE_PATH


def extract_output_content(content: str) -> str | None:
    """从 AI 响应中提取 <output> 及其内容。"""
    blocks = re.findall(r"<output>(.*?)</output>", content or "", flags=re.S | re.I)
    extracted = "\n\n".join(block.strip() for block in blocks if block.strip())
    return extracted or None


def _list_current_entries(directory: Path) -> list[str]:
    """获取目录当前层的条目名列表。"""
    return sorted(entry.name for entry in directory.iterdir() if not entry.name.startswith("."))


def validate_analysis(content: str, directory: Path) -> dict:
    """校验 AI 输出结果与真实文件列表的一致性。"""
    output = extract_output_content(content)
    if not output:
        return {"is_valid": False, "reason": "missing_output", "missing": [], "extra": [], "duplicate": [], "invalid_lines": []}

    parsed_names = []
    invalid_lines = []
    for line in output.splitlines():
        line = line.strip()
        if not line or re.match(r"^分析目录路径[:：]", line):
            continue
        if "|" not in line:
            invalid_lines.append(line)
            continue

        name = normalize_entry_name(line.split("|", 1)[0].strip(), directory)
        if not name:
            invalid_lines.append(line)
            continue
        parsed_names.append(name)

    expected = set(_list_current_entries(directory))
    actual = set(parsed_names)
    counter = Counter(parsed_names)

    duplicates = [name for name, count in counter.items() if count > 1]
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)

    is_valid = not (missing or extra or duplicates or invalid_lines)
    return {
        "is_valid": is_valid,
        "missing": missing,
        "extra": extra,
        "duplicates": duplicates,
        "invalid_lines": invalid_lines,
    }


def _dispatch_tool_call(target_dir: Path, name: str, args: dict):
    if name == "read_local_file":
        filename = resolve_tool_path(target_dir, args.get("filename"))
        return read_local_file(filename)
    if name == "list_local_files":
        directory = resolve_tool_path(target_dir, args.get("directory"), default=".")
        return list_local_files(directory, max_depth=args.get("max_depth", 1))
    return "Unknown tool"


def run_analysis_cycle(target_dir: Path, event_handler=None, model: str = ANALYSIS_MODEL_NAME):
    global WORKDIR_PATH
    """一个完整的分析循环：扫描 -> AI 思考 -> 校验 -> 重试。"""
    target_dir = Path(target_dir).resolve()
    WORKDIR_PATH = target_dir
    client = get_client()

    files_info = list_local_files(str(target_dir), max_depth=0)
    messages = [{"role": "system", "content": build_system_prompt(files_info, target_dir=target_dir)}]
    messages.append({"role": "user", "content": "请分析当前目录下的所有条目及其用途。"})

    for attempt in range(1, MAX_ANALYSIS_RETRIES + 1):
        emit(event_handler, "cycle_start", {"attempt": attempt})

        full_content = ""
        curr_messages = list(messages)
        while True:
            response = client.chat.completions.create(model=model, messages=curr_messages, tools=tools, tool_choice="auto")
            msg = response.choices[0].message
            if not msg.tool_calls:
                emit(event_handler, "ai_streaming_start")
                stream = client.chat.completions.create(model=model, messages=curr_messages, stream=True)
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
                break

            curr_messages.append(msg)
            for tool_call in msg.tool_calls:
                name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                emit(event_handler, "tool_start", {"name": name, "args": args})
                result = _dispatch_tool_call(target_dir, name, args)
                curr_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": name,
                    "content": result,
                })

        check = validate_analysis(full_content, target_dir)
        if check["is_valid"]:
            emit(event_handler, "validation_pass", {"attempt": attempt})
            return full_content

        emit(event_handler, "validation_fail", {"attempt": attempt, "details": check})
        if attempt < MAX_ANALYSIS_RETRIES:
            retry_msg = f"刚才的结果未通过校验。\n缺失：{check['missing']}\n多余：{check['extra']}\n重复：{check['duplicates']}\n请重新完整输出。"
            messages.append({"role": "assistant", "content": full_content})
            messages.append({"role": "user", "content": retry_msg})
        else:
            emit(event_handler, "retry_exhausted", {"attempt": attempt})
            return None


tools = [
    {
        "type": "function",
        "function": {
            "name": "read_local_file",
            "description": "读取文件摘要。",
            "parameters": {
                "type": "object",
                "properties": {"filename": {"type": "string"}},
                "required": ["filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_local_files",
            "description": "列出子目录摘要。",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string"},
                    "max_depth": {"type": "integer"},
                },
                "required": ["directory"],
            },
        },
    },
]




