from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import AuthenticatedUser, get_current_user
from app.core.config import get_user_cache_dir, get_user_media_dir, get_user_temp_dir, get_user_trash_dir

router = APIRouter(tags=["assets"])


def _safe_resolve(root_dir: Path, requested_path: str) -> Path:
    relative_path = str(requested_path or "").replace("\\", "/").strip().strip("/")
    if not relative_path:
        raise HTTPException(status_code=404, detail="资源不存在")

    resolved_root = root_dir.resolve()
    resolved_path = (resolved_root / relative_path).resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="资源不存在") from exc

    if not resolved_path.exists() or not resolved_path.is_file():
        raise HTTPException(status_code=404, detail="资源不存在")
    return resolved_path


def _file_response(path: Path) -> FileResponse:
    media_type, _ = mimetypes.guess_type(path.name)
    return FileResponse(path, media_type=media_type or None)


@router.get("/media/{asset_path:path}")
def get_media_asset(asset_path: str, current_user: AuthenticatedUser = Depends(get_current_user)) -> FileResponse:
    return _file_response(_safe_resolve(get_user_media_dir(current_user.username), asset_path))


@router.get("/cache/{asset_name:path}")
def get_cache_asset(asset_name: str, current_user: AuthenticatedUser = Depends(get_current_user)) -> FileResponse:
    return _file_response(_safe_resolve(get_user_cache_dir(current_user.username), asset_name))


@router.get("/thumbnails/{asset_name:path}")
def get_thumbnail_asset(asset_name: str, current_user: AuthenticatedUser = Depends(get_current_user)) -> FileResponse:
    return _file_response(_safe_resolve(get_user_temp_dir(current_user.username), asset_name))


@router.get("/trash-media/{asset_path:path}")
def get_trash_media_asset(asset_path: str, current_user: AuthenticatedUser = Depends(get_current_user)) -> FileResponse:
    return _file_response(_safe_resolve(get_user_trash_dir(current_user.username), asset_path))