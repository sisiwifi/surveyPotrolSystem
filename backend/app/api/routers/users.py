from __future__ import annotations

import shutil
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import AuthenticatedUser, require_admin
from app.api.schemas import UserCreateRequest, UserItem, UserListResponse, UserPasswordResetRequest
from app.core.config import MEDIA_ROOT_DIR, TEMP_ROOT_DIR, TRASH_ROOT_DIR, USERS_DATA_DIR, ensure_user_storage_dirs
from app.db.session import dispose_user_db, get_system_session
from app.models.user import User
from app.services.auth_service import build_password_record, normalize_username, to_public_user

router = APIRouter(prefix="/api/users", tags=["users"])


def _normalize_role(value: object) -> str:
    normalized = str(value or "user").strip().lower() or "user"
    if normalized not in {"admin", "user"}:
        raise ValueError("role 只能是 admin 或 user")
    return normalized


def _remove_tree(path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


@router.get("", response_model=UserListResponse)
def list_users(_admin: AuthenticatedUser = Depends(require_admin)) -> UserListResponse:
    with get_system_session() as session:
        users = session.exec(select(User).order_by(User.username)).all()
    return UserListResponse(items=[UserItem(**to_public_user(user)) for user in users])


@router.post("", response_model=UserItem, status_code=201)
def create_user(body: UserCreateRequest, _admin: AuthenticatedUser = Depends(require_admin)) -> UserItem:
    try:
        username = normalize_username(body.username)
        role = _normalize_role(body.role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    password = str(body.password or "")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="密码长度至少为 4 位")

    with get_system_session() as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"用户 {username} 已存在")

        password_salt, password_hash = build_password_record(password)
        user = User(
            username=username,
            display_name=str(body.display_name or "").strip(),
            password_salt=password_salt,
            password_hash=password_hash,
            role=role,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

    ensure_user_storage_dirs(username)
    return UserItem(**to_public_user(user))


@router.post("/{username}/reset-password")
def reset_user_password(
    username: str,
    body: UserPasswordResetRequest,
    _admin: AuthenticatedUser = Depends(require_admin),
) -> dict:
    try:
        normalized_username = normalize_username(username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    password = str(body.password or "")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="密码长度至少为 4 位")

    with get_system_session() as session:
        user = session.exec(select(User).where(User.username == normalized_username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        password_salt, password_hash = build_password_record(password)
        user.password_salt = password_salt
        user.password_hash = password_hash
        user.updated_at = datetime.utcnow()
        session.add(user)
        session.commit()

    return {"ok": True}


@router.delete("/{username}")
def delete_user(username: str, current_user: AuthenticatedUser = Depends(require_admin)) -> dict:
    try:
        normalized_username = normalize_username(username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if normalized_username == current_user.username:
        raise HTTPException(status_code=400, detail="不能删除当前登录用户")

    with get_system_session() as session:
        user = session.exec(select(User).where(User.username == normalized_username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        if user.role == "admin":
            admin_count = len(
                session.exec(
                    select(User)
                    .where(User.role == "admin")
                    .where(User.is_active == True)  # noqa: E712
                ).all()
            )
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="至少需要保留一个管理员账号")

        session.delete(user)
        session.commit()

    dispose_user_db(normalized_username)
    _remove_tree(USERS_DATA_DIR / normalized_username)
    _remove_tree(MEDIA_ROOT_DIR / normalized_username)
    _remove_tree(TRASH_ROOT_DIR / normalized_username)
    _remove_tree(TEMP_ROOT_DIR / normalized_username)
    return {"deleted": 1}