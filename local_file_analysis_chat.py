import json
import os
import re
from collections import Counter
from pathlib import Path

from openai import OpenAI

from file_parser import list_local_files, read_local_file

API_KEY = "sk-66a49a6465be13648a92808511184fc466413e034c52fbe1a0a9c847a3833911"
BASE_URL = "https://sub.jlypx.de/v1"
MODEL_NAME = "gpt-5.2"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
# 使用绝对路径确保在切换工作目录后，输出依然能保存到项目下的 output 文件夹
OUTPUT_DIR = Path("output").resolve()
WORKDIR_PATH = Path.cwd().resolve()
MAX_ANALYSIS_RETRIES = 3


def append_output_result(content: str, analysis_dir: Path | None = None):
    """提取 <output> 块并追加到 output/result.txt。"""
    extracted = extract_output_content(content)
    if not extracted:
        return None

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    result_path = OUTPUT_DIR / "result.txt"
    record = f"{extracted}\n"

    if result_path.exists() and result_path.stat().st_size > 0:
        record = "\n" + record

    with result_path.open("a", encoding="utf-8") as file:
        file.write(record)

    return result_path


def extract_output_content(content: str) -> str | None:
    """提取并合并响应中的 <output> 块。"""
    blocks = re.findall(r"<output>(.*?)</output>", content or "", flags=re.S | re.I)
    extracted = "\n\n".join(block.strip() for block in blocks if block.strip())
    return extracted or None


def list_analysis_entries(analysis_dir: Path) -> list[str]:
    """获取待分析目录当前层的真实条目名。"""
    return sorted(
        entry.name
        for entry in analysis_dir.iterdir()
        if not entry.name.startswith(".")
    )


def normalize_output_entry_path(raw_path: str, analysis_dir: Path) -> str | None:
    """将输出中的路径规范化为当前层条目名。"""
    raw_path = (raw_path or "").strip()
    if not raw_path:
        return None

    normalized_path = raw_path.replace("\\", "/")
    while normalized_path.startswith("./"):
        normalized_path = normalized_path[2:]

    candidate = Path(normalized_path)
    if candidate.is_absolute():
        try:
            relative_path = candidate.resolve().relative_to(analysis_dir.resolve())
        except ValueError:
            return None
        parts = relative_path.parts
    else:
        parts = Path(normalized_path).parts

    if len(parts) != 1 or parts[0] in {"", "."}:
        return None

    return parts[0]


def validate_analysis_output(content: str, analysis_dir: Path) -> dict:
    """校验输出是否与当前层真实条目一一对应。"""
    output_content = extract_output_content(content)
    if not output_content:
        return {
            "is_valid": False,
            "reason": "missing_output_block",
            "missing_entries": [],
            "extra_entries": [],
            "duplicate_entries": [],
            "invalid_lines": [],
        }

    parsed_entries = []
    invalid_lines = []

    for raw_line in output_content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if re.match(r"^分析目录路径[:：]", line):
            continue
        if "|" not in line:
            invalid_lines.append(line)
            continue

        raw_path = line.split("|", 1)[0].strip()
        normalized_name = normalize_output_entry_path(raw_path, analysis_dir)
        if normalized_name is None:
            invalid_lines.append(line)
            continue
        parsed_entries.append(normalized_name)

    expected_entries = list_analysis_entries(analysis_dir)
    expected_set = set(expected_entries)
    parsed_set = set(parsed_entries)
    entry_counter = Counter(parsed_entries)
    duplicate_entries = sorted(name for name, count in entry_counter.items() if count > 1)
    missing_entries = sorted(expected_set - parsed_set)
    extra_entries = sorted(parsed_set - expected_set)

    return {
        "is_valid": not (missing_entries or extra_entries or duplicate_entries or invalid_lines),
        "reason": "ok" if not (missing_entries or extra_entries or duplicate_entries or invalid_lines) else "mismatch",
        "missing_entries": missing_entries,
        "extra_entries": extra_entries,
        "duplicate_entries": duplicate_entries,
        "invalid_lines": invalid_lines,
    }


