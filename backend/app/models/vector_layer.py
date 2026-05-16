from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class VectorLayer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    dataset_id: int = Field(index=True)
    name: str = Field(index=True, max_length=256)
    display_name: Optional[str] = Field(default=None, max_length=256)
    role: str = Field(default='dataset', index=True, max_length=32)
    geometry_type: Optional[str] = Field(default=None, index=True, max_length=32)
    source_crs: Optional[str] = Field(default=None, index=True, max_length=64)
    is_visible: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)
    style_config: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    filter_config: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    metadata_: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column('metadata', JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
