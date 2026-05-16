<template>
  <section class="page map-management-page" :style="pageVars">
    <TopLevelPageHeader
      title="地图管理"
      subtitle="天地图底图、照片点位与空间工作区将在这里集中承载。"
    />

    <div class="placeholder-card">
      <div class="placeholder-card__hero">
        <span class="placeholder-card__eyebrow">Phase 1</span>
        <h2 class="placeholder-card__title">地图工作区占位页</h2>
        <p class="placeholder-card__desc">
          下一步会在这里接入天地图底图、照片定位点、点位点击查看与空间筛选能力。
        </p>
      </div>

      <div class="placeholder-card__grid">
        <article class="placeholder-panel">
          <h3 class="placeholder-panel__title">准备接入的能力</h3>
          <ul class="placeholder-list">
            <li>天地图底图与基础工具栏</li>
            <li>照片 EXIF GPS 点位展示</li>
            <li>无坐标照片的补点与纠偏</li>
            <li>照片与矢量图层联动查看</li>
          </ul>
        </article>

        <article class="placeholder-panel placeholder-panel--muted">
          <h3 class="placeholder-panel__title">当前状态</h3>
          <p class="placeholder-panel__text">
            本页已接入一级导航与路由，后续将作为地图中心页面继续扩展。
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<script>
import TopLevelPageHeader from './TopLevelPageHeader.vue'
import { topLevelPageVars } from './topLevelPageConvention'

export default {
  name: 'MapManagementPage',
  components: {
    TopLevelPageHeader,
  },
  computed: {
    pageVars() {
      return topLevelPageVars()
    },
  },
}
</script>

<style scoped lang="css">
.map-management-page {
  @apply space-y-6;
}

.placeholder-card {
  @apply rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/70;
}

.placeholder-card__hero {
  @apply space-y-3;
}

.placeholder-card__eyebrow {
  @apply inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700;
}

.placeholder-card__title {
  @apply text-2xl font-semibold text-slate-900;
}

.placeholder-card__desc {
  @apply max-w-3xl text-sm leading-7 text-slate-600;
}

.placeholder-card__grid {
  @apply mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)];
}

.placeholder-panel {
  @apply rounded-[24px] border border-slate-200 bg-slate-50/85 p-5;
}

.placeholder-panel--muted {
  @apply bg-[linear-gradient(160deg,rgba(236,253,245,0.9),rgba(240,249,255,0.9))];
}

.placeholder-panel__title {
  @apply text-base font-semibold text-slate-900;
}

.placeholder-panel__text {
  @apply mt-3 text-sm leading-7 text-slate-600;
}

.placeholder-list {
  @apply mt-3 grid gap-3 text-sm text-slate-700;
}

.placeholder-list li {
  @apply rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-sm shadow-slate-200/70;
}
</style>