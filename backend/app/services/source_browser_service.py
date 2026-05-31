"""服务端路径浏览服务。"""

from __future__ import annotations

import os
import string
from datetime import datetime
from pathlib import Path
from typing import Iterable


def _list_windows_drives() -> list[Path]:
    items: list[Path] = []
    for letter in string.ascii_uppercase:
        root = Path(f"{letter}:\\")
        if root.exists():
            items.append(root)
    return items


def _entry_type(path: Path) -> str:
    if path.drive and path.parent == path:
        return "drive"
    if path.is_dir():
        return "directory"
    return "file"


def _as_iso_timestamp(path: Path) -> str | None:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat()
    except Exception:
        return None


def _serialize_entry(path: Path) -> dict:
    entry_type = _entry_type(path)
    size_bytes = None
    if entry_type == "file":
        try:
            size_bytes = int(path.stat().st_size)
        except Exception:
            size_bytes = None

    return {
        "name": path.name or str(path),
        "path": path.as_posix(),
        "entry_type": entry_type,
        "extension": path.suffix.lower() if path.is_file() else None,
        "size_bytes": size_bytes,
        "modified_at": _as_iso_timestamp(path),
    }


def _sorted_entries(paths: Iterable[Path]) -> list[dict]:
    sorted_paths = sorted(
        paths,
        key=lambda item: (
            0 if item.is_dir() else 1,
            item.name.lower(),
        ),
    )
    return [_serialize_entry(path) for path in sorted_paths]


def _normalize_current_path(raw_path: str | None) -> Path | None:
    normalized = str(raw_path or "").strip()
    if not normalized:
        return None
    try:
        return Path(normalized).expanduser().resolve(strict=True)
    except FileNotFoundError as exc:
        raise ValueError("指定路径不存在") from exc
    except OSError as exc:
        raise ValueError("无法访问指定路径") from exc


def browse_source_entries(raw_path: str | None, *, allowed_extensions: set[str]) -> dict:
    current_path = _normalize_current_path(raw_path)
    if current_path is None:
        return {
            "current_path": "",
            "parent_path": None,
            "items": [_serialize_entry(path) for path in _list_windows_drives()],
        }

    if current_path.is_file():
        current_path = current_path.parent
    if not current_path.is_dir():
        raise ValueError("指定路径不是目录")

    try:
        entries: list[Path] = []
        with os.scandir(current_path) as iterator:
            for item in iterator:
                item_path = Path(item.path)
                if item.is_dir():
                    entries.append(item_path)
                    continue
                if item.is_file() and item_path.suffix.lower() in allowed_extensions:
                    entries.append(item_path)
    except PermissionError as exc:
        raise ValueError("没有权限读取该目录") from exc
    except OSError as exc:
        raise ValueError("读取目录失败") from exc

    parent_path = None if current_path.parent == current_path else current_path.parent.as_posix()
    return {
        "current_path": current_path.as_posix(),
        "parent_path": parent_path,
        "items": _sorted_entries(entries),
    }