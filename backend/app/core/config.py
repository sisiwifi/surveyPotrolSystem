from __future__ import annotations

import os
from contextvars import ContextVar, Token
from pathlib import Path
from typing import Callable


class DynamicPath(os.PathLike):
	def __init__(self, resolver: Callable[[], Path], label: str):
		self._resolver = resolver
		self._label = label

	def _path(self) -> Path:
		return self._resolver()

	def __fspath__(self) -> str:
		return os.fspath(self._path())

	def __str__(self) -> str:
		return str(self._path())

	def __repr__(self) -> str:
		return f"DynamicPath(label={self._label!r}, path={self._path()!s})"

	def __truediv__(self, key: object) -> Path:
		return self._path() / key

	def __getattr__(self, name: str):
		return getattr(self._path(), name)


BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
TEMP_ROOT_DIR = BASE_DIR / "temp"
USERS_DATA_DIR = DATA_DIR / "users"
VIEWER_ICON_DIR = DATA_DIR / "viewer_icons"
MEDIA_ROOT_DIR = PROJECT_ROOT / "media"
TRASH_ROOT_DIR = PROJECT_ROOT / "trash"
SYSTEM_DB_PATH = DATA_DIR / "system.db"
LEGACY_DB_PATH = DATA_DIR / "app.db"

for root_path in (
	DATA_DIR,
	TEMP_ROOT_DIR,
	USERS_DATA_DIR,
	VIEWER_ICON_DIR,
	MEDIA_ROOT_DIR,
	TRASH_ROOT_DIR,
):
	root_path.mkdir(parents=True, exist_ok=True)

_CURRENT_USERNAME: ContextVar[str | None] = ContextVar("current_username", default=None)
_CURRENT_USER_ROLE: ContextVar[str | None] = ContextVar("current_user_role", default=None)


def set_current_user_context(username: str | None, role: str | None = None) -> tuple[Token, Token]:
	return _CURRENT_USERNAME.set(username), _CURRENT_USER_ROLE.set(role)


def reset_current_user_context(username_token: Token, role_token: Token) -> None:
	_CURRENT_USERNAME.reset(username_token)
	_CURRENT_USER_ROLE.reset(role_token)


def get_current_username(required: bool = False) -> str | None:
	username = _CURRENT_USERNAME.get()
	if required and not username:
		raise RuntimeError("当前请求未绑定用户上下文")
	return username


def require_current_username() -> str:
	username = get_current_username(required=True)
	if not username:
		raise RuntimeError("当前请求未绑定用户上下文")
	return username


def get_current_user_role() -> str | None:
	return _CURRENT_USER_ROLE.get()


def get_user_data_dir(username: str) -> Path:
	user_dir = USERS_DATA_DIR / username
	user_dir.mkdir(parents=True, exist_ok=True)
	return user_dir


def get_user_db_path(username: str) -> Path:
	return get_user_data_dir(username) / "app.db"


def get_user_settings_path(username: str) -> Path:
	return get_user_data_dir(username) / "app_settings.json"


def get_user_cache_dir(username: str) -> Path:
	cache_dir = get_user_data_dir(username) / "cache"
	cache_dir.mkdir(parents=True, exist_ok=True)
	return cache_dir


def get_user_temp_dir(username: str) -> Path:
	temp_dir = TEMP_ROOT_DIR / username
	temp_dir.mkdir(parents=True, exist_ok=True)
	return temp_dir


def get_user_media_dir(username: str) -> Path:
	media_dir = MEDIA_ROOT_DIR / username
	media_dir.mkdir(parents=True, exist_ok=True)
	return media_dir


def get_user_trash_dir(username: str) -> Path:
	trash_dir = TRASH_ROOT_DIR / username
	trash_dir.mkdir(parents=True, exist_ok=True)
	return trash_dir


def ensure_user_storage_dirs(username: str) -> None:
	get_user_data_dir(username)
	get_user_cache_dir(username)
	get_user_temp_dir(username)
	get_user_media_dir(username)
	get_user_trash_dir(username)


