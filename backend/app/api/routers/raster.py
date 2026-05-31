"""栅格数据接口。

主要职责：
- 提供栅格检查、导入、列表、删除与 XYZ 瓦片访问能力。
- 为地图管理页和栅格数据一级页提供统一契约。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.deps import AuthenticatedUser, get_current_user
from app.api.schemas import (
    RasterDatasetListResponse,
    RasterDatasetSummary,
    RasterDeleteResponse,
    RasterImportResponse,
    RasterImportTaskRequest,
    RasterImportTaskStatus,
    RasterInspectItem,
    RasterInspectResponse,
    RasterPathInspectRequest,
    SourceBrowserEntry,
    SourceBrowserResponse,
)
from app.db.session import get_session
from app.services.raster_service import (
    UploadedRasterFile,
    SUPPORTED_RASTER_EXTENSIONS,
    delete_raster_dataset,
    get_raster_dataset_summary,
    import_raster_dataset,
    inspect_raster_source_path,
    inspect_uploaded_rasters,
    list_raster_datasets,
    render_raster_tile,
)
from app.services.raster_task_service import create_raster_import_task, get_raster_import_task
from app.services.source_browser_service import browse_source_entries

router = APIRouter(prefix="/api/rasters", tags=["rasters"])


@router.get("/datasets", response_model=RasterDatasetListResponse)
def list_datasets(_current_user: AuthenticatedUser = Depends(get_current_user)) -> RasterDatasetListResponse:
    with get_session() as session:
        items = list_raster_datasets(session)
    return RasterDatasetListResponse(items=[RasterDatasetSummary(**item) for item in items])


@router.post("/inspect", response_model=RasterInspectResponse)
async def inspect_uploads(
    files: list[UploadFile] = File(...),
    max_zoom: int = Form(default=18),
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> RasterInspectResponse:
    uploaded_files = [
        UploadedRasterFile(
            filename=str(file_item.filename or ""),
            content=await file_item.read(),
        )
        for file_item in files
    ]

    try:
        items = inspect_uploaded_rasters(uploaded_files, max_zoom=max_zoom)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return RasterInspectResponse(items=[RasterInspectItem(**item) for item in items])


@router.post("/inspect-path", response_model=RasterInspectResponse)
def inspect_path(
    body: RasterPathInspectRequest,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> RasterInspectResponse:
    try:
        item = inspect_raster_source_path(body.source_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RasterInspectResponse(items=[RasterInspectItem(**item)])


@router.get("/source-browser", response_model=SourceBrowserResponse)
def source_browser(
    path: str | None = None,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> SourceBrowserResponse:
    try:
        payload = browse_source_entries(path, allowed_extensions=set(SUPPORTED_RASTER_EXTENSIONS))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SourceBrowserResponse(
        current_path=str(payload.get("current_path") or ""),
        parent_path=payload.get("parent_path"),
        items=[SourceBrowserEntry(**item) for item in list(payload.get("items") or [])],
    )


@router.post("/import", response_model=RasterImportResponse, status_code=201)
async def import_dataset(
    file: UploadFile | None = File(default=None),
    source_mode: str = Form(default="import"),
    source_path: str | None = Form(default=None),
    title: str | None = Form(default=None),
    generate_pyramid: bool = Form(default=False),
    max_zoom: int = Form(default=18),
    transparency_mode: str = Form(default="auto"),
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> RasterImportResponse:
    uploaded_file = None
    if file is not None:
        uploaded_file = UploadedRasterFile(
            filename=str(file.filename or ""),
            content=await file.read(),
        )

    try:
        with get_session() as session:
            dataset = import_raster_dataset(
                session,
                uploaded_file=uploaded_file,
                source_path=source_path,
                source_mode=source_mode,
                title_override=title,
                generate_pyramid=generate_pyramid,
                max_zoom=max_zoom,
                transparency_mode=transparency_mode,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return RasterImportResponse(dataset=RasterDatasetSummary(**dataset))


@router.post("/import-tasks", response_model=RasterImportTaskStatus, status_code=202)
def create_import_task(
    body: RasterImportTaskRequest,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> RasterImportTaskStatus:
    task = create_raster_import_task(
        username=_current_user.username,
        role=getattr(_current_user, "role", None),
        import_options={
            "source_path": body.source_path,
            "source_mode": body.source_mode,
            "title_override": body.title,
            "generate_pyramid": body.generate_pyramid,
            "max_zoom": body.max_zoom,
            "transparency_mode": body.transparency_mode,
        },
    )
    return RasterImportTaskStatus(**task)


@router.get("/import-tasks/{task_id}", response_model=RasterImportTaskStatus)
def import_task_detail(
    task_id: str,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> RasterImportTaskStatus:
    task = get_raster_import_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="栅格导入任务不存在")
    return RasterImportTaskStatus(**task)


@router.get("/datasets/{public_id}", response_model=RasterDatasetSummary)
def dataset_detail(public_id: str, _current_user: AuthenticatedUser = Depends(get_current_user)) -> RasterDatasetSummary:
    with get_session() as session:
        dataset = get_raster_dataset_summary(session, public_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="栅格数据集不存在")
    return RasterDatasetSummary(**dataset)


@router.delete("/datasets/{public_id}", response_model=RasterDeleteResponse)
def delete_dataset(public_id: str, _current_user: AuthenticatedUser = Depends(get_current_user)) -> RasterDeleteResponse:
    with get_session() as session:
        deleted = delete_raster_dataset(session, public_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="栅格数据集不存在")
    return RasterDeleteResponse(deleted=deleted)


@router.get("/datasets/{public_id}/tiles/{z_value}/{x_value}/{y_value}.png")
def dataset_tile(
    public_id: str,
    z_value: int,
    x_value: int,
    y_value: int,
    _current_user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
    with get_session() as session:
        tile_result = render_raster_tile(session, public_id, z_value=z_value, x_value=x_value, y_value=y_value)
    if not tile_result:
        raise HTTPException(status_code=404, detail="栅格数据集不存在")
    content, media_type = tile_result
    return Response(content=content, media_type=media_type)