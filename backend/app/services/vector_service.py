"""矢量数据导入与查询服务。

主要职责：
- 支持任意 SHP 与当前业务 CSV 点位格式导入。
- 在 SHP 导入阶段完成坐标系识别、投影转换与必要的轴序纠偏。
- 统一生成数据集、图层、要素、样式和 GeoJSON 预览数据，供地图页与矢量页共用。
"""

from __future__ import annotations

import csv
import io
import math
import re
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

import shapefile
from sqlmodel import Session, select

try:
    from pyproj import CRS, Transformer
    from pyproj.exceptions import CRSError
except Exception:  # pragma: no cover - optional dependency on Python 3.14
    CRS = None
    Transformer = None
    CRSError = None

from app.core.config import get_current_username
from app.models.vector_dataset import VectorDataset
from app.models.vector_feature import VectorFeature
from app.models.vector_layer import VectorLayer

CSV_REQUIRED_FIELDS = [
    "文件夹",
    "名称",
    "经度",
    "纬度",
    "海拔",
    "文本显示风格",
    "图标样式",
    "Comment",
]
LABEL_FIELD_CANDIDATES = ["name", "名称", "NAME", "Name", "title", "TITLE"]
DMS_RE = re.compile(r"^\s*([+-]?\d+)\s*[°º]\s*(\d+)\s*['’′]\s*(\d+(?:\.\d+)?)\s*(?:\"\"|\"|″)?\s*$")
TEXT_DECODE_ENCODINGS = ("utf-8-sig", "utf-8", "gb18030", "gbk")


@dataclass(frozen=True)
class UploadedVectorFile:
    filename: str
    content: bytes


@dataclass(frozen=True)
class ParsedFeature:
    feature_key: str
    geometry_type: str
    geometry: dict[str, Any]
    properties: dict[str, Any]
    bbox: tuple[float, float, float, float] | None
    source_row_index: int | None = None


@dataclass(frozen=True)
class ParsedDataset:
    title: str
    description: str
    format: str
    source_filename: str
    source_crs: str | None
    target_crs: str
    geometry_type: str | None
    file_group: list[dict[str, Any]]
    extent: dict[str, Any]
    style_config: dict[str, Any]
    metadata: dict[str, Any]
    features: list[ParsedFeature]
    label_field: str | None = None


def _new_public_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _decode_text_content(raw_bytes: bytes) -> str:
    for encoding_name in TEXT_DECODE_ENCODINGS:
        try:
            return raw_bytes.decode(encoding_name)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace")


def _make_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple, set)):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _make_json_safe(raw_value) for key, raw_value in value.items()}
    return str(value)


def _guess_label_field(properties: dict[str, Any]) -> str | None:
    for field_name in LABEL_FIELD_CANDIDATES:
        value = properties.get(field_name)
        if isinstance(value, str) and value.strip():
            return field_name
    return None


def _base_geometry_type(geometry_type: str | None) -> str | None:
    normalized = str(geometry_type or "").strip()
    if not normalized:
        return None
    if normalized.startswith("Multi"):
        return normalized[5:]
    return normalized


def default_style_for_geometry(geometry_type: str | None, label_field: str | None = None) -> dict[str, Any]:
    base_type = _base_geometry_type(geometry_type)
    if base_type == "Point":
        return {
            "circleColor": "#f97316",
            "circleRadius": 6,
            "circleStrokeColor": "#ffffff",
            "circleStrokeWidth": 1.2,
            "labelField": label_field or "name",
        }
    if base_type == "LineString":
        return {
            "lineColor": "#0284c7",
            "lineWidth": 3,
            "labelField": label_field,
        }
    return {
        "fillColor": "#10b981",
        "fillOpacity": 0.24,
        "lineColor": "#047857",
        "lineWidth": 2,
        "labelField": label_field,
    }


def _parse_dms(raw_value: Any) -> float:
    text = str(raw_value or "").strip()
    matched = DMS_RE.match(text)
    if not matched:
        raise ValueError(f"无法解析度分秒坐标：{text}")

    degree = float(matched.group(1))
    minute = float(matched.group(2))
    second = float(matched.group(3))
    sign = -1 if degree < 0 else 1
    absolute_degree = abs(degree) + minute / 60 + second / 3600
    return sign * absolute_degree


