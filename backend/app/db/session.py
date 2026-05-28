import json
from threading import RLock

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, Session, create_engine

from app.core.config import SYSTEM_DB_PATH, ensure_user_storage_dirs, get_current_username, get_user_db_path

_system_engine = create_engine(f"sqlite:///{SYSTEM_DB_PATH}", echo=False)
_user_engines: dict[str, Engine] = {}
_system_db_initialized = False
_user_db_initialized: set[str] = set()
_engine_lock = RLock()


def _load_business_models() -> tuple[type, ...]:
    from app.models.album import Album
    from app.models.album_image import AlbumImage
    from app.models.category import Category
    from app.models.collection import Collection
    from app.models.collection_image import CollectionImage
    from app.models.image_asset import ImageAsset
    from app.models.photo_geo_link import PhotoGeoLink
    from app.models.photo_location import PhotoLocation
    from app.models.recent_import_operation import RecentImportOperation
    from app.models.tag import Tag
    from app.models.trash_entry import TrashEntry
    from app.models.vector_dataset import VectorDataset
    from app.models.vector_layer import VectorLayer

    return (
        Collection,
        CollectionImage,
        Album,
        AlbumImage,
        Category,
        ImageAsset,
        PhotoGeoLink,
        PhotoLocation,
        RecentImportOperation,
        Tag,
        TrashEntry,
        VectorDataset,
        VectorLayer,
    )


def init_db() -> None:
    init_system_db()


def init_system_db() -> None:
    global _system_db_initialized
    if _system_db_initialized:
        return

    with _engine_lock:
        if _system_db_initialized:
            return
        from app.models.user import User

        User.__table__.create(bind=_system_engine, checkfirst=True)
        _migrate_system_db()

        with Session(_system_engine) as session:
            from app.services.auth_service import ensure_seed_users

            ensure_seed_users(session)
            session.commit()

        _system_db_initialized = True


def _get_user_engine(username: str) -> Engine:
    with _engine_lock:
        engine = _user_engines.get(username)
        if engine is not None:
            return engine

        ensure_user_storage_dirs(username)
        engine = create_engine(f"sqlite:///{get_user_db_path(username)}", echo=False)
        _user_engines[username] = engine
        return engine


def init_user_db(username: str) -> None:
    init_system_db()
    if username in _user_db_initialized:
        return

    with _engine_lock:
        if username in _user_db_initialized:
            return

        engine = _get_user_engine(username)
        business_models = _load_business_models()
        SQLModel.metadata.create_all(engine, tables=[model.__table__ for model in business_models])
        _migrate_business_db(engine)

        with Session(engine) as session:
            from app.services.category_service import ensure_default_category

            ensure_default_category(session)
            session.commit()

        _user_db_initialized.add(username)


