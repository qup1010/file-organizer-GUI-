from file_organizer.cli.console import CLI
from file_organizer.cli.event_printer import scanner_ui_handler
from file_organizer.shared.config import ANALYSIS_MODEL_NAME, ORGANIZER_MODEL_NAME, PROJECT_ROOT, RESULT_FILE_PATH
from file_organizer.workflows.organize_pipeline import run_organize_chat as workflow_run_organize_chat
from file_organizer.workflows.organize_pipeline import run_pipeline as workflow_run_pipeline

import execution_service as execution
import organizer_service as organizer
import scanner_service as scanner


def run_organize_chat(scan_lines, target_dir):
    return workflow_run_organize_chat(
        scan_lines,
        target_dir,
        organizer_module=organizer,
        execution_module=execution,
        input_func=input,
        print_func=print,
        event_handler=scanner_ui_handler,
    )


def run_pipeline():
    return workflow_run_pipeline(
        input_func=input,
        print_func=print,
        scanner_module=scanner,
        organizer_module=organizer,
        execution_module=execution,
        event_handler=scanner_ui_handler,
        result_file_path=RESULT_FILE_PATH,
    )


if __name__ == "__main__":
    run_pipeline()
