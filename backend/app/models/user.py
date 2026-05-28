from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "user_account"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=64)
    display_name: str = Field(default="", max_length=128)
    password_salt: str = Field(max_length=128)
    password_hash: str = Field(max_length=256)
    role: str = Field(default="user", index=True, max_length=32)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)