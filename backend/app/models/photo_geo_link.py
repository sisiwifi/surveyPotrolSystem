from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class PhotoGeoLink(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    image_id: int = Field(index=True)
    dataset_id: Optional[int] = Field(default=None, index=True)
    layer_id: Optional[int] = Field(default=None, index=True)
    target_kind: str = Field(default='feature', index=True, max_length=32)
    target_ref: Optional[str] = Field(default=None, index=True, max_length=256)
    relation_type: str = Field(default='located_in', index=True, max_length=32)
    link_payload: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
