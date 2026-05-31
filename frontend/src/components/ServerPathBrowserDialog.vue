<template>
  <Teleport to="body">
    <Transition name="path-browser-fade">
      <div v-if="visible" class="path-browser-mask" @click.self="$emit('close')">
        <section class="path-browser-dialog" role="dialog" aria-modal="true" :aria-label="title">
          <header class="path-browser-dialog__header">
            <div>
              <h3 class="path-browser-dialog__title">{{ title }}</h3>
              <p class="path-browser-dialog__subtitle">{{ subtitle }}</p>
            </div>
            <button class="path-browser-dialog__close" type="button" :disabled="loading" @click="$emit('close')">关闭</button>
          </header>

          <div class="path-browser-toolbar">
            <button class="path-browser-btn" type="button" :disabled="loading" @click="loadRoot">根目录</button>
            <button class="path-browser-btn" type="button" :disabled="loading || !parentPath" @click="load(parentPath)">上一级</button>
            <button class="path-browser-btn" type="button" :disabled="loading" @click="reloadCurrent">刷新</button>
            <div class="path-browser-toolbar__path">
              <input
                v-model.trim="draftPath"
                class="path-browser-input"
                type="text"
                placeholder="输入绝对路径并回车"
                @keydown.enter.prevent="openDraftPath"
              >
              <button class="path-browser-btn path-browser-btn--primary" type="button" :disabled="loading" @click="openDraftPath">打开</button>
            </div>
          </div>

          <div v-if="error" class="path-browser-feedback path-browser-feedback--error">{{ error }}</div>

          <div class="path-browser-current">
            <strong>当前位置</strong>
            <span>{{ currentPath || '根目录 / 驱动器列表' }}</span>
          </div>

          <div class="path-browser-board">
            <div v-if="loading" class="path-browser-empty">正在读取服务端目录…</div>

            <div v-else-if="!items.length" class="path-browser-empty">
              当前目录没有符合条件的文件。
            </div>

            <ul v-else class="path-browser-list">
              <li v-for="item in items" :key="item.path">
                <article
                  class="path-browser-item"
                  :class="{
                    'path-browser-item--dir': item.entry_type !== 'file',
                    'path-browser-item--selected': isSelected(item.path),
                  }"
                >
                  <button class="path-browser-item__main" type="button" @click="openItem(item)">
                    <span class="path-browser-item__icon">{{ item.entry_type === 'file' ? 'FILE' : 'DIR' }}</span>
                    <span class="path-browser-item__copy">
                      <span class="path-browser-item__name">{{ item.name }}</span>
                      <span class="path-browser-item__meta">
                        {{ item.path }}
                        <template v-if="item.entry_type === 'file' && Number.isFinite(item.size_bytes)">
                          / {{ formatBytes(item.size_bytes) }}
                        </template>
                        <template v-if="item.modified_at">
                          / {{ formatTime(item.modified_at) }}
                        </template>
                      </span>
                    </span>
                  </button>

                  <button
                    v-if="item.entry_type === 'file'"
                    class="path-browser-select-btn"
                    type="button"
                    :class="{ 'path-browser-select-btn--active': isSelected(item.path) }"
                    @click="toggleSelect(item.path)"
                  >
                    {{ selectionMode === 'single' ? (isSelected(item.path) ? '已选' : '选择') : (isSelected(item.path) ? '取消' : '加入') }}
                  </button>
                </article>
              </li>
            </ul>
          </div>

          <footer class="path-browser-dialog__footer">
            <p class="path-browser-dialog__hint">{{ hint }}</p>
            <div class="path-browser-dialog__actions">
              <button class="path-browser-btn" type="button" :disabled="loading" @click="$emit('close')">取消</button>
              <button
                class="path-browser-btn path-browser-btn--primary"
                type="button"
                :disabled="loading || !selectedPaths.length"
                @click="confirmSelection"
              >
                {{ confirmLabel }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
export default {
  name: 'ServerPathBrowserDialog',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '浏览服务路径' },
    subtitle: { type: String, default: '通过服务端目录浏览选择数据源文件。' },
    hint: { type: String, default: '' },
    confirmLabel: { type: String, default: '确认选择' },
    selectionMode: {
      type: String,
      default: 'single',
      validator(value) {
        return ['single', 'multiple'].includes(value)
      },
    },
    loader: {
      type: Function,
      required: true,
    },
  },
  emits: ['close', 'confirm'],
  data() {
    return {
      loading: false,
      error: '',
      currentPath: '',
      parentPath: '',
      draftPath: '',
      items: [],
      selectedPaths: [],
    }
  },
  watch: {
    visible: {
      immediate: true,
      handler(value) {
        if (!value) {
          return
        }
        this.selectedPaths = []
        this.load(this.currentPath || '')
      },
    },
  },
  methods: {
    async load(path = '') {
      this.loading = true
      this.error = ''
      try {
        const payload = await this.loader(path)
        this.currentPath = String(payload?.current_path || '')
        this.parentPath = String(payload?.parent_path || '')
        this.items = Array.isArray(payload?.items) ? payload.items : []
        this.draftPath = this.currentPath
        const allowed = new Set(this.items.filter(item => item?.entry_type === 'file').map(item => item.path))
        this.selectedPaths = this.selectedPaths.filter(item => allowed.has(item))
      } catch (error) {
        this.error = error instanceof Error ? error.message : '读取目录失败'
      } finally {
        this.loading = false
      }
    },
    loadRoot() {
      this.load('')
    },
    reloadCurrent() {
      this.load(this.currentPath || '')
    },
    openDraftPath() {
      this.load(this.draftPath || '')
    },
    openItem(item) {
      if (item?.entry_type === 'file') {
        this.toggleSelect(item.path)
        return
      }
      this.load(item?.path || '')
    },
    isSelected(path) {
      return this.selectedPaths.includes(path)
    },
    toggleSelect(path) {
      if (this.selectionMode === 'single') {
        this.selectedPaths = this.isSelected(path) ? [] : [path]
        return
      }
      if (this.isSelected(path)) {
        this.selectedPaths = this.selectedPaths.filter(item => item !== path)
        return
      }
      this.selectedPaths = [...this.selectedPaths, path]
    },
    confirmSelection() {
      if (!this.selectedPaths.length) {
        return
      }
      const payload = this.selectionMode === 'single'
        ? this.selectedPaths[0]
        : [...this.selectedPaths]
      this.$emit('confirm', payload)
      this.selectedPaths = []
    },
    formatBytes(size) {
      const value = Number(size || 0)
      if (!Number.isFinite(value) || value <= 0) {
        return '0 B'
      }
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let current = value
      let unitIndex = 0
      while (current >= 1024 && unitIndex < units.length - 1) {
        current /= 1024
        unitIndex += 1
      }
      return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
    },
    formatTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        return ''
      }
      return date.toLocaleString()
    },
  },
}
</script>