def build_validation_retry_message(validation_result: dict) -> str:
    """生成校验失败后的重试提示。"""
    details = [
        "你刚才的 <output> 结果未通过校验，请重新输出完整结果。",
        "要求：只统计当前目录当前层的文件和文件夹，必须一一对应，不能遗漏、不能新增、不能重复，顺序不限。",
    ]

    if validation_result["missing_entries"]:
        details.append(f"缺少条目：{', '.join(validation_result['missing_entries'])}")
    if validation_result["extra_entries"]:
        details.append(f"多余条目：{', '.join(validation_result['extra_entries'])}")
    if validation_result["duplicate_entries"]:
        details.append(f"重复条目：{', '.join(validation_result['duplicate_entries'])}")
    if validation_result["invalid_lines"]:
        details.append("格式异常行：")
        details.extend(validation_result["invalid_lines"])

    details.append("请重新输出完整的 <output> 内容，不要补充解释。")
    return "\n".join(details)


def analyze_current_directory(event_handler=None, max_retries: int = MAX_ANALYSIS_RETRIES):
    """分析当前目录，并在输出与真实条目不一致时自动重试。"""
    files_info = get_workdir_files()
    messages = [
        {"role": "system", "content": build_system_prompt(files_info)},
        {"role": "user", "content": "请分析当前目录下的文件及其用途，并按要求格式输出总结。"},
    ]

    for attempt in range(1, max_retries + 1):
        result = chat_with_ai(messages, event_handler=event_handler)
        if not result:
            return None

        validation_result = validate_analysis_output(result, WORKDIR_PATH)
        if validation_result["is_valid"]:
            emit_event(
                event_handler,
                {"type": "validation_passed", "attempt": attempt},
            )
            return result

        emit_event(
            event_handler,
            {
                "type": "validation_failed",
                "attempt": attempt,
                **validation_result,
            },
        )

        if attempt >= max_retries:
            emit_event(
                event_handler,
                {
                    "type": "retry_exhausted",
                    "attempt": attempt,
                    **validation_result,
                },
            )
            return None

        messages.extend(
            [
                {"role": "assistant", "content": result},
                {"role": "user", "content": build_validation_retry_message(validation_result)},
            ]
        )

    return None


def get_workdir_files():
    """获取当前目录下一层的目录摘要。"""
    return list_local_files(".", max_depth=0)


def emit_event(event_handler, event: dict):
    """将内部事件交给调用方处理。"""
    if event_handler:
        event_handler(event)


def execute_tool_call(tool_call, event_handler=None):
    """执行单个工具调用并返回结果。"""
    function_name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)

    emit_event(
        event_handler,
        {"type": "tool_call", "tool_name": function_name, "args": args},
    )

    if function_name == "read_local_file":
        tool_result = read_local_file(args.get("filename"))
    elif function_name == "list_local_files":
        tool_result = list_local_files(
            args.get("directory", "."),
            max_depth=args.get("max_depth", 1),
        )
    else:
        tool_result = f"未知工具: {function_name}"

    return function_name, tool_result


tools = [
    {
        "type": "function",
        "function": {
            "name": "read_local_file",
            "description": (
                "读取当前工作目录或子目录中指定文件的内容摘要。"
                "当前支持文本文件（如 .txt、.md、.py、.js、.html、.css、.json、.yml、.yaml等等）、PDF、Word、Excel；"
                "图片文件当前不支持解析。"
                "为节省 Token，系统通常仅返回文件前 300 个字符或前几行摘要。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "文件名或相对路径，例如 'local_file_analysis_chat.py'、'file_parser.py' 或 'test/example.pdf'",
                    }
                },
                "required": ["filename"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_local_files",
            "description": "列出指定目录下一层的文件和子目录摘要，适合查看目录结构，默认只递归一层。",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "目录相对路径，例如 '.' 或 'test'",
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "递归深度，0 表示只看当前目录，1 表示展开下一层。",
                    }
                },
                "required": ["directory"],
            },
        },
    },
]


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


