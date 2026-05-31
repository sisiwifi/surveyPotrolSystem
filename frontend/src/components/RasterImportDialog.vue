<template>
  <Teleport to="body">
    <Transition name="raster-import-fade">
      <div v-if="visible" class="raster-import-mask" @click.self="$emit('close')">
        <section class="raster-import-dialog" role="dialog" aria-modal="true" aria-label="导入栅格影像">
          <header class="raster-import-dialog__header">
            <div>
              <h3 class="raster-import-dialog__title">导入栅格影像</h3>
              <p class="raster-import-dialog__subtitle">通过服务端路径浏览选择遥感影像。导入模式可在库内副本上构建概览金字塔，仅读模式只在服务端建立缓存，不改原文件。</p>
            </div>
            <button class="raster-import-dialog__close" type="button" :disabled="busy" @click="$emit('close')">关闭</button>
          </header>

          <div class="raster-import-layout">
            <div class="raster-import-board">
              <div class="raster-import-table-wrap">
                <table v-if="rows.length" class="raster-import-table">
                  <thead>
                    <tr>
                      <th>路径</th>
                      <th>方式</th>
                      <th>金字塔</th>
                      <th>级别</th>
                      <th>透明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in rows"
                      :key="row.id"
                      class="raster-import-row"
                      :class="{ 'is-selected': selectedIds.includes(row.id) }"
                      @click="$emit('toggle-row', row.id)"
                    >
                      <td>
                        <div class="raster-import-path-cell">
                          <span class="raster-import-path-cell__mark">{{ selectedIds.includes(row.id) ? '●' : '○' }}</span>
                          <div>
                            <div class="raster-import-path">{{ row.label }}</div>
                            <div class="raster-import-meta">
                              服务路径
                              / {{ row.format || '未知格式' }}
                              / {{ row.sourceCrs || '未记录坐标系' }}
                              / {{ row.bandCount || 0 }} 波段
                            </div>
                            <div class="raster-import-inline-meta">{{ row.sourcePath || '未记录原始路径' }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          class="raster-import-select"
                          :disabled="busy"
                          :value="row.sourceMode"
                          @click.stop
                          @change="$emit('update-row', { rowId: row.id, key: 'sourceMode', value: $event.target.value })"
                        >
                          <option value="import">导入</option>
                          <option value="load_only" :disabled="row.pathMode !== 'manual'">仅加载</option>
                        </select>
                      </td>
                      <td>
                        <select
                          class="raster-import-select"
                          :disabled="busy"
                          :value="String(Boolean(row.generatePyramid))"
                          @click.stop
                          @change="$emit('update-row', { rowId: row.id, key: 'generatePyramid', value: $event.target.value === 'true' })"
                        >
                          <option value="false">{{ existingPyramidLabel(row) }}</option>
                          <option value="true">{{ generateActionLabel(row) }}</option>
                        </select>
                        <div class="raster-import-inline-meta">{{ row.pyramidPath || '未检测到外部金字塔路径' }}</div>
                      </td>
                      <td>
                        <select
                          class="raster-import-select"
                          :disabled="busy"
                          :value="String(row.maxZoom)"
                          @click.stop
                          @change="$emit('update-row', { rowId: row.id, key: 'maxZoom', value: Number($event.target.value) })"
                        >
                          <option v-for="zoom in zoomOptions" :key="zoom" :value="String(zoom)">z{{ zoom }}</option>
                        </select>
                      </td>
                      <td>
                        <select
                          class="raster-import-select"
                          :disabled="busy"
                          :value="row.transparencyMode"
                          @click.stop
                          @change="$emit('update-row', { rowId: row.id, key: 'transparencyMode', value: $event.target.value })"
                        >
                          <option value="auto_black">自动透明黑边</option>
                          <option value="preserve">保留原值</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div v-else class="raster-import-empty">
                  尚未添加任何栅格影像。点击右侧按钮浏览服务端路径并加入队列。
                </div>
              </div>
            </div>

            <aside class="raster-import-actions">
              <div class="raster-import-actions__top">
                <button class="raster-import-side-btn" type="button" :disabled="busy" @click="$emit('browse-paths')">浏览服务路径</button>
                <button class="raster-import-side-btn raster-import-side-btn--danger" type="button" :disabled="busy || !selectedIds.length" @click="$emit('delete-selected')">删除行</button>
              </div>

              <div class="raster-import-actions__bottom">
                <button class="raster-import-main-btn raster-import-main-btn--accent" type="button" :disabled="busy || !rows.length" @click="$emit('confirm')">
                  {{ busy ? '处理中…' : '创建后台任务' }}
                </button>
                <button class="raster-import-main-btn raster-import-main-btn--ghost" type="button" :disabled="busy" @click="$emit('close')">取消</button>
              </div>
            </aside>
          </div>

          <p v-if="error" class="raster-import-feedback raster-import-feedback--error">{{ error }}</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
/**
 * 栅格导入任务对话框。
 * 基于服务路径预检结果选择“导入并构建概览”或“仅加载并建立服务端缓存”。
 */
export default {
  name: 'RasterImportDialog',
  props: {
    visible: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    rows: { type: Array, default: () => [] },
    selectedIds: { type: Array, default: () => [] },
    error: { type: String, default: '' },
  },
  emits: ['browse-paths', 'close', 'confirm', 'delete-selected', 'toggle-row', 'update-row'],
  computed: {
    zoomOptions() {
      return Array.from({ length: 13 }, (_, index) => index + 6)
    },
  },
  methods: {
    existingPyramidLabel(row) {
      const mode = String(row?.pyramidMode || 'none')
      if (mode === 'none' || mode === 'dynamic') {
        return row?.sourceMode === 'load_only' ? '保持动态读取' : '保持无概览'
      }
      if (mode === 'overview') return '使用现有概览'
      if (mode === 'ovr') return '使用现有 .ovr'
      if (mode === 'rrd') return '使用现有 .rrd'
      if (mode === 'generated_cache') return '使用服务端缓存'
      return `使用现有 ${mode}`
    },
    generateActionLabel(row) {
      return row?.sourceMode === 'load_only' ? '建立服务端瓦片缓存' : '构建概览金字塔'
    },
  },
}
</script>

<style scoped lang="css">
.raster-import-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(8px);
}

