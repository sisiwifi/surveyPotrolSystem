<template>
  <section class="page vector-data-page" :style="pageVars">
    <TopLevelPageHeader
      title="矢量数据"
      subtitle="导入 SHP 与业务 CSV 点位文件，统一管理样式并联动地图页。"
    >
      <div class="vector-page-actions">
        <button class="vector-page-btn vector-page-btn--primary" type="button" :disabled="busy" @click="openPathBrowser">
          {{ busy ? '导入中…' : '服务路径导入' }}
        </button>
        <button class="vector-page-btn" type="button" :disabled="busy" @click="openFilePicker">
          浏览器上传 CSV / ZIP
        </button>
        <button class="vector-page-btn" type="button" :disabled="busy || loading" @click="refreshDatasets">
          刷新列表
        </button>
      </div>
    </TopLevelPageHeader>

    <input
      ref="fileInput"
      class="vector-page-hidden-input"
      type="file"
      accept=".csv,.zip"
      multiple
      @change="handleFileChange"
    >

    <section class="vector-data-shell">
      <div class="vector-data-shell__intro">
        <article class="vector-intro-card">
          <h3>导入说明</h3>
          <p>支持业务 CSV 点位文件，以及 SHP / ZIP 的服务路径导入。SHP 现在会由服务端自动寻找同目录同名侧车文件。</p>
          <ul>
            <li>CSV 可继续通过浏览器上传，或直接走服务路径导入。</li>
            <li>SHP 建议使用“服务路径导入”，后端会自动读取同目录的 .prj/.shx/.dbf 等侧车文件。</li>
            <li>ZIP 仍可通过浏览器上传，或直接走服务路径导入。</li>
            <li>导入完成后会同步出现在地图管理页的业务图层面板中。</li>
          </ul>
        </article>

        <article class="vector-intro-card vector-intro-card--muted">
          <h3>当前状态</h3>
          <dl>
            <div>
              <dt>数据集</dt>
              <dd>{{ datasets.length }}</dd>
            </div>
            <div>
              <dt>已就绪</dt>
              <dd>{{ readyCount }}</dd>
            </div>
            <div>
              <dt>异常</dt>
              <dd>{{ errorCount }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div v-if="errorText" class="vector-feedback vector-feedback--error">{{ errorText }}</div>

      <div v-if="!datasets.length && !loading" class="vector-empty-state">
        还没有导入任何矢量数据。点击上方按钮通过服务路径导入 SHP，或上传 CSV / ZIP 开始测试。
      </div>

      <div v-else class="vector-dataset-grid">
        <article v-for="dataset in datasets" :key="dataset.public_id" class="vector-dataset-card">
          <div class="vector-dataset-card__head">
            <div>
              <h3>{{ dataset.title }}</h3>
              <p>{{ dataset.source_filename || '未记录源文件名' }}</p>
            </div>
            <span class="vector-status-chip" :class="statusClass(dataset.import_status)">
              {{ dataset.import_status || 'unknown' }}
            </span>
          </div>

          <dl class="vector-dataset-meta">
            <div>
              <dt>格式</dt>
              <dd>{{ dataset.format }}</dd>
            </div>
            <div>
              <dt>几何</dt>
              <dd>{{ dataset.geometry_type || '未知' }}</dd>
            </div>
            <div>
              <dt>要素数</dt>
              <dd>{{ dataset.parsed_feature_count || 0 }}</dd>
            </div>
            <div>
              <dt>源坐标系</dt>
              <dd>{{ dataset.source_crs || '未记录' }}</dd>
            </div>
          </dl>

          <p v-if="dataset.import_error" class="vector-dataset-card__error">{{ dataset.import_error }}</p>

          <div class="vector-dataset-card__extent">
            <strong>范围</strong>
            <span>{{ formatExtent(dataset.extent) }}</span>
          </div>

          <div class="vector-style-form">
            <label>
              <span>主颜色</span>
              <input v-model="editingStyles[dataset.public_id].color" type="color">
            </label>
            <label>
              <span>透明度</span>
              <input v-model.number="editingStyles[dataset.public_id].opacity" type="range" min="0.05" max="1" step="0.05">
            </label>
            <label>
              <span>{{ sizeLabel(dataset.geometry_type) }}</span>
              <input v-model.number="editingStyles[dataset.public_id].size" type="range" min="1" max="16" step="1">
            </label>
          </div>

          <div class="vector-dataset-card__actions">
            <button class="vector-page-btn vector-page-btn--small" type="button" @click="saveStyle(dataset.public_id)">保存样式</button>
            <button class="vector-page-btn vector-page-btn--small" type="button" @click="goToMap(dataset.public_id)">地图查看</button>
            <button class="vector-page-btn vector-page-btn--small vector-page-btn--danger" type="button" @click="deleteDataset(dataset.public_id)">删除</button>
          </div>
        </article>
      </div>
    </section>

    <ActionProgressOverlay
      :visible="busy"
      title="正在处理矢量导入"
      message="后端会解析坐标系、自动识别 SHP 同目录侧车文件，并写入统一主库。"
    />

    <ServerPathBrowserDialog
      :visible="pathBrowserOpen"
      title="浏览矢量源路径"
      subtitle="选择服务端可访问的 SHP / CSV / ZIP 文件。SHP 会自动匹配同目录的 .prj/.shx/.dbf。"
      hint="如果要导入单个 SHP，请直接选 .shp 文件即可，系统会由服务端补齐同名侧车文件。"
      confirm-label="开始导入"
      selection-mode="single"
      :loader="loadVectorBrowser"
      @close="pathBrowserOpen = false"
      @confirm="handlePathBrowserConfirm"
    />
  </section>
</template>

<script>
/**
 * 矢量数据一级页，负责导入 SHP 与业务 CSV，并管理地图展示所需的基础样式。
 * 当前页面直接对接统一 PostgreSQL 主库后的 vectors API，导入完成的数据会同步出现在地图管理页。
 * 相关文档：frontend/Frontend_README.md、backend/api_services.md。
 */
import ActionProgressOverlay from '../components/ActionProgressOverlay.vue'
import ServerPathBrowserDialog from '../components/ServerPathBrowserDialog.vue'
import TopLevelPageHeader from './TopLevelPageHeader.vue'
import {
  browseVectorSources,
  deleteVectorDataset,
  importVectorDataset,
  importVectorDatasetFromPath,
  listVectorDatasets,
  updateVectorDatasetStyle,
} from '../utils/vectorApi'
import { topLevelPageVars } from './topLevelPageConvention'

function isPointGeometry(geometryType) {
  return String(geometryType || '').toLowerCase().includes('point')
}

function isLineGeometry(geometryType) {
  return String(geometryType || '').toLowerCase().includes('line')
}

function normalizeStyleDraft(dataset) {
  const style = dataset?.style_config || {}
  const color = style.circleColor || style.lineColor || style.fillColor || '#0ea5e9'
  const opacity = Number(style.fillOpacity ?? 0.24)
  const size = isPointGeometry(dataset?.geometry_type)
    ? Number(style.circleRadius ?? 6)
    : Number(style.lineWidth ?? 3)

  return {
    color,
    opacity: Number.isFinite(opacity) ? opacity : 0.24,
    size: Number.isFinite(size) ? size : 3,
  }
}

export default {
  name: 'VectorDataPage',
  components: {
    ActionProgressOverlay,
    ServerPathBrowserDialog,
    TopLevelPageHeader,
  },
  data() {
    return {
      datasets: [],
      loading: false,
      busy: false,
      errorText: '',
      editingStyles: {},
      pathBrowserOpen: false,
    }
  },
  computed: {
    pageVars() {
      return topLevelPageVars()
    },
    readyCount() {
      return this.datasets.filter(item => item.import_status === 'ready').length
    },
    errorCount() {
      return this.datasets.filter(item => item.import_status === 'error').length
    },
  },
  mounted() {
    this.refreshDatasets()
  },
  methods: {
    statusClass(status) {
      return `vector-status-chip--${String(status || 'unknown').toLowerCase()}`
    },
    sizeLabel(geometryType) {
      if (isPointGeometry(geometryType)) {
        return '点半径'
      }
      if (isLineGeometry(geometryType)) {
        return '线宽'
      }
      return '描边宽度'
    },
    openFilePicker() {
      this.$refs.fileInput?.click()
    },
    openPathBrowser() {
      this.pathBrowserOpen = true
    },
    loadVectorBrowser(path = '') {
      return browseVectorSources(path)
    },
    async refreshDatasets() {
      this.loading = true
      this.errorText = ''
      try {
        const datasets = await listVectorDatasets()
        this.datasets = datasets
        this.editingStyles = datasets.reduce((result, dataset) => {
          result[dataset.public_id] = normalizeStyleDraft(dataset)
          return result
        }, {})
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : '读取矢量列表失败'
      } finally {
        this.loading = false
      }
    },
    async handleFileChange(event) {
      const files = Array.from(event.target?.files || [])
      event.target.value = ''
      if (!files.length) {
        return
      }

      this.busy = true
      this.errorText = ''
      try {
        await importVectorDataset(files)
        await this.refreshDatasets()
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : '矢量导入失败'
      } finally {
        this.busy = false
      }
    },
    async handlePathBrowserConfirm(sourcePath) {
      this.pathBrowserOpen = false
      if (!sourcePath) {
        return
      }

      this.busy = true
      this.errorText = ''
      try {
        await importVectorDatasetFromPath(sourcePath)
        await this.refreshDatasets()
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : '矢量导入失败'
      } finally {
        this.busy = false
      }
    },
    async saveStyle(publicId) {
      const dataset = this.datasets.find(item => item.public_id === publicId)
      const draft = this.editingStyles[publicId]
      if (!dataset || !draft) {
        return
      }

      const geometryType = dataset.geometry_type
      let styleConfig
      if (isPointGeometry(geometryType)) {
        styleConfig = {
          circleColor: draft.color,
          circleRadius: draft.size,
          circleStrokeColor: '#ffffff',
          circleStrokeWidth: 1.2,
        }
      } else if (isLineGeometry(geometryType)) {
        styleConfig = {
          lineColor: draft.color,
          lineWidth: draft.size,
        }
      } else {
        styleConfig = {
          fillColor: draft.color,
          fillOpacity: draft.opacity,
          lineColor: draft.color,
          lineWidth: draft.size,
        }
      }

      try {
        await updateVectorDatasetStyle(publicId, styleConfig)
        await this.refreshDatasets()
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : '保存样式失败'
      }
    },
    async deleteDataset(publicId) {
      if (!window.confirm('确认删除该矢量数据集及其要素吗？')) {
        return
      }

      this.busy = true
      this.errorText = ''
      try {
        await deleteVectorDataset(publicId)
        await this.refreshDatasets()
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : '删除数据集失败'
      } finally {
        this.busy = false
      }
    },
    goToMap(publicId) {
      this.$router.push({ path: '/maps', query: { focus: publicId } })
    },
    formatExtent(extent) {
      const bbox = Array.isArray(extent?.bbox) ? extent.bbox : null
      if (!bbox || bbox.length !== 4) {
        return '未记录'
      }
      return bbox.map(value => Number(value).toFixed(5)).join(' / ')
    },
  },
}
</script>

<style scoped lang="css">
.vector-data-page {
  @apply space-y-6;
}

.vector-page-hidden-input {
  display: none;
}

.vector-page-actions {
  @apply flex flex-wrap items-center gap-3;
}

.vector-page-btn {
  @apply inline-flex items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition;
}

.vector-page-btn:hover {
  @apply border-sky-300 bg-sky-50 text-slate-900;
}

.vector-page-btn--primary {
  @apply border-transparent bg-slate-900 text-white;
}

.vector-page-btn--primary:hover {
  @apply border-transparent bg-slate-800 text-white;
}

.vector-page-btn--small {
  @apply px-3 py-2 text-xs;
}

.vector-page-btn--danger {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.vector-data-shell {
  @apply space-y-4;
}

.vector-data-shell__intro {
  @apply grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)];
}

