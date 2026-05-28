import json

from app.core.config import DATA_DIR, get_current_username, get_user_settings_path

DEFAULT_CACHE_SHORT_SIDE_PX = 600
MIN_CACHE_SHORT_SIDE_PX = 100
MAX_CACHE_SHORT_SIDE_PX = 4000

DEFAULT_MONTH_COVER_SIZE_PX = 400
MIN_MONTH_COVER_SIZE_PX = 100
MAX_MONTH_COVER_SIZE_PX = 2000

DEFAULT_TAG_MATCH_ENABLED = True
DEFAULT_TAG_MATCH_NOISE_TOKENS: list[str] = []
DEFAULT_TAG_MATCH_MIN_TOKEN_LENGTH = 2
MIN_TAG_MATCH_MIN_TOKEN_LENGTH = 1
MAX_TAG_MATCH_MIN_TOKEN_LENGTH = 32
DEFAULT_TAG_MATCH_DROP_NUMERIC_ONLY = True

DEFAULT_PAGE_BROWSE_MODE = "paged"
PAGE_BROWSE_MODE_OPTIONS = {"scroll", "paged"}
DEFAULT_PAGE_SCROLL_WINDOW_SIZE = 100
PAGE_SCROLL_WINDOW_OPTIONS = tuple(range(40, 201, 20))
DEFAULT_PAGE_SIZE = 20
PAGE_SIZE_OPTIONS = (20, 40, 60, 100, 200)

DEFAULT_MAP_TIANDITU_TK = ""
DEFAULT_MAP_CENTER = [35.8617, 104.1954]
DEFAULT_MAP_ZOOM = 5
MIN_MAP_ZOOM = 3
MAX_MAP_ZOOM = 18


def _settings_file_path():
    username = get_current_username()
    if username:
        return get_user_settings_path(username)
    return DATA_DIR / "app_settings.json"


def _normalize_page_scroll_window_size(value: object) -> int:
    try:
        normalized = int(value)
    except Exception:
        return DEFAULT_PAGE_SCROLL_WINDOW_SIZE
    if normalized in PAGE_SCROLL_WINDOW_OPTIONS:
        return normalized
    return DEFAULT_PAGE_SCROLL_WINDOW_SIZE


def _normalize_page_size(value: object) -> int:
    try:
        normalized = int(value)
    except Exception:
        return DEFAULT_PAGE_SIZE
    if normalized in PAGE_SIZE_OPTIONS:
        return normalized
    return DEFAULT_PAGE_SIZE


def _normalize_map_center(value: object) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return list(DEFAULT_MAP_CENTER)

    try:
        latitude = float(value[0])
        longitude = float(value[1])
    except Exception:
        return list(DEFAULT_MAP_CENTER)

    latitude = max(-90.0, min(90.0, latitude))
    longitude = max(-180.0, min(180.0, longitude))
    return [latitude, longitude]


def _normalize_map_zoom(value: object) -> int:
    try:
        normalized = int(value)
    except Exception:
        return DEFAULT_MAP_ZOOM
    return max(MIN_MAP_ZOOM, min(MAX_MAP_ZOOM, normalized))