def _migrate_business_db(engine: Engine) -> None:
    """Add new columns to existing tables if they don't exist yet.

    Only additive (ALTER TABLE ADD COLUMN) migrations are performed here.
    Destructive schema changes (e.g. removing deleted_at) are left to the
    caller who will drop-and-recreate the DB when clearing all data.
    """
    with engine.connect() as conn:
        # ── imageasset columns ────────────────────────────────────────────
        for column, col_type in [
            ("media_path",     "TEXT"),
            ("date_group",     "TEXT"),
            ("full_filename",  "TEXT"),
            ("quick_hash",     "TEXT"),
            ("thumbs",         "TEXT"),
            ("file_created_at","DATETIME"),
            ("imported_at",    "DATETIME"),
            ("width",          "INTEGER"),
            ("height",         "INTEGER"),
            ("file_size",      "INTEGER"),
            ("mime_type",      "TEXT"),
            ("is_animated",    "INTEGER"),
            ("animation_meta", "TEXT"),
            ("category_id",    "INTEGER"),
            ("tags",           "TEXT"),
            ("album",          "TEXT"),
            ("collection",     "TEXT"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE imageasset ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore

        try:
            column_rows = conn.execute(text("PRAGMA table_info(imageasset)")).fetchall()
            imageasset_columns = {row[1] for row in column_rows}
        except Exception:
            imageasset_columns = set()

        if "animation_meta" in imageasset_columns and (
            "frame_count" in imageasset_columns or "animation_format" in imageasset_columns
        ):
            try:
                rows = conn.execute(
                    text(
                        "SELECT id, is_animated, frame_count, animation_format, animation_meta "
                        "FROM imageasset"
                    )
                ).fetchall()
                for row_id, is_animated, frame_count, animation_format, animation_meta in rows:
                    parsed_meta = None
                    if isinstance(animation_meta, str) and animation_meta.strip():
                        try:
                            loaded = json.loads(animation_meta)
                            if isinstance(loaded, dict):
                                parsed_meta = loaded
                        except Exception:
                            parsed_meta = None

                    normalized_format = str(
                        ((parsed_meta or {}).get("format") if isinstance(parsed_meta, dict) else None)
                        or ((parsed_meta or {}).get("animation_format") if isinstance(parsed_meta, dict) else None)
                        or animation_format
                        or ""
                    ).strip().upper() or None
                    has_frame_count = (
                        (isinstance(parsed_meta, dict) and parsed_meta.get("frame_count") is not None)
                        or frame_count is not None
                    )
                    normalized_frame_count = max(
                        int(
                            (parsed_meta or {}).get("frame_count")
                            if isinstance(parsed_meta, dict) and (parsed_meta or {}).get("frame_count") is not None
                            else (frame_count or 1)
                        ),
                        1,
                    )
                    normalized_is_animated = bool(is_animated) or normalized_frame_count > 1 or normalized_format is not None
                    normalized_meta = None
                    if normalized_is_animated and (has_frame_count or normalized_format is not None):
                        normalized_meta = {
                            "frame_count": normalized_frame_count,
                            "format": normalized_format,
                        }

                    serialized_meta = json.dumps(normalized_meta) if normalized_meta is not None else None
                    conn.execute(
                        text(
                            "UPDATE imageasset SET is_animated = :is_animated, animation_meta = :animation_meta "
                            "WHERE id = :id"
                        ),
                        {
                            "id": row_id,
                            "is_animated": 1 if normalized_is_animated else 0,
                            "animation_meta": serialized_meta,
                        },
                    )
                conn.commit()
            except Exception:
                pass

        # ── Migrate media_path: convert plain strings to JSON arrays ──────
        try:
            rows = conn.execute(
                text(
                    "SELECT id, media_path FROM imageasset "
                    "WHERE media_path IS NOT NULL AND media_path != ''"
                )
            ).fetchall()
            for row_id, mp in rows:
                if mp and not mp.strip().startswith("["):
                    conn.execute(
                        text("UPDATE imageasset SET media_path = :v WHERE id = :id"),
                        {"v": json.dumps([mp]), "id": row_id},
                    )
            conn.commit()
        except Exception:
            pass

        # ── Legacy: relax thumb_path NOT NULL constraint if present ───────
        try:
            result = conn.execute(text("PRAGMA table_info(imageasset)"))
            thumb_notnull = any(
                row[1] == "thumb_path" and row[3] == 1 for row in result.fetchall()
            )
            if thumb_notnull:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(text("""
                    CREATE TABLE imageasset_new (
                        id            INTEGER PRIMARY KEY,
                        original_path TEXT NOT NULL,
                        file_hash     TEXT NOT NULL,
                        thumb_path    TEXT,
                        media_path    TEXT,
                        date_group    TEXT,
                        created_at    DATETIME NOT NULL
                    )
                """))
                conn.execute(text(
                    "INSERT INTO imageasset_new "
                    "SELECT id, original_path, file_hash, thumb_path, "
                    "media_path, date_group, created_at FROM imageasset"
                ))
                conn.execute(text("DROP TABLE imageasset"))
                conn.execute(text("ALTER TABLE imageasset_new RENAME TO imageasset"))
                for idx_sql in [
                    "CREATE INDEX IF NOT EXISTS ix_imageasset_original_path ON imageasset(original_path)",
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_imageasset_file_hash ON imageasset(file_hash)",
                    "CREATE INDEX IF NOT EXISTS ix_imageasset_date_group ON imageasset(date_group)",
                    "CREATE INDEX IF NOT EXISTS ix_imageasset_quick_hash ON imageasset(quick_hash)",
                ]:
                    conn.execute(text(idx_sql))
                conn.execute(text("PRAGMA foreign_keys=ON"))
                conn.commit()
        except Exception:
            pass

        # ── Ensure quick_hash index ───────────────────────────────────────
        try:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_imageasset_quick_hash "
                "ON imageasset(quick_hash)"
            ))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_imageasset_is_animated "
                "ON imageasset(is_animated)"
            ))
            conn.commit()
        except Exception:
            pass

        # ── tag columns ───────────────────────────────────────────────────
        for column, col_type in [
            ("public_id",    "TEXT"),
            ("display_name", "TEXT"),
            ("type",         "TEXT"),
            ("description",  "TEXT"),
            ("usage_count",  "INTEGER"),
            ("last_used_at", "TEXT"),
            ("metadata",     "TEXT"),
            ("created_by",   "TEXT"),
            ("updated_at",   "DATETIME"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE tag ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass

        try:
            conn.execute(text("UPDATE tag SET type = 'normal' WHERE type IS NULL OR trim(type) = ''"))
            conn.commit()
        except Exception:
            pass

        # ── album_image table indexes & constraints ──────────────────────
        try:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_album_image_album_image "
                "ON album_image(album_id, image_id)"
            ))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_album_image_image_id "
                "ON album_image(image_id)"
            ))
            conn.commit()
        except Exception:
            pass

        # ── collection_image table indexes & constraints ────────────────
        try:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_image_collection_image "
                "ON collection_image(collection_id, image_id)"
            ))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_collection_image_image_id "
                "ON collection_image(image_id)"
            ))
            conn.commit()
        except Exception:
            pass

        # ── album columns ─────────────────────────────────────────────────
        for column, col_type in [
            ("public_id",            "TEXT"),
            ("title",                "TEXT"),
            ("description",          "TEXT"),
            ("path",                 "TEXT"),
            ("is_leaf",              "INTEGER"),
            ("parent_id",            "INTEGER"),
            ("cover",                "TEXT"),
            ("photo_count",          "INTEGER"),
            ("subtree_photo_count",  "INTEGER"),
            ("sort_mode",            "TEXT"),
            ("settings",             "TEXT"),
            ("stats",                "TEXT"),
            ("date_group",           "TEXT"),
            ("created_at",           "DATETIME"),
            ("updated_at",           "DATETIME"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE album ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass

        # ── collection columns ───────────────────────────────────────────
        for column, col_type in [
            ("public_id",           "TEXT"),
            ("title",               "TEXT"),
            ("description",         "TEXT"),
            ("collection_path",     "TEXT"),
            ("is_leaf",             "INTEGER"),
            ("parent_id",           "INTEGER"),
            ("cover",               "TEXT"),
            ("photo_count",         "INTEGER"),
            ("subtree_photo_count", "INTEGER"),
            ("sort_mode",           "TEXT"),
            ("settings",            "TEXT"),
            ("stats",               "TEXT"),
            ("created_at",          "DATETIME"),
            ("updated_at",          "DATETIME"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE collection ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass

        # ── trash_entry columns ───────────────────────────────────────────
        for column, col_type in [
            ("category_id", "INTEGER"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE trash_entry ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass

        # ── recent_import_operation columns ───────────────────────────────
        for column, col_type in [
            ("successful_image_ids", "TEXT"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE recentimportoperation ADD COLUMN {column} {col_type}")
                )
                conn.commit()
            except Exception:
                pass

        for index_sql in [
            "CREATE INDEX IF NOT EXISTS ix_imageasset_category_id ON imageasset(category_id)",
            "CREATE INDEX IF NOT EXISTS ix_trash_entry_category_id ON trash_entry(category_id)",
        ]:
            try:
                conn.execute(text(index_sql))
                conn.commit()
            except Exception:
                pass


def _migrate_system_db() -> None:
    with _system_engine.connect() as conn:
        for column, col_type in [
            ("display_name", "TEXT"),
            ("password_salt", "TEXT"),
            ("password_hash", "TEXT"),
            ("role", "TEXT"),
            ("is_active", "INTEGER"),
            ("created_at", "DATETIME"),
            ("updated_at", "DATETIME"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE user_account ADD COLUMN {column} {col_type}"))
                conn.commit()
            except Exception:
                pass

        for index_sql in [
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_account_username ON user_account(username)",
            "CREATE INDEX IF NOT EXISTS ix_user_account_role ON user_account(role)",
            "CREATE INDEX IF NOT EXISTS ix_user_account_is_active ON user_account(is_active)",
        ]:
            try:
                conn.execute(text(index_sql))
                conn.commit()
            except Exception:
                pass


def get_system_session() -> Session:
    init_system_db()
    return Session(_system_engine)


def dispose_user_db(username: str) -> None:
    with _engine_lock:
        engine = _user_engines.pop(username, None)
        _user_db_initialized.discard(username)
    if engine is not None:
        engine.dispose()


def get_session(username: str | None = None) -> Session:
    active_username = username or get_current_username(required=True)
    if not active_username:
        raise RuntimeError("当前请求未绑定用户上下文")
    init_user_db(active_username)
    return Session(_get_user_engine(active_username))
