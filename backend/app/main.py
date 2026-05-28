from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.api.deps import AuthenticatedUser
from app.core.config import VIEWER_ICON_DIR, reset_current_user_context, set_current_user_context
from app.db.session import get_system_session, init_db
from app.services.auth_service import get_user_from_token


def _is_open_path(path: str) -> bool:
    if path in {"/openapi.json", "/api/auth/login"}:
        return True
    return path.startswith("/docs") or path.startswith("/redoc") or path.startswith("/viewer-icons")


def _requires_auth(path: str) -> bool:
    return path.startswith("/api") or path.startswith("/media") or path.startswith("/cache") or path.startswith("/thumbnails") or path.startswith("/trash-media")


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = str(request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip() or None
    return None


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="picTagView Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve extracted viewer icons at /viewer-icons/<id>.png
    app.mount("/viewer-icons", StaticFiles(directory=str(VIEWER_ICON_DIR)), name="viewer_icons")

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        request.state.current_user = None

        if request.method == "OPTIONS" or _is_open_path(request.url.path) or not _requires_auth(request.url.path):
            return await call_next(request)

        token = _extract_bearer_token(request) or request.query_params.get("access_token")
        if not token:
            return JSONResponse(status_code=401, content={"detail": "未登录或令牌缺失"})

        with get_system_session() as session:
            user = get_user_from_token(token, session)

        if not user:
            return JSONResponse(status_code=401, content={"detail": "登录状态已失效"})

        current_user = AuthenticatedUser(
            id=int(user.id or 0),
            username=user.username,
            display_name=user.display_name or "",
            role=user.role or "user",
            is_active=bool(user.is_active),
        )
        username_token, role_token = set_current_user_context(current_user.username, current_user.role)
        request.state.current_user = current_user
        try:
            return await call_next(request)
        finally:
            reset_current_user_context(username_token, role_token)

    app.include_router(api_router)
    return app


app = create_app()
