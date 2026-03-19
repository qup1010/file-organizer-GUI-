import json
import os
import re
from collections import Counter
from pathlib import Path

from app_config import ANALYSIS_MODEL_NAME, create_openai_client, RESULT_FILE_PATH
from file_parser import list_local_files, read_local_file

# --- 全局变量 ---
# 在分析过程中，我们需要知道相对于哪个目录进行解析。
# 在 Service 模式下，通常通过参数传递，但在工具回调中通过全局变量（或上下文对象）共享较方便
WORKDIR_PATH = Path.cwd().resolve()
MAX_ANALYSIS_RETRIES = 3

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

def normalize_entry_name(raw_path: str, base_dir: Path) -> str | None:
    """尝试将 AI 输出的路径碎片还原为当前层的条目名。"""
    raw_path = (raw_path or "").strip().replace("\\", "/")
    while raw_path.startswith("./"):
        raw_path = raw_path[2:]
    
    parts = Path(raw_path).parts
    if not parts:
        return None
        
    # 如果 AI 给的是绝对路径，转为相对路径后再取第一段
    p = Path(raw_path)
    if p.is_absolute():
        try:
            return p.resolve().relative_to(base_dir.resolve()).parts[0]
        except ValueError:
            return None
    
    return parts[0]

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
    
    duplicates = [n for n, c in counter.items() if c > 1]
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)

    is_valid = not (missing or extra or duplicates or invalid_lines)
    return {
        "is_valid": is_valid,
        "missing": missing,
        "extra": extra,
        "duplicates": duplicates,
        "invalid_lines": invalid_lines
    }

def build_system_prompt(files_info: str) -> str:
    return (
        "你是一个可以查看和分析本地文件的专业助理。\n"
        f"当前工作目录绝对路径：{WORKDIR_PATH}\n"
        f"{files_info}\n"
        "你可以使用 read_local_file 工具读取文件内容，使用 list_local_files 工具查看目录结构。\n"
        "当你输出文件介绍或文件总结内容时，必须整体使用 <output> 和 </output> 包围。\n"
        "在 <output> 内部，必须按以下格式输出：\n"
        "首行：分析目录路径:<目录完整绝对路径>\n"
        "<文件名/文件夹名> | <可能用途> | <内容摘要>\n"
        "<文件名/文件夹名> | <可能用途> | <内容摘要>\n"
        "...\n"
        "如果用户要求分析多个文件，请一行一个文件输出。\n"
        "默认只总结当前层文件和当前层文件夹，不总结多层内容。\n"
        "输出中的条目必须与当前目录当前层的真实文件和文件夹一一对应，不能遗漏、不能新增、不能重复。\n"
        "可能用途应基于文件名和内容做谨慎判断；信息不足时写未知或待判断，不要编造。\n"
        "内容摘要要简洁，不超过四十字，概括核心主题、结构或主要信息。"
    )

def emit(handler, event_type: str, data: dict = None):
    if handler:
        handler(event_type, data or {})

def run_analysis_cycle(target_dir: Path, event_handler=None, model: str = ANALYSIS_MODEL_NAME):
    """一个完整的分析循环：扫描 -> AI 思考 -> 校验 -> 重试。"""
    global WORKDIR_PATH
    WORKDIR_PATH = target_dir.resolve()
    client = get_client()

    # 1. 获取基础目录信息
    files_info = list_local_files(".", max_depth=0)
    messages = [{"role": "system", "content": build_system_prompt(files_info)}]
    messages.append({"role": "user", "content": "请分析当前目录下的所有条目及其用途。"})

    for attempt in range(1, MAX_ANALYSIS_RETRIES + 1):
        emit(event_handler, "cycle_start", {"attempt": attempt})
        
        full_content = ""
        # 对话循环 (处理工具调用)
        curr_messages = list(messages)
        while True:
            response = client.chat.completions.create(model=model, messages=curr_messages, tools=tools, tool_choice="auto")
            msg = response.choices[0].message
            if not msg.tool_calls:
                # 切换流式输出最终答案
                emit(event_handler, "ai_streaming_start")
                stream = client.chat.completions.create(model=model, messages=curr_messages, stream=True)
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    # 推理内容
                    reasoning = getattr(delta, "reasoning_content", None) or (delta.model_extra.get("reasoning_content") if hasattr(delta, "model_extra") and delta.model_extra else None)
                    if reasoning:
                        emit(event_handler, "ai_reasoning", {"content": reasoning})
                    # 文本内容
                    if delta.content:
                        full_content += delta.content
                        emit(event_handler, "ai_chunk", {"content": delta.content})
                emit(event_handler, "ai_streaming_end", {"full_content": full_content})
                break
            
            # 执行工具
            curr_messages.append(msg)
            for tool_call in msg.tool_calls:
                name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                emit(event_handler, "tool_start", {"name": name, "args": args})
                
                if name == "read_local_file":
                    res = read_local_file(args.get("filename"))
                elif name == "list_local_files":
                    res = list_local_files(args.get("directory", "."), max_depth=args.get("max_depth", 1))
                else:
                    res = "Unknown tool"
                
                curr_messages.append({"role": "tool", "tool_call_id": tool_call.id, "name": name, "content": res})
        
        # 2. 校验
        check = validate_analysis(full_content, WORKDIR_PATH)
        if check["is_valid"]:
            emit(event_handler, "validation_pass", {"attempt": attempt})
            return full_content
        
        emit(event_handler, "validation_fail", {"attempt": attempt, "details": check})
        if attempt < MAX_ANALYSIS_RETRIES:
            # 构造重试 Prompt
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
                    "max_depth": {"type": "integer"}
                },
                "required": ["directory"],
            },
        },
    },
]
