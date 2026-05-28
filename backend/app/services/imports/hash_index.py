import json
from pathlib import Path
from typing import Optional

from sqlmodel import select

from app.core.config import get_current_username, get_user_media_dir
from app.db.session import get_session
from app.models.image_asset import ImageAsset

_hash_index_by_user: dict[str, dict[str, int]] = {}
_quick_hash_index_by_user: dict[str, dict[str, str]] = {}


def _active_username() -> str:
    username = get_current_username(required=True)
    if not username:
        raise RuntimeError("当前请求未绑定用户上下文")
    return username


def _hash_index_path(username: str) -> Path:
    return get_user_media_dir(username) / ".hash_index.json"


def load_hash_index() -> None:
    username = _active_username()
    if username in _hash_index_by_user:
        return

    index_path = _hash_index_path(username)
    if index_path.exists():
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and "hash_to_id" in raw:
                _hash_index_by_user[username] = raw["hash_to_id"]
                _quick_hash_index_by_user[username] = raw.get("quick_to_hash", {})
            else:
                _hash_index_by_user[username] = raw if isinstance(raw, dict) else {}
                _quick_hash_index_by_user[username] = {}
        except Exception:
            _hash_index_by_user[username] = {}
            _quick_hash_index_by_user[username] = {}
    else:
        _hash_index_by_user[username] = {}
        _quick_hash_index_by_user[username] = {}


def save_hash_index() -> None:
    username = _active_username()
    hash_index = _hash_index_by_user.get(username)
    if hash_index is None:
        return
    try:
        data = {
            "hash_to_id": hash_index,
            "quick_to_hash": _quick_hash_index_by_user.get(username, {}),
        }
        _hash_index_path(username).write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass


def add_to_hash_index(file_hash: str, image_id: int, quick_hash: Optional[str] = None) -> None:
    username = _active_username()
    hash_index = _hash_index_by_user.setdefault(username, {})
    hash_index[file_hash] = image_id
    if quick_hash:
        quick_index = _quick_hash_index_by_user.setdefault(username, {})
        quick_index[quick_hash] = file_hash


def lookup_hash_index(file_hash: str) -> Optional[int]:
    username = _active_username()
    hash_index = _hash_index_by_user.get(username)
    if hash_index is None:
        return None
    return hash_index.get(file_hash)


def lookup_quick_hash(quick_hash: str) -> Optional[str]:
    username = _active_username()
    quick_index = _quick_hash_index_by_user.get(username)
    if quick_index is None:
        return None
    return quick_index.get(quick_hash)


def clear_hash_index_memory() -> None:
    username = get_current_username()
    if username:
        _hash_index_by_user.pop(username, None)
        _quick_hash_index_by_user.pop(username, None)
        return

    _hash_index_by_user.clear()
    _quick_hash_index_by_user.clear()


def rebuild_hash_index() -> None:
    username = _active_username()
    _hash_index_by_user[username] = {}
    _quick_hash_index_by_user[username] = {}
    with get_session() as session:
        for asset in session.exec(select(ImageAsset)).all():
            if asset.file_hash and asset.id is not None:
                _hash_index_by_user[username][asset.file_hash] = asset.id
                if asset.quick_hash:
                    _quick_hash_index_by_user[username][asset.quick_hash] = asset.file_hash
    save_hash_index()
