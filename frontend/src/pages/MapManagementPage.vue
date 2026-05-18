<template>
  <section class="page map-management-page" :style="pageVars">
    <TopLevelPageHeader
      title="地图管理"
      subtitle="天地图底图、照片点位与空间工作区将在这里集中承载。"
    />

    <div class="map-management-page__intro">
      <article class="map-management-page__intro-card">
        <span class="map-management-page__eyebrow">Phase 1</span>
        <h2 class="map-management-page__title">天地图接入框架</h2>
        <p class="map-management-page__desc">
          先把底图加载、TK 配置、点位挂载和图层切换框架搭起来，后续你只需要往这里接照片、矢量资源和筛选逻辑。
        </p>
      </article>

      <article class="map-management-page__intro-card map-management-page__intro-card--soft">
        <h3 class="map-management-page__mini-title">你需要先准备</h3>
        <ul class="map-management-page__list">
          <li>申请天地图网页服务 TK，并配置允许访问的域名</li>
          <li>确认底图使用场景，先保留矢量、影像、地形三种切换</li>
          <li>统一照片点位的坐标来源，明确经纬度字段和坐标系</li>
          <li>给后续图层准备业务 id、图层类型和显示状态字段</li>
        </ul>
      </article>
    </div>

    <TianDiTuMapFrame />
  </section>
</template>

<script>
import TopLevelPageHeader from './TopLevelPageHeader.vue'
import TianDiTuMapFrame from '../components/map/TianDiTuMapFrame.vue'
import { topLevelPageVars } from './topLevelPageConvention'

export default {
  name: 'MapManagementPage',
  components: {
    TopLevelPageHeader,
    TianDiTuMapFrame,
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

.map-management-page__intro {
  @apply grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.95fr)];
}

.map-management-page__intro-card {
  @apply rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/70;
}

.map-management-page__intro-card--soft {
  @apply bg-[linear-gradient(160deg,rgba(236,253,245,0.9),rgba(240,249,255,0.9))];
}

.map-management-page__eyebrow {
  @apply inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700;
}

.map-management-page__title {
  @apply mt-3 text-2xl font-semibold text-slate-900;
}

.map-management-page__desc {
  @apply mt-3 max-w-3xl text-sm leading-7 text-slate-600;
}

.map-management-page__mini-title {
  @apply text-base font-semibold text-slate-900;
}

.map-management-page__list {
  @apply mt-3 grid gap-3 text-sm text-slate-700;
}

.map-management-page__list li {
  @apply rounded-2xl border border-white/90 bg-white px-4 py-3 shadow-sm shadow-slate-200/70;
}
</style>