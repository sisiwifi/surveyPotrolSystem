"""矢量数据集元数据模型。

主要职责：
- 记录导入文件、坐标系、样式、范围和要素统计等数据集级信息。
- 作为地图页和矢量页列表展示的主数据源。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class VectorDataset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    owner_username: Optional[str] = Field(default=None, index=True, max_length=64)
    title: str = Field(index=True, max_length=256)
    description: Optional[str] = Field(default=None, max_length=1024)
    format: str = Field(default="unknown", index=True, max_length=32)
    source_filename: Optional[str] = Field(default=None, max_length=256)
    import_status: str = Field(default="pending", index=True, max_length=32)
    import_error: Optional[str] = Field(default=None, max_length=2048)
    source_crs: Optional[str] = Field(default=None, index=True, max_length=64)
    target_crs: str = Field(default="EPSG:4326", index=True, max_length=64)
    geometry_type: Optional[str] = Field(default=None, index=True, max_length=32)
    primary_file_path: Optional[str] = Field(default=None, index=True)
    file_group: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    extent: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    style_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    parsed_feature_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