.vector-intro-card {
  @apply rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/70;
}

.vector-intro-card--muted {
  @apply bg-slate-50/90;
}

.vector-intro-card h3 {
  @apply m-0 text-lg font-semibold text-slate-900;
}

.vector-intro-card p,
.vector-intro-card li,
.vector-intro-card dt,
.vector-intro-card dd {
  @apply text-sm leading-7 text-slate-600;
}

.vector-intro-card ul {
  @apply mt-3 space-y-1 pl-5;
}

.vector-intro-card dl {
  @apply mt-4 grid gap-3;
}

.vector-intro-card dt {
  @apply text-xs font-semibold uppercase tracking-[0.18em] text-slate-400;
}

.vector-intro-card dd {
  @apply m-0 text-xl font-semibold text-slate-900;
}

.vector-feedback {
  @apply rounded-[20px] border px-4 py-3 text-sm;
}

.vector-feedback--error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.vector-empty-state {
  @apply rounded-[24px] border border-dashed border-slate-300 bg-white/90 px-6 py-12 text-center text-sm text-slate-500;
}

.vector-dataset-grid {
  @apply grid gap-4 xl:grid-cols-2;
}

.vector-dataset-card {
  @apply rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-200/70;
}

.vector-dataset-card__head {
  @apply flex flex-wrap items-start justify-between gap-3;
}

