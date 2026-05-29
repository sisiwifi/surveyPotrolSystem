from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_RUNTIME_CONFIG_PATH = BACKEND_DIR / "runtime_config.json"

DEFAULT_RUNTIME_CONFIG: dict[str, Any] = {
    "backend": {
        "host": "127.0.0.1",
        "port": 8000,
    },
    "database": {
        "embedded": True,
        "driver": "postgresql+psycopg",
        "host": "127.0.0.1",
        "port": 5432,
        "user": "postgres",
        "password": "postgres123",
        "database": "survey_potrol_system",
        "admin_database": "postgres",
        "runtime_dir": "runtime/postgresql",
        "bin_dir": "runtime/postgresql/bin",
        "cluster_dir": "data/postgresql/cluster",
        "log_file": "data/postgresql/log/postgresql.log",
    },
}


def get_runtime_config_path() -> Path:
    configured_path = str(os.getenv("SURVEY_RUNTIME_CONFIG") or "").strip()
    if not configured_path:
        return DEFAULT_RUNTIME_CONFIG_PATH

    path = Path(configured_path).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


def _deep_merge(target: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
            continue
        target[key] = value
    return target


def load_runtime_config() -> dict[str, Any]:
    config = deepcopy(DEFAULT_RUNTIME_CONFIG)
    runtime_config_path = get_runtime_config_path()

    if not runtime_config_path.exists():
        return config

    try:
        raw_data = json.loads(runtime_config_path.read_text(encoding="utf-8"))
    except Exception:
        return config

    if not isinstance(raw_data, dict):
        return config

    return _deep_merge(config, raw_data)


RUNTIME_CONFIG = load_runtime_config()


def get_backend_runtime_config() -> dict[str, Any]:
    backend_config = RUNTIME_CONFIG.get("backend")
    if isinstance(backend_config, dict):
        return backend_config
    return {}


def get_database_runtime_config() -> dict[str, Any]:
    database_config = RUNTIME_CONFIG.get("database")
    if isinstance(database_config, dict):
        return database_config
    return {}


def resolve_backend_path(value: str | os.PathLike[str]) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path.resolve()
    return (BACKEND_DIR / path).resolve()