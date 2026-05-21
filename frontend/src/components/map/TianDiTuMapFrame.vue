<template>
  <section class="tianditu-map-frame">
    <div class="tianditu-map-frame__stage">
      <div ref="mapRoot" class="tianditu-map-frame__map"></div>

      <div class="tianditu-map-frame__search-shell">
        <section class="map-float-card map-float-card--search">
          <label class="map-search" for="map-search-input">
            <svg class="map-search__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.25" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.2 10.2L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input
              id="map-search-input"
              v-model.trim="searchText"
              class="map-search__input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="搜索地点、图层或照片"
            >
          </label>
        </section>
      </div>

      <aside
        class="tianditu-map-frame__layers-shell"
        :class="{ 'tianditu-map-frame__layers-shell--collapsed': isLayerPanelCollapsed }"
      >
        <section class="map-float-card map-float-card--layers">
          <div class="map-panel-head">
            <button
              class="map-panel-head__toggle"
              type="button"
              :title="isLayerPanelCollapsed ? '展开图层面板' : '收起图层面板'"
              :aria-label="isLayerPanelCollapsed ? '展开图层面板' : '收起图层面板'"
              @click="toggleLayerPanel"
            >
              <span v-if="isLayerPanelCollapsed">&gt;</span>
              <span v-else>&lt;</span>
            </button>

            <div v-if="!isLayerPanelCollapsed" class="map-panel-head__copy">
              <strong>图层</strong>
              <span>{{ visibleContentCount }} / {{ totalContentCount }}</span>
            </div>
          </div>

          <div v-if="!isLayerPanelCollapsed" class="map-layer-groups">
            <section v-for="group in layerGroups" :key="group.id" class="map-layer-group">
              <button
                class="map-layer-group__header"
                type="button"
                :aria-expanded="String(!group.collapsed)"
                @click="toggleGroupCollapse(group.id)"
              >
                <span class="map-layer-group__title-wrap">
                  <span class="map-layer-group__caret">{{ group.collapsed ? '+' : '−' }}</span>
                  <span class="map-layer-group__title">{{ group.label }}</span>
                </span>
                <span class="map-layer-group__count">{{ group.items.length }}</span>
              </button>

              <ul v-if="!group.collapsed" class="map-layer-group__list">
                <li v-for="layer in group.items" :key="layer.id">
                  <article
                    class="map-layer-card"
                    :class="{
                      'map-layer-card--active': isLayerSelected(group.id, layer),
                      'map-layer-card--hidden': group.id !== 'base' && !layer.visible,
                      'map-layer-card--drag-over': isDragTarget(group.id, layer.id),
                    }"
                    draggable="true"
                    @dragstart="handleDragStart(group.id, layer.id, $event)"
                    @dragover.prevent="handleDragOver(group.id, layer.id)"
                    @drop="handleDrop(group.id, layer.id)"
                    @dragend="handleDragEnd"
                  >
                    <button
                      class="map-layer-card__main"
                      type="button"
                      :title="group.id === 'base' ? `切换到底图：${layer.label}` : `查看图层：${layer.label}`"
                      @click="handleLayerCardClick(group.id, layer.id)"
                    >
                      <span class="map-layer-card__drag" aria-hidden="true">⋮⋮</span>
                      <span class="map-layer-card__copy">
                        <span class="map-layer-card__title">{{ layer.label }}</span>
                        <span class="map-layer-card__meta">{{ getLayerMeta(group.id, layer) }}</span>
                      </span>
                    </button>

                    <button
                      class="map-mini-btn"
                      :class="{ 'map-mini-btn--active': isLayerVisible(group.id, layer) }"
                      type="button"
                      :title="getLayerToggleTitle(group.id, layer)"
                      :aria-pressed="String(isLayerVisible(group.id, layer))"
                      @click.stop="handleLayerToggle(group.id, layer.id)"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor" />
                        <rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor" />
                        <rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor" />
                      </svg>
                    </button>
                  </article>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </aside>

      <div class="tianditu-map-frame__tools-shell">
        <section class="map-float-card map-float-card--tools">
          <div class="map-toolbar" role="toolbar" aria-label="地图工具栏">
            <button
              class="map-toolbar__button"
              :class="{ 'map-toolbar__button--active': selectedModeKey === 'vector' }"
              type="button"
              title="天地图"
              aria-label="天地图"
              @click="setSelectedMode('vector')"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" />
              </svg>
            </button>

            <button
              class="map-toolbar__button"
              :class="{ 'map-toolbar__button--active': selectedModeKey === 'imagery' }"
              type="button"
              title="天地图影像"
              aria-label="天地图影像"
              @click="setSelectedMode('imagery')"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.4" />
                <path d="M3.5 9L6 6.5L8 8L10.5 5.5L12 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="4.25" cy="4.5" r="0.8" fill="currentColor" />
              </svg>
            </button>

            <button
              class="map-toolbar__button"
              :class="{ 'map-toolbar__button--active': selectedModeKey === 'terrain' }"
              type="button"
              title="天地图地形"
              aria-label="天地图地形"
              @click="setSelectedMode('terrain')"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1.5 10.5L4.5 5.5L7 8.5L9 4.5L12.5 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <button class="map-toolbar__button" type="button" title="缩小" aria-label="缩小" @click="zoomOut">－</button>
            <button class="map-toolbar__button" type="button" title="放大" aria-label="放大" @click="zoomIn">＋</button>
            <button class="map-toolbar__button" type="button" title="默认视图" aria-label="默认视图" @click="resetView">⟳</button>
            <button class="map-toolbar__button" type="button" title="配置天地图 API" aria-label="配置天地图 API" @click="openMapConfig">⚙</button>
          </div>
        </section>
      </div>

      <aside class="tianditu-map-frame__detail-shell">
        <section class="map-float-card map-float-card--detail">
          <div class="map-detail-card__head">
            <div>
              <h3 class="map-detail-card__title">{{ inspectorTitle }}</h3>
              <p class="map-detail-card__subtitle">{{ inspectorSubtitle }}</p>
            </div>
            <span class="map-detail-card__badge" :class="runtime.ready ? 'map-detail-card__badge--ready' : 'map-detail-card__badge--idle'">
              {{ runtime.ready ? '在线' : '待配置' }}
            </span>
          </div>

          <dl class="map-detail-card__meta">
            <div class="map-detail-card__meta-item">
              <dt>底图</dt>
              <dd>{{ currentModeLabel }}</dd>
            </div>
            <div class="map-detail-card__meta-item">
              <dt>默认</dt>
              <dd>{{ centerLabel }} / z{{ runtime.defaultZoom }}</dd>
            </div>
            <div class="map-detail-card__meta-item">
              <dt>当前</dt>
              <dd>{{ currentViewLabel }}</dd>
            </div>
            <div class="map-detail-card__meta-item">
              <dt>图层</dt>
              <dd>{{ visibleContentCount }} / {{ totalContentCount }}</dd>
            </div>
          </dl>

          <p v-if="configError" class="map-detail-card__notice">
            {{ configError }}
          </p>
        </section>
      </aside>

      <div v-if="configLoading" class="tianditu-map-frame__overlay">
        <span class="tianditu-map-frame__overlay-tag">加载中</span>
        <h4 class="tianditu-map-frame__overlay-title">正在读取地图配置</h4>
        <p class="tianditu-map-frame__overlay-text">
          正在恢复天地图运行时参数。
        </p>
      </div>

      <div v-else-if="!runtime.ready" class="tianditu-map-frame__overlay">
        <span class="tianditu-map-frame__overlay-tag">待配置</span>
        <h4 class="tianditu-map-frame__overlay-title">还没有可用的天地图 Key</h4>
        <p class="tianditu-map-frame__overlay-text">
          请先在“设置 → 配置天地图 API”中填写 Key，保存后返回这里即可加载天地图瓦片。
        </p>
        <button class="tianditu-map-frame__overlay-action" type="button" @click="openMapConfig">
          去配置天地图 API
        </button>
      </div>

      <div v-else-if="mapError" class="tianditu-map-frame__overlay tianditu-map-frame__overlay--error">
        <span class="tianditu-map-frame__overlay-tag tianditu-map-frame__overlay-tag--error">加载失败</span>
        <h4 class="tianditu-map-frame__overlay-title">天地图底图未能初始化</h4>
        <p class="tianditu-map-frame__overlay-text">{{ mapError }}</p>
      </div>
    </div>
  </section>
