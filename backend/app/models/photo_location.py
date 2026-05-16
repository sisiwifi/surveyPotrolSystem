from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class PhotoLocation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    image_id: int = Field(index=True, unique=True)
    longitude: float = Field(index=True)
    latitude: float = Field(index=True)
    altitude: Optional[float] = Field(default=None)
    accuracy_m: Optional[float] = Field(default=None)
    source_type: str = Field(default='exif', index=True, max_length=32)
    source_crs: str = Field(default='EPSG:4326', index=True, max_length=32)
    location_name: Optional[str] = Field(default=None, max_length=256)
    note: Optional[str] = Field(default=None, max_length=1024)
    captured_at: Optional[datetime] = Field(default=None, index=True)
    raw_payload: Optional[dict[str, Any]] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
