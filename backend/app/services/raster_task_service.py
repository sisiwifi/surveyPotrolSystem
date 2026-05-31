"""栅格导入后台任务服务。

负责在后台线程里执行复制、概览构建、缓存初始化与建档，并持续回写阶段和进度。
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Any, Callable
from uuid import uuid4

from app.core.config import reset_current_user_context, set_current_user_context
from app.db.session import get_system_session
from app.services.raster_service import import_raster_dataset

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="raster-import")
_tasks_lock = Lock()
_tasks: dict[str, dict[str, Any]] = {}


def _update_task(task_id: str, **values: Any) -> None:
    with _tasks_lock:
        task = _tasks.get(task_id)
        if task is None:
            return
        task.update(values)


def _build_progress_callback(task_id: str) -> Callable[[str, float | None, str], None]:
    def callback(stage: str, progress: float | None, message: str) -> None:
        _update_task(
            task_id,
            stage=stage,
            progress=progress,
            message=message,
            status="running",
        )

    return callback


def _run_task(task_id: str, *, username: str, role: str | None, import_options: dict[str, Any]) -> None:
    username_token, role_token = set_current_user_context(username, role)
    try:
        _update_task(task_id, status="running", stage="preparing", progress=0.01, message="正在准备导入任务")
        with get_system_session() as session:
            dataset = import_raster_dataset(
                session,
                progress_callback=_build_progress_callback(task_id),
                **import_options,
            )
        _update_task(
            task_id,
            status="completed",
            stage="completed",
            progress=1.0,
            message="栅格导入完成",
            dataset=dataset,
            dataset_public_id=str(dataset.get("public_id") or ""),
            error=None,
        )
    except ValueError as exc:
        _update_task(
            task_id,
            status="failed",
            stage="failed",
            progress=None,
            message=str(exc),
            error=str(exc),
        )
    except RuntimeError as exc:
        _update_task(
            task_id,
            status="failed",
            stage="failed",
            progress=None,
            message=str(exc),
            error=str(exc),
        )
    except Exception as exc:  # pragma: no cover - defensive background task guard
        _update_task(
            task_id,
            status="failed",
            stage="failed",
            progress=None,
            message="后台导入任务执行失败",
            error=str(exc),
        )
    finally:
        reset_current_user_context(username_token, role_token)


def create_raster_import_task(*, username: str, role: str | None, import_options: dict[str, Any]) -> dict[str, Any]:
    task_id = f"raster_task_{uuid4().hex[:12]}"
    task = {
        "task_id": task_id,
        "status": "queued",
        "stage": "queued",
        "progress": 0.0,
        "message": "任务已进入队列",
        "dataset_public_id": None,
        "dataset": None,
        "error": None,
    }
    with _tasks_lock:
        _tasks[task_id] = task
    _executor.submit(_run_task, task_id, username=username, role=role, import_options=dict(import_options or {}))
    return dict(task)


def get_raster_import_task(task_id: str) -> dict[str, Any] | None:
    with _tasks_lock:
        task = _tasks.get(task_id)
        return dict(task) if task is not None else None