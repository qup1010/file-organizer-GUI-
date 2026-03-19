import sys
from pathlib import Path

from file_organizer.cli.console import default_cli
from file_organizer.rollback import service as rollback_service


def _prompt_text(cli, method_name: str, message: str, *, input_func=input) -> str:
    prompt_method = getattr(cli, method_name, None)
    if callable(prompt_method):
        result = prompt_method(message, input_func=input_func)
        if isinstance(result, str):
            return result
    return cli.prompt(message, input_func=input_func)


def run_rollback_last_execution(
    argv: list[str] | None = None,
    rollback_module=rollback_service,
    input_func=input,
    print_func=print,
    cli=default_cli,
) -> int:
    del print_func
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) != 1:
        cli.warning("用法: python -m file_organizer.rollback <target_dir>", title="用法")
        return 1

    target_dir = Path(args[0]).resolve()
    journal = rollback_module.load_latest_execution_for_directory(target_dir)
    if not journal:
        cli.warning(f"没有可回退记录: {target_dir}", title="无可回退记录")
        return 1

    plan = rollback_module.build_rollback_plan(journal)
    precheck = rollback_module.validate_rollback_preconditions(plan)
    cli.show_rollback_preview(plan, precheck)

    if not precheck.can_execute:
        return 1

    confirm_text = _prompt_text(cli, "prompt_confirmation", "输入 YES 执行回退；其他任意输入取消", input_func=input_func).strip()
    if confirm_text != "YES":
        cli.info("已取消回退。", title="已取消")
        return 0

    report = rollback_module.execute_rollback_plan(plan)
    rollback_module.finalize_rollback_state(journal, report)
    cli.show_rollback_report(report, plan.target_dir)
    return 0 if report.failure_count == 0 else 1
