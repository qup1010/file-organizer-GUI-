from file_organizer.workflows.rollback_flow import run_rollback_last_execution


def main(argv: list[str] | None = None) -> int:
    return run_rollback_last_execution(argv)


if __name__ == "__main__":
    raise SystemExit(main())