def _parse_float(raw_value: Any) -> float | None:
    text = str(raw_value or "").strip()
    if not text:
        return None
    return float(text)


def _iter_coordinates(raw_value: Any) -> Iterable[tuple[float, float]]:
    if not isinstance(raw_value, (list, tuple)) or not raw_value:
        return []
    first = raw_value[0]
    if isinstance(first, (int, float)) and len(raw_value) >= 2:
        return [(float(raw_value[0]), float(raw_value[1]))]

    pairs: list[tuple[float, float]] = []
    for item in raw_value:
        pairs.extend(list(_iter_coordinates(item)))
    return pairs


def _compute_bbox(geometry: dict[str, Any] | None) -> tuple[float, float, float, float] | None:
    if not isinstance(geometry, dict):
        return None
    coordinates = list(_iter_coordinates(geometry.get("coordinates")))
    if not coordinates:
        return None
    xs = [item[0] for item in coordinates]
    ys = [item[1] for item in coordinates]
    return (min(xs), min(ys), max(xs), max(ys))


def _bbox_is_lon_lat(bbox: tuple[float, float, float, float] | None) -> bool:
    if bbox is None:
        return True
    min_x, min_y, max_x, max_y = bbox
    return all(
        [
            -180.0 <= float(min_x) <= 180.0,
            -180.0 <= float(max_x) <= 180.0,
            -90.0 <= float(min_y) <= 90.0,
            -90.0 <= float(max_y) <= 90.0,
        ]
    )


def _swap_geometry_xy(geometry: dict[str, Any]) -> dict[str, Any]:
    def swap_coordinates(raw_value: Any) -> Any:
        if not isinstance(raw_value, (list, tuple)) or not raw_value:
            return raw_value
        first = raw_value[0]
        if isinstance(first, (int, float)) and len(raw_value) >= 2:
            extras = list(raw_value[2:])
            return [float(raw_value[1]), float(raw_value[0]), *extras]
        return [swap_coordinates(item) for item in raw_value]

    return {
        "type": geometry.get("type"),
        "coordinates": swap_coordinates(geometry.get("coordinates")),
    }


def _extent_from_features(features: list[ParsedFeature]) -> dict[str, Any]:
    bboxes = [feature.bbox for feature in features if feature.bbox is not None]
    if not bboxes:
        return {}

    min_x = min(item[0] for item in bboxes)
    min_y = min(item[1] for item in bboxes)
    max_x = max(item[2] for item in bboxes)
    max_y = max(item[3] for item in bboxes)
    return {
        "bbox": [min_x, min_y, max_x, max_y],
        "center": [(min_x + max_x) / 2, (min_y + max_y) / 2],
    }


def _transform_geometry(geometry: dict[str, Any], transformer: Transformer | None) -> dict[str, Any]:
    if not transformer:
        return geometry

    def transform_coordinates(raw_value: Any) -> Any:
        if not isinstance(raw_value, (list, tuple)) or not raw_value:
            return raw_value
        first = raw_value[0]
        if isinstance(first, (int, float)) and len(raw_value) >= 2:
            x_value, y_value = transformer.transform(float(raw_value[0]), float(raw_value[1]))
            extras = [float(item) for item in raw_value[2:]]
            return [x_value, y_value, *extras]
        return [transform_coordinates(item) for item in raw_value]

    return {
        "type": geometry.get("type"),
        "coordinates": transform_coordinates(geometry.get("coordinates")),
    }


def _mercator_to_wgs84(x_value: float, y_value: float) -> tuple[float, float]:
    longitude = x_value / 20037508.34 * 180
    latitude = y_value / 20037508.34 * 180
    latitude = 180 / math.pi * (2 * math.atan(math.exp(latitude * math.pi / 180)) - math.pi / 2)
    return longitude, latitude


class _CallableTransformer:
    def __init__(self, transform_function):
        self._transform_function = transform_function

    def transform(self, x_value: float, y_value: float) -> tuple[float, float]:
        return self._transform_function(x_value, y_value)


