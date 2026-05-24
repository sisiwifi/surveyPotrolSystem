"""API 总路由聚合入口。

主要职责：
- 统一定义后端各业务 router 的注册顺序。
- 适合快速查看系统有哪些接口模块，不适合堆放具体业务逻辑。

模块职责与端点速查见 backend/api_services.md、backend/techReadme.md。
"""

from fastapi import APIRouter

from app.api.routers import (
    albums_router,
    basic_router,
    cache_router,
    collections_router,
    categories_router,
    dates_router,
    gallery_router,
    home_router,
    images_router,
    search_router,
    system_router,
    tags_router,
    trash_router,
)

router = APIRouter()
router.include_router(basic_router)
router.include_router(categories_router)
router.include_router(dates_router)
router.include_router(gallery_router)
router.include_router(home_router)
router.include_router(albums_router)
router.include_router(images_router)
router.include_router(collections_router)
router.include_router(search_router)
router.include_router(system_router)
router.include_router(cache_router)
router.include_router(tags_router)
router.include_router(trash_router)
