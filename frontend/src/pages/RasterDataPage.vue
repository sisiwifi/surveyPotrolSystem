<template>
  <section class="page raster-data-page" :style="pageVars">
    <TopLevelPageHeader
      title="栅格数据"
      subtitle="通过服务端路径导入超大遥感影像，并以后台任务方式跟踪复制、概览构建与建档进度。"
    >
      <div class="raster-page-actions">
        <button class="raster-page-btn raster-page-btn--primary" type="button" :disabled="busy" @click="openImportDialog">
          {{ busy ? '处理中…' : '导入栅格影像' }}
        </button>
        <button class="raster-page-btn" type="button" :disabled="busy || loading" @click="refreshDatasets">
          刷新列表
        </button>
      </div>
    </TopLevelPageHeader>

    <section class="raster-data-shell">
      <div class="raster-data-shell__intro">
        <article class="raster-intro-card">
          <h3>导入说明</h3>
          <p>当前栅格流程已切到服务路径模式。浏览器只负责选择服务端可访问的文件路径，不再直接上传大体积影像。</p>
          <ul>
            <li>“导入”会把影像复制到个人 grid 目录后再建档，并可在库内副本上构建真实概览金字塔。</li>
            <li>“仅加载”只记录原始绝对路径，不复制文件；如勾选优化，仅在服务端建立瓦片缓存，不改原文件。</li>
            <li>元数据预检与真正导入拆成两步，页面会显示后台任务进度；地图页只拉取所需瓦片，不会把整幅影像读入浏览器内存。</li>
          </ul>
        </article>

        <article class="raster-intro-card raster-intro-card--muted">
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
            <div>
              <dt>运行中任务</dt>
              <dd>{{ activeImportTaskCount }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div v-if="errorText" class="raster-feedback raster-feedback--error">{{ errorText }}</div>

      <section v-if="importTasks.length" class="raster-task-board">
        <div class="raster-task-board__head">
          <div>
            <h3>导入任务</h3>
            <p>{{ activeImportTaskCount }} 个运行中 / {{ finishedImportTaskCount }} 个已结束</p>
          </div>
          <button
            class="raster-page-btn raster-page-btn--small"
            type="button"
            :disabled="busy || !finishedImportTaskCount"
            @click="clearFinishedTasks"
          >
            清理已结束
          </button>
        </div>

        <div class="raster-task-grid">
          <article v-for="task in importTasks" :key="task.taskId" class="raster-task-card">
            <div class="raster-task-card__head">
              <div>
                <h4>{{ task.title || '未命名任务' }}</h4>
                <p>{{ task.sourcePath || '未记录源路径' }}</p>
              </div>
              <span class="raster-task-chip" :class="taskStatusClass(task.status)">
                {{ taskStatusLabel(task.status) }}
              </span>
            </div>

            <div class="raster-task-progress">
              <span class="raster-task-progress__bar" :style="{ width: `${taskProgressPercent(task)}%` }"></span>
            </div>

            <div class="raster-task-card__meta">
              <span>{{ task.message || '任务排队中' }}</span>
              <span v-if="task.progress !== null">{{ taskProgressPercent(task) }}%</span>
            </div>

            <div class="raster-task-card__meta raster-task-card__meta--muted">
              <span>{{ sourceModeLabel(task.sourceMode) }}</span>
              <span>{{ task.stage || 'queued' }}</span>
            </div>

            <p v-if="task.error" class="raster-task-card__error">{{ task.error }}</p>

            <div v-if="task.datasetPublicId" class="raster-task-card__actions">
              <button class="raster-page-btn raster-page-btn--small" type="button" @click="goToMap(task.datasetPublicId)">地图查看</button>
            </div>
          </article>
        </div>
      </section>

      <div v-if="!datasets.length && !loading" class="raster-empty-state">
        还没有导入任何栅格数据。点击上方按钮浏览服务端路径并加入后台导入任务。
      </div>

      <div v-else class="raster-dataset-grid">
        <article v-for="dataset in datasets" :key="dataset.public_id" class="raster-dataset-card">
          <div class="raster-dataset-card__head">
            <div>
              <h3>{{ dataset.title }}</h3>
              <p>{{ dataset.source_filename || dataset.source_path || '未记录源路径' }}</p>
            </div>
            <span class="raster-status-chip" :class="statusClass(dataset.import_status)">
              {{ dataset.import_status || 'unknown' }}
            </span>
          </div>

          <dl class="raster-dataset-meta">
            <div>
              <dt>格式</dt>
              <dd>{{ dataset.format || '未知' }}</dd>
            </div>
            <div>
              <dt>模式</dt>
              <dd>{{ sourceModeLabel(dataset.source_mode) }}</dd>
            </div>
            <div>
              <dt>波段</dt>
              <dd>{{ dataset.band_count || 0 }}</dd>
            </div>
            <div>
              <dt>坐标系</dt>
              <dd>{{ dataset.source_crs || '未记录' }}</dd>
            </div>
            <div>
              <dt>金字塔</dt>
              <dd>{{ pyramidLabel(dataset.pyramid_mode) }}</dd>
            </div>
            <div>
              <dt>透明</dt>
              <dd>{{ transparencyLabel(dataset.transparency_mode) }}</dd>
            </div>
          </dl>

          <p v-if="dataset.import_error" class="raster-dataset-card__error">{{ dataset.import_error }}</p>

          <div class="raster-dataset-card__extent">
            <strong>范围</strong>
            <span>{{ formatExtent(dataset.extent) }}</span>
          </div>

          <div class="raster-dataset-card__actions">
            <button class="raster-page-btn raster-page-btn--small" type="button" @click="goToMap(dataset.public_id)">地图查看</button>
            <button class="raster-page-btn raster-page-btn--small raster-page-btn--danger" type="button" @click="deleteDataset(dataset.public_id)">删除</button>
          </div>
        </article>
      </div>
    </section>

    <RasterImportDialog
      :visible="importDialogOpen"
      :busy="busy"
      :rows="importRows"
      :selected-ids="selectedImportRowIds"
      :error="importDialogError"
      @close="closeImportDialog"
      @browse-paths="openPathBrowser"
      @delete-selected="deleteSelectedImportRows"
      @confirm="confirmImportDialog"
      @toggle-row="toggleImportRowSelection"
      @update-row="updateImportRow"
    />

    <ServerPathBrowserDialog
      :visible="pathBrowserOpen"
      title="浏览栅格源路径"
      subtitle="选择服务端可访问的 tif/tiff/img/jp2 文件，可以一次加入多个路径。"
      hint="大体积影像会先做元数据预检，再按“导入构建概览 / 仅加载建立缓存”进入后台任务。"
      confirm-label="加入预检队列"
      selection-mode="multiple"
      :loader="loadRasterBrowser"
      @close="pathBrowserOpen = false"
      @confirm="handlePathBrowserConfirm"
    />

    <ActionProgressOverlay
      :visible="busy"
      title="正在处理栅格请求"
      message="系统正在检查服务路径、读取元数据或提交后台导入任务。"
    />
  </section>
</template>

<script>
/**
 * 栅格数据一级页。
 * 维护服务路径预检、后台任务轮询，以及“导入构建概览 / 仅读建立缓存”的页面语义。
 */
import ActionProgressOverlay from '../components/ActionProgressOverlay.vue'
import RasterImportDialog from '../components/RasterImportDialog.vue'
import ServerPathBrowserDialog from '../components/ServerPathBrowserDialog.vue'
import TopLevelPageHeader from './TopLevelPageHeader.vue'
import {
  browseRasterSources,
  createRasterImportTask,
  deleteRasterDataset,
  getRasterImportTask,
  inspectRasterPath,
  listRasterDatasets,
} from '../utils/rasterApi'
import { topLevelPageVars } from './topLevelPageConvention'

function toErrorMessage(error) {
  if (!error) return '未知错误'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function createRowFromInspection(id, inspection, extra = {}) {
  return {
    id,
    label: extra.label || inspection.source_filename || inspection.title || `栅格 ${id}`,
    title: inspection.title || extra.title || '',
    sourcePath: extra.sourcePath || '',
    sourceMode: extra.sourceMode || 'load_only',
    format: inspection.format || 'unknown',
    sourceCrs: inspection.source_crs || '',
    bandCount: Number(inspection.band_count || 0),
    pyramidMode: inspection.pyramid_mode || 'none',
    pyramidPath: inspection.pyramid_path || '',
    generatePyramid: inspection.pyramid_mode === 'none' || inspection.pyramid_mode === 'dynamic',
    maxZoom: Number(inspection.max_zoom || 18),
    transparencyMode: inspection.suggested_transparency_mode || 'preserve',
  }
}

function normalizeImportTask(task, extra = {}) {
  const progress = Number(task?.progress)
  return {
    taskId: String(task?.task_id || task?.taskId || ''),
    status: String(task?.status || extra.status || 'queued'),
    stage: String(task?.stage || extra.stage || 'queued'),
    progress: Number.isFinite(progress) ? progress : null,
    message: String(task?.message || extra.message || ''),
    error: String(task?.error || extra.error || ''),
    datasetPublicId: String(task?.dataset_public_id || task?.datasetPublicId || extra.datasetPublicId || ''),
    dataset: task?.dataset || extra.dataset || null,
    title: extra.title || task?.dataset?.title || '',
    sourcePath: extra.sourcePath || '',
    sourceMode: extra.sourceMode || 'import',
  }
}

function isActiveTask(task) {
  return ['queued', 'running'].includes(String(task?.status || ''))
}

export default {
  name: 'RasterDataPage',
  components: {
    ActionProgressOverlay,
    RasterImportDialog,
    ServerPathBrowserDialog,
    TopLevelPageHeader,
  },
  data() {
    return {
      datasets: [],
      loading: false,
      busy: false,
      errorText: '',
      importDialogOpen: false,
      importDialogError: '',
      importRows: [],
      selectedImportRowIds: [],
      nextImportRowId: 1,
      pathBrowserOpen: false,
      importTasks: [],
      taskPollTimer: null,
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
    activeImportTaskCount() {
      return this.importTasks.filter(task => isActiveTask(task)).length
    },
    finishedImportTaskCount() {
      return this.importTasks.filter(task => !isActiveTask(task)).length
    },
  },
  mounted() {
    this.refreshDatasets()
  },
  beforeUnmount() {
    this.stopTaskPolling()
  },
  methods: {
    statusClass(status) {
      return `raster-status-chip--${String(status || 'unknown').toLowerCase()}`
    },
    taskStatusClass(status) {
      return `raster-task-chip--${String(status || 'unknown').toLowerCase()}`
    },
    taskStatusLabel(status) {
      if (status === 'completed') return '已完成'
      if (status === 'failed') return '失败'
      if (status === 'running') return '运行中'
      return '排队中'
    },
    sourceModeLabel(mode) {
      return mode === 'load_only' ? '仅加载' : '导入'
    },
    pyramidLabel(mode) {
      if (!mode || mode === 'none') return '无'
      if (mode === 'generated_cache') return '服务端瓦片缓存'
      if (mode === 'overview') return '内建概览'
      if (mode === 'ovr') return '外部 .ovr 概览'
      if (mode === 'rrd') return '外部 .rrd 概览'
      if (mode === 'dynamic') return '动态读取'
      return mode
    },
    transparencyLabel(mode) {
      return mode === 'auto_black' ? '自动透明黑边' : '保留原值'
    },
    taskProgressPercent(task) {
      const progress = Number(task?.progress)
      if (!Number.isFinite(progress) || progress <= 0) {
        return 0
      }
      return Math.max(0, Math.min(100, Math.round(progress * 100)))
    },
    formatExtent(extent) {
      const bbox = Array.isArray(extent?.bbox) ? extent.bbox : null
      if (!bbox || bbox.length !== 4) {
        return '未记录'
      }
      return bbox.map(value => Number(value).toFixed(5)).join(' / ')
    },
    async refreshDatasets() {
      this.loading = true
      this.errorText = ''
      try {
        this.datasets = await listRasterDatasets()
      } catch (error) {
        this.errorText = toErrorMessage(error)
      } finally {
        this.loading = false
      }
    },
    openImportDialog() {
      this.importDialogError = ''
      this.importDialogOpen = true
    },
    closeImportDialog() {
      if (this.busy) {
        return
      }
      this.importDialogOpen = false
      this.importDialogError = ''
    },
    openPathBrowser() {
      if (this.busy) {
        return
      }
      this.pathBrowserOpen = true
    },
    loadRasterBrowser(path) {
      return browseRasterSources(path)
    },
    async handlePathBrowserConfirm(payload) {
      const paths = Array.isArray(payload) ? payload : [payload]
      this.pathBrowserOpen = false
      if (!paths.length) {
        return
      }

      this.importDialogOpen = true
      this.busy = true
      this.importDialogError = ''
      try {
        const rows = []
        const failures = []
        for (const sourcePath of paths) {
          try {
            const inspection = await inspectRasterPath(sourcePath)
            if (!inspection) {
              throw new Error('未读取到栅格元数据')
            }
            rows.push(createRowFromInspection(this.nextImportRowId + rows.length, inspection, {
              sourcePath,
              label: sourcePath,
              sourceMode: 'load_only',
            }))
          } catch (error) {
            failures.push(`${sourcePath}: ${toErrorMessage(error)}`)
          }
        }
        if (rows.length) {
          this.nextImportRowId += rows.length
          this.importRows = [...this.importRows, ...rows]
        }
        if (failures.length) {
          this.importDialogError = failures.join('；')
        }
      } finally {
        this.busy = false
      }
    },
    toggleImportRowSelection(rowId) {
      if (this.busy) {
        return
      }
      if (this.selectedImportRowIds.includes(rowId)) {
        this.selectedImportRowIds = this.selectedImportRowIds.filter(id => id !== rowId)
        return
      }
      this.selectedImportRowIds = [...this.selectedImportRowIds, rowId]
    },
    updateImportRow({ rowId, key, value }) {
      this.importRows = this.importRows.map(row => (
        row.id === rowId ? { ...row, [key]: value } : row
      ))
      this.importDialogError = ''
    },
    deleteSelectedImportRows() {
      if (this.busy || !this.selectedImportRowIds.length) {
        return
      }
      const selectedIdSet = new Set(this.selectedImportRowIds)
      this.importRows = this.importRows.filter(row => !selectedIdSet.has(row.id))
      this.selectedImportRowIds = []
    },
    async confirmImportDialog() {
      if (this.busy) {
        return
      }
      if (!this.importRows.length) {
        this.importDialogError = '请先浏览服务路径并加入至少一个栅格文件。'
        return
      }

      const failedRows = []
      const createdTasks = []
      this.busy = true
      this.errorText = ''
      this.importDialogError = ''
      try {
        for (const row of this.importRows) {
          try {
            const task = await createRasterImportTask({
              sourcePath: row.sourcePath,
              sourceMode: row.sourceMode,
              title: row.title,
              generatePyramid: row.generatePyramid,
              maxZoom: row.maxZoom,
              transparencyMode: row.transparencyMode,
            })
            createdTasks.push(normalizeImportTask(task, {
              title: row.title || row.label,
              sourcePath: row.sourcePath,
              sourceMode: row.sourceMode,
            }))
          } catch (error) {
            failedRows.push({ id: row.id, reason: toErrorMessage(error) })
          }
        }
      } finally {
        this.busy = false
      }

      if (createdTasks.length) {
        const nextTasks = [...this.importTasks]
        createdTasks.forEach(task => {
          const existingIndex = nextTasks.findIndex(item => item.taskId === task.taskId)
          if (existingIndex >= 0) {
            nextTasks.splice(existingIndex, 1, task)
            return
          }
          nextTasks.unshift(task)
        })
        this.importTasks = nextTasks
        this.scheduleTaskPolling()
      }

      if (failedRows.length) {
        const failedIdSet = new Set(failedRows.map(item => item.id))
        this.importRows = this.importRows.filter(row => failedIdSet.has(row.id))
        this.selectedImportRowIds = []
        this.importDialogError = failedRows.map(item => item.reason).join('；')
      } else {
        this.importRows = []
        this.selectedImportRowIds = []
        this.importDialogOpen = false
      }
    },
    stopTaskPolling() {
      if (this.taskPollTimer) {
        window.clearTimeout(this.taskPollTimer)
        this.taskPollTimer = null
      }
    },
    scheduleTaskPolling() {
      this.stopTaskPolling()
      if (!this.importTasks.some(task => isActiveTask(task))) {
        return
      }
      this.taskPollTimer = window.setTimeout(() => {
        this.taskPollTimer = null
        this.pollImportTasks()
      }, 1500)
    },
    async pollImportTasks() {
      const activeTasks = this.importTasks.filter(task => isActiveTask(task))
      if (!activeTasks.length) {
        return
      }

      const updates = await Promise.all(activeTasks.map(async task => {
        try {
          const payload = await getRasterImportTask(task.taskId)
          return normalizeImportTask(payload, task)
        } catch (error) {
          const message = toErrorMessage(error)
          return normalizeImportTask({
            task_id: task.taskId,
            status: 'failed',
            stage: 'failed',
            message,
            error: message,
          }, task)
        }
      }))

      const updateMap = new Map(updates.map(task => [task.taskId, task]))
      let shouldRefresh = false
      this.importTasks = this.importTasks.map(task => {
        const nextTask = updateMap.get(task.taskId)
        if (!nextTask) {
          return task
        }
        if (nextTask.status !== task.status && ['completed', 'failed'].includes(nextTask.status)) {
          shouldRefresh = true
        }
        return { ...task, ...nextTask }
      })

      if (shouldRefresh) {
        await this.refreshDatasets()
      }
      this.scheduleTaskPolling()
    },
    clearFinishedTasks() {
      this.importTasks = this.importTasks.filter(task => isActiveTask(task))
      if (!this.importTasks.some(task => isActiveTask(task))) {
        this.stopTaskPolling()
      }
    },
    async deleteDataset(publicId) {
      if (!window.confirm('确认删除该栅格数据集吗？')) {
        return
      }

      this.busy = true
      this.errorText = ''
      try {
        await deleteRasterDataset(publicId)
        await this.refreshDatasets()
      } catch (error) {
        this.errorText = toErrorMessage(error)
      } finally {
        this.busy = false
      }
    },
    goToMap(publicId) {
      this.$router.push({ path: '/maps', query: { focusRaster: publicId } })
    },
  },
}
</script>

<style scoped lang="css">
.raster-data-page {
  @apply space-y-6;
}

.raster-page-actions {
  @apply flex flex-wrap items-center gap-3;
}

.raster-page-btn {
  @apply inline-flex items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition;
}

.raster-page-btn:hover {
  @apply border-sky-300 bg-sky-50 text-slate-900;
}

.raster-page-btn--primary {
  @apply border-transparent bg-slate-900 text-white;
}

.raster-page-btn--primary:hover {
  @apply bg-slate-800 text-white;
}

.raster-page-btn--small {
  @apply px-3 py-2 text-xs;
}

.raster-page-btn--danger {
  @apply text-rose-700;
}

.raster-data-shell {
  @apply space-y-5;
}

.raster-data-shell__intro {
  @apply grid gap-4 xl:grid-cols-[2fr_minmax(0,1fr)];
}

.raster-intro-card {
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  @apply rounded-[26px] p-5;
}

.raster-intro-card h3 {
  @apply m-0 text-base font-semibold text-slate-900;
}

.raster-intro-card p {
  @apply mt-2 text-sm leading-7 text-slate-600;
}

.raster-intro-card ul {
  @apply mt-3 space-y-2 pl-5 text-sm text-slate-600;
}

.raster-intro-card--muted {
  background: linear-gradient(180deg, rgba(240, 249, 255, 0.92), rgba(248, 250, 252, 0.98));
}

.raster-intro-card--muted dl {
  @apply mt-4 grid gap-3;
}

.raster-intro-card--muted dt {
  @apply text-xs font-semibold uppercase tracking-[0.18em] text-slate-400;
}

.raster-intro-card--muted dd {
  @apply m-0 text-lg font-semibold text-slate-900;
}

.raster-feedback {
  @apply rounded-[18px] border px-4 py-3 text-sm font-semibold;
}

.raster-feedback--error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.raster-task-board {
  border: 1px solid rgba(191, 219, 254, 0.95);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.98));
  box-shadow: 0 18px 40px rgba(14, 116, 144, 0.08);
  @apply rounded-[26px] p-5;
}

.raster-task-board__head {
  @apply flex flex-wrap items-start justify-between gap-3;
}

.raster-task-board__head h3 {
  @apply m-0 text-base font-semibold text-slate-900;
}

.raster-task-board__head p {
  @apply mt-1 text-sm text-slate-500;
}

.raster-task-grid {
  @apply mt-4 grid gap-4 xl:grid-cols-2;
}

.raster-task-card {
  border: 1px solid rgba(203, 213, 225, 0.8);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
  @apply rounded-[22px] p-4;
}

.raster-task-card__head {
  @apply flex items-start justify-between gap-3;
}

.raster-task-card__head h4 {
  @apply m-0 text-base font-semibold text-slate-900;
}

.raster-task-card__head p {
  @apply mt-1 text-xs leading-6 text-slate-500;
  overflow-wrap: anywhere;
}

.raster-task-chip {
  @apply inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em];
}

.raster-task-chip--queued {
  @apply bg-slate-100 text-slate-600;
}

.raster-task-chip--running {
  @apply bg-sky-50 text-sky-700;
}

.raster-task-chip--completed {
  @apply bg-emerald-50 text-emerald-700;
}

.raster-task-chip--failed,
.raster-task-chip--error {
  @apply bg-rose-50 text-rose-700;
}

.raster-task-progress {
  position: relative;
  margin-top: 1rem;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.92);
}

.raster-task-progress__bar {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 10px;
  border-radius: inherit;
  background: linear-gradient(90deg, #0ea5e9, #0f766e, #0f172a);
}

.raster-task-card__meta {
  @apply mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700;
}

.raster-task-card__meta--muted {
  @apply mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400;
}

.raster-task-card__error {
  @apply mt-3 rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.raster-task-card__actions {
  @apply mt-4 flex flex-wrap gap-2;
}

.raster-empty-state {
  @apply rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center text-sm text-slate-500;
}

.raster-dataset-grid {
  @apply grid gap-4 xl:grid-cols-2;
}

.raster-dataset-card {
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
  @apply rounded-[24px] p-5;
}

.raster-dataset-card__head {
  @apply flex items-start justify-between gap-4;
}

.raster-dataset-card__head h3 {
  @apply m-0 text-base font-semibold text-slate-900;
}

.raster-dataset-card__head p {
  @apply mt-1 text-xs leading-6 text-slate-500;
  overflow-wrap: anywhere;
}

.raster-status-chip {
  @apply inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em];
}

.raster-status-chip--ready {
  @apply bg-emerald-50 text-emerald-700;
}

.raster-status-chip--error {
  @apply bg-rose-50 text-rose-700;
}

.raster-status-chip--pending,
.raster-status-chip--unknown {
  @apply bg-amber-50 text-amber-700;
}

.raster-dataset-meta {
  @apply mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3;
}

.raster-dataset-meta dt {
  @apply text-xs font-semibold uppercase tracking-[0.16em] text-slate-400;
}

.raster-dataset-meta dd {
  @apply m-0 mt-1 text-sm text-slate-700;
}

.raster-dataset-card__error {
  @apply mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.raster-dataset-card__extent {
  @apply mt-4 rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600;
}

.raster-dataset-card__extent strong {
  @apply mr-2 text-slate-900;
}

.raster-dataset-card__actions {
  @apply mt-4 flex flex-wrap gap-2;
}

@media (max-width: 860px) {
  .raster-task-card__head,
  .raster-dataset-card__head {
    @apply flex-col;
  }
}
</style>