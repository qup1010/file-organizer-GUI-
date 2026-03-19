import os
from pathlib import Path
from app_config import PROJECT_ROOT, RESULT_FILE_PATH, ANALYSIS_MODEL_NAME, ORGANIZER_MODEL_NAME
import scanner_service as scanner
import organizer_service as organizer

# --- 终端美化工具 ---
class CLI:
    GREY = "\033[90m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
    @staticmethod
    def panel(title, content="", color=GREEN):
        print(f"\n{CLI.BOLD}{color}--- {title} ---{CLI.RESET}")
        if content:
            print(content)

# --- 业务流程调度器 ---

def scanner_ui_handler(event_type, data):
    """处理扫描过程中的各种反馈。"""
    if event_type == "cycle_start":
        print(f"{CLI.YELLOW}[系统: 正在进行第 {data['attempt']} 次分析分析...]{CLI.RESET}")
    elif event_type == "tool_start":
        print(f"  {CLI.BLUE}➤ 工具调用: {data['name']}({data['args']}){CLI.RESET}")
    elif event_type == "ai_reasoning":
        print(f"{CLI.GREY}{data['content']}{CLI.RESET}", end="", flush=True)
    elif event_type == "ai_chunk":
        print(data['content'], end="", flush=True)
    elif event_type == "ai_streaming_start":
        print(f"  {CLI.BOLD}AI: {CLI.RESET}", end="", flush=True)
    elif event_type == "ai_streaming_end":
        print()
    elif event_type == "validation_pass":
        print(f"{CLI.GREEN}✅ 第 {data['attempt']} 次结果校验通过!{CLI.RESET}")
    elif event_type == "validation_fail":
        details = data['details']
        print(f"{CLI.YELLOW}⚠️ 第 {data['attempt']} 次校验失败!{CLI.RESET}")
        if details['missing']: print(f"  缺少: {details['missing']}")
        if details['extra']:   print(f"  多余: {details['extra']}")
        if details['duplicates']: print(f"  重复: {details['duplicates']}")
    elif event_type == "retry_exhausted":
        print(f"{CLI.YELLOW}❌ 重试次数耗尽，本次分析未保存。{CLI.RESET}")

def run_organize_chat(scan_lines):
    """进入双向整理交互对话。"""
    messages = organizer.build_initial_messages(scan_lines)
    CLI.panel("整理决策会话", "AI 将为您分析文件并给出整理建议，您可以输入意见或输入确定。")

    while True:
        try:
            # 1. AI 思考一轮
            CLI.panel(f"文件整理助手 ({ORGANIZER_MODEL_NAME})", color=CLI.BLUE)
            print(f"  {CLI.BOLD}AI: {CLI.RESET}", end="", flush=True)
            
            full_content = organizer.chat_one_round(messages, event_handler=scanner_ui_handler)
            print()
            messages.append({"role": "assistant", "content": full_content})
            
            # 检测是否有命令块
            cmd = organizer.extract_commands(full_content)
            if cmd:
                print(f"\n{CLI.GREEN}[已检测到文件整理命令流，您可以核对后决定是否执行]{CLI.RESET}")
            
            # 2. 等待用户输入意见
            user_text = input(f"\n{CLI.BOLD}您的建议 (quit 退出): {CLI.RESET}").strip()
            if not user_text:
                continue
            if user_text.lower() in ["quit", "exit"]:
                break
            
            messages.append({"role": "user", "content": user_text})
            
        except KeyboardInterrupt:
            break

def run_pipeline():
    CLI.panel("AI 文件一键整理系统", f"项目根目录: {PROJECT_ROOT}\n模型 (分析/整理): {ANALYSIS_MODEL_NAME} / {ORGANIZER_MODEL_NAME}")

    # 1. 输入目录
    target_dir = input(f"\n{CLI.BOLD}请输入要分析的目录绝对路径: {CLI.RESET}").strip()
    if not target_dir: return
    
    path = Path(target_dir)
    if not path.is_dir():
        print(f"{CLI.YELLOW}错误: '{target_dir}' 不是一个有效的目录。{CLI.RESET}")
        return

    original_cwd = Path.cwd()
    try:
        # --- 阶段 1: 扫描并生成快照 ---
        os.chdir(path)
        CLI.panel("执行目录扫描分析")
        
        result = scanner.run_analysis_cycle(path, event_handler=scanner_ui_handler)
        
        if result:
            # 存入结果文件
            if RESULT_FILE_PATH.exists():
                RESULT_FILE_PATH.unlink() # 每次重新扫描时先清理之前的结果
            
            scanner.append_output_result(result)
            print(f"\n{CLI.GREEN}[数据已提取至 {RESULT_FILE_PATH}]{CLI.RESET}")
            
            # --- 阶段 2: 整理建议阶段 ---
            os.chdir(original_cwd) # 返回根目录读取并进入对话
            scan_lines = organizer.get_scan_content()
            run_organize_chat(scan_lines)
            
    except Exception as exc:
        print(f"\n{CLI.YELLOW}工作流崩溃: {exc}{CLI.RESET}")
    finally:
        os.chdir(original_cwd)

if __name__ == "__main__":
    run_pipeline()