def _build_csv_dataset(files: list[UploadedVectorFile], title_override: str | None = None) -> ParsedDataset:
    if len(files) != 1:
        raise ValueError("CSV 导入一次只支持一个文件")

    file_item = files[0]
    return _build_csv_dataset_from_text(
        _decode_text_content(file_item.content),
        source_filename=file_item.filename,
        file_size=len(file_item.content),
        title_override=title_override,
    )


def _build_csv_dataset_from_text(
    text: str,
    *,
    source_filename: str,
    file_size: int,
    title_override: str | None = None,
) -> ParsedDataset:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV 缺少表头")

    missing_fields = [field_name for field_name in CSV_REQUIRED_FIELDS if field_name not in reader.fieldnames]
    if missing_fields:
        raise ValueError(f"CSV 缺少必要字段：{', '.join(missing_fields)}")

    features: list[ParsedFeature] = []
    for row_index, row in enumerate(reader, start=1):
        longitude = _parse_dms(row.get("经度"))
        latitude = _parse_dms(row.get("纬度"))
        altitude = _parse_float(row.get("海拔"))
        name = str(row.get("名称") or f"点位 {row_index}").strip() or f"点位 {row_index}"
        geometry = {
            "type": "Point",
            "coordinates": [longitude, latitude],
        }
        properties = {
            **{field_name: _make_json_safe(row.get(field_name)) for field_name in reader.fieldnames},
            "name": name,
            "folder": str(row.get("文件夹") or "").strip(),
            "altitude": altitude,
            "text_style": str(row.get("文本显示风格") or "").strip(),
            "icon_style": str(row.get("图标样式") or "").strip(),
            "comment": str(row.get("Comment") or "").strip(),
        }
        features.append(
            ParsedFeature(
                feature_key=f"csv-row-{row_index}",
                geometry_type="Point",
                geometry=geometry,
                properties=properties,
                bbox=(longitude, latitude, longitude, latitude),
                source_row_index=row_index,
            )
        )

    label_field = "name"
    style_config = default_style_for_geometry("Point", label_field)
    return ParsedDataset(
        title=title_override or Path(source_filename).stem,
        description="由业务点位 CSV 导入的点图层。",
        format="csv",
        source_filename=source_filename,
        source_crs="EPSG:4326",
        target_crs="EPSG:4326",
        geometry_type="Point",
        file_group=[{"name": source_filename, "size": file_size}],
        extent=_extent_from_features(features),
        style_config=style_config,
        metadata={
            "field_names": list(reader.fieldnames),
            "import_kind": "csv_point_file",
        },
        features=features,
        label_field=label_field,
    )


def _build_csv_dataset_from_path(source_path: Path, title_override: str | None = None) -> ParsedDataset:
    if not source_path.exists() or not source_path.is_file():
        raise ValueError("指定的 CSV 源文件不存在")
    raw_bytes = source_path.read_bytes()
    return _build_csv_dataset_from_text(
        _decode_text_content(raw_bytes),
        source_filename=source_path.name,
        file_size=int(source_path.stat().st_size),
        title_override=title_override,
    )


def _collect_shp_files(files: list[UploadedVectorFile], work_dir: Path) -> tuple[Path, Path, list[dict[str, Any]]]:
    file_group = [{"name": file_item.filename, "size": len(file_item.content)} for file_item in files]
    if len(files) == 1 and files[0].filename.lower().endswith(".zip"):
        archive_path = work_dir / files[0].filename
        archive_path.write_bytes(files[0].content)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(work_dir)
    else:
        for file_item in files:
            (work_dir / file_item.filename).write_bytes(file_item.content)

    shp_files = list(work_dir.rglob("*.shp"))
    if not shp_files:
        raise ValueError("没有找到可导入的 SHP 文件")
    if len(shp_files) > 1:
        raise ValueError("一次只支持导入一个 SHP 数据集，请分别上传")

    shp_path = shp_files[0]
    prj_path = shp_path.with_suffix(".prj")
    if not prj_path.exists():
        raise ValueError("SHP 缺少 .prj 文件，当前版本要求明确坐标系后再导入")
    return shp_path, prj_path, file_group


