from __future__ import annotations

import os

import uvicorn

from file_organizer.api.main import create_app
from file_organizer.api.runtime import clear_backend_runtime, write_backend_runtime


def main() -> None:
    host = os.getenv("FILE_ORGANIZER_API_HOST", "127.0.0.1")
    port = int(os.getenv("FILE_ORGANIZER_API_PORT", "8765"))
    reload = os.getenv("FILE_ORGANIZER_API_RELOAD", "true").lower() == "true"
    base_url = os.getenv("FILE_ORGANIZER_API_BASE_URL", f"http://{host}:{port}")
    
    write_backend_runtime(base_url, host, port)
    try:
        if reload:
            print(f"[Core] Starting with Hot-Reload enabled for path: {os.getcwd()}")
            uvicorn.run(
                "file_organizer.api.main:create_app", 
                factory=True, 
                host=host, 
                port=port, 
                reload=True,
                reload_dirs=["file_organizer"]
            )
        else:
            uvicorn.run(create_app(), host=host, port=port)
    finally:
        clear_backend_runtime()


if __name__ == "__main__":
    main()
