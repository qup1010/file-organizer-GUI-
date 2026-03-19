import sys
from pathlib import Path

from file_organizer.rollback import service as rollback_service


def run_rollback_last_execution(
    argv: list[str] | None = None,
    rollback_module=rollback_service,
    input_func=input,
    print_func=print,
) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) != 1:
        print_func("用法: python rollback_last_execution.py <target_dir>")
        return 1

    target_dir = Path(args[0]).resolve()
    journal = rollback_module.load_latest_execution_for_directory(target_dir)
    if not journal:
        print_func(f"没有可回退记录: {target_dir}")
        return 1

    plan = rollback_module.build_rollback_plan(journal)
    precheck = rollback_module.validate_rollback_preconditions(plan)
    print_func(rollback_module.render_rollback_preview(plan, precheck))

    if not precheck.can_execute:
        return 1

    confirm_text = input_func("输入 YES 执行回退；其他任意输入取消: ").strip()
    if confirm_text != "YES":
        print_func("已取消回退。")
        return 0

    report = rollback_module.execute_rollback_plan(plan)
    rollback_module.finalize_rollback_state(journal, report)
    print_func(rollback_module.render_rollback_report(report))
    return 0 if report.failure_count == 0 else 1