def _collect_shp_source_path(source_path: Path, work_dir: Path) -> tuple[Path, Path, list[dict[str, Any]]]:
    if not source_path.exists() or not source_path.is_file():
        raise ValueError("指定的矢量源文件不存在")

    suffix = source_path.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(source_path) as archive:
            archive.extractall(work_dir)
        shp_path, prj_path, _ = _collect_shp_files([], work_dir)
        return shp_path, prj_path, [{"name": source_path.name, "size": int(source_path.stat().st_size)}]

    if suffix != ".shp":
        raise ValueError("当前服务路径导入仅支持 CSV、SHP 或 ZIP 包")

    prj_path = source_path.with_suffix(".prj")
    if not prj_path.exists():
        raise ValueError("SHP 缺少同目录同名 .prj 文件，当前版本要求明确坐标系后再导入")

    file_group = []
    for sibling_path in sorted(source_path.parent.glob(f"{source_path.stem}.*")):
        if sibling_path.is_file():
            file_group.append({"name": sibling_path.name, "size": int(sibling_path.stat().st_size)})
    return source_path.resolve(), prj_path.resolve(), file_group


def _build_transformer_from_prj(prj_path: Path) -> tuple[str | None, Transformer | None, bool]:
    prj_text = prj_path.read_text(encoding="utf-8", errors="ignore").strip()
    if not prj_text:
        raise ValueError("PRJ 文件为空，无法判断坐标系")

    upper_text = prj_text.upper()
    is_projected_crs = any(token in upper_text for token in ["PROJCS[", "PROJCRS[", "PROJECTION[", "CONVERSION["])

    if CRS is not None and Transformer is not None:
        source_crs = CRS.from_wkt(prj_text)
        authority = source_crs.to_authority()
        epsg_code = source_crs.to_epsg()
        source_crs_text = (
            (f"{authority[0]}:{authority[1]}" if authority and len(authority) == 2 else "")
            or (f"EPSG:{epsg_code}" if epsg_code else "")
            or str(source_crs.name or "UNKNOWN")
        )
        if len(source_crs_text) > 64:
            source_crs_text = str(source_crs.name or "UNKNOWN")[:64]
        is_geographic_crs = bool(getattr(source_crs, "is_geographic", False))
        transformer = Transformer.from_crs(source_crs, CRS.from_epsg(4326), always_xy=True)
        return source_crs_text, transformer, is_geographic_crs

    if any(token in upper_text for token in ["PSEUDO-MERCATOR", "WEB_MERCATOR", 'AUTHORITY["EPSG","3857"]', 'AUTHORITY["EPSG","102100"]', 'AUTHORITY["EPSG","900913"]']):
        return "EPSG:3857", _CallableTransformer(_mercator_to_wgs84), False

    if not is_projected_crs and any(token in upper_text for token in ["WGS_1984", "WGS 84", 'AUTHORITY["EPSG","4326"]', 'AUTHORITY["EPSG","4490"]', "CGCS2000"]):
        return "EPSG:4326", None, True

    raise ValueError("当前环境缺少 pyproj，无法自动转换该 SHP 的投影；请先转换到 EPSG:4326 后再导入")


def _build_shp_dataset(files: list[UploadedVectorFile], title_override: str | None = None) -> ParsedDataset:
    with tempfile.TemporaryDirectory(prefix="vector_import_") as temp_dir:
        work_dir = Path(temp_dir)
        shp_path, prj_path, file_group = _collect_shp_files(files, work_dir)
        return _build_shp_dataset_from_paths(
            shp_path,
            prj_path,
            file_group=file_group,
            title_override=title_override,
        )


