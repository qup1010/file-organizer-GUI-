import sys
from pathlib import Path

import rollback_service as rollback


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) != 1:
        print("用法: python rollback_last_execution.py <target_dir>")
        return 1

    target_dir = Path(args[0]).resolve()
    journal = rollback.load_latest_execution_for_directory(target_dir)
    if not journal:
        print(f"没有可回退记录: {target_dir}")
        return 1

    plan = rollback.build_rollback_plan(journal)
    precheck = rollback.validate_rollback_preconditions(plan)
    print(rollback.render_rollback_preview(plan, precheck))

    if not precheck.can_execute:
        return 1

    confirm_text = input("输入 YES 执行回退；其他任意输入取消: ").strip()
    if confirm_text != "YES":
        print("已取消回退。")
        return 0

    report = rollback.execute_rollback_plan(plan)
    rollback.finalize_rollback_state(journal, report)
    print(rollback.render_rollback_report(report))
    return 0 if report.failure_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