.raster-import-dialog {
  width: min(100%, 1280px);
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 30px;
  padding: 1.35rem;
  background:
    radial-gradient(circle at top left, rgba(191, 219, 254, 0.72), transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
}

.raster-import-dialog__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.raster-import-dialog__title {
  margin: 0;
  color: #0f172a;
  font-size: 1.12rem;
  font-weight: 800;
}

.raster-import-dialog__subtitle {
  margin: 0.4rem 0 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.6;
}

.raster-import-dialog__close {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.raster-import-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 1.2rem;
  margin-top: 1.2rem;
}

.raster-import-board {
  min-width: 0;
}

.raster-import-table-wrap {
  min-height: 460px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 22px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.84);
}

.raster-import-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.raster-import-table th,
.raster-import-table td {
  border-bottom: 1px solid rgba(203, 213, 225, 0.8);
  padding: 0.85rem 0.9rem;
  text-align: left;
  vertical-align: top;
}

.raster-import-table th {
  color: #334155;
  font-size: 0.8rem;
  font-weight: 800;
  background: rgba(248, 250, 252, 0.92);
}

.raster-import-table th:first-child,
.raster-import-table td:first-child {
  width: 40%;
  border-right: 1px solid rgba(203, 213, 225, 0.8);
}

.raster-import-row {
  cursor: pointer;
  transition: background 150ms ease;
}

.raster-import-row:hover {
  background: rgba(241, 245, 249, 0.74);
}

.raster-import-row.is-selected {
  background: rgba(219, 234, 254, 0.8);
}

.raster-import-path-cell {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.raster-import-path-cell__mark {
  color: #0f172a;
  font-size: 0.92rem;
  line-height: 1.2;
}

.raster-import-path {
  color: #0f172a;
  font-size: 0.86rem;
  font-weight: 700;
  word-break: break-all;
}

.raster-import-meta,
.raster-import-inline-meta {
  margin-top: 0.28rem;
  color: #64748b;
  font-size: 0.74rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.raster-import-select {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  padding: 0.72rem 0.8rem;
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  font-size: 0.84rem;
}

.raster-import-empty {
  min-height: 460px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: #94a3b8;
  font-size: 0.86rem;
  text-align: center;
}

.raster-import-actions {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
}

.raster-import-actions__top,
.raster-import-actions__bottom {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.raster-import-side-btn,
.raster-import-main-btn {
  border: 0;
  cursor: pointer;
  transition: transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.raster-import-side-btn:hover,
.raster-import-main-btn:hover {
  transform: translateY(-1px);
}

.raster-import-side-btn {
  width: 100%;
  min-height: 56px;
  border-radius: 18px;
  padding: 0.88rem 0.95rem;
  background: rgba(255, 255, 255, 0.94);
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 800;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.3);
}

.raster-import-side-btn--danger {
  color: #991b1b;
}

.raster-import-main-btn {
  width: 100%;
  min-height: 56px;
  border-radius: 18px;
  padding: 0.9rem 1rem;
  font-size: 0.96rem;
  font-weight: 800;
}

.raster-import-main-btn--accent {
  background: linear-gradient(135deg, #0f766e, #0f766e 35%, #0f172a);
  color: #fff;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.16);
}

.raster-import-main-btn--ghost {
  background: rgba(226, 232, 240, 0.88);
  color: #334155;
}

.raster-import-feedback {
  margin: 1rem 0 0;
  border-radius: 16px;
  padding: 0.8rem 0.95rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.raster-import-feedback--error {
  background: rgba(254, 226, 226, 0.9);
  color: #991b1b;
}

.raster-import-side-btn:disabled,
.raster-import-main-btn:disabled,
.raster-import-select:disabled,
.raster-import-dialog__close:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.raster-import-fade-enter-active,
.raster-import-fade-leave-active {
  transition: opacity 180ms ease;
}

.raster-import-fade-enter-from,
.raster-import-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1080px) {
  .raster-import-layout {
    grid-template-columns: 1fr;
  }

  .raster-import-actions__top,
  .raster-import-actions__bottom {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .raster-import-side-btn,
  .raster-import-main-btn {
    flex: 1 1 180px;
  }
}

@media (max-width: 860px) {
  .raster-import-table-wrap {
    overflow: auto;
  }

  .raster-import-table {
    min-width: 1120px;
  }
}
</style>