def chat_with_ai(messages: list, model: str = MODEL_NAME, event_handler=None):
    """支持多轮工具调用的对话。"""
    conversation = list(messages)

    try:
        while True:
            # 第一次调用，检测是否要调用工具
            response = client.chat.completions.create(
                model=model,
                messages=conversation,
                tools=tools,
                tool_choice="auto",
                stream=False,
            )

            response_msg = response.choices[0].message
            tool_calls = response_msg.tool_calls

            if tool_calls:
                conversation.append(response_msg)
                for tool_call in tool_calls:
                    function_name, tool_result = execute_tool_call(tool_call, event_handler=event_handler)
                    conversation.append(
                        {
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": tool_result,
                        }
                    )
                continue

            # 如果没有工具调用，切换到流式请求获取最终回答，避免因为特定节点的原因在非流模式下截断或丢失文本
            second_response = client.chat.completions.create(
                model=model,
                messages=conversation,
                stream=True,
            )
            
            full_content = ""
            if event_handler:
                event_handler({"type": "stream_start"})

            for chunk in second_response:
                if chunk.choices and chunk.choices[0].delta.content:
                    content_chunk = chunk.choices[0].delta.content
                    full_content += content_chunk
                    if event_handler:
                        event_handler({"type": "stream_chunk", "content": content_chunk})
            
            if event_handler:
                event_handler({"type": "final_response", "content": full_content})

            return full_content

    except Exception as exc:
        emit_event(event_handler, {"type": "error", "error": str(exc)})
        return None


def cli_event_handler(event: dict):
    """命令行模式下的事件输出。"""
    event_type = event.get("type")

    if event_type == "tool_call":
        tool_name = event.get("tool_name")
        args = event.get("args", {})
        if tool_name == "read_local_file":
            print(f"\n[系统：正在读取文件 {args.get('filename')}]")
        elif tool_name == "list_local_files":
            directory = args.get("directory", ".")
            max_depth = args.get("max_depth", 1)
            display_dir = str((WORKDIR_PATH / directory).resolve()) if directory != "." else str(WORKDIR_PATH)
            print(f"\n[系统：正在读取目录 {display_dir}，max_depth={max_depth}]")

    elif event_type == "stream_start":
        print("\nAI: ", end="", flush=True)
    elif event_type == "stream_chunk":
        print(event.get("content", ""), end="", flush=True)
    elif event_type == "final_response":
        print("\n")
    elif event_type == "validation_failed":
        print(
            f"[系统：第 {event.get('attempt')} 次校验失败]"
            f" 缺少: {', '.join(event.get('missing_entries', [])) or '无'};"
            f" 多余: {', '.join(event.get('extra_entries', [])) or '无'};"
            f" 重复: {', '.join(event.get('duplicate_entries', [])) or '无'}"
        )
        if event.get("invalid_lines"):
            print("[系统：以下输出行格式异常]")
            for line in event["invalid_lines"]:
                print(f"  - {line}")
        print("[系统：正在根据校验结果重新分析...]")
    elif event_type == "validation_passed":
        print(f"[系统：第 {event.get('attempt')} 次结果校验通过]")
    elif event_type == "retry_exhausted":
        print(f"[系统：已达到最大重试次数 {event.get('attempt')}，本次结果未保存]")
    elif event_type == "error":
        print(f"\n发生错误: {event.get('error')}")


def main():
    print(f"--- 已连接到模型 {MODEL_NAME} ---")

    while True:
        try:
            target_dir = input("\n请输入要分析的文件夹绝对路径 (或输入 'quit' 退出): ").strip()
            if not target_dir:
                continue
            if target_dir.lower() in ["exit", "quit"]:
                break

            path = Path(target_dir)
            if not path.is_dir():
                print(f"错误: '{target_dir}' 不是一个有效的目录。")
                continue

            # 记录原始路径
            original_cwd = Path.cwd()

            try:
                # 切换工作目录，使工具调用（如 list_local_files(".")）能够访问目标文件夹
                os.chdir(path)
                global WORKDIR_PATH
                WORKDIR_PATH = path.resolve()

                print(f"[系统：正在扫描目录 {WORKDIR_PATH}...]")
                result = analyze_current_directory(event_handler=cli_event_handler)

                if result:
                    # 将结果追加保存到项目原有的 output/result.txt 中
                    saved_path = append_output_result(result, analysis_dir=WORKDIR_PATH)
                    if saved_path:
                        print(f"[系统：分析完成，结果已保存至 {saved_path}]")
                        break
            finally:
                # 分析结束后切回原目录，恢复状态
                os.chdir(original_cwd)
                WORKDIR_PATH = original_cwd.resolve()

        except KeyboardInterrupt:
            break
        except Exception as exc:
            print(f"\n执行过程中出错: {exc}")


if __name__ == "__main__":
    main()
