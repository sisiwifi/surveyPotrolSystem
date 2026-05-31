"""统一数据库会话与运行时重置入口。

主要职责：
- 将原本 system.db + users/*/app.db 的多 SQLite 结构收束为单一 PostgreSQL 主库。
- 在应用启动时自动创建目标数据库、建表并补齐种子用户与默认分类。
- 为现有服务层继续提供 get_system_session / get_session 兼容入口，减少本轮重构的连锁改动。

数据库连接参数见 app.core.config，接口契约说明见 backend/api_services.md。
"""

from __future__ import annotations

import re
from threading import RLock

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import (
    DATABASE_ADMIN_URL,
    DATABASE_URL,
    EMBEDDED_POSTGRES_ENABLED,
    LEGACY_DB_PATH,
    MEDIA_ROOT_DIR,
    POSTGRES_BIN_DIR,
    SYSTEM_DB_PATH,
    TEMP_ROOT_DIR,
    TRASH_ROOT_DIR,
    USERS_DATA_DIR,
    VIEWER_ICON_DIR,
    clear_directory,
)

_engine: Engine | None = None
_db_initialized = False
_engine_lock = RLock()
_DATABASE_NAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$")


def _ensure_embedded_runtime_ready() -> None:
    if not EMBEDDED_POSTGRES_ENABLED:
        raise RuntimeError(
            "本工程以内置 PostgreSQL 作为固定运行架构。"
            "当前运行时配置不是内置模式。"
            "如果你要在本机恢复项目要求的内置运行时配置，可自行执行 "
            "build\\repair_embedded_pg.bat。"
        )

    required_files = (
        POSTGRES_BIN_DIR / "pg_ctl.exe",
        POSTGRES_BIN_DIR / "initdb.exe",
    )
    missing_files = [str(path) for path in required_files if not path.exists()]
    if not missing_files:
        return

    missing_paths = ", ".join(missing_files)
    raise RuntimeError(
        "当前机器缺少本工程要求的内置 PostgreSQL 运行时："
        f"{missing_paths}。"
        "如果你要在本机补齐该运行时，可自行执行 "
        "build\\repair_embedded_pg.bat。"
    )


def _load_all_models() -> tuple[type, ...]:
    from app.models.album import Album
    from app.models.album_image import AlbumImage
    from app.models.category import Category
    from app.models.collection import Collection
    from app.models.collection_image import CollectionImage
    from app.models.image_asset import ImageAsset
    from app.models.photo_geo_link import PhotoGeoLink
    from app.models.photo_location import PhotoLocation
    from app.models.raster_dataset import RasterDataset
    from app.models.recent_import_operation import RecentImportOperation
    from app.models.tag import Tag
    from app.models.trash_entry import TrashEntry
    from app.models.user import User
    from app.models.vector_dataset import VectorDataset
    from app.models.vector_feature import VectorFeature
    from app.models.vector_layer import VectorLayer

    return (
        User,
        Collection,
        CollectionImage,
        Album,
        AlbumImage,
        Category,
        ImageAsset,
        PhotoGeoLink,
        PhotoLocation,
        RasterDataset,
        RecentImportOperation,
        Tag,
        TrashEntry,
        VectorDataset,
        VectorLayer,
        VectorFeature,
    )


def _extract_database_name(database_url: str) -> str:
    database_name = database_url.rsplit("/", 1)[-1].split("?", 1)[0].strip()
    if not _DATABASE_NAME_RE.fullmatch(database_name):
        raise RuntimeError(f"非法数据库名：{database_name!r}")
    return database_name


def _create_database_if_missing() -> None:
    _ensure_embedded_runtime_ready()
    database_name = _extract_database_name(DATABASE_URL)
    admin_engine = create_engine(DATABASE_ADMIN_URL, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": database_name},
            ).scalar()
            if not exists:
                connection.exec_driver_sql(f'CREATE DATABASE "{database_name}"')
    finally:
        admin_engine.dispose()


def _get_engine() -> Engine:
    global _engine
    with _engine_lock:
        if _engine is None:
            _create_database_if_missing()
            _engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
        return _engine


def _enable_postgis_if_available(engine: Engine) -> None:
    with engine.connect() as connection:
        try:
            connection.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
            connection.commit()
        except Exception:
            connection.rollback()


def init_db() -> None:
    global _db_initialized
    if _db_initialized:
        return

    with _engine_lock:
        if _db_initialized:
            return

        engine = _get_engine()
        _load_all_models()
        _enable_postgis_if_available(engine)
        SQLModel.metadata.create_all(engine)

        with Session(engine) as session:
            from app.services.auth_service import ensure_seed_users
            from app.services.category_service import ensure_default_category

            ensure_seed_users(session)
            ensure_default_category(session)
            session.commit()

        _db_initialized = True


def get_system_session() -> Session:
    init_db()
    return Session(_get_engine())


def dispose_user_db(username: str) -> None:
    _ = username
    engine = _engine
    if engine is not None:
        engine.dispose()


def get_session(username: str | None = None) -> Session:
    _ = username
    init_db()
    return Session(_get_engine())


def reset_application_state() -> None:
    global _db_initialized, _engine

    with _engine_lock:
        engine = _engine
        _engine = None
        _db_initialized = False

    if engine is not None:
        engine.dispose()

    admin_engine = create_engine(DATABASE_ADMIN_URL, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    database_name = _extract_database_name(DATABASE_URL)
    try:
        with admin_engine.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)')
    finally:
        admin_engine.dispose()

    for legacy_db_path in (SYSTEM_DB_PATH, LEGACY_DB_PATH):
        if legacy_db_path.exists():
            legacy_db_path.unlink()

    for runtime_dir in (
        USERS_DATA_DIR,
        VIEWER_ICON_DIR,
        MEDIA_ROOT_DIR,
        TRASH_ROOT_DIR,
        TEMP_ROOT_DIR,
    ):
        clear_directory(runtime_dir)

    init_db()
