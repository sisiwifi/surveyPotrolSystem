from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request


@dataclass(frozen=True)
class AuthenticatedUser:
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool = True


def get_current_user(request: Request) -> AuthenticatedUser:
    current_user = getattr(request.state, "current_user", None)
    if isinstance(current_user, AuthenticatedUser):
        return current_user
    raise HTTPException(status_code=401, detail="未登录")


def require_admin(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行该操作")
    return current_user