def _build_shp_dataset_from_paths(
    shp_path: Path,
    prj_path: Path,
    *,
    file_group: list[dict[str, Any]],
    title_override: str | None = None,
) -> ParsedDataset:
    source_crs, transformer, is_geographic_crs = _build_transformer_from_prj(prj_path)
    reader = shapefile.Reader(str(shp_path))
    field_names = [field[0] for field in reader.fields[1:]]

    features: list[ParsedFeature] = []
    label_field: str | None = None
    geometry_type: str | None = None
    axis_swap_applied = False
    for row_index, shape_record in enumerate(reader.iterShapeRecords(), start=1):
        raw_geometry = shape_record.shape.__geo_interface__
        if not isinstance(raw_geometry, dict) or not raw_geometry.get("type"):
            continue
        transformed_geometry = _transform_geometry(raw_geometry, transformer)
        bbox = _compute_bbox(transformed_geometry)

        if is_geographic_crs and not _bbox_is_lon_lat(bbox):
            swapped_geometry = _transform_geometry(_swap_geometry_xy(raw_geometry), transformer)
            swapped_bbox = _compute_bbox(swapped_geometry)
            if _bbox_is_lon_lat(swapped_bbox):
                transformed_geometry = swapped_geometry
                bbox = swapped_bbox
                axis_swap_applied = True

        if not _bbox_is_lon_lat(bbox):
            raise ValueError(
                f"SHP 转换后的坐标超出经纬度范围：第 {row_index} 条要素疑似存在错误轴序或 .prj 定义异常，请校核源数据后重试"
            )

        current_geometry_type = str(transformed_geometry.get("type") or "").strip() or None
        if current_geometry_type and geometry_type is None:
            geometry_type = current_geometry_type

        properties = {
            field_name: _make_json_safe(value)
            for field_name, value in zip(field_names, shape_record.record)
        }
        if not label_field:
            label_field = _guess_label_field(properties)
        if label_field and label_field in properties and "name" not in properties:
            properties["name"] = properties[label_field]
        feature_key = str(properties.get(label_field or "") or f"feature-{row_index}")
        features.append(
            ParsedFeature(
                feature_key=feature_key,
                geometry_type=current_geometry_type or "Unknown",
                geometry=transformed_geometry,
                properties=properties,
                bbox=bbox,
                source_row_index=row_index,
            )
        )

    style_config = default_style_for_geometry(geometry_type, label_field)
    return ParsedDataset(
        title=title_override or shp_path.stem,
        description="由 SHP 数据集导入的矢量图层。",
        format="shp",
        source_filename=shp_path.name,
        source_crs=source_crs,
        target_crs="EPSG:4326",
        geometry_type=geometry_type,
        file_group=file_group,
        extent=_extent_from_features(features),
        style_config=style_config,
        metadata={
            "field_names": field_names,
            "import_kind": "shapefile",
            "axis_swap_applied": axis_swap_applied,
        },
        features=features,
        label_field=label_field,
    )


def _normalize_vector_parse_error(exc: Exception) -> ValueError:
    if isinstance(exc, ValueError):
        return exc
    if isinstance(exc, csv.Error):
        return ValueError("CSV 内容格式无效，无法解析矢量数据")
    if isinstance(exc, zipfile.BadZipFile):
        return ValueError("ZIP 压缩包无效，无法解析矢量数据")
    if isinstance(exc, shapefile.ShapefileException):
        return ValueError("无法解析 SHP 数据集，请确认 .shp/.shx/.dbf/.prj 文件完整且未损坏")
    if CRSError is not None and isinstance(exc, CRSError):
        return ValueError("PRJ 坐标系定义无效，无法解析该 SHP 数据集")
    if isinstance(exc, OSError):
        return ValueError("读取矢量源文件失败")
    return ValueError("矢量数据解析失败")


def _build_shp_dataset_from_source_path(source_path: Path, title_override: str | None = None) -> ParsedDataset:
    with tempfile.TemporaryDirectory(prefix="vector_path_import_") as temp_dir:
        work_dir = Path(temp_dir)
        shp_path, prj_path, file_group = _collect_shp_source_path(source_path, work_dir)
        return _build_shp_dataset_from_paths(
            shp_path,
            prj_path,
            file_group=file_group,
            title_override=title_override,
        )


def parse_vector_upload(files: list[UploadedVectorFile], title_override: str | None = None) -> ParsedDataset:
    if not files:
        raise ValueError("至少需要上传一个文件")

    try:
        normalized_names = [str(file_item.filename or "").lower() for file_item in files]
        if len(files) == 1 and normalized_names[0].endswith(".csv"):
            return _build_csv_dataset(files, title_override)
        if any(filename.endswith(".shp") for filename in normalized_names) or (len(files) == 1 and normalized_names[0].endswith(".zip")):
            return _build_shp_dataset(files, title_override)
        raise ValueError("当前仅支持 CSV、SHP 组件文件或包含单个 SHP 的 ZIP 包")
    except Exception as exc:
        raise _normalize_vector_parse_error(exc) from exc


