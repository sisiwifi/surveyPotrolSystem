<template>
  <section class="map-config-page">
    <BreadcrumbHeader
      :show-back="true"
      :crumbs="headerCrumbs"
      @back="goBack"
    />

    <Transition name="page-message">
      <p
        v-if="floatingMessage.visible"
        class="floating-message"
        :class="floatingMessage.type === 'error' ? 'floating-message--error' : 'floating-message--success'"
      >
        {{ floatingMessage.text }}
      </p>
    </Transition>

    <div class="map-config-page__scroller">
      <LoadingSpinner v-if="loading" />

      <div v-else class="map-config-page__stack">
        <section class="map-config-card">
          <div class="map-config-grid">
            <label class="map-config-field map-config-field--full">
              <span class="map-config-field__label">天地图 API Key</span>
              <input
                v-model.trim="tkDraft"
                class="map-config-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="输入天地图网页服务 TK"
              >
              <span class="map-config-field__hint">允许留空。留空时地图页会保持未配置引导态，或回退到本地环境变量兜底。</span>
            </label>

            <label class="map-config-field">
              <span class="map-config-field__label">默认中心纬度</span>
              <input
                v-model.trim="latitudeDraft"
                class="map-config-input"
                type="number"
                inputmode="decimal"
                min="-90"
                max="90"
                step="0.000001"
                placeholder="35.8617"
              >
              <span class="map-config-field__hint">范围 -90 到 90。</span>
            </label>

            <label class="map-config-field">
              <span class="map-config-field__label">默认中心经度</span>
              <input
                v-model.trim="longitudeDraft"
                class="map-config-input"
                type="number"
                inputmode="decimal"
                min="-180"
                max="180"
                step="0.000001"
                placeholder="104.1954"
              >
              <span class="map-config-field__hint">范围 -180 到 180。</span>
            </label>

            <label class="map-config-field">
              <span class="map-config-field__label">默认缩放</span>
              <input
                v-model.trim="zoomDraft"
                class="map-config-input"
                type="number"
                inputmode="numeric"
                :min="MIN_MAP_ZOOM"
                :max="MAX_MAP_ZOOM"
                step="1"
                placeholder="5"
              >
              <span class="map-config-field__hint">范围 {{ MIN_MAP_ZOOM }} 到 {{ MAX_MAP_ZOOM }}。</span>
            </label>
          </div>

          <p v-if="validationError" class="map-config-error">{{ validationError }}</p>
          <p v-else-if="errorMessage" class="map-config-error">{{ errorMessage }}</p>

          <div class="map-config-actions">
            <button class="map-config-button map-config-button--secondary" type="button" :disabled="saving" @click="resetDefaultView">
              恢复默认视角
            </button>
            <button class="map-config-button map-config-button--primary" type="button" :disabled="saving || Boolean(validationError)" @click="saveCurrentConfig">
              {{ saving ? '保存中…' : '保存地图配置' }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script>
import BreadcrumbHeader from '../components/BreadcrumbHeader.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  fetchMapConfig,
  saveMapConfig,
} from '../utils/mapConfig'

function toErrorMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export default {
  name: 'MapConfigPage',
  components: {
    BreadcrumbHeader,
    LoadingSpinner,
  },
  data() {
    return {
      loading: false,
      saving: false,
      errorMessage: '',
      tkDraft: '',
      latitudeDraft: String(DEFAULT_MAP_CENTER[0]),
      longitudeDraft: String(DEFAULT_MAP_CENTER[1]),
      zoomDraft: String(DEFAULT_MAP_ZOOM),
      floatingMessage: {
        visible: false,
        type: 'success',
        text: '',
      },
      floatingMessageTimer: null,
      MIN_MAP_ZOOM,
      MAX_MAP_ZOOM,
    }
  },
  computed: {
    headerCrumbs() {
      return [
        { label: '设置', title: '设置', to: '/settings' },
        { label: '配置天地图 API', title: '配置天地图 API', current: true },
      ]
    },
    parsedLatitude() {
      const value = Number.parseFloat(String(this.latitudeDraft ?? '').trim())
      return Number.isFinite(value) ? value : null
    },
    parsedLongitude() {
      const value = Number.parseFloat(String(this.longitudeDraft ?? '').trim())
      return Number.isFinite(value) ? value : null
    },
    parsedZoom() {
      const value = Number.parseInt(String(this.zoomDraft ?? '').trim(), 10)
      return Number.isFinite(value) ? value : null
    },
    validationError() {
      if (this.parsedLatitude === null) return '请输入有效的默认中心纬度。'
      if (this.parsedLatitude < -90 || this.parsedLatitude > 90) return '默认中心纬度必须在 -90 到 90 之间。'
      if (this.parsedLongitude === null) return '请输入有效的默认中心经度。'
      if (this.parsedLongitude < -180 || this.parsedLongitude > 180) return '默认中心经度必须在 -180 到 180 之间。'
      if (this.parsedZoom === null) return '请输入有效的默认缩放级别。'
      if (this.parsedZoom < MIN_MAP_ZOOM || this.parsedZoom > MAX_MAP_ZOOM) {
        return `默认缩放级别必须在 ${MIN_MAP_ZOOM} 到 ${MAX_MAP_ZOOM} 之间。`
      }
      return ''
    },
  },
  created() {
    this.fetchCurrentConfig()
  },
  beforeUnmount() {
    if (this.floatingMessageTimer) {
      clearTimeout(this.floatingMessageTimer)
      this.floatingMessageTimer = null
    }
  },
  methods: {
    goBack() {
      this.$router.push('/settings')
    },
    applyDrafts(config) {
      this.tkDraft = config.tk || ''
      this.latitudeDraft = String(config.defaultCenter?.[0] ?? DEFAULT_MAP_CENTER[0])
      this.longitudeDraft = String(config.defaultCenter?.[1] ?? DEFAULT_MAP_CENTER[1])
      this.zoomDraft = String(config.defaultZoom ?? DEFAULT_MAP_ZOOM)
    },
    async fetchCurrentConfig() {
      this.loading = true
      this.errorMessage = ''
      try {
        const config = await fetchMapConfig()
        this.applyDrafts(config)
      } catch (err) {
        this.errorMessage = `加载地图配置失败：${toErrorMessage(err)}`
      } finally {
        this.loading = false
      }
    },
    resetDefaultView() {
      this.latitudeDraft = String(DEFAULT_MAP_CENTER[0])
      this.longitudeDraft = String(DEFAULT_MAP_CENTER[1])
      this.zoomDraft = String(DEFAULT_MAP_ZOOM)
    },
    showFloatingMessage(type, text) {
      if (this.floatingMessageTimer) {
        clearTimeout(this.floatingMessageTimer)
        this.floatingMessageTimer = null
      }

      this.floatingMessage = {
        visible: true,
        type,
        text,
      }

      this.floatingMessageTimer = setTimeout(() => {
        this.floatingMessage.visible = false
      }, 2600)
    },
    async saveCurrentConfig() {
      if (this.validationError) {
        this.errorMessage = this.validationError
        return
      }

      this.saving = true
      this.errorMessage = ''
      try {
        const saved = await saveMapConfig({
          tk: this.tkDraft,
          defaultCenter: [this.parsedLatitude, this.parsedLongitude],
          defaultZoom: this.parsedZoom,
        })
        this.applyDrafts(saved)
        this.showFloatingMessage('success', '地图配置已保存。')
      } catch (err) {
        this.errorMessage = `保存地图配置失败：${toErrorMessage(err)}`
        this.showFloatingMessage('error', this.errorMessage)
      } finally {
        this.saving = false
      }
    },
  },
}
</script>
/**
 * 地图配置页，用于编辑地图中心点、缩放级别与相关底图参数。
 * 常见入口来自设置页中的地图配置入口，对应路由 /settings/map-config。
 * 这里主要处理配置读写和表单校验；地图渲染本身在 MapManagementPage 与 map 组件目录中实现。
 * 相关文档：frontend/Frontend_README.md、backend/api_services.md。
 */

<style scoped lang="css">
.map-config-page {
  @apply space-y-4;
}

.map-config-page__scroller {
  @apply min-h-0;
}

.map-config-page__stack {
  @apply grid gap-4;
}

.map-config-card {
  @apply rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/70;
}

.map-config-grid {
  @apply grid gap-4 md:grid-cols-2;
}

.map-config-field {
  @apply flex flex-col gap-2;
}

.map-config-field--full {
  @apply md:col-span-2;
}

.map-config-field__label {
  @apply text-sm font-semibold text-slate-800;
}

.map-config-field__hint {
  @apply text-xs leading-6 text-slate-500;
}

.map-config-input {
  @apply w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition;
}

.map-config-input:focus {
  @apply border-emerald-400 bg-white ring-4 ring-emerald-100;
}

.map-config-error {
  @apply mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700;
}

.map-config-actions {
  @apply mt-5 flex flex-wrap justify-end gap-3;
}

.map-config-button {
  @apply inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150;
}

.map-config-button:disabled {
  @apply cursor-not-allowed opacity-50;
}

.map-config-button--primary {
  @apply border-indigo-600 bg-indigo-600 text-white;
}

.map-config-button--primary:not(:disabled):hover {
  @apply border-indigo-700 bg-indigo-700;
}

.map-config-button--secondary {
  @apply border-slate-300 bg-white text-slate-700;
}

.map-config-button--secondary:not(:disabled):hover {
  @apply bg-slate-100;
}

.floating-message {
  @apply fixed right-6 top-6 z-[70] rounded-[18px] border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm;
}

.floating-message--success {
  @apply border-emerald-200 bg-emerald-50/95 text-emerald-800;
}

.floating-message--error {
  @apply border-rose-200 bg-rose-50/95 text-rose-800;
}

.page-message-enter-active,
.page-message-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.page-message-enter-from,
.page-message-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>