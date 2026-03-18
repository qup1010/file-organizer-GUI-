from pathlib import Path
from openai import OpenAI


API_KEY = "sk-66a49a6465be13648a92808511184fc466413e034c52fbe1a0a9c847a3833911"
BASE_URL = "https://sub.jlypx.de/v1"
MODEL_NAME = "gpt-5.2"
DEFAULT_SCAN_RESULT_PATH = Path("output") / "result.txt"

PROMPT_TEMPLATE =  """
你是“文件整理助手”。

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

首行：
分析目录路径:<目录完整绝对路径>

后续每一行表示一个待整理项目，格式为：
<文件名或文件夹名> | <可能用途> | <内容摘要>

例如：
分析目录路径:/Users/demo/Desktop
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


def create_client() -> OpenAI:
    return OpenAI(api_key=API_KEY, base_url=BASE_URL)


def read_scan_lines(scan_result_path: Path = DEFAULT_SCAN_RESULT_PATH) -> str:
    if not scan_result_path.exists():
        raise ValueError(f"扫描结果文件不存在: {scan_result_path}")

    content = scan_result_path.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"扫描结果文件为空: {scan_result_path}")

    first_line = content.splitlines()[0].strip()
    if not first_line.startswith("分析目录路径:"):
        raise ValueError("扫描结果格式不正确，首行必须以“分析目录路径:”开头。")

    return content


def build_command_prompt(scan_lines: str) -> str:
    return PROMPT_TEMPLATE.replace("<<<SCAN_LINES>>>", scan_lines)

import re

def generate_commands(scan_lines: str, client: OpenAI | None = None, model: str = MODEL_NAME) -> None:
    active_client = client or create_client()
    messages = [{"role": "system", "content": build_command_prompt(scan_lines)}]
    
    print(f"--- 已连接到文件整理助手 ({model}) ---")
    print("正在分析文件内容并生成整理建议，请稍候...\n")

    while True:
        try:
            response = active_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )
            
            print("AI: ", end="", flush=True)
            full_content = ""
            for chunk in response:
                delta = chunk.choices[0].delta
                
                # 兼容部分大模型暴露的 reasoning_content（思考链内容）
                reasoning = getattr(delta, "reasoning_content", None)
                if not reasoning and hasattr(delta, "model_extra") and delta.model_extra:
                    reasoning = delta.model_extra.get("reasoning_content")
                    
                if reasoning:
                    print(f"\033[90m{reasoning}\033[0m", end="", flush=True)

                if delta.content:
                    print(delta.content, end="", flush=True)
                    full_content += delta.content
            print("\n")
            
            messages.append({"role": "assistant", "content": full_content})
            
            # 检测是否输出了最终的 COMMANDS
            commands_blocks = re.findall(r"<COMMANDS>(.*?)</COMMANDS>", full_content, flags=re.S | re.I)
            if commands_blocks:
                print("\n[系统提醒：AI 已经给出了整理命令。如果满意，可以将其应用；如果不满意，可以告诉它修改意见。]")
            
            user_input = input("\n用户回复 (输入 'quit' 退出): ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit"]:
                break
                
            messages.append({"role": "user", "content": user_input})
            
        except KeyboardInterrupt:
            print("\n已终止交互。")
            break
        except Exception as exc:
            print(f"\n交互过程中出错: {exc}")
            break


def main() -> None:
    try:
        scan_lines = read_scan_lines()
        generate_commands(scan_lines)
    except Exception as exc:
        print(f"初始化错误: {exc}")

if __name__ == "__main__":
    main()