def parse_vector_source_path(source_path: str, title_override: str | None = None) -> ParsedDataset:
    try:
        resolved_path = Path(str(source_path or "").strip()).expanduser().resolve()
        suffix = resolved_path.suffix.lower()
        if suffix == ".csv":
            return _build_csv_dataset_from_path(resolved_path, title_override)
        if suffix in {".shp", ".zip"}:
            return _build_shp_dataset_from_source_path(resolved_path, title_override)
        raise ValueError("当前服务路径导入仅支持 CSV、SHP 或 ZIP 包")
    except Exception as exc:
        raise _normalize_vector_parse_error(exc) from exc


def _persist_vector_dataset(session: Session, parsed_dataset: ParsedDataset) -> dict[str, Any]:
    owner_username = get_current_username()
    now = datetime.utcnow()

    dataset = VectorDataset(
        public_id=_new_public_id("vd"),
        owner_username=owner_username,
        title=parsed_dataset.title,
        description=parsed_dataset.description,
        format=parsed_dataset.format,
        source_filename=parsed_dataset.source_filename,
        import_status="ready",
        import_error=None,
        source_crs=parsed_dataset.source_crs,
        target_crs=parsed_dataset.target_crs,
        geometry_type=parsed_dataset.geometry_type,
        primary_file_path=parsed_dataset.source_filename,
        file_group=parsed_dataset.file_group,
        extent=parsed_dataset.extent,
        style_config=parsed_dataset.style_config,
        metadata_=parsed_dataset.metadata,
        parsed_feature_count=len(parsed_dataset.features),
        created_at=now,
        updated_at=now,
    )
    session.add(dataset)
    session.flush()

    layer = VectorLayer(
        public_id=_new_public_id("vl"),
        dataset_id=int(dataset.id or 0),
        name=parsed_dataset.title,
        display_name=parsed_dataset.title,
        role="dataset",
        geometry_type=parsed_dataset.geometry_type,
        source_crs=parsed_dataset.target_crs,
        label_field=parsed_dataset.label_field,
        feature_count=len(parsed_dataset.features),
        is_visible=True,
        sort_order=0,
        style_config=parsed_dataset.style_config,
        filter_config={},
        metadata_={"source_filename": parsed_dataset.source_filename},
        created_at=now,
        updated_at=now,
    )
    session.add(layer)
    session.flush()

    feature_rows: list[VectorFeature] = []
    for row_index, feature in enumerate(parsed_dataset.features, start=1):
        min_x = min_y = max_x = max_y = None
        if feature.bbox is not None:
            min_x, min_y, max_x, max_y = feature.bbox
        feature_rows.append(
            VectorFeature(
                public_id=_new_public_id("vf"),
                dataset_id=int(dataset.id or 0),
                layer_id=int(layer.id or 0),
                feature_key=feature.feature_key or f"feature-{row_index}",
                geometry_type=feature.geometry_type,
                source_row_index=feature.source_row_index,
                geometry=feature.geometry,
                properties=feature.properties,
                min_x=min_x,
                min_y=min_y,
                max_x=max_x,
                max_y=max_y,
                created_at=now,
                updated_at=now,
            )
        )

    session.add_all(feature_rows)
    session.commit()
    session.refresh(dataset)
    return serialize_dataset(session, dataset)


def import_vector_dataset(session: Session, files: list[UploadedVectorFile], title_override: str | None = None) -> dict[str, Any]:
    parsed_dataset = parse_vector_upload(files, title_override)
    return _persist_vector_dataset(session, parsed_dataset)


def import_vector_dataset_from_source_path(
    session: Session,
    source_path: str,
    title_override: str | None = None,
) -> dict[str, Any]:
    parsed_dataset = parse_vector_source_path(source_path, title_override)
    return _persist_vector_dataset(session, parsed_dataset)


def serialize_layer(layer: VectorLayer) -> dict[str, Any]:
    return {
        "public_id": str(layer.public_id or ""),
        "name": layer.name,
        "display_name": layer.display_name or layer.name,
        "geometry_type": layer.geometry_type,
        "label_field": layer.label_field,
        "feature_count": int(layer.feature_count or 0),
        "is_visible": bool(layer.is_visible),
        "sort_order": int(layer.sort_order or 0),
        "style_config": dict(layer.style_config or {}),
    }


