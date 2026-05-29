"""矢量数据接口。

主要职责：
- 提供 SHP / CSV 上传导入、数据集列表、GeoJSON 预览与样式更新能力。
- 为矢量数据一级页与地图管理页提供统一后端契约。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import AuthenticatedUser, get_current_user
from app.api.schemas import (
    VectorDatasetListResponse,
    VectorDatasetSummary,
    VectorDeleteResponse,
    VectorImportResponse,
    VectorStyleUpdateRequest,
)
from app.db.session import get_session
from app.services.vector_service import (
    UploadedVectorFile,
    delete_vector_dataset,
    get_vector_dataset_geojson,
    get_vector_dataset_summary,
    import_vector_dataset,
    list_vector_datasets,
    update_vector_dataset_style,
)

router = APIRouter(prefix="/api/vectors", tags=["vectors"])


@router.get("/datasets", response_model=VectorDatasetListResponse)
def list_datasets(_current_user: AuthenticatedUser = Depends(get_current_user)) -> VectorDatasetListResponse:
    with get_session() as session:
        items = list_vector_datasets(session)
    return VectorDatasetListResponse(items=[VectorDatasetSummary(**item) for item in items])


@router.post("/import", response_model=VectorImportResponse, status_code=201)
async def import_dataset(
    files: list[UploadFile] = File(...),
    title: str | None = Form(default=None),
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> VectorImportResponse:
    uploaded_files = [
        UploadedVectorFile(
            filename=str(file_item.filename or ""),
            content=await file_item.read(),
        )
        for file_item in files
    ]

    try:
        with get_session() as session:
            dataset = import_vector_dataset(session, uploaded_files, title_override=title)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return VectorImportResponse(dataset=VectorDatasetSummary(**dataset))


@router.get("/datasets/{public_id}", response_model=VectorDatasetSummary)
def dataset_detail(public_id: str, _current_user: AuthenticatedUser = Depends(get_current_user)) -> VectorDatasetSummary:
    with get_session() as session:
        dataset = get_vector_dataset_summary(session, public_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="矢量数据集不存在")
    return VectorDatasetSummary(**dataset)


@router.get("/datasets/{public_id}/geojson")
def dataset_geojson(public_id: str, _current_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    with get_session() as session:
        dataset = get_vector_dataset_geojson(session, public_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="矢量数据集不存在")
    return dataset


@router.patch("/datasets/{public_id}/style", response_model=VectorDatasetSummary)
def update_dataset_style(
    public_id: str,
    body: VectorStyleUpdateRequest,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> VectorDatasetSummary:
    with get_session() as session:
        dataset = update_vector_dataset_style(session, public_id, body.style_config)
    if not dataset:
        raise HTTPException(status_code=404, detail="矢量数据集不存在")
    return VectorDatasetSummary(**dataset)


@router.delete("/datasets/{public_id}", response_model=VectorDeleteResponse)
def delete_dataset(public_id: str, _current_user: AuthenticatedUser = Depends(get_current_user)) -> VectorDeleteResponse:
    with get_session() as session:
        deleted = delete_vector_dataset(session, public_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="矢量数据集不存在")
    return VectorDeleteResponse(deleted=deleted)