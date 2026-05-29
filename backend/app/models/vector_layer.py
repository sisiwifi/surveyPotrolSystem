"""矢量图层模型。

主要职责：
- 为数据集中的业务图层保存显隐、顺序、样式和标签字段等视图层状态。
- 当前导入器默认每个数据集创建一个图层，为后续多图层扩展预留结构。
"""

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
    role: str = Field(default="dataset", index=True, max_length=32)
    geometry_type: Optional[str] = Field(default=None, index=True, max_length=32)
    source_crs: Optional[str] = Field(default=None, index=True, max_length=64)
    label_field: Optional[str] = Field(default=None, max_length=128)
    feature_count: int = Field(default=0)
    is_visible: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)
    style_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    filter_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
