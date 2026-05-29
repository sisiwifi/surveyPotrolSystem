/**
 * 前端路由总表。
 * 这里负责把一级页、BrowsePage 的复用契约路由，以及地图 fullBleed 等展示约定串起来。
 * 新增页面时先在这里确认路径、name 和 meta，再同步更新 frontend/Frontend_README.md 中的路由速查说明。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { authState, isAdmin, restoreAuthState, validateAuthSession } from '../utils/auth'
import HomePage from '../pages/HomePage.vue'
import GalleryPage from '../pages/GalleryPage.vue'
import CalendarOverview from '../pages/CalendarOverview.vue'
import BrowsePage from '../pages/BrowsePage/index.vue'
import CategorySettingsPage from '../pages/CategorySettingsPage.vue'
import LoginPage from '../pages/LoginPage.vue'
import MapConfigPage from '../pages/MapConfigPage.vue'
import RuntimeConfigPage from '../pages/RuntimeConfigPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import SearchPage from '../pages/SearchPage.vue'
import FavoritesPage from '../pages/FavoritesPage.vue'
import TagOverviewPage from '../pages/TagOverviewPage.vue'
import UserManagementPage from '../pages/UserManagementPage.vue'
import MapManagementPage from '../pages/MapManagementPage.vue'
import VectorDataPage from '../pages/VectorDataPage.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { requiresAuth: false, hideSidebar: true, fullBleed: true }
  },
  {
    path: '/',
    name: 'home',
    component: HomePage
  },
  {
    path: '/search',
    name: 'search',
    component: SearchPage
  },
  {
    path: '/search/results',
    name: 'search-results',
    component: BrowsePage,
    meta: { reuseKey: 'browse', browseContract: 'search-results' }
  },
  {
    path: '/tags',
    name: 'tags',
    component: TagOverviewPage
  },
  {
    path: '/maps',
    name: 'maps',
    component: MapManagementPage,
    meta: { fullBleed: true }
  },
  {
    path: '/vectors',
    name: 'vectors',
    component: VectorDataPage
  },
  {
    path: '/tags/:tagId',
    name: 'browse-tag',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse', browseContract: 'tag' }
  },
  {
    path: '/gallery',
    name: 'gallery',
    component: GalleryPage,
    meta: { keepAlive: true }
  },
  {
    path: '/gallery/recent',
    name: 'gallery-recent',
    component: BrowsePage,
    meta: { reuseKey: 'browse', browseContract: 'gallery-recent' }
  },
  {
    path: '/gallery/recent/:group/:albumPath+',
    name: 'gallery-recent-album',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse', browseContract: 'gallery-recent' }
  },
  {
    path: '/gallery/all',
    name: 'gallery-all',
    component: BrowsePage,
    meta: { reuseKey: 'browse', browseContract: 'gallery-all' }
  },
  {
    path: '/gallery/all/:group/:albumPath+',
    name: 'gallery-all-album',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse', browseContract: 'gallery-all' }
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: CalendarOverview
  },
  {
    path: '/calendar/:group',
    name: 'browse-group',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse' }
  },
  {
    path: '/calendar/:group/:albumPath+',
    name: 'browse-album',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsPage
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: FavoritesPage
  },
  {
    path: '/favorites/:collectionId',
    name: 'browse-collection',
    component: BrowsePage,
    props: true,
    meta: { reuseKey: 'browse', browseContract: 'collection' }
  },
  {
    path: '/settings/categories',
    name: 'settings-categories',
    component: CategorySettingsPage
  },
  {
    path: '/settings/map-config',
    name: 'settings-map-config',
    component: MapConfigPage
  },
  {
    path: '/settings/runtime-config',
    name: 'settings-runtime-config',
    component: RuntimeConfigPage,
    meta: { requiresAdmin: true }
  },
  {
    path: '/settings/users',
    name: 'settings-users',
    component: UserManagementPage,
    meta: { requiresAdmin: true }
  },
  {
    path: '/trash',
    name: 'trash',
    component: BrowsePage,
    meta: { reuseKey: 'browse', browseContract: 'trash' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  restoreAuthState()

  if (to.name === 'login') {
    const hasValidSession = await validateAuthSession()
    if (!hasValidSession) {
      return true
    }
    return typeof to.query?.redirect === 'string' && to.query.redirect.startsWith('/')
      ? to.query.redirect
      : '/'
  }

  const requiresAuth = to.meta?.requiresAuth !== false
  if (requiresAuth && !(await validateAuthSession())) {
    return {
      name: 'login',
      query: to.fullPath && to.fullPath !== '/login'
        ? { redirect: to.fullPath }
        : {},
    }
  }

  if (to.meta?.requiresAdmin && !isAdmin()) {
    return authState.user ? '/settings' : '/login'
  }

  return true
})

export default router
