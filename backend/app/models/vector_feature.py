"""矢量要素存储模型。

主要职责：
- 为导入后的点、线、面要素提供统一的 JSON 几何与属性存储。
- 在未启用 PostGIS 的开发环境里，先以 GeoJSON + BBox 的方式支撑地图预览与查询。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class VectorFeature(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    public_id: Optional[str] = Field(default=None, index=True, unique=True)
    dataset_id: int = Field(index=True)
    layer_id: int = Field(index=True)
    feature_key: str = Field(index=True, max_length=256)
    geometry_type: Optional[str] = Field(default=None, index=True, max_length=32)
    source_row_index: Optional[int] = Field(default=None, index=True)
    geometry: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    properties: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    min_x: Optional[float] = Field(default=None, index=True)
    min_y: Optional[float] = Field(default=None, index=True)
    max_x: Optional[float] = Field(default=None, index=True)
    max_y: Optional[float] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)