def serialize_dataset(session: Session, dataset: VectorDataset) -> dict[str, Any]:
    layers = session.exec(
        select(VectorLayer)
        .where(VectorLayer.dataset_id == int(dataset.id or 0))
        .order_by(VectorLayer.sort_order, VectorLayer.created_at)
    ).all()
    return {
        "public_id": str(dataset.public_id or ""),
        "title": dataset.title,
        "description": dataset.description,
        "format": dataset.format,
        "source_filename": dataset.source_filename,
        "import_status": dataset.import_status,
        "import_error": dataset.import_error,
        "source_crs": dataset.source_crs,
        "target_crs": dataset.target_crs,
        "geometry_type": dataset.geometry_type,
        "parsed_feature_count": int(dataset.parsed_feature_count or 0),
        "owner_username": dataset.owner_username,
        "extent": dict(dataset.extent or {}),
        "style_config": dict(dataset.style_config or {}),
        "metadata": dict(dataset.metadata_ or {}),
        "layers": [serialize_layer(layer) for layer in layers],
        "created_at": dataset.created_at,
        "updated_at": dataset.updated_at,
    }


def list_vector_datasets(session: Session) -> list[dict[str, Any]]:
    datasets = session.exec(select(VectorDataset).order_by(VectorDataset.created_at.desc())).all()
    return [serialize_dataset(session, dataset) for dataset in datasets]


def get_vector_dataset(session: Session, public_id: str) -> VectorDataset | None:
    return session.exec(select(VectorDataset).where(VectorDataset.public_id == public_id)).first()


def get_vector_dataset_summary(session: Session, public_id: str) -> dict[str, Any] | None:
    dataset = get_vector_dataset(session, public_id)
    if not dataset:
        return None
    return serialize_dataset(session, dataset)


def get_vector_dataset_geojson(session: Session, public_id: str) -> dict[str, Any] | None:
    dataset = get_vector_dataset(session, public_id)
    if not dataset:
        return None

    features = session.exec(
        select(VectorFeature)
        .where(VectorFeature.dataset_id == int(dataset.id or 0))
        .order_by(VectorFeature.id)
    ).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": feature.public_id or feature.feature_key,
                "geometry": dict(feature.geometry or {}),
                "properties": {
                    **dict(feature.properties or {}),
                    "_feature_key": feature.feature_key,
                    "_dataset_public_id": dataset.public_id,
                },
            }
            for feature in features
        ],
        "metadata": {
            "dataset_public_id": dataset.public_id,
            "title": dataset.title,
            "geometry_type": dataset.geometry_type,
            "extent": dict(dataset.extent or {}),
        },
    }


def update_vector_dataset_style(session: Session, public_id: str, style_config: dict[str, Any]) -> dict[str, Any] | None:
    dataset = get_vector_dataset(session, public_id)
    if not dataset:
        return None

    normalized_style = {str(key): _make_json_safe(value) for key, value in dict(style_config or {}).items()}
    dataset.style_config = {
        **dict(dataset.style_config or {}),
        **normalized_style,
    }
    dataset.updated_at = datetime.utcnow()
    session.add(dataset)

    layers = session.exec(select(VectorLayer).where(VectorLayer.dataset_id == int(dataset.id or 0))).all()
    for layer in layers:
        layer.style_config = {
            **dict(layer.style_config or {}),
            **normalized_style,
        }
        layer.updated_at = dataset.updated_at
        session.add(layer)

    session.commit()
    session.refresh(dataset)
    return serialize_dataset(session, dataset)


def delete_vector_dataset(session: Session, public_id: str) -> int:
    dataset = get_vector_dataset(session, public_id)
    if not dataset:
        return 0

    layers = session.exec(select(VectorLayer).where(VectorLayer.dataset_id == int(dataset.id or 0))).all()
    features = session.exec(select(VectorFeature).where(VectorFeature.dataset_id == int(dataset.id or 0))).all()
    for feature in features:
        session.delete(feature)
    for layer in layers:
        session.delete(layer)
    session.delete(dataset)
    session.commit()
    return 1