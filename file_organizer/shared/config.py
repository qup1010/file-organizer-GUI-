import os
from pathlib import Path

from openai import OpenAI


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / ".env"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_ANALYSIS_MODEL = "gpt-5.2"
DEFAULT_ORGANIZER_MODEL = "gpt-5.2"


def load_env_file(env_path: Path = ENV_PATH) -> None:
    """从项目根目录的 .env 加载配置，不覆盖已存在的环境变量。"""
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()


def get_env(name: str, default: str | None = None, required: bool = False) -> str | None:
    value = os.getenv(name, default)
    if required and not value:
        raise ValueError(f"缺少必要配置: {name}")
    return value


def create_openai_client() -> OpenAI:
    return OpenAI(
        api_key=get_env("OPENAI_API_KEY", required=True),
        base_url=get_env("OPENAI_BASE_URL", DEFAULT_BASE_URL),
    )


ANALYSIS_MODEL_NAME = get_env("OPENAI_ANALYSIS_MODEL", DEFAULT_ANALYSIS_MODEL)
ORGANIZER_MODEL_NAME = get_env("OPENAI_ORGANIZER_MODEL", DEFAULT_ORGANIZER_MODEL)

OUTPUT_DIR = (PROJECT_ROOT / "output").resolve()
RESULT_FILE_PATH = OUTPUT_DIR / "result.txt"
HISTORY_DIR = (OUTPUT_DIR / "history").resolve()
EXECUTION_LOG_DIR = (HISTORY_DIR / "executions").resolve()
LATEST_BY_DIRECTORY_PATH = HISTORY_DIR / "latest_by_directory.json"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)
EXECUTION_LOG_DIR.mkdir(parents=True, exist_ok=True)
