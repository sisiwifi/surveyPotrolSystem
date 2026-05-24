<template>
  <section class="page vector-data-page" :style="pageVars">
    <TopLevelPageHeader
      title="矢量数据"
      subtitle="统一管理 SHP、DAT、DWG 等地理资源，并为照片关联预留工作流。"
    />

    <div class="placeholder-shell">
      <div class="placeholder-shell__header">
        <div>
          <span class="placeholder-shell__eyebrow">Phase 1</span>
          <h2 class="placeholder-shell__title">矢量资源管理占位页</h2>
        </div>
        <span class="placeholder-shell__status">待接入导入器</span>
      </div>

      <div class="placeholder-shell__layout">
        <section class="vector-box">
          <h3 class="vector-box__title">规划中的数据对象</h3>
          <div class="vector-chip-list">
            <span class="vector-chip">数据集资源</span>
            <span class="vector-chip">业务图层</span>
            <span class="vector-chip">解析状态</span>
            <span class="vector-chip">坐标系信息</span>
            <span class="vector-chip">照片关联</span>
            <span class="vector-chip">导入导出记录</span>
          </div>
        </section>

        <section class="vector-box vector-box--notes">
          <h3 class="vector-box__title">说明</h3>
          <p class="vector-box__desc">
            第一阶段先接入空白页面。后续会在这里承载数据集列表、图层状态、样式与关联管理。
          </p>
        </section>
      </div>
    </div>
  </section>
</template>

<script>
import TopLevelPageHeader from './TopLevelPageHeader.vue'
import { topLevelPageVars } from './topLevelPageConvention'

export default {
  name: 'VectorDataPage',
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
/**
 * 矢量数据入口页，当前作为 GIS 扩展能力的占位与规划说明页面。
 * 用户从 /vectors 进入，用来承接未来的 SHP、DWG 等地理资源导入和照片关联流程。
 * 现阶段应把它视为路线图页；真正的数据读写与图层逻辑接入前，请先补齐对应后端接口和 Frontend_README 说明。
 * 相关文档：frontend/Frontend_README.md、backend/techReadme.md。
 */

<style scoped lang="css">
.vector-data-page {
  @apply space-y-6;
}

.placeholder-shell {
  @apply rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-6 shadow-sm shadow-slate-200/70;
}

.placeholder-shell__header {
  @apply flex flex-col gap-4 md:flex-row md:items-start md:justify-between;
}

.placeholder-shell__eyebrow {
  @apply inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700;
}

.placeholder-shell__title {
  @apply mt-3 text-2xl font-semibold text-slate-900;
}

.placeholder-shell__status {
  @apply inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700;
}

.placeholder-shell__layout {
  @apply mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)];
}

.vector-box {
  @apply rounded-[24px] border border-slate-200 bg-white/90 p-5;
}

.vector-box--notes {
  @apply bg-slate-50/90;
}

.vector-box__title {
  @apply text-base font-semibold text-slate-900;
}

.vector-box__desc {
  @apply mt-3 text-sm leading-7 text-slate-600;
}

.vector-chip-list {
  @apply mt-4 flex flex-wrap gap-3;
}

.vector-chip {
  @apply inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700;
}
</style>