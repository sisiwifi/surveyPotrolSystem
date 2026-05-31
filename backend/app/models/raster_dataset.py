"""栅格数据集元数据模型。

主要职责：
- 记录导入或仅加载的栅格源、金字塔状态、空间范围和渲染透明度策略。
- 作为地图页与栅格数据一级页共享的主数据源。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class RasterDataset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    owner_username: Optional[str] = Field(default=None, index=True, max_length=64)
    title: str = Field(index=True, max_length=256)
    description: Optional[str] = Field(default=None, max_length=1024)
    format: str = Field(default="unknown", index=True, max_length=32)
    source_filename: Optional[str] = Field(default=None, max_length=256)
    source_mode: str = Field(default="import", index=True, max_length=32)
    source_path: Optional[str] = Field(default=None, index=True)
    stored_path: Optional[str] = Field(default=None, index=True)
    pyramid_mode: str = Field(default="none", index=True, max_length=32)
    pyramid_path: Optional[str] = Field(default=None, index=True)
    max_zoom: int = Field(default=18)
    import_status: str = Field(default="pending", index=True, max_length=32)
    import_error: Optional[str] = Field(default=None, max_length=2048)
    source_crs: Optional[str] = Field(default=None, index=True, max_length=64)
    target_crs: str = Field(default="EPSG:3857", index=True, max_length=64)
    band_count: int = Field(default=0)
    has_alpha: bool = Field(default=False)
    nodata_value: Optional[str] = Field(default=None, max_length=256)
    transparency_mode: str = Field(default="preserve", max_length=64)
    extent: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    center: list[float] = Field(default_factory=list, sa_column=Column(JSON))
    resolution: list[float] = Field(default_factory=list, sa_column=Column(JSON))
    size: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)