<template>
  <header v-if="showHeader" class="top-level-header">
    <div v-if="!hideText" class="top-level-header__main">
      <h2 class="top-level-header__title">{{ title }}</h2>
      <p v-if="subtitle" class="top-level-header__subtitle">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.default" class="top-level-header__extra">
      <slot />
    </div>
  </header>
</template>

<script>
/**
 * 顶层页共用页头组件，不是独立业务页面。
 * 用法是为 Home、Search、Gallery、Favorites、TagOverview 等一级页统一提供标题、副标题和右侧插槽区域。
 * 如果需要调整一级页页头视觉或间距，优先修改这里，并同步核对 src/pages/topLevelPageConvention.js 的整体约定。
 * 相关文档：frontend/Frontend_README.md。
 */
export default {
  name: 'TopLevelPageHeader',
  props: {
    hideText: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      default: '',
    },
  },
  computed: {
    showHeader() {
      return !this.hideText || Boolean(this.$slots.default)
    },
  },
}
</script>

<style scoped lang="css">
.top-level-header {
  @apply flex flex-wrap items-end justify-between gap-3;
}

.top-level-header__main {
  @apply flex min-w-0 flex-col gap-1;
}

.top-level-header__extra {
  @apply flex flex-wrap items-center gap-3;
}

.top-level-header__title {
  @apply m-0 text-2xl font-semibold text-slate-900;
}

.top-level-header__subtitle {
  @apply m-0 text-sm text-slate-500;
}

@media (max-width: 640px) {
  .top-level-header {
    @apply flex-col items-stretch;
  }

  .top-level-header__extra {
    @apply justify-start;
  }
}
</style>