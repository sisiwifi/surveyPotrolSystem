from __future__ import annotations

import json

from app.core.runtime_config import (
    DEFAULT_RUNTIME_CONFIG,
    get_runtime_config_path,
    load_runtime_config,
    resolve_backend_path,
)

MIN_RUNTIME_PORT = 1
MAX_RUNTIME_PORT = 65535


def _normalize_text(value: object, default: str) -> str:
    normalized = str(value or "").strip()
    return normalized or default


def _normalize_port(value: object, default: int) -> int:
    try:
        normalized = int(value)
    except Exception:
        return default
    return max(MIN_RUNTIME_PORT, min(MAX_RUNTIME_PORT, normalized))


def _normalize_bool(value: object, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _normalize_path_text(value: object, default: str) -> str:
    normalized = _normalize_text(value, default)
    return normalized.replace("\\", "/")


def _build_runtime_settings(raw_config: dict) -> dict:
    default_backend = DEFAULT_RUNTIME_CONFIG.get("backend", {})
    default_database = DEFAULT_RUNTIME_CONFIG.get("database", {})

    backend = raw_config.get("backend") if isinstance(raw_config.get("backend"), dict) else {}
    database = raw_config.get("database") if isinstance(raw_config.get("database"), dict) else {}

    runtime_dir = _normalize_path_text(database.get("runtime_dir"), str(default_database.get("runtime_dir", "runtime/postgresql")))
    bin_dir = _normalize_path_text(database.get("bin_dir"), str(default_database.get("bin_dir", "runtime/postgresql/bin")))
    cluster_dir = _normalize_path_text(database.get("cluster_dir"), str(default_database.get("cluster_dir", "data/postgresql/cluster")))
    log_file = _normalize_path_text(database.get("log_file"), str(default_database.get("log_file", "data/postgresql/log/postgresql.log")))

    return {
        "config_path": str(get_runtime_config_path()),
        "backend_host": _normalize_text(backend.get("host"), str(default_backend.get("host", "127.0.0.1"))),
        "backend_port": _normalize_port(backend.get("port"), int(default_backend.get("port", 8000))),
        "embedded_postgres_enabled": True,
        "postgres_driver": _normalize_text(database.get("driver"), str(default_database.get("driver", "postgresql+psycopg"))),
        "postgres_host": _normalize_text(database.get("host"), str(default_database.get("host", "127.0.0.1"))),
        "postgres_port": _normalize_port(database.get("port"), int(default_database.get("port", 5432))),
        "postgres_user": _normalize_text(database.get("user"), str(default_database.get("user", "postgres"))),
        "postgres_password": _normalize_text(database.get("password"), str(default_database.get("password", "postgres123"))),
        "postgres_db_name": _normalize_text(database.get("database"), str(default_database.get("database", "survey_potrol_system"))),
        "postgres_admin_db_name": _normalize_text(database.get("admin_database"), str(default_database.get("admin_database", "postgres"))),
        "postgres_runtime_dir": runtime_dir,
        "postgres_bin_dir": bin_dir,
        "postgres_cluster_dir": cluster_dir,
        "postgres_log_file": log_file,
        "resolved_postgres_runtime_dir": str(resolve_backend_path(runtime_dir)),
        "resolved_postgres_bin_dir": str(resolve_backend_path(bin_dir)),
        "resolved_postgres_cluster_dir": str(resolve_backend_path(cluster_dir)),
        "resolved_postgres_log_file": str(resolve_backend_path(log_file)),
        "restart_required": True,
    }


def get_runtime_settings() -> dict:
    return _build_runtime_settings(load_runtime_config())


def set_runtime_settings(setting: dict) -> dict:
    if not isinstance(setting, dict):
        setting = {}

    current = get_runtime_settings()

    if "backend_host" in setting:
        current["backend_host"] = _normalize_text(setting.get("backend_host"), current["backend_host"])
    if "backend_port" in setting:
        current["backend_port"] = _normalize_port(setting.get("backend_port"), current["backend_port"])
    current["embedded_postgres_enabled"] = True
    if "postgres_host" in setting:
        current["postgres_host"] = _normalize_text(setting.get("postgres_host"), current["postgres_host"])
    if "postgres_port" in setting:
        current["postgres_port"] = _normalize_port(setting.get("postgres_port"), current["postgres_port"])
    if "postgres_user" in setting:
        current["postgres_user"] = _normalize_text(setting.get("postgres_user"), current["postgres_user"])
    if "postgres_password" in setting:
        current["postgres_password"] = _normalize_text(setting.get("postgres_password"), current["postgres_password"])
    if "postgres_db_name" in setting:
        current["postgres_db_name"] = _normalize_text(setting.get("postgres_db_name"), current["postgres_db_name"])
    if "postgres_admin_db_name" in setting:
        current["postgres_admin_db_name"] = _normalize_text(
            setting.get("postgres_admin_db_name"),
            current["postgres_admin_db_name"],
        )
    if "postgres_runtime_dir" in setting:
        current["postgres_runtime_dir"] = _normalize_path_text(setting.get("postgres_runtime_dir"), current["postgres_runtime_dir"])
    if "postgres_bin_dir" in setting:
        current["postgres_bin_dir"] = _normalize_path_text(setting.get("postgres_bin_dir"), current["postgres_bin_dir"])
    if "postgres_cluster_dir" in setting:
        current["postgres_cluster_dir"] = _normalize_path_text(setting.get("postgres_cluster_dir"), current["postgres_cluster_dir"])
    if "postgres_log_file" in setting:
        current["postgres_log_file"] = _normalize_path_text(setting.get("postgres_log_file"), current["postgres_log_file"])

    payload = {
        "backend": {
            "host": current["backend_host"],
            "port": current["backend_port"],
        },
        "database": {
            "embedded": True,
            "driver": current["postgres_driver"],
            "host": current["postgres_host"],
            "port": current["postgres_port"],
            "user": current["postgres_user"],
            "password": current["postgres_password"],
            "database": current["postgres_db_name"],
            "admin_database": current["postgres_admin_db_name"],
            "runtime_dir": current["postgres_runtime_dir"],
            "bin_dir": current["postgres_bin_dir"],
            "cluster_dir": current["postgres_cluster_dir"],
            "log_file": current["postgres_log_file"],
        },
    }

    runtime_config_path = get_runtime_config_path()
    runtime_config_path.parent.mkdir(parents=True, exist_ok=True)
    runtime_config_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return get_runtime_settings()