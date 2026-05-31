"""栅格数据检查、导入与瓦片服务。

主要职责：
- 检查 GeoTIFF / IMG / JP2 的基础元数据、概览状态和透明度建议。
- 在导入模式下优先构建真实概览金字塔，在仅加载模式下仅建立服务端瓦片缓存而不改原文件。
- 为地图页提供受鉴权的 XYZ 栅格瓦片输出，并缓存渲染拉伸统计以降低大影像逐瓦片开销。
"""

from __future__ import annotations

import io
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import numpy as np
from PIL import Image
from sqlmodel import Session, select

try:
    import rasterio
    from rasterio.errors import RasterioError
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import transform_bounds
except Exception:  # pragma: no cover - runtime dependency is optional during static analysis
    rasterio = None
    RasterioError = None
    Resampling = None
    from_bounds = None
    WarpedVRT = None
    transform_bounds = None

from app.core.config import (
    get_user_grid_dir,
    require_current_username,
    resolve_user_scoped_path,
    to_user_scoped_relative,
)
from app.models.raster_dataset import RasterDataset

SUPPORTED_RASTER_EXTENSIONS = {
    ".tif": "GeoTIFF",
    ".tiff": "GeoTIFF",
    ".img": "IMG",
    ".jp2": "JP2",
}
DEFAULT_MAX_ZOOM = 18
TILE_SIZE = 256
WEB_MERCATOR_HALF = 20037508.342789244
BLACK_PIXEL_THRESHOLD = 4
COPY_CHUNK_SIZE = 16 * 1024 * 1024
SOURCE_MODES = {"import", "load_only"}
TRANSPARENCY_MODES = {"auto", "auto_black", "preserve"}
DEFAULT_TARGET_CRS = "EPSG:3857"
STRETCH_PERCENTILES = (2.0, 98.0)
RENDER_PROFILE_VERSION = 1
RENDER_PROFILE_SAMPLE_MAX_SIDE = 1024
PNG_COMPRESS_LEVEL = 1


@dataclass(frozen=True)
class UploadedRasterFile:
    filename: str
    content: bytes


ProgressCallback = Callable[[str, float | None, str], None]


def _require_rasterio() -> None:
    if rasterio is None or Resampling is None or from_bounds is None or WarpedVRT is None or transform_bounds is None:
        raise RuntimeError("当前环境缺少 rasterio，无法启用栅格数据能力，请先安装 backend/requirements.txt 中新增的依赖。")


def _new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _normalize_filename(raw_name: str) -> str:
    filename = Path(str(raw_name or "").replace("\\", "/")).name.strip()
    if not filename:
        raise ValueError("栅格文件名无效")
    return filename


def _normalize_source_mode(raw_mode: str) -> str:
    source_mode = str(raw_mode or "import").strip().lower()
    if source_mode not in SOURCE_MODES:
        raise ValueError("source_mode 仅支持 import 或 load_only")
    return source_mode


def _normalize_transparency_mode(raw_mode: str, suggested_mode: str) -> str:
    mode = str(raw_mode or "auto").strip().lower()
    if mode not in TRANSPARENCY_MODES:
        mode = "auto"
    return suggested_mode if mode == "auto" else mode


def _normalize_max_zoom(raw_value: int | None) -> int:
    parsed_value = int(raw_value if raw_value is not None else DEFAULT_MAX_ZOOM)
    return max(0, min(DEFAULT_MAX_ZOOM, parsed_value))


def _path_to_storage_string(path: Path, *, username: str) -> str:
    return to_user_scoped_relative(path, username=username)


def _optional_path_to_storage_string(raw_path: str | Path | None, *, username: str) -> str | None:
    if not raw_path:
        return None
    return _path_to_storage_string(Path(str(raw_path)).expanduser().resolve(), username=username)


def _emit_progress(
    progress_callback: ProgressCallback | None,
    *,
    stage: str,
    progress: float | None,
    message: str,
) -> None:
    if progress_callback is None:
        return
    progress_callback(stage, progress, message)


def _as_float_list(values: tuple[Any, ...] | list[Any]) -> list[float]:
    return [float(value) for value in values if value is not None]


def _as_int_list(values: tuple[Any, ...] | list[Any]) -> list[int]:
    return [int(value) for value in values if value is not None]


def _format_nodata_value(raw_value: Any) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, (list, tuple)):
        return ", ".join(str(value) for value in raw_value)
    return str(raw_value)


def _colorinterp_names(src) -> list[str]:
    try:
        return [str(item.name).lower() for item in src.colorinterp]
    except Exception:
        return []


def _has_alpha_band(src) -> bool:
    return any(name == "alpha" for name in _colorinterp_names(src))


def _to_wgs84_extent(src) -> tuple[dict[str, Any], list[float]]:
    if not src.crs:
        raise ValueError("栅格缺少坐标系，无法用于地图显示")

    min_x, min_y, max_x, max_y = transform_bounds(src.crs, "EPSG:4326", *src.bounds, densify_pts=21)
    bbox = [float(min_x), float(min_y), float(max_x), float(max_y)]
    center = [float((min_x + max_x) / 2), float((min_y + max_y) / 2)]
    return {"bbox": bbox, "center": center}, center


def _detect_xyz_root(source_path: Path) -> Path | None:
    candidates = (
        source_path.parent / f"{source_path.stem}_tiles",
        source_path.parent / f"{source_path.stem}.tiles",
        source_path.parent / "tiles" / source_path.stem,
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate.resolve()
    return None


def _detect_pyramid_state(source_path: Path, src) -> dict[str, Any]:
    xyz_root = _detect_xyz_root(source_path)
    if xyz_root is not None:
        return {
            "mode": "xyz",
            "path": xyz_root.as_posix(),
            "overviews": [],
        }

    overviews = sorted(set(int(value) for value in src.overviews(1) or [])) if src.count else []
    if overviews:
        return {
            "mode": "overview",
            "path": None,
            "overviews": overviews,
        }

    ovr_path = Path(f"{source_path}.ovr")
    if ovr_path.exists():
        return {
            "mode": "ovr",
            "path": ovr_path.resolve().as_posix(),
            "overviews": [],
        }

    rrd_path = Path(f"{source_path}.rrd")
    if rrd_path.exists():
        return {
            "mode": "rrd",
            "path": rrd_path.resolve().as_posix(),
            "overviews": [],
        }

    return {
        "mode": "none",
        "path": None,
        "overviews": [],
    }


def _sample_border_dark_ratio(src) -> float:
    if src.count < 3:
        return 0.0

    sample_height = min(int(src.height or 0), 256)
    sample_width = min(int(src.width or 0), 256)
    if sample_height <= 1 or sample_width <= 1:
        return 0.0

    sample = src.read(
        indexes=[1, 2, 3],
        out_shape=(3, sample_height, sample_width),
        masked=True,
        resampling=Resampling.nearest,
    )
    if np.ma.count(sample) == 0:
        return 0.0

    rgb = np.asarray(np.ma.filled(sample, 0), dtype=np.float32)
    mask = np.asarray(np.ma.getmaskarray(sample), dtype=bool)
    border_rgb = np.concatenate(
        [
            rgb[:, 0, :],
            rgb[:, -1, :],
            rgb[:, 1:-1, 0],
            rgb[:, 1:-1, -1],
        ],
        axis=1,
    )
    border_mask = np.concatenate(
        [
            mask[:, 0, :],
            mask[:, -1, :],
            mask[:, 1:-1, 0],
            mask[:, 1:-1, -1],
        ],
        axis=1,
    )
    valid_border = ~np.any(border_mask, axis=0)
    if not np.any(valid_border):
        return 0.0

    valid_rgb = border_rgb[:, valid_border]
    dark_pixels = np.all(valid_rgb <= BLACK_PIXEL_THRESHOLD, axis=0)
    return float(np.mean(dark_pixels)) if dark_pixels.size else 0.0


def _suggest_transparency_mode(src) -> str:
    if _has_alpha_band(src) or src.nodata is not None:
        return "preserve"
    if _sample_border_dark_ratio(src) >= 0.55:
        return "auto_black"
    return "preserve"


def _calculate_stretch_range(band: np.ndarray, mask: np.ndarray | None = None) -> tuple[float, float] | None:
    values = np.asarray(band, dtype=np.float32)
    if mask is not None:
        valid_values = values[~np.asarray(mask, dtype=bool)]
    else:
        valid_values = values.reshape(-1)
    if valid_values.size == 0:
        return None

    valid_values = valid_values[np.isfinite(valid_values)]
    if valid_values.size == 0:
        return None

    lower = float(np.nanpercentile(valid_values, STRETCH_PERCENTILES[0]))
    upper = float(np.nanpercentile(valid_values, STRETCH_PERCENTILES[1]))
    if not np.isfinite(lower) or not np.isfinite(upper) or upper <= lower:
        lower = float(np.nanmin(valid_values))
        upper = float(np.nanmax(valid_values))
    if not np.isfinite(lower) or not np.isfinite(upper) or upper <= lower:
        return None
    return lower, upper


def _build_render_profile(src) -> dict[str, Any] | None:
    read_indexes = list(range(1, min(int(src.count or 0), 4) + 1))
    if not read_indexes:
        return None

    width = max(int(src.width or 1), 1)
    height = max(int(src.height or 1), 1)
    longest_side = max(width, height, 1)
    scale = min(1.0, RENDER_PROFILE_SAMPLE_MAX_SIDE / float(longest_side))
    sample_width = max(1, int(round(width * scale)))
    sample_height = max(1, int(round(height * scale)))

    sample = src.read(
        indexes=read_indexes,
        out_shape=(len(read_indexes), sample_height, sample_width),
        masked=True,
        resampling=Resampling.average,
    )
    bands: list[dict[str, float] | None] = []
    for band_index in range(sample.shape[0]):
        band_mask = np.asarray(np.ma.getmaskarray(sample[band_index]), dtype=bool)
        stretch = _calculate_stretch_range(sample[band_index], band_mask)
        if stretch is None:
            bands.append(None)
            continue
        bands.append(
            {
                "lower": round(float(stretch[0]), 6),
                "upper": round(float(stretch[1]), 6),
            }
        )

    if not any(isinstance(item, dict) for item in bands):
        return None

    return {
        "version": RENDER_PROFILE_VERSION,
        "percentiles": [float(STRETCH_PERCENTILES[0]), float(STRETCH_PERCENTILES[1])],
        "sample_size": [sample_width, sample_height],
        "bands": bands,
    }


def _render_profile_band_stretch(render_profile: dict[str, Any] | None, band_index: int) -> tuple[float, float] | None:
    if not isinstance(render_profile, dict):
        return None
    bands = render_profile.get("bands")
    if not isinstance(bands, list) or band_index < 0 or band_index >= len(bands):
        return None
    entry = bands[band_index]
    if not isinstance(entry, dict):
        return None
    try:
        lower = float(entry.get("lower"))
        upper = float(entry.get("upper"))
    except Exception:
        return None
    if not np.isfinite(lower) or not np.isfinite(upper) or upper <= lower:
        return None
    return lower, upper


def _has_valid_render_profile(render_profile: Any) -> bool:
    if not isinstance(render_profile, dict):
        return False
    bands = render_profile.get("bands")
    if not isinstance(bands, list):
        return False
    return any(_render_profile_band_stretch(render_profile, index) is not None for index in range(len(bands)))


def _ensure_render_profile(session: Session, dataset: RasterDataset, src) -> dict[str, Any] | None:
    metadata = dict(dataset.metadata_ or {})
    render_profile = metadata.get("render_profile")
    if _has_valid_render_profile(render_profile):
        return render_profile

    render_profile = _build_render_profile(src)
    if render_profile is None:
        return None

    metadata["render_profile"] = render_profile
    dataset.metadata_ = metadata
    dataset.updated_at = datetime.utcnow()
    session.add(dataset)
    session.commit()
    return render_profile


def _build_missing_overview_factors(src) -> list[int]:
    if int(src.count or 0) <= 0:
        return []

    existing = sorted(set(int(value) for value in src.overviews(1) or []))
    longest_side = max(int(src.width or 0), int(src.height or 0), 0)
    factors: list[int] = []
    factor = 2
    while longest_side / factor > TILE_SIZE:
        if factor not in existing:
            factors.append(factor)
        factor *= 2
    if not existing and not factors and longest_side > TILE_SIZE:
        factors.append(2)
    return factors


def _build_native_overviews(source_path: Path, *, progress_callback: ProgressCallback | None) -> bool:
    _require_rasterio()
    try:
        with rasterio.open(source_path, "r+") as src:
            factors = _build_missing_overview_factors(src)
            if not factors:
                return False
            _emit_progress(
                progress_callback,
                stage="optimizing",
                progress=0.88,
                message=f"正在构建概览金字塔（{len(factors)} 级）",
            )
            src.build_overviews(factors, Resampling.average)
            try:
                src.update_tags(ns="rio_overview", resampling="average")
            except Exception:
                pass
    except RasterioError as exc:
        raise ValueError("当前格式暂不支持自动构建概览金字塔，请保留源文件自带概览或先转为 GeoTIFF 后再导入") from exc

    _emit_progress(
        progress_callback,
        stage="optimizing",
        progress=0.92,
        message="概览金字塔构建完成，正在刷新元数据",
    )
    return True


def _inspect_raster_path(
    source_path: Path,
    *,
    source_filename: str | None = None,
    max_zoom: int = DEFAULT_MAX_ZOOM,
    include_render_profile: bool = False,
) -> dict[str, Any]:
    _require_rasterio()

    suffix = source_path.suffix.lower()
    if suffix not in SUPPORTED_RASTER_EXTENSIONS:
        raise ValueError("当前仅支持 tif、tiff、img、jp2 等常见遥感影像格式")
    if not source_path.exists() or not source_path.is_file():
        raise ValueError("指定的栅格文件不存在")

    try:
        with rasterio.open(source_path) as src:
            extent, center = _to_wgs84_extent(src)
            pyramid_state = _detect_pyramid_state(source_path, src)
            has_alpha = _has_alpha_band(src)
            suggested_transparency_mode = _suggest_transparency_mode(src)
            nodata_value = _format_nodata_value(src.nodata)
            format_name = SUPPORTED_RASTER_EXTENSIONS.get(suffix) or str(src.driver or "unknown")
            metadata = {
                "driver": str(src.driver or "unknown"),
                "dtype": [str(value) for value in src.dtypes],
                "width": int(src.width or 0),
                "height": int(src.height or 0),
                "bounds_native": [float(value) for value in src.bounds],
                "raw_crs": str(src.crs.to_string() if src.crs else ""),
                "colorinterp": _colorinterp_names(src),
                "overviews": pyramid_state["overviews"],
                "border_dark_ratio": round(_sample_border_dark_ratio(src), 4),
            }
            if include_render_profile:
                render_profile = _build_render_profile(src)
                if render_profile is not None:
                    metadata["render_profile"] = render_profile

            return {
                "source_filename": source_filename or source_path.name,
                "title": Path(source_filename or source_path.name).stem,
                "format": format_name,
                "source_crs": str(src.crs.to_string() if src.crs else ""),
                "extent": extent,
                "center": center,
                "resolution": _as_float_list(src.res),
                "size": _as_int_list((src.width, src.height)),
                "band_count": int(src.count or 0),
                "has_alpha": has_alpha,
                "nodata_value": nodata_value,
                "pyramid_mode": pyramid_state["mode"],
                "pyramid_path": pyramid_state["path"],
                "max_zoom": _normalize_max_zoom(max_zoom),
                "suggested_transparency_mode": suggested_transparency_mode,
                "metadata": metadata,
            }
    except RasterioError as exc:
        raise ValueError("无法读取栅格文件，请确认文件格式受支持且文件未损坏") from exc


def inspect_uploaded_rasters(files: list[UploadedRasterFile], *, max_zoom: int = DEFAULT_MAX_ZOOM) -> list[dict[str, Any]]:
    if not files:
        raise ValueError("至少需要上传一个栅格文件")

    work_dir = Path(tempfile.mkdtemp(prefix="raster-inspect-"))
    try:
        items: list[dict[str, Any]] = []
        for file_item in files:
            filename = _normalize_filename(file_item.filename)
            temp_path = work_dir / filename
            temp_path.write_bytes(file_item.content)
            items.append(_inspect_raster_path(temp_path, source_filename=filename, max_zoom=max_zoom))
        return items
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def inspect_raster_source_path(source_path: str, *, max_zoom: int = DEFAULT_MAX_ZOOM) -> dict[str, Any]:
    normalized_path = Path(str(source_path or "").strip()).expanduser().resolve()
    return _inspect_raster_path(normalized_path, source_filename=normalized_path.name, max_zoom=max_zoom)


def _copy_file_with_progress(
    source_path: Path,
    target_path: Path,
    *,
    progress_callback: ProgressCallback | None,
) -> None:
    total_size = 0
    try:
        total_size = int(source_path.stat().st_size)
    except Exception:
        total_size = 0

    copied_size = 0
    with source_path.open("rb") as source_stream, target_path.open("wb") as target_stream:
        while True:
            chunk = source_stream.read(COPY_CHUNK_SIZE)
            if not chunk:
                break
            target_stream.write(chunk)
            copied_size += len(chunk)
            mapped_progress = 0.2
            if total_size > 0:
                mapped_progress = 0.12 + 0.58 * min(copied_size / total_size, 1.0)
            _emit_progress(
                progress_callback,
                stage="copying",
                progress=round(mapped_progress, 4),
                message="正在复制栅格源文件到库目录",
            )
    shutil.copystat(source_path, target_path)


def _serialize_dataset(dataset: RasterDataset) -> dict[str, Any]:
    return {
        "public_id": str(dataset.public_id or ""),
        "title": dataset.title,
        "description": dataset.description,
        "format": dataset.format,
        "source_filename": dataset.source_filename,
        "source_mode": dataset.source_mode,
        "source_path": dataset.source_path,
        "stored_path": dataset.stored_path,
        "pyramid_mode": dataset.pyramid_mode,
        "pyramid_path": dataset.pyramid_path,
        "max_zoom": int(dataset.max_zoom or DEFAULT_MAX_ZOOM),
        "import_status": dataset.import_status,
        "import_error": dataset.import_error,
        "source_crs": dataset.source_crs,
        "target_crs": dataset.target_crs,
        "band_count": int(dataset.band_count or 0),
        "has_alpha": bool(dataset.has_alpha),
        "nodata_value": dataset.nodata_value,
        "transparency_mode": dataset.transparency_mode,
        "owner_username": dataset.owner_username,
        "extent": dict(dataset.extent or {}),
        "center": list(dataset.center or []),
        "resolution": list(dataset.resolution or []),
        "size": list(dataset.size or []),
        "metadata": dict(dataset.metadata_ or {}),
        "created_at": dataset.created_at,
        "updated_at": dataset.updated_at,
    }


def list_raster_datasets(session: Session) -> list[dict[str, Any]]:
    datasets = session.exec(select(RasterDataset).order_by(RasterDataset.created_at.desc())).all()
    return [_serialize_dataset(dataset) for dataset in datasets]


def get_raster_dataset(session: Session, public_id: str) -> RasterDataset | None:
    return session.exec(select(RasterDataset).where(RasterDataset.public_id == public_id)).first()


def get_raster_dataset_summary(session: Session, public_id: str) -> dict[str, Any] | None:
    dataset = get_raster_dataset(session, public_id)
    return _serialize_dataset(dataset) if dataset else None


def _resolve_source_path(dataset: RasterDataset) -> Path | None:
    stored = dataset.stored_path if dataset.source_mode == "import" and dataset.stored_path else dataset.source_path
    return resolve_user_scoped_path(stored, username=dataset.owner_username)


def _resolve_pyramid_root(dataset: RasterDataset) -> Path | None:
    return resolve_user_scoped_path(dataset.pyramid_path, username=dataset.owner_username)


def import_raster_dataset(
    session: Session,
    *,
    uploaded_file: UploadedRasterFile | None = None,
    source_path: str | None = None,
    source_mode: str = "import",
    title_override: str | None = None,
    generate_pyramid: bool = False,
    max_zoom: int = DEFAULT_MAX_ZOOM,
    transparency_mode: str = "auto",
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    username = require_current_username()
    normalized_mode = _normalize_source_mode(source_mode)
    normalized_max_zoom = _normalize_max_zoom(max_zoom)
    public_id = _new_public_id("rd")
    dataset_root = get_user_grid_dir(username) / public_id
    dataset_root.mkdir(parents=True, exist_ok=True)

    _emit_progress(
        progress_callback,
        stage="validating",
        progress=0.05,
        message="正在校验栅格源信息",
    )

    if normalized_mode == "import":
        if uploaded_file is None and not str(source_path or "").strip():
            raise ValueError("导入模式需要上传栅格文件，或提供可访问的源文件路径")
        source_dir = dataset_root / "source"
        source_dir.mkdir(parents=True, exist_ok=True)
        if uploaded_file is not None:
            filename = _normalize_filename(uploaded_file.filename)
            stored_file_path = source_dir / filename
            _emit_progress(
                progress_callback,
                stage="copying",
                progress=0.26,
                message="正在写入上传的栅格文件",
            )
            stored_file_path.write_bytes(uploaded_file.content)
        else:
            resolved_original_path = Path(str(source_path).strip()).expanduser().resolve()
            if not resolved_original_path.exists() or not resolved_original_path.is_file():
                raise ValueError("提供的源文件路径不存在")
            filename = _normalize_filename(resolved_original_path.name)
            stored_file_path = source_dir / filename
            _copy_file_with_progress(
                resolved_original_path,
                stored_file_path,
                progress_callback=progress_callback,
            )
        _emit_progress(
            progress_callback,
            stage="inspecting",
            progress=0.8,
            message="正在提取栅格元数据",
        )
        inspection = _inspect_raster_path(
            stored_file_path,
            source_filename=filename,
            max_zoom=normalized_max_zoom,
            include_render_profile=True,
        )
        source_path_value = _path_to_storage_string(stored_file_path, username=username)
        stored_path_value = source_path_value
        resolved_source_path = stored_file_path
    else:
        if not str(source_path or "").strip():
            raise ValueError("仅加载模式需要提供可访问的源文件路径")
        resolved_source_path = Path(str(source_path).strip()).expanduser().resolve()
        _emit_progress(
            progress_callback,
            stage="inspecting",
            progress=0.52,
            message="正在检查原始路径栅格元数据",
        )
        inspection = _inspect_raster_path(
            resolved_source_path,
            source_filename=resolved_source_path.name,
            max_zoom=normalized_max_zoom,
            include_render_profile=True,
        )
        source_path_value = resolved_source_path.as_posix()
        stored_path_value = None

    managed_pyramid_root = False
    native_overviews_generated = False
    source_pyramid_mode = str(inspection["pyramid_mode"] or "none")
    optimization_mode = "none"
    pyramid_mode = str(inspection["pyramid_mode"] or "none")
    pyramid_path_value = _optional_path_to_storage_string(inspection.get("pyramid_path"), username=username)
    if generate_pyramid and pyramid_mode != "xyz":
        if normalized_mode == "import" and pyramid_mode == "none":
            native_overviews_generated = _build_native_overviews(resolved_source_path, progress_callback=progress_callback)
            inspection = _inspect_raster_path(
                resolved_source_path,
                source_filename=resolved_source_path.name,
                max_zoom=normalized_max_zoom,
                include_render_profile=True,
            )
            pyramid_mode = str(inspection["pyramid_mode"] or "none")
            pyramid_path_value = _optional_path_to_storage_string(inspection.get("pyramid_path"), username=username)
            optimization_mode = "native_overview" if native_overviews_generated else "none"
        elif normalized_mode == "load_only":
            managed_pyramid_path = dataset_root / "tiles"
            managed_pyramid_path.mkdir(parents=True, exist_ok=True)
            pyramid_mode = "generated_cache"
            pyramid_path_value = _path_to_storage_string(managed_pyramid_path, username=username)
            managed_pyramid_root = True
            optimization_mode = "tile_cache"
        elif pyramid_mode in {"overview", "ovr", "rrd"}:
            optimization_mode = "existing_overview"
    elif pyramid_mode == "none":
        pyramid_mode = "dynamic"

    if generate_pyramid and normalized_mode == "import" and pyramid_mode in {"overview", "ovr", "rrd"} and optimization_mode == "none":
        optimization_mode = "existing_overview"

    resolved_transparency_mode = _normalize_transparency_mode(
        transparency_mode,
        str(inspection["suggested_transparency_mode"] or "preserve"),
    )
    _emit_progress(
        progress_callback,
        stage="finalizing",
        progress=0.94,
        message="正在写入栅格数据集记录",
    )
    now = datetime.utcnow()
    dataset = RasterDataset(
        public_id=public_id,
        owner_username=username,
        title=title_override or str(inspection["title"]),
        description=f"由 {inspection['format']} 遥感影像建立的栅格数据集。",
        format=str(inspection["format"]),
        source_filename=str(inspection["source_filename"]),
        source_mode=normalized_mode,
        source_path=source_path_value,
        stored_path=stored_path_value,
        pyramid_mode=pyramid_mode,
        pyramid_path=pyramid_path_value,
        max_zoom=normalized_max_zoom,
        import_status="ready",
        import_error=None,
        source_crs=str(inspection["source_crs"] or ""),
        target_crs="EPSG:3857",
        band_count=int(inspection["band_count"] or 0),
        has_alpha=bool(inspection["has_alpha"]),
        nodata_value=inspection.get("nodata_value"),
        transparency_mode=resolved_transparency_mode,
        extent=dict(inspection["extent"] or {}),
        center=list(inspection["center"] or []),
        resolution=list(inspection["resolution"] or []),
        size=list(inspection["size"] or []),
        metadata_={
            **dict(inspection["metadata"] or {}),
            "generate_pyramid": bool(generate_pyramid),
            "managed_pyramid_root": managed_pyramid_root,
            "native_overviews_generated": native_overviews_generated,
            "source_pyramid_mode": source_pyramid_mode,
            "optimization_mode": optimization_mode,
            "suggested_transparency_mode": inspection["suggested_transparency_mode"],
        },
        created_at=now,
        updated_at=now,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    _emit_progress(
        progress_callback,
        stage="completed",
        progress=1.0,
        message="栅格数据集已导入完成",
    )
    return _serialize_dataset(dataset)


def delete_raster_dataset(session: Session, public_id: str) -> int:
    dataset = get_raster_dataset(session, public_id)
    if not dataset:
        return 0

    owner_username = str(dataset.owner_username or require_current_username())
    dataset_root = (get_user_grid_dir(owner_username) / str(dataset.public_id or "")).resolve()
    managed_pyramid_root = bool(dict(dataset.metadata_ or {}).get("managed_pyramid_root"))
    pyramid_root = _resolve_pyramid_root(dataset)

    session.delete(dataset)
    session.commit()

    if dataset_root.exists() and (dataset.source_mode == "import" or managed_pyramid_root):
        shutil.rmtree(dataset_root, ignore_errors=True)
        return 1

    if managed_pyramid_root and pyramid_root and pyramid_root.exists() and pyramid_root.is_dir():
        shutil.rmtree(pyramid_root, ignore_errors=True)

    return 1


def _tile_bounds_mercator(z_value: int, x_value: int, y_value: int) -> tuple[float, float, float, float]:
    tiles_per_axis = 2 ** int(z_value)
    tile_span = (WEB_MERCATOR_HALF * 2) / tiles_per_axis
    min_x = -WEB_MERCATOR_HALF + x_value * tile_span
    max_x = min_x + tile_span
    max_y = WEB_MERCATOR_HALF - y_value * tile_span
    min_y = max_y - tile_span
    return min_x, min_y, max_x, max_y


def _intersects_dataset_bounds(src, tile_bounds: tuple[float, float, float, float]) -> bool:
    dataset_bounds = transform_bounds(src.crs, "EPSG:3857", *src.bounds, densify_pts=21)
    min_x, min_y, max_x, max_y = tile_bounds
    ds_min_x, ds_min_y, ds_max_x, ds_max_y = dataset_bounds
    return not (max_x <= ds_min_x or max_y <= ds_min_y or min_x >= ds_max_x or min_y >= ds_max_y)


def _stretch_band_to_uint8(
    band: np.ndarray,
    mask: np.ndarray | None = None,
    *,
    stretch: tuple[float, float] | None = None,
) -> np.ndarray:
    values = np.asarray(band, dtype=np.float32)
    resolved_stretch = stretch or _calculate_stretch_range(values, mask)
    if resolved_stretch is None:
        return np.zeros(values.shape, dtype=np.uint8)

    lower, upper = resolved_stretch

    scaled = (values - lower) / (upper - lower)
    return np.clip(scaled * 255.0, 0, 255).astype(np.uint8)


def _encode_masked_tile(
    masked_data: np.ma.MaskedArray,
    *,
    has_alpha: bool,
    transparency_mode: str,
    render_profile: dict[str, Any] | None,
) -> bytes:
    if masked_data.ndim != 3 or masked_data.shape[0] <= 0:
        return transparent_png_bytes()

    raw_data = np.asarray(np.ma.filled(masked_data, 0), dtype=np.float32)
    raw_mask = np.asarray(np.ma.getmaskarray(masked_data), dtype=bool)
    if raw_mask.ndim == 0:
        raw_mask = np.zeros_like(raw_data, dtype=bool)

    if raw_data.shape[0] == 1:
        gray = _stretch_band_to_uint8(raw_data[0], raw_mask[0], stretch=_render_profile_band_stretch(render_profile, 0))
        rgb = np.stack([gray, gray, gray], axis=0)
        alpha = np.where(raw_mask[0], 0, 255).astype(np.uint8)
    elif raw_data.shape[0] == 2:
        gray = _stretch_band_to_uint8(raw_data[0], raw_mask[0], stretch=_render_profile_band_stretch(render_profile, 0))
        rgb = np.stack([gray, gray, gray], axis=0)
        alpha = _stretch_band_to_uint8(raw_data[1], raw_mask[1], stretch=_render_profile_band_stretch(render_profile, 1))
        alpha = np.where(raw_mask[0] | raw_mask[1], 0, alpha).astype(np.uint8)
    else:
        rgb = np.stack(
            [
                _stretch_band_to_uint8(raw_data[0], raw_mask[0], stretch=_render_profile_band_stretch(render_profile, 0)),
                _stretch_band_to_uint8(raw_data[1], raw_mask[1], stretch=_render_profile_band_stretch(render_profile, 1)),
                _stretch_band_to_uint8(raw_data[2], raw_mask[2], stretch=_render_profile_band_stretch(render_profile, 2)),
            ],
            axis=0,
        )
        combined_mask = raw_mask[0] | raw_mask[1] | raw_mask[2]
        if has_alpha and raw_data.shape[0] >= 4:
            alpha = _stretch_band_to_uint8(raw_data[3], raw_mask[3], stretch=_render_profile_band_stretch(render_profile, 3))
            alpha = np.where(combined_mask | raw_mask[3], 0, alpha).astype(np.uint8)
        else:
            alpha = np.where(combined_mask, 0, 255).astype(np.uint8)

    if transparency_mode == "auto_black":
        black_mask = np.all(rgb <= BLACK_PIXEL_THRESHOLD, axis=0)
        alpha = np.where(black_mask, 0, alpha).astype(np.uint8)

    rgba = np.dstack([rgb[0], rgb[1], rgb[2], alpha])
    image = Image.fromarray(rgba, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", compress_level=PNG_COMPRESS_LEVEL)
    return buffer.getvalue()


@lru_cache(maxsize=1)
def transparent_png_bytes() -> bytes:
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _existing_tile_file(tile_root: Path, *, z_value: int, x_value: int, y_value: int) -> Path | None:
    base_path = tile_root / str(z_value) / str(x_value)
    for extension in (".png", ".jpg", ".jpeg", ".webp"):
        candidate = base_path / f"{y_value}{extension}"
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def render_raster_tile(session: Session, public_id: str, *, z_value: int, x_value: int, y_value: int) -> tuple[bytes, str] | None:
    dataset = get_raster_dataset(session, public_id)
    if not dataset:
        return None

    if z_value < 0 or x_value < 0 or y_value < 0:
        return transparent_png_bytes(), "image/png"
    if z_value > int(dataset.max_zoom or DEFAULT_MAX_ZOOM):
        return transparent_png_bytes(), "image/png"

    tile_root = _resolve_pyramid_root(dataset)
    if tile_root is not None:
        existing_tile = _existing_tile_file(tile_root, z_value=z_value, x_value=x_value, y_value=y_value)
        if existing_tile is not None:
            suffix = existing_tile.suffix.lower()
            media_type = "image/png"
            if suffix in {".jpg", ".jpeg"}:
                media_type = "image/jpeg"
            elif suffix == ".webp":
                media_type = "image/webp"
            return existing_tile.read_bytes(), media_type

    source_path = _resolve_source_path(dataset)
    if source_path is None or not source_path.exists():
        return transparent_png_bytes(), "image/png"

    _require_rasterio()
    tile_bounds = _tile_bounds_mercator(z_value, x_value, y_value)
    with rasterio.open(source_path) as src:
        if not _intersects_dataset_bounds(src, tile_bounds):
            return transparent_png_bytes(), "image/png"
        render_profile = _ensure_render_profile(session, dataset, src)

        min_x, min_y, max_x, max_y = tile_bounds
        tile_transform = from_bounds(min_x, min_y, max_x, max_y, TILE_SIZE, TILE_SIZE)
        read_indexes = list(range(1, min(int(src.count or 0), 4) + 1))
        if not read_indexes:
            return transparent_png_bytes(), "image/png"

        with WarpedVRT(
            src,
            crs="EPSG:3857",
            transform=tile_transform,
            width=TILE_SIZE,
            height=TILE_SIZE,
            resampling=Resampling.bilinear,
            nodata=src.nodata,
        ) as vrt:
            masked = vrt.read(indexes=read_indexes, masked=True, resampling=Resampling.bilinear)

    png_bytes = _encode_masked_tile(
        masked,
        has_alpha=bool(dataset.has_alpha),
        transparency_mode=str(dataset.transparency_mode or "preserve"),
        render_profile=render_profile,
    )

    if tile_root is not None and str(dataset.pyramid_mode or "") == "generated_cache":
        tile_path = tile_root / str(z_value) / str(x_value) / f"{y_value}.png"
        tile_path.parent.mkdir(parents=True, exist_ok=True)
        tile_path.write_bytes(png_bytes)

    return png_bytes, "image/png"