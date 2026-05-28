from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import AuthenticatedUser, get_current_user
from app.api.schemas import AuthUserResponse, LoginRequest, LoginResponse
from app.db.session import get_system_session
from app.services.auth_service import authenticate_user, create_access_token, to_public_user

router = APIRouter(tags=["auth"])


@router.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest) -> LoginResponse:
    with get_system_session() as session:
        user = authenticate_user(session, body.username, body.password)

    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    return LoginResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        user=AuthUserResponse(**to_public_user(user)),
    )


@router.get("/api/auth/me", response_model=AuthUserResponse)
def me(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthUserResponse:
    return AuthUserResponse(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        role=current_user.role,
        is_active=current_user.is_active,
    )


@router.post("/api/auth/logout")
def logout() -> dict:
    return {"ok": True}