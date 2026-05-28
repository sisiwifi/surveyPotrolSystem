from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime

from sqlmodel import Session, select

from app.core.config import DATA_DIR
from app.models.user import User

AUTH_SECRET_FILE = DATA_DIR / ".auth_secret"
ACCESS_TOKEN_EXPIRE_SECONDS = 60 * 60 * 12
PBKDF2_ITERATIONS = 200_000
_USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def normalize_username(value: object) -> str:
    username = str(value or "").strip()
    if not username:
        raise ValueError("用户名不能为空")
    if not _USERNAME_RE.fullmatch(username):
        raise ValueError("用户名只能包含英文字母、数字、点、下划线和中划线")
    return username


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _urlsafe_b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}")


def _get_secret_key() -> bytes:
    if AUTH_SECRET_FILE.exists():
        stored = AUTH_SECRET_FILE.read_text(encoding="utf-8").strip()
        if stored:
            return stored.encode("utf-8")

    secret = secrets.token_hex(32)
    AUTH_SECRET_FILE.write_text(secret, encoding="utf-8")
    return secret.encode("utf-8")


def hash_password(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ITERATIONS,
    ).hex()


def build_password_record(password: str) -> tuple[str, str]:
    salt_hex = secrets.token_hex(16)
    return salt_hex, hash_password(password, salt_hex)


def verify_password(password: str, user: User) -> bool:
    expected_hash = hash_password(password, user.password_salt)
    return hmac.compare_digest(expected_hash, user.password_hash)


def to_public_user(user: User) -> dict:
    return {
        "id": int(user.id or 0),
        "username": user.username,
        "display_name": user.display_name or "",
        "role": user.role or "user",
        "is_active": bool(user.is_active),
    }


def create_access_token(user: User, *, expires_in_seconds: int = ACCESS_TOKEN_EXPIRE_SECONDS) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user.username,
        "role": user.role or "user",
        "exp": int(time.time()) + int(expires_in_seconds),
    }
    encoded_header = _urlsafe_b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(_get_secret_key(), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_urlsafe_b64encode(signature)}"


def decode_access_token(token: str) -> dict | None:
    parts = str(token or "").split(".")
    if len(parts) != 3:
        return None

    encoded_header, encoded_payload, encoded_signature = parts
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    expected_signature = hmac.new(_get_secret_key(), signing_input, hashlib.sha256).digest()

    try:
        provided_signature = _urlsafe_b64decode(encoded_signature)
    except Exception:
        return None

    if not hmac.compare_digest(expected_signature, provided_signature):
        return None

    try:
        payload = json.loads(_urlsafe_b64decode(encoded_payload).decode("utf-8"))
    except Exception:
        return None

    try:
        if int(payload.get("exp") or 0) < int(time.time()):
            return None
    except Exception:
        return None

    return payload if isinstance(payload, dict) else None


def authenticate_user(session: Session, username: str, password: str) -> User | None:
    try:
        normalized_username = normalize_username(username)
    except ValueError:
        return None

    user = session.exec(select(User).where(User.username == normalized_username)).first()
    if not user or not user.is_active:
        return None
    if not verify_password(password, user):
        return None
    return user


def get_user_from_token(token: str, session: Session) -> User | None:
    payload = decode_access_token(token)
    if not payload:
        return None

    username = payload.get("sub")
    if not isinstance(username, str) or not username.strip():
        return None

    user = session.exec(select(User).where(User.username == username.strip())).first()
    if not user or not user.is_active:
        return None
    return user


def ensure_seed_users(session: Session) -> None:
    for username, display_name, password, role in (
        ("admin", "管理员", "123456", "admin"),
        ("guest", "访客", "qwerty", "user"),
    ):
        user = session.exec(select(User).where(User.username == username)).first()
        if user:
            changed = False
            if user.role != role:
                user.role = role
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if not user.display_name:
                user.display_name = display_name
                changed = True
            if changed:
                user.updated_at = datetime.utcnow()
                session.add(user)
            continue

        password_salt, password_hash = build_password_record(password)
        session.add(
            User(
                username=username,
                display_name=display_name,
                password_salt=password_salt,
                password_hash=password_hash,
                role=role,
                is_active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )