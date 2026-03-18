import json
import re
from pathlib import Path

from openai import OpenAI

from file_parser import list_local_files, read_local_file

# NOTE: 这里填写你的 API 配置
API_KEY = "sk-66a49a6465be13648a92808511184fc466413e034c52fbe1a0a9c847a3833911"
BASE_URL = "https://sub.jlypx.de/v1"
MODEL_NAME = "gpt-5.4"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
OUTPUT_DIR = Path("output")
WORKDIR_PATH = Path.cwd().resolve()


def append_output_result(content: str, analysis_dir: Path | None = None):
    """Extract <output> blocks and append them to output/result.txt."""
    blocks = re.findall(r"<output>(.*?)</output>", content or "", flags=re.S | re.I)
    if not blocks:
        return None

    extracted = "\n\n".join(block.strip() for block in blocks if block.strip())
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


def get_workdir_files():
    """获取当前目录下一层的目录摘要。"""
    return list_local_files(".", max_depth=0)


tools = [
    {
        "type": "function",
        "function": {
            "name": "read_local_file",
            "description": (
                "读取当前工作目录或子目录中指定文件的内容摘要。"
                "当前支持文本文件(.txt、.md、.py、.js、.html、.css、.json、.yml、.yaml)、PDF、Word、Excel；图片文件当前不支持解析。"
                "注意：为节省 Token，系统通常仅返回文件的前 300 个字符或前几行摘要。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": (
                            "文件名或相对路径，例如 'ai_template.py'、"
                            "'file_parser.py' 或 'test/example.pdf'"
                        ),
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
            "description": (
                "列出指定目录下一层内的文件和子目录摘要。"
                "适合在需要了解目录结构时调用，默认只递归一层。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "目录相对路径，例如 '.' 或 'test'",
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
        "你可以使用 read_local_file 工具来读取文件内容（当仅凭文件名无法判断用途时再调用），使用 list_local_files 工具来查看目录结构。\n"
        "当你输出文件介绍或文件总结内容时，必须整体使用 <output> 和 </output> 包围。\n"
        "在 <output> 内部，必须按照以下格式输出：\n"
        "首行：分析目录路径:<目录路径>（完整绝对路径）\n"
        "<文件1路径> | <可能用途> | <内容摘要>\n"
        "<文件2路径> | <可能用途> | <内容摘要>\n"
        "...\n"
        "如果用户要求分析多个文件，请一行一个文件输出。\n"
        "默认只总结当前层文件和当前层文件夹，不总结多层内容；只有用户明确要求时才展开更深层级。\n"
        "“可能用途”应基于文件名和内容做谨慎判断；信息不足时写“未知”或“待判断”，不要编造。\n"
        "“内容摘要”要求简洁，不超过四十字，概括核心主题、结构或主要信息。"
    )


def chat_with_ai(messages: list, model: str = MODEL_NAME):
    """支持工具调用的对话。"""
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            stream=False,
        )

        response_msg = response.choices[0].message

        if response_msg.tool_calls:
            messages.append(response_msg)

            for tool_call in response_msg.tool_calls:
                function_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)

                if function_name == "read_local_file":
                    filename = args.get("filename")
                    print(f"\n[系统：正在读取文件 {filename}...]")
                    tool_result = read_local_file(filename)
                elif function_name == "list_local_files":
                    directory = args.get("directory")
                    print(f"\n[系统：正在读取目录 {directory}...]")
                    tool_result = list_local_files(directory)
                else:
                    tool_result = f"未知工具: {function_name}"

                messages.append(
                    {
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": tool_result,
                    }
                )

            second_response = client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )

            full_content = ""
            print("AI：", end="", flush=True)
            for chunk in second_response:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    print(content, end="", flush=True)
                    full_content += content
            print("\n")
            return full_content

        content = response_msg.content
        print(f"\nAI：{content}\n")
        return content

    except Exception as exc:
        print(f"\n发生错误: {exc}")
        return None


def main():
    print(f"--- 已连接到模型 {MODEL_NAME} ---")

    files_info = get_workdir_files()
    messages = [{"role": "system", "content": build_system_prompt(files_info)}]

    while True:
        try:
            user_input = input("用户：").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit"]:
                break

            messages.append({"role": "user", "content": user_input})
            result = chat_with_ai(messages)

            if result:
                messages.append({"role": "assistant", "content": result})
                saved_path = append_output_result(result)
                if saved_path:
                    print(f"[系统：已保存输出到 {saved_path}]")
            else:
                messages.pop()
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
