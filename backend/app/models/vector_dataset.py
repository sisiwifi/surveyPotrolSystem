from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class VectorDataset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    title: str = Field(index=True, max_length=256)
    description: Optional[str] = Field(default=None, max_length=1024)
    format: str = Field(default='unknown', index=True, max_length=32)
    import_status: str = Field(default='pending', index=True, max_length=32)
    source_crs: Optional[str] = Field(default=None, index=True, max_length=64)
    geometry_type: Optional[str] = Field(default=None, index=True, max_length=32)
    primary_file_path: Optional[str] = Field(default=None, index=True)
    file_group: Optional[list[dict[str, Any]]] = Field(default_factory=list, sa_column=Column(JSON))
    extent: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    style_config: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    metadata_: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column('metadata', JSON))
    parsed_feature_count: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
