<template>
  <aside class="sidebar" :class="isSidebarCollapsed ? 'sidebar--collapsed' : 'sidebar--expanded'">
    <div class="sidebar__header">
      <div class="sidebar__logo" aria-hidden="true">P</div>
      <div
        class="sidebar__title"
        :class="isTextVisible ? 'sidebar__title--visible' : 'sidebar__title--hidden'"
      >
        <h1 class="text-lg font-semibold">图片空间管理</h1>
        <p class="text-sm text-slate-500">导航面板</p>
      </div>
    </div>
    <nav class="sidebar__nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="sidebar__nav-item"
        :class="{ 'sidebar__nav-item--active': isActive(item.path) }"
      >
        <span>{{ item.icon }}</span>
        <span
          class="sidebar__nav-text"
          :class="isTextVisible ? 'sidebar__nav-text--visible' : 'sidebar__nav-text--hidden'"
        >{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebar__footer">
      <div
        v-if="authState.user"
        class="sidebar__account"
        :class="isTextVisible ? 'sidebar__account--visible' : 'sidebar__account--hidden'"
      >
        <span class="sidebar__account-name">{{ authState.user.username }}</span>
        <span class="sidebar__account-role">{{ roleLabel }}</span>
      </div>
      <button class="sidebar__logout" type="button" @click="handleLogout">
        <span>⎋</span>
        <span
          class="sidebar__nav-text"
          :class="isTextVisible ? 'sidebar__nav-text--visible' : 'sidebar__nav-text--hidden'"
        >退出登录</span>
      </button>
      <button
        class="sidebar__toggle"
        @click="toggleSidebar"
        :aria-label="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
      >
        <span v-if="isSidebarCollapsed">&gt;</span>
        <span v-else>&lt;</span>
      </button>
    </div>
  </aside>
</template>

<script>
import { authState, logout } from '../utils/auth'
import { TOP_LEVEL_NAV_ITEMS, isTopLevelRouteActive } from '../pages/topLevelPageConvention'

export default {
  name: 'AppSidebar',
  data() {
    return {
      authState,
      isSidebarCollapsed: false,
      isTextVisible: true,
    }
  },
  computed: {
    navItems() {
      return TOP_LEVEL_NAV_ITEMS.filter(item => {
        if (!item.requiredRole) return true
        return this.authState.user?.role === item.requiredRole
      })
    },
    roleLabel() {
      return this.authState.user?.role === 'admin' ? '管理员' : '普通用户'
    },
  },
  methods: {
    isActive(path) {
      return isTopLevelRouteActive(this.$route.path, path)
    },
    handleLogout() {
      logout({ redirectToLogin: false })
      this.$router.replace('/login')
    },
    toggleSidebar() {
      if (this.isSidebarCollapsed) {
        this.isSidebarCollapsed = false
        window.setTimeout(() => {
          this.isTextVisible = true
        }, 180)
        return
      }

      this.isTextVisible = false
      window.setTimeout(() => {
        this.isSidebarCollapsed = true
      }, 200)
    }
  }
}
</script>

<style scoped lang="css">
.sidebar {
  @apply sticky top-0 h-screen flex-shrink-0 z-50 overflow-y-auto flex flex-col border-r border-slate-200 bg-white transition-all duration-300;
}

.sidebar--collapsed {
  @apply w-20;
}

.sidebar--expanded {
  @apply w-64;
}

.sidebar__header {
  @apply flex items-center gap-3 p-6;
}

.sidebar__logo {
  @apply flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white;
}

.sidebar__title {
  @apply overflow-hidden whitespace-nowrap transition-all duration-200;
}

.sidebar__title--visible {
  @apply max-w-[200px] opacity-100;
}

.sidebar__title--hidden {
  @apply max-w-0 opacity-0;
}

.sidebar__nav {
  @apply mt-2 space-y-2 px-4 text-sm;
}

.sidebar__nav-item {
  @apply flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-600 hover:bg-slate-100;
}

.sidebar__nav-item--active {
  @apply bg-slate-100 font-medium text-slate-900;
}

.sidebar__nav-text {
  @apply inline-block overflow-hidden whitespace-nowrap transition-all duration-200;
}

.sidebar__nav-text--visible {
  @apply max-w-[140px] opacity-100;
}

.sidebar__nav-text--hidden {
  @apply max-w-0 opacity-0;
}

.sidebar__footer {
  @apply mt-auto p-4 flex flex-col gap-3;
}

.sidebar__account {
  @apply rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition-all duration-200 overflow-hidden;
}

.sidebar__account--visible {
  @apply max-h-20 opacity-100;
}

.sidebar__account--hidden {
  @apply max-h-0 opacity-0 p-0 border-transparent;
}

.sidebar__account-name {
  @apply block text-sm font-semibold text-slate-900;
}

.sidebar__account-role {
  @apply block text-xs text-slate-500 mt-1;
}

.sidebar__logout {
  @apply flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-600 hover:bg-slate-100;
}

.sidebar__toggle {
  @apply flex h-9 w-full items-center justify-center rounded-full border border-slate-200 text-sm text-slate-500 hover:bg-slate-100;
}
</style>