</template>

<script>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MAP_CONFIG_UPDATED_EVENT,
  fetchMapConfig,
  getCachedMapConfig,
} from '../../utils/mapConfig'
import {
  createTiandituLayerBundle,
  formatTiandituCenter,
  getTiandituLayerModes,
  readTiandituRuntime,
} from '../../utils/map/tianditu'

function createLayerGroups() {
  return [
    {
      id: 'base',
      label: '底图',
      collapsed: false,
      items: [
        { id: 'base-vector', label: '天地图', modeKey: 'vector' },
        { id: 'base-imagery', label: '天地图影像', modeKey: 'imagery' },
        { id: 'base-terrain', label: '天地图地形', modeKey: 'terrain' },
      ],
    },
    {
      id: 'content',
      label: '内容图层',
      collapsed: false,
      items: [
        { id: 'photo-points', label: '照片点位', visible: true },
        { id: 'vector-datasets', label: '矢量数据', visible: true },
        { id: 'tracks-and-zones', label: '轨迹与区域', visible: false },
      ],
    },
  ]
}

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

export default {
  name: 'TianDiTuMapFrame',
  data() {
    return {
      runtime: readTiandituRuntime(getCachedMapConfig()),
      layerModes: getTiandituLayerModes(),
      selectedModeKey: 'vector',
      mapInstance: null,
      activeLayerBundle: null,
      mapError: '',
      configLoading: true,
      configError: '',
      currentViewLabel: '未初始化',
      searchText: '',
      isLayerPanelCollapsed: false,
      inspectedLayerId: 'photo-points',
      dragState: {
        groupId: '',
        itemId: '',
        overItemId: '',
      },
      layerGroups: createLayerGroups(),
    }
  },
  computed: {
    centerLabel() {
      return formatTiandituCenter(this.runtime.defaultCenter)
    },
    currentModeLabel() {
      const currentMode = this.layerModes.find(mode => mode.key === this.selectedModeKey)
      return currentMode ? currentMode.label : '未指定'
    },
    visibleContentCount() {
      const contentGroup = this.layerGroups.find(group => group.id === 'content')
      return contentGroup ? contentGroup.items.filter(item => item.visible).length : 0
    },
    totalContentCount() {
      const contentGroup = this.layerGroups.find(group => group.id === 'content')
      return contentGroup ? contentGroup.items.length : 0
    },
    inspectedLayer() {
      const contentGroup = this.layerGroups.find(group => group.id === 'content')
      return contentGroup?.items.find(item => item.id === this.inspectedLayerId) || contentGroup?.items[0] || null
    },
    inspectorTitle() {
      return this.inspectedLayer ? this.inspectedLayer.label : '内容面板'
    },
    inspectorSubtitle() {
      if (!this.inspectedLayer) {
        return '未选择'
      }
      return this.inspectedLayer.visible ? '列表显示中' : '当前隐藏'
    },
  },
  mounted() {
    this.initializeRuntime()
    window.addEventListener('resize', this.handleWindowResize)
    window.addEventListener(MAP_CONFIG_UPDATED_EVENT, this.handleRuntimeConfigUpdated)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleWindowResize)
    window.removeEventListener(MAP_CONFIG_UPDATED_EVENT, this.handleRuntimeConfigUpdated)
    this.teardownMap()
  },
  methods: {
    async initializeRuntime() {
      this.configLoading = true
      this.configError = ''

      try {
        const config = await fetchMapConfig()
        this.runtime = readTiandituRuntime(config)
      } catch (error) {
        this.configError = toErrorMessage(error)
        this.runtime = readTiandituRuntime(getCachedMapConfig())
      } finally {
        this.configLoading = false
        this.setupMap()
      }
    },
    handleRuntimeConfigUpdated(event) {
      this.runtime = readTiandituRuntime(event?.detail || getCachedMapConfig())
      this.configError = ''

      if (!this.mapInstance) {
        return
      }

      this.mapInstance.setView(this.runtime.defaultCenter, this.runtime.defaultZoom, {
        animate: false,
      })

      if (this.runtime.ready) {
        this.syncBaseLayer()
      } else {
        this.clearBaseLayer()
        this.mapError = ''
      }

      this.syncViewState()
      this.$nextTick(() => {
        if (this.mapInstance) {
          this.mapInstance.invalidateSize()
        }
      })
    },
    setupMap() {
      if (this.mapInstance) {
        return
      }

      const mapRoot = this.$refs.mapRoot
      if (!mapRoot) {
        this.mapError = '地图容器未找到。'
        return
      }

      this.mapInstance = L.map(mapRoot, {
        center: this.runtime.defaultCenter,
        zoom: this.runtime.defaultZoom,
        zoomControl: false,
        attributionControl: false,
      })

      this.mapInstance.on('moveend zoomend', this.syncViewState)
      this.syncViewState()

      if (this.runtime.ready) {
        this.syncBaseLayer()
      }

      this.$nextTick(() => {
        if (this.mapInstance) {
          this.mapInstance.invalidateSize()
        }
      })
    },
    teardownMap() {
      this.clearBaseLayer()
      if (this.mapInstance) {
        this.mapInstance.off('moveend zoomend', this.syncViewState)
        this.mapInstance.remove()
        this.mapInstance = null
      }
    },
    handleWindowResize() {
      if (this.mapInstance) {
        this.mapInstance.invalidateSize()
      }
    },
    syncViewState() {
      if (!this.mapInstance) {
        this.currentViewLabel = '未初始化'
        return
      }

      const center = this.mapInstance.getCenter()
      this.currentViewLabel = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)} / z${this.mapInstance.getZoom()}`
    },
    clearBaseLayer() {
      if (!this.mapInstance || !this.activeLayerBundle) {
        this.activeLayerBundle = null
        return
      }

      this.mapInstance.removeLayer(this.activeLayerBundle.baseLayer)
      if (this.activeLayerBundle.annotationLayer) {
        this.mapInstance.removeLayer(this.activeLayerBundle.annotationLayer)
      }
      this.activeLayerBundle = null
    },
    syncBaseLayer() {
      if (!this.mapInstance || !this.runtime.ready) {
        return
      }

      this.clearBaseLayer()
      try {
        const bundle = createTiandituLayerBundle(L, this.selectedModeKey, this.runtime.tk)
        bundle.baseLayer.addTo(this.mapInstance)
        if (bundle.annotationLayer) {
          bundle.annotationLayer.addTo(this.mapInstance)
        }
        this.activeLayerBundle = bundle
        this.mapError = ''
      } catch (error) {
        this.mapError = error instanceof Error ? error.message : '未知错误'
      }
    },
    setSelectedMode(modeKey) {
      if (!this.layerModes.some(mode => mode.key === modeKey)) {
        return
      }
      this.selectedModeKey = modeKey
      this.syncBaseLayer()
    },
    resetView() {
      if (!this.mapInstance) {
        return
      }
      this.mapInstance.setView(this.runtime.defaultCenter, this.runtime.defaultZoom)
    },
    zoomIn() {
      if (this.mapInstance) {
        this.mapInstance.zoomIn()
      }
    },
    zoomOut() {
      if (this.mapInstance) {
        this.mapInstance.zoomOut()
      }
    },
    openMapConfig() {
      this.$router.push('/settings/map-config')
    },
    toggleLayerPanel() {
      this.isLayerPanelCollapsed = !this.isLayerPanelCollapsed
    },
    toggleGroupCollapse(groupId) {
      this.layerGroups = this.layerGroups.map(group => {
        if (group.id !== groupId) {
          return group
        }
        return {
          ...group,
          collapsed: !group.collapsed,
        }
      })
    },
    findLayer(groupId, layerId) {
      const group = this.layerGroups.find(candidate => candidate.id === groupId)
      return group?.items.find(item => item.id === layerId) || null
    },
    getLayerMeta(groupId, layer) {
      if (groupId === 'base') {
        return this.selectedModeKey === layer.modeKey ? '当前底图' : '点击切换'
      }
      return layer.visible ? '列表显示' : '已隐藏'
    },
    getLayerToggleTitle(groupId, layer) {
      if (groupId === 'base') {
        return this.selectedModeKey === layer.modeKey ? `${layer.label}：当前底图` : `切换为 ${layer.label}`
      }
      return layer.visible ? `隐藏图层：${layer.label}` : `列表显示：${layer.label}`
    },
    isLayerSelected(groupId, layer) {
      if (groupId === 'base') {
        return this.selectedModeKey === layer.modeKey
      }
      return this.inspectedLayerId === layer.id
    },
    isLayerVisible(groupId, layer) {
      if (groupId === 'base') {
        return this.selectedModeKey === layer.modeKey
      }
      return Boolean(layer.visible)
    },
    handleLayerCardClick(groupId, layerId) {
      const layer = this.findLayer(groupId, layerId)
      if (!layer) {
        return
      }

      if (groupId === 'base') {
        this.setSelectedMode(layer.modeKey)
        return
      }

      this.inspectedLayerId = layerId
    },
    handleLayerToggle(groupId, layerId) {
      const layer = this.findLayer(groupId, layerId)
      if (!layer) {
        return
      }

      if (groupId === 'base') {
        this.setSelectedMode(layer.modeKey)
        return
      }

      this.layerGroups = this.layerGroups.map(group => {
        if (group.id !== groupId) {
          return group
        }
        return {
          ...group,
          items: group.items.map(item => {
            if (item.id !== layerId) {
              return item
            }
            return {
              ...item,
              visible: !item.visible,
            }
          }),
        }
      })
      this.inspectedLayerId = layerId
    },
    handleDragStart(groupId, layerId, event) {
      this.dragState = {
        groupId,
        itemId: layerId,
        overItemId: layerId,
      }

      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', `${groupId}:${layerId}`)
      }
    },
    handleDragOver(groupId, layerId) {
      if (this.dragState.groupId !== groupId || this.dragState.itemId === layerId) {
        return
      }

      this.dragState = {
        ...this.dragState,
        overItemId: layerId,
      }
    },
    handleDrop(groupId, layerId) {
      const { groupId: dragGroupId, itemId: dragItemId } = this.dragState
      if (!dragGroupId || dragGroupId !== groupId || dragItemId === layerId) {
        this.handleDragEnd()
        return
      }

      this.layerGroups = this.layerGroups.map(group => {
        if (group.id !== groupId) {
          return group
        }

        const items = [...group.items]
        const fromIndex = items.findIndex(item => item.id === dragItemId)
        const toIndex = items.findIndex(item => item.id === layerId)
        if (fromIndex < 0 || toIndex < 0) {
          return group
        }

        const [movedItem] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, movedItem)
        return {
          ...group,
          items,
        }
      })

      this.handleDragEnd()
    },
    handleDragEnd() {
      this.dragState = {
        groupId: '',
        itemId: '',
        overItemId: '',
      }
    },
    isDragTarget(groupId, layerId) {
      return this.dragState.groupId === groupId && this.dragState.overItemId === layerId && this.dragState.itemId !== layerId
    },
  },
}
</script>

<style scoped lang="css">
.tianditu-map-frame {
  height: 100%;
  min-height: 100%;
}

.tianditu-map-frame__stage {
  position: relative;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(186, 230, 253, 0.42), transparent 30%),
    linear-gradient(180deg, rgba(241, 245, 249, 0.92), rgba(226, 232, 240, 0.82));
}

.tianditu-map-frame__map {
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.tianditu-map-frame__search-shell,
.tianditu-map-frame__layers-shell,
.tianditu-map-frame__tools-shell,
.tianditu-map-frame__detail-shell {
  position: absolute;
  z-index: 900;
}

.tianditu-map-frame__search-shell {
  top: 1rem;
  left: 1rem;
  width: clamp(16rem, 32vw, 28rem);
}

.tianditu-map-frame__layers-shell {
  top: 5rem;
  left: 1rem;
  bottom: 1rem;
  width: 18.25rem;
  transition: width 180ms ease;
}

.tianditu-map-frame__layers-shell--collapsed {
  width: 4.25rem;
}

.tianditu-map-frame__tools-shell {
  top: 1rem;
  right: 1rem;
}

.tianditu-map-frame__detail-shell {
  top: 5rem;
  right: 1rem;
  width: 16.5rem;
}

.map-float-card {
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px);
  @apply rounded-[24px];
}

.map-float-card--search {
  @apply p-3;
}

.map-float-card--layers {
  height: 100%;
  overflow: hidden;
  @apply p-3;
}

.map-float-card--tools,
.map-float-card--detail {
  @apply p-3;
}

.map-search {
  @apply flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/90 px-4 py-3;
}

.map-search__icon {
  @apply h-4 w-4 flex-shrink-0 text-slate-400;
}

.map-search__input {
  @apply w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none;
}

.map-search__input::placeholder {
  color: #94a3b8;
}

.map-panel-head {
  @apply flex items-center gap-3;
}

.map-panel-head__toggle {
  @apply inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition;
}

.map-panel-head__toggle:hover {
  @apply border-emerald-300 bg-emerald-50 text-slate-900;
}

.map-panel-head__copy {
  @apply flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[16px] bg-slate-100/75 px-3 py-2 text-sm text-slate-600;
}

.map-panel-head__copy strong {
  @apply font-semibold text-slate-900;
}

.map-layer-groups {
  height: calc(100% - 3.25rem);
  @apply mt-3 grid content-start gap-3 overflow-auto pr-1;
}

.map-layer-group {
  @apply rounded-[18px] bg-slate-100/70 p-2;
}

.map-layer-group__header {
  @apply flex w-full items-center justify-between gap-3 rounded-[14px] bg-white/90 px-3 py-2 text-left text-sm text-slate-700 transition;
}

.map-layer-group__header:hover {
  @apply bg-white text-slate-900;
}

.map-layer-group__title-wrap {
  @apply flex min-w-0 items-center gap-2;
}

.map-layer-group__caret {
  @apply inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500;
}

.map-layer-group__title {
  @apply truncate font-semibold;
}

.map-layer-group__count {
  @apply inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500;
}

.map-layer-group__list {
  @apply mt-2 grid gap-2;
}

.map-layer-card {
  @apply flex items-center gap-2 rounded-[16px] border border-slate-200/90 bg-white/95 p-1 transition;
}

.map-layer-card:hover {
  @apply border-emerald-200 bg-white;
}

.map-layer-card--active {
  border-color: rgba(16, 185, 129, 0.44);
  background: rgba(236, 253, 245, 0.92);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.12);
}

.map-layer-card--hidden {
  opacity: 0.68;
}

.map-layer-card--drag-over {
  transform: translateY(-2px);
  border-color: rgba(14, 165, 233, 0.5);
}

.map-layer-card__main {
  @apply flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left;
}

.map-layer-card__drag {
  color: #94a3b8;
  letter-spacing: -1px;
  @apply text-xs;
}

.map-layer-card__copy {
  @apply flex min-w-0 flex-1 flex-col gap-0.5;
}

.map-layer-card__title {
  @apply truncate text-sm font-semibold text-slate-900;
}

.map-layer-card__meta {
  @apply text-[11px] text-slate-500;
}

.map-mini-btn {
  @apply inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-500 transition;
}

.map-mini-btn:hover {
  @apply border-emerald-300 bg-emerald-50 text-emerald-700;
}

.map-mini-btn--active {
  @apply border-emerald-400 bg-emerald-50 text-emerald-700;
}

.map-toolbar {
  @apply flex items-center gap-2;
}

.map-toolbar__button {
  @apply inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition;
}

.map-toolbar__button:hover {
  @apply border-emerald-300 bg-emerald-50 text-slate-900;
}

.map-toolbar__button--active {
  @apply border-emerald-400 bg-emerald-50 text-emerald-800 shadow-sm;
}

.map-detail-card__head {
  @apply flex items-start justify-between gap-3;
}

.map-detail-card__title {
  @apply text-sm font-semibold text-slate-900;
}

.map-detail-card__subtitle {
  @apply mt-1 text-xs text-slate-500;
}

.map-detail-card__badge {
  @apply inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold;
}

.map-detail-card__badge--ready {
  @apply bg-emerald-100 text-emerald-800;
}

.map-detail-card__badge--idle {
  @apply bg-amber-100 text-amber-800;
}

.map-detail-card__meta {
  @apply mt-3 grid gap-2;
}

.map-detail-card__meta-item {
  @apply rounded-[16px] border border-slate-200/80 bg-white/90 px-3 py-2.5;
}

.map-detail-card__meta-item dt {
  @apply text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500;
}

.map-detail-card__meta-item dd {
  @apply mt-1 text-xs leading-5 text-slate-900;
}

.map-detail-card__notice {
  @apply mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800;
}

.tianditu-map-frame__overlay {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  z-index: 920;
  max-width: 28rem;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.78));
  @apply flex flex-col rounded-[24px] p-5 text-white shadow-lg shadow-slate-900/20 backdrop-blur-sm;
}

.tianditu-map-frame__overlay--error {
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.14), rgba(127, 29, 29, 0.82));
}

.tianditu-map-frame__overlay-tag {
  @apply mb-3 inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white;
}

.tianditu-map-frame__overlay-tag--error {
  @apply bg-rose-100/20 text-rose-50;
}

.tianditu-map-frame__overlay-title {
  @apply text-xl font-semibold text-white;
}

.tianditu-map-frame__overlay-text {
  @apply mt-2 text-sm leading-7 text-white/80;
}

.tianditu-map-frame__overlay-action {
  @apply mt-4 inline-flex w-fit items-center rounded-[14px] border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition;
}

.tianditu-map-frame__overlay-action:hover {
  @apply bg-white/20;
}

:deep(.leaflet-container) {
  background:
    linear-gradient(180deg, rgba(226, 232, 240, 0.62), rgba(241, 245, 249, 0.88)),
    repeating-linear-gradient(0deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.08) 1px, transparent 1px, transparent 48px),
    repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.08) 1px, transparent 1px, transparent 48px);
  font-family: inherit;
}

@media (max-width: 1180px) {
  .tianditu-map-frame__search-shell {
    width: min(22rem, calc(100% - 2rem));
  }

  .tianditu-map-frame__tools-shell {
    top: 5rem;
    left: 1rem;
    right: 1rem;
  }

  .tianditu-map-frame__detail-shell {
    top: 9rem;
    width: 15rem;
  }

  .map-toolbar {
    @apply flex-wrap;
  }
}

@media (max-width: 900px) {
  .tianditu-map-frame__search-shell,
  .tianditu-map-frame__tools-shell,
  .tianditu-map-frame__detail-shell {
    left: 1rem;
    right: 1rem;
    width: auto;
  }

  .tianditu-map-frame__layers-shell {
    top: 9rem;
    bottom: 12rem;
    width: 15.5rem;
  }

  .tianditu-map-frame__detail-shell {
    top: auto;
    bottom: 1rem;
  }

  .tianditu-map-frame__overlay {
    right: 1rem;
    max-width: none;
  }
}

@media (max-width: 640px) {
  .tianditu-map-frame__search-shell,
  .tianditu-map-frame__tools-shell,
  .tianditu-map-frame__detail-shell,
  .tianditu-map-frame__overlay {
    left: 0.75rem;
    right: 0.75rem;
  }

  .tianditu-map-frame__search-shell {
    top: 0.75rem;
    width: auto;
  }

  .tianditu-map-frame__tools-shell {
    top: 4.75rem;
  }

  .tianditu-map-frame__layers-shell {
    top: 8.5rem;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 12rem;
    width: auto;
  }

  .tianditu-map-frame__layers-shell--collapsed {
    right: auto;
    width: 4.25rem;
  }

  .map-toolbar {
    @apply justify-between;
  }
}
</style>
