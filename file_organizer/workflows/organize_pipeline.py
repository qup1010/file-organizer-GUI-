import os
from pathlib import Path

from file_organizer.analysis import service as analysis_service
from file_organizer.cli.console import default_cli
from file_organizer.cli.event_printer import scanner_ui_handler
from file_organizer.execution import service as execution_service
from file_organizer.organize import service as organize_service
from file_organizer.shared.config import ANALYSIS_MODEL_NAME, ORGANIZER_MODEL_NAME, PROJECT_ROOT, RESULT_FILE_PATH


def _prompt_text(cli, method_name: str, message: str, *, input_func=input) -> str:
    prompt_method = getattr(cli, method_name, None)
    if callable(prompt_method):
        result = prompt_method(message, input_func=input_func)
        if isinstance(result, str):
            return result
    return cli.prompt(message, input_func=input_func)


def _run_organizer_cycle_with_state(organizer_module, messages, scan_lines, *, pending_plan, user_constraints, event_handler):
    try:
        return organizer_module.run_organizer_cycle(
            messages,
            scan_lines,
            pending_plan=pending_plan,
            user_constraints=user_constraints,
            event_handler=event_handler,
        )
    except TypeError:
        return organizer_module.run_organizer_cycle(messages, scan_lines, event_handler=event_handler)


def _show_plan_diff(cli, diff_summary: list[str]) -> None:
    show_method = getattr(cli, "show_plan_diff", None)
    if callable(show_method):
        show_method(diff_summary)
    elif diff_summary:
        cli.show_list("????", diff_summary, style="blue")


def _show_pending_plan(cli, pending_plan, display_plan: dict | None) -> None:
    if not pending_plan or not display_plan:
        return
    show_method = getattr(cli, "show_pending_plan", None)
    if callable(show_method):
        show_method(
            pending_plan,
            focus=display_plan.get("focus", "full"),
            summary=display_plan.get("summary", ""),
        )


def run_organize_chat(
    scan_lines,
    target_dir: Path,
    organizer_module=organize_service,
    execution_module=execution_service,
    input_func=input,
    print_func=print,
    event_handler=scanner_ui_handler,
    cli=default_cli,
):
    """进入双向整理交互对话。"""
    del print_func
    messages = organizer_module.build_initial_messages(scan_lines)
    pending_plan = None
    user_constraints: list[str] = []
    cli.panel("整理决策会话", "AI 将为您分析文件并给出整理建议，您可以输入意见或继续讨论。", style="blue")

    while True:
        try:
            cli.stage(f"文件整理助手 ({ORGANIZER_MODEL_NAME})", style="blue")
            display_text, cycle_result = _run_organizer_cycle_with_state(
                organizer_module,
                messages,
                scan_lines,
                pending_plan=pending_plan,
                user_constraints=user_constraints,
                event_handler=event_handler,
            )
            del display_text

            cycle_result = cycle_result or {"is_valid": False}
            pending_plan = cycle_result.get("pending_plan", pending_plan)
            diff_summary = cycle_result.get("diff_summary", [])
            if diff_summary:
                _show_plan_diff(cli, diff_summary)

            _show_pending_plan(cli, pending_plan, cycle_result.get("display_plan"))

            if cycle_result.get("repair_mode"):
                cli.warning("命令流多次失败，已根据权威分析结构重建整理计划。", title="修复模式")

            if cycle_result.get("is_valid"):
                final_plan = cycle_result.get("final_plan")
                plan = execution_module.build_execution_plan(final_plan, target_dir)
                precheck = execution_module.validate_execution_preconditions(plan)
                cli.show_execution_preview(plan, precheck)

                if not precheck.can_execute:
                    user_text = _prompt_text(
                        cli,
                        "prompt_feedback",
                        "预检查未通过，请输入修改意见 (quit 退出)",
                        input_func=input_func,
                    ).strip()
                    if not user_text:
                        continue
                    if user_text.lower() in ["quit", "exit"]:
                        break
                    user_constraints.append(user_text)
                    messages.append({"role": "user", "content": user_text})
                    continue

                confirm_text = _prompt_text(
                    cli,
                    "prompt_confirmation",
                    "输入 YES 执行；其他任意输入继续讨论 (quit 退出)",
                    input_func=input_func,
                ).strip()
                if not confirm_text:
                    continue
                if confirm_text.lower() in ["quit", "exit"]:
                    break
                if confirm_text == "YES":
                    report = execution_module.execute_plan(plan)
                    cli.show_execution_report(report, plan.base_dir)
                    break

                user_constraints.append(confirm_text)
                messages.append({"role": "user", "content": confirm_text})
                continue

            user_text = _prompt_text(cli, "prompt_feedback", "您的建议 (quit 退出)", input_func=input_func).strip()
            if not user_text:
                continue
            if user_text.lower() in ["quit", "exit"]:
                break

            user_constraints.append(user_text)
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
    cli=default_cli,
):
    del print_func
    cli.show_app_header(PROJECT_ROOT, ANALYSIS_MODEL_NAME, ORGANIZER_MODEL_NAME)

    target_dir = _prompt_text(cli, "prompt_path", "请输入要分析的目录绝对路径", input_func=input_func).strip()
    if not target_dir:
        return

    path = Path(target_dir)
    if not path.is_dir():
        cli.error(
            f"'{target_dir}' 不是一个有效的目录。\n请输入 Windows 绝对路径，例如: D:/Users/YourName/Documents",
            title="输入错误",
        )
        return

    try:
        cli.stage("执行目录扫描分析", style="blue")
        result = scanner_module.run_analysis_cycle(path, event_handler=event_handler)

        if result:
            if result_file_path.exists():
                result_file_path.unlink()

            scanner_module.append_output_result(result)
            cli.show_saved_result(result_file_path)

            scan_lines = organizer_module.get_scan_content()
            run_organize_chat(
                scan_lines,
                path.resolve(),
                organizer_module=organizer_module,
                execution_module=execution_module,
                input_func=input_func,
                print_func=print,
                event_handler=event_handler,
                cli=cli,
            )
    except Exception as exc:
        cli.error(f"工作流崩溃: {exc}", title="运行失败")