def get_current_user_db_path() -> Path:
	return get_user_db_path(require_current_username())


def get_current_user_settings_path() -> Path:
	return get_user_settings_path(require_current_username())


def get_current_user_cache_dir() -> Path:
	return get_user_cache_dir(require_current_username())


def get_current_user_temp_dir() -> Path:
	return get_user_temp_dir(require_current_username())


def get_current_user_media_dir() -> Path:
	return get_user_media_dir(require_current_username())


def get_current_user_trash_dir() -> Path:
	return get_user_trash_dir(require_current_username())


def _normalize_virtual_path(raw_path: str) -> str:
	return str(raw_path or "").replace("\\", "/").strip().strip("/")


def _resolve_virtual_suffix(normalized_path: str, prefix: str) -> str | None:
	if normalized_path == prefix:
		return ""
	prefix_with_sep = f"{prefix}/"
	if normalized_path.startswith(prefix_with_sep):
		return normalized_path[len(prefix_with_sep):]
	return None


def resolve_user_scoped_path(stored_path: str | os.PathLike | None, *, username: str | None = None) -> Path | None:
	if not stored_path:
		return None

	path = Path(stored_path)
	if path.is_absolute():
		return path.resolve()

	normalized_path = _normalize_virtual_path(str(stored_path))
	if not normalized_path:
		return None

	active_username = username or get_current_username()
	if active_username:
		for prefix, resolver in (
			("media", get_user_media_dir),
			("trash", get_user_trash_dir),
			("cache", get_user_cache_dir),
			("temp", get_user_temp_dir),
		):
			suffix = _resolve_virtual_suffix(normalized_path, prefix)
			if suffix is None:
				continue
			relative = Path(suffix) if suffix else Path()
			return (resolver(active_username) / relative).resolve()

	return (PROJECT_ROOT / normalized_path).resolve()


def _to_virtual_path_from_root(resolved_path: Path, root_path: Path, prefix: str, *, strip_segments: int) -> str | None:
	try:
		relative = resolved_path.relative_to(root_path.resolve())
	except Exception:
		return None

	parts = list(relative.parts)
	if strip_segments > 0 and parts:
		parts = parts[strip_segments:]

	suffix = "/".join(parts)
	return prefix if not suffix else f"{prefix}/{suffix}"


def to_user_scoped_relative(path: Path, *, username: str | None = None) -> str:
	resolved_path = path.resolve()
	active_username = username or get_current_username()

	if active_username:
		for prefix, root_path in (
			("media", get_user_media_dir(active_username)),
			("trash", get_user_trash_dir(active_username)),
			("cache", get_user_cache_dir(active_username)),
			("temp", get_user_temp_dir(active_username)),
		):
			virtual_path = _to_virtual_path_from_root(resolved_path, root_path, prefix, strip_segments=0)
			if virtual_path is not None:
				return virtual_path

	for prefix, root_path, strip_segments in (
		("media", MEDIA_ROOT_DIR, 1),
		("trash", TRASH_ROOT_DIR, 1),
		("cache", USERS_DATA_DIR, 2),
		("temp", TEMP_ROOT_DIR, 1),
	):
		virtual_path = _to_virtual_path_from_root(
			resolved_path,
			root_path,
			prefix,
			strip_segments=strip_segments,
		)
		if virtual_path is not None:
			return virtual_path

	try:
		return resolved_path.relative_to(PROJECT_ROOT.resolve()).as_posix()
	except Exception:
		return resolved_path.as_posix()


MEDIA_DIR = DynamicPath(get_current_user_media_dir, "MEDIA_DIR")
TRASH_DIR = DynamicPath(get_current_user_trash_dir, "TRASH_DIR")
CACHE_DIR = DynamicPath(get_current_user_cache_dir, "CACHE_DIR")
TEMP_DIR = DynamicPath(get_current_user_temp_dir, "TEMP_DIR")
DB_PATH = DynamicPath(get_current_user_db_path, "DB_PATH")