def load_app_settings() -> dict:
    settings_file = _settings_file_path()
    if not settings_file.exists():
        return {}
    try:
        return json.loads(settings_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_app_settings(data: dict) -> None:
    try:
        settings_file = _settings_file_path()
        settings_file.parent.mkdir(parents=True, exist_ok=True)
        settings_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def get_cache_thumb_short_side_px() -> int:
    data = load_app_settings()
    value = data.get("cache_thumb_short_side_px")
    if isinstance(value, int):
        if value < MIN_CACHE_SHORT_SIDE_PX:
            return MIN_CACHE_SHORT_SIDE_PX
        if value > MAX_CACHE_SHORT_SIDE_PX:
            return MAX_CACHE_SHORT_SIDE_PX
        return value
    return DEFAULT_CACHE_SHORT_SIDE_PX


def set_cache_thumb_short_side_px(value: int) -> int:
    clamped = max(MIN_CACHE_SHORT_SIDE_PX, min(MAX_CACHE_SHORT_SIDE_PX, int(value)))
    data = load_app_settings()
    data["cache_thumb_short_side_px"] = clamped
    save_app_settings(data)
    return clamped


def get_month_cover_size_px() -> int:
    data = load_app_settings()
    value = data.get("month_cover_size_px")
    if isinstance(value, int):
        if value < MIN_MONTH_COVER_SIZE_PX:
            return MIN_MONTH_COVER_SIZE_PX
        if value > MAX_MONTH_COVER_SIZE_PX:
            return MAX_MONTH_COVER_SIZE_PX
        return value
    return DEFAULT_MONTH_COVER_SIZE_PX


def set_month_cover_size_px(value: int) -> int:
    clamped = max(MIN_MONTH_COVER_SIZE_PX, min(MAX_MONTH_COVER_SIZE_PX, int(value)))
    data = load_app_settings()
    data["month_cover_size_px"] = clamped
    save_app_settings(data)
    return clamped


def _sanitize_noise_tokens(raw_tokens: object) -> list[str]:
    if not isinstance(raw_tokens, list):
        return []

    seen: set[str] = set()
    result: list[str] = []
    for token in raw_tokens:
        if not isinstance(token, str):
            continue
        normalized = token.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def get_tag_match_setting() -> dict:
    data = load_app_settings()
    raw = data.get("tag_match_setting")
    if not isinstance(raw, dict):
        raw = {}

    min_token_length_raw = raw.get("min_token_length", DEFAULT_TAG_MATCH_MIN_TOKEN_LENGTH)
    try:
        min_token_length = int(min_token_length_raw)
    except Exception:
        min_token_length = DEFAULT_TAG_MATCH_MIN_TOKEN_LENGTH
    min_token_length = max(MIN_TAG_MATCH_MIN_TOKEN_LENGTH, min(MAX_TAG_MATCH_MIN_TOKEN_LENGTH, min_token_length))

    enabled = raw.get("enabled", DEFAULT_TAG_MATCH_ENABLED)
    drop_numeric_only = raw.get("drop_numeric_only", DEFAULT_TAG_MATCH_DROP_NUMERIC_ONLY)

    return {
        "enabled": bool(enabled),
        "noise_tokens": _sanitize_noise_tokens(raw.get("noise_tokens", DEFAULT_TAG_MATCH_NOISE_TOKENS)),
        "min_token_length": min_token_length,
        "drop_numeric_only": bool(drop_numeric_only),
        "sort_mode": "name_asc",
    }


def set_tag_match_setting(setting: dict) -> dict:
    if not isinstance(setting, dict):
        setting = {}

    current = get_tag_match_setting()

    if "enabled" in setting:
        current["enabled"] = bool(setting.get("enabled"))
    if "noise_tokens" in setting:
        current["noise_tokens"] = _sanitize_noise_tokens(setting.get("noise_tokens"))
    if "min_token_length" in setting:
        try:
            raw_length = int(setting.get("min_token_length"))
        except Exception:
            raw_length = DEFAULT_TAG_MATCH_MIN_TOKEN_LENGTH
        current["min_token_length"] = max(
            MIN_TAG_MATCH_MIN_TOKEN_LENGTH,
            min(MAX_TAG_MATCH_MIN_TOKEN_LENGTH, raw_length),
        )
    if "drop_numeric_only" in setting:
        current["drop_numeric_only"] = bool(setting.get("drop_numeric_only"))

    current["sort_mode"] = "name_asc"

    data = load_app_settings()
    data["tag_match_setting"] = {
        "enabled": current["enabled"],
        "noise_tokens": current["noise_tokens"],
        "min_token_length": current["min_token_length"],
        "drop_numeric_only": current["drop_numeric_only"],
        "sort_mode": "name_asc",
    }
    save_app_settings(data)
    return current


def get_page_config() -> dict:
    data = load_app_settings()
    raw = data.get("page_config")
    if not isinstance(raw, dict):
        raw = {}

    browse_mode = DEFAULT_PAGE_BROWSE_MODE
    scroll_window_size = _normalize_page_scroll_window_size(
        raw.get("scroll_window_size", DEFAULT_PAGE_SCROLL_WINDOW_SIZE),
    )
    page_size = _normalize_page_size(
        raw.get("page_size", DEFAULT_PAGE_SIZE),
    )

    return {
        "browse_mode": browse_mode,
        "scroll_window_size": scroll_window_size,
        "page_size": page_size,
    }


def set_page_config(setting: dict) -> dict:
    if not isinstance(setting, dict):
        setting = {}

    current = get_page_config()

    if "browse_mode" in setting:
        current["browse_mode"] = DEFAULT_PAGE_BROWSE_MODE

    if "scroll_window_size" in setting:
        current["scroll_window_size"] = _normalize_page_scroll_window_size(
            setting.get("scroll_window_size"),
        )

    if "page_size" in setting:
        current["page_size"] = _normalize_page_size(
            setting.get("page_size"),
        )

    data = load_app_settings()
    data["page_config"] = {
        "browse_mode": current["browse_mode"],
        "scroll_window_size": current["scroll_window_size"],
        "page_size": current["page_size"],
    }
    save_app_settings(data)
    return current


def get_map_config() -> dict:
    data = load_app_settings()
    raw = data.get("map_config")
    if not isinstance(raw, dict):
        raw = {}

    tk = raw.get("tk", DEFAULT_MAP_TIANDITU_TK)
    if not isinstance(tk, str):
        tk = DEFAULT_MAP_TIANDITU_TK

    return {
        "tk": tk.strip(),
        "default_center": _normalize_map_center(raw.get("default_center", DEFAULT_MAP_CENTER)),
        "default_zoom": _normalize_map_zoom(raw.get("default_zoom", DEFAULT_MAP_ZOOM)),
    }


def set_map_config(setting: dict) -> dict:
    if not isinstance(setting, dict):
        setting = {}

    current = get_map_config()

    if "tk" in setting:
        tk = setting.get("tk", DEFAULT_MAP_TIANDITU_TK)
        current["tk"] = tk.strip() if isinstance(tk, str) else DEFAULT_MAP_TIANDITU_TK

    if "default_center" in setting:
        current["default_center"] = _normalize_map_center(setting.get("default_center"))

    if "default_zoom" in setting:
        current["default_zoom"] = _normalize_map_zoom(setting.get("default_zoom"))

    data = load_app_settings()
    data["map_config"] = {
        "tk": current["tk"],
        "default_center": current["default_center"],
        "default_zoom": current["default_zoom"],
    }
    save_app_settings(data)
    return current
