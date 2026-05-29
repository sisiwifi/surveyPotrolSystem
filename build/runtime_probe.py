from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _load_runtime_snapshot() -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root / "backend"
    sys.path.insert(0, str(backend_dir))

    from app.core.config import (  # pylint: disable=import-outside-toplevel
        BACKEND_HOST,
        BACKEND_PORT,
        EMBEDDED_POSTGRES_ENABLED,
        POSTGRES_ADMIN_DB_NAME,
        POSTGRES_BIN_DIR,
        POSTGRES_CLUSTER_DIR,
        POSTGRES_DB_NAME,
        POSTGRES_HOST,
        POSTGRES_LOG_FILE,
        POSTGRES_PASSWORD,
        POSTGRES_PORT,
        POSTGRES_RUNTIME_DIR,
        POSTGRES_USER,
        RUNTIME_CONFIG_PATH,
    )

    return {
        "SURVEY_RUNTIME_CONFIG_PATH": str(RUNTIME_CONFIG_PATH),
        "SURVEY_BACKEND_HOST": BACKEND_HOST,
        "SURVEY_BACKEND_PORT": BACKEND_PORT,
        "SURVEY_EMBEDDED_POSTGRES_ENABLED": EMBEDDED_POSTGRES_ENABLED,
        "SURVEY_POSTGRES_HOST": POSTGRES_HOST,
        "SURVEY_POSTGRES_PORT": POSTGRES_PORT,
        "SURVEY_POSTGRES_USER": POSTGRES_USER,
        "SURVEY_POSTGRES_PASSWORD": POSTGRES_PASSWORD,
        "SURVEY_POSTGRES_DB_NAME": POSTGRES_DB_NAME,
        "SURVEY_POSTGRES_ADMIN_DB_NAME": POSTGRES_ADMIN_DB_NAME,
        "SURVEY_POSTGRES_RUNTIME_DIR": str(POSTGRES_RUNTIME_DIR),
        "SURVEY_POSTGRES_BIN_DIR": str(POSTGRES_BIN_DIR),
        "SURVEY_POSTGRES_CLUSTER_DIR": str(POSTGRES_CLUSTER_DIR),
        "SURVEY_POSTGRES_LOG_FILE": str(POSTGRES_LOG_FILE),
    }


def _env_value(value: object) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit resolved survey runtime settings.")
    parser.add_argument("--format", choices=("env", "json"), default="env")
    args = parser.parse_args()

    snapshot = _load_runtime_snapshot()
    if args.format == "json":
        print(json.dumps(snapshot, ensure_ascii=False))
        return 0

    for key, value in snapshot.items():
        print(f"{key}={_env_value(value)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())