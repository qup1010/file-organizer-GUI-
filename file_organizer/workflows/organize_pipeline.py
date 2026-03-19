import os
from pathlib import Path

from file_organizer.analysis import service as analysis_service
from file_organizer.cli.console import CLI
from file_organizer.cli.event_printer import scanner_ui_handler
from file_organizer.execution import service as execution_service
from file_organizer.organize import service as organize_service
from file_organizer.shared.config import ANALYSIS_MODEL_NAME, ORGANIZER_MODEL_NAME, PROJECT_ROOT, RESULT_FILE_PATH


def run_organize_chat(
    scan_lines,
    target_dir: Path,
    organizer_module=organize_service,
    execution_module=execution_service,
    input_func=input,
    print_func=print,
    event_handler=scanner_ui_handler,
):
    """进入双向整理交互对话。"""
    messages = organizer_module.build_initial_messages(scan_lines)
    CLI.panel("整理决策会话", "AI 将为您分析文件并给出整理建议，您可以输入意见或输入确定。")

    while True:
        try:
            CLI.panel("文件整理助手 ({})".format(ORGANIZER_MODEL_NAME), color=CLI.BLUE)
            full_content, validation = organizer_module.run_organizer_cycle(
                messages,
                scan_lines,
                event_handler=event_handler,
            )

            if validation and validation["is_valid"]:
                parsed = organizer_module.parse_commands_block(full_content)
                plan = execution_module.build_execution_plan(parsed, target_dir)
                precheck = execution_module.validate_execution_preconditions(plan)

                print_func()
                print_func(execution_module.render_execution_preview(plan, precheck))

                if not precheck.can_execute:
                    for item in precheck.blocking_errors:
                        print_func(f"{CLI.YELLOW}{item}{CLI.RESET}")
                    user_text = input_func(
                        f"\n{CLI.BOLD}预检查未通过，请输入修改意见 (quit 退出): {CLI.RESET}"
                    ).strip()
                    if not user_text:
                        continue
                    if user_text.lower() in ["quit", "exit"]:
                        break
                    messages.append({"role": "user", "content": user_text})
                    continue

                confirm_text = input_func(
                    f"\n{CLI.BOLD}输入 YES 执行；其他任意输入继续讨论 (quit 退出): {CLI.RESET}"
                ).strip()
                if not confirm_text:
                    continue
                if confirm_text.lower() in ["quit", "exit"]:
                    break
                if confirm_text == "YES":
                    report = execution_module.execute_plan(plan)
                    print_func()
                    print_func(execution_module.render_execution_report(report))
                    break

                messages.append({"role": "user", "content": confirm_text})
                continue

            user_text = input_func(f"\n{CLI.BOLD}您的建议 (quit 退出): {CLI.RESET}").strip()
            if not user_text:
                continue
            if user_text.lower() in ["quit", "exit"]:
                break

            messages.append({"role": "user", "content": user_text})

        except KeyboardInterrupt:
            break


def run_pipeline(
    input_func=input,
    print_func=print,
    scanner_module=analysis_service,
    organizer_module=organize_service,
    execution_module=execution_service,
    event_handler=scanner_ui_handler,
    result_file_path=RESULT_FILE_PATH,
):
    CLI.panel(
        "AI 文件一键整理系统",
        f"项目根目录: {PROJECT_ROOT}\n模型 (分析/整理): {ANALYSIS_MODEL_NAME} / {ORGANIZER_MODEL_NAME}",
    )

    target_dir = input_func(f"\n{CLI.BOLD}请输入要分析的目录绝对路径: {CLI.RESET}").strip()
    if not target_dir:
        return

    path = Path(target_dir)
    if not path.is_dir():
        print_func(f"{CLI.YELLOW}错误: '{target_dir}' 不是一个有效的目录。{CLI.RESET}")
        return

    try:
        CLI.panel("执行目录扫描分析")
        result = scanner_module.run_analysis_cycle(path, event_handler=event_handler)

        if result:
            if result_file_path.exists():
                result_file_path.unlink()

            scanner_module.append_output_result(result)
            print_func(f"\n{CLI.GREEN}[数据已提取至 {result_file_path}]{CLI.RESET}")

            scan_lines = organizer_module.get_scan_content()
            run_organize_chat(
                scan_lines,
                path.resolve(),
                organizer_module=organizer_module,
                execution_module=execution_module,
                input_func=input_func,
                print_func=print_func,
                event_handler=event_handler,
            )
    except Exception as exc:
        print_func(f"\n{CLI.YELLOW}工作流崩溃: {exc}{CLI.RESET}")