<style scoped lang="css">
.path-browser-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
}

.path-browser-dialog {
  width: min(100%, 1180px);
  max-height: min(88vh, 900px);
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 28px;
  padding: 1.25rem;
  background:
    radial-gradient(circle at top left, rgba(186, 230, 253, 0.56), transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
}

.path-browser-dialog__header,
.path-browser-dialog__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.path-browser-dialog__title {
  margin: 0;
  color: #0f172a;
  font-size: 1.1rem;
  font-weight: 800;
}

.path-browser-dialog__subtitle,
.path-browser-dialog__hint {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.65;
}

.path-browser-dialog__close {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.path-browser-toolbar {
  display: grid;
  grid-template-columns: repeat(3, auto) minmax(0, 1fr);
  gap: 0.75rem;
}

.path-browser-toolbar__path {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

.path-browser-input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 16px;
  padding: 0.82rem 0.95rem;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font-size: 0.84rem;
}

.path-browser-btn,
.path-browser-select-btn {
  border: 0;
  border-radius: 16px;
  padding: 0.82rem 0.95rem;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.28);
  color: #0f172a;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
}

.path-browser-btn:hover,
.path-browser-select-btn:hover {
  transform: translateY(-1px);
}

.path-browser-btn--primary,
.path-browser-select-btn--active {
  background: linear-gradient(135deg, #0f766e, #0f172a);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.16);
  color: #fff;
}

.path-browser-feedback {
  border-radius: 18px;
  padding: 0.85rem 0.95rem;
  font-size: 0.84rem;
  font-weight: 700;
}

.path-browser-feedback--error {
  background: rgba(254, 226, 226, 0.92);
  color: #991b1b;
}

.path-browser-current {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  border-radius: 20px;
  padding: 0.95rem 1rem;
  background: rgba(241, 245, 249, 0.82);
  color: #334155;
  font-size: 0.82rem;
}

.path-browser-current span {
  overflow-wrap: anywhere;
}

.path-browser-board {
  min-height: 420px;
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.78);
}

.path-browser-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.path-browser-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem 0.95rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.88);
}

.path-browser-item--selected {
  background: rgba(219, 234, 254, 0.72);
}

.path-browser-item__main {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.path-browser-item__icon {
  display: inline-flex;
  min-width: 52px;
  justify-content: center;
  border-radius: 999px;
  padding: 0.32rem 0.55rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.path-browser-item--dir .path-browser-item__icon {
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
}

.path-browser-item__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.path-browser-item__name {
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 700;
}

.path-browser-item__meta {
  color: #64748b;
  font-size: 0.76rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.path-browser-empty {
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: #94a3b8;
  font-size: 0.88rem;
  text-align: center;
}

.path-browser-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.path-browser-btn:disabled,
.path-browser-select-btn:disabled,
.path-browser-dialog__close:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.path-browser-fade-enter-active,
.path-browser-fade-leave-active {
  transition: opacity 180ms ease;
}

.path-browser-fade-enter-from,
.path-browser-fade-leave-to {
  opacity: 0;
}

@media (max-width: 960px) {
  .path-browser-dialog {
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  }

  .path-browser-toolbar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .path-browser-toolbar__path {
    grid-column: 1 / -1;
  }

  .path-browser-dialog__header,
  .path-browser-dialog__footer,
  .path-browser-item {
    grid-template-columns: 1fr;
  }
}
</style>