from file_organizer.workflows.rollback_flow import run_rollback_last_execution

import rollback_service as rollback


def main(argv: list[str] | None = None) -> int:
    return run_rollback_last_execution(
        argv=argv,
        rollback_module=rollback,
        input_func=input,
        print_func=print,
    )


if __name__ == "__main__":
    raise SystemExit(main())