.vector-dataset-card__head h3 {
  @apply m-0 text-lg font-semibold text-slate-900;
}

.vector-dataset-card__head p {
  @apply mt-1 text-sm text-slate-500;
}

.vector-status-chip {
  @apply inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em];
}

.vector-status-chip--ready {
  @apply bg-emerald-50 text-emerald-700;
}

.vector-status-chip--error {
  @apply bg-rose-50 text-rose-700;
}

.vector-status-chip--pending,
.vector-status-chip--unknown {
  @apply bg-amber-50 text-amber-700;
}

.vector-dataset-meta {
  @apply mt-4 grid gap-3 sm:grid-cols-2;
}

.vector-dataset-meta dt {
  @apply text-xs font-semibold uppercase tracking-[0.16em] text-slate-400;
}

.vector-dataset-meta dd {
  @apply m-0 text-sm text-slate-700;
}

.vector-dataset-card__error {
  @apply mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.vector-dataset-card__extent {
  @apply mt-4 flex flex-col gap-1 rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600;
}

.vector-style-form {
  @apply mt-4 grid gap-3 sm:grid-cols-3;
}

.vector-style-form label {
  @apply flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500;
}

.vector-style-form input[type='range'] {
  @apply w-full;
}

.vector-dataset-card__actions {
  @apply mt-5 flex flex-wrap gap-2;
}
</style>