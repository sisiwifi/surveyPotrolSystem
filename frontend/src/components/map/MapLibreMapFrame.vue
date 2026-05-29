<template>
  <section class="maplibre-map-frame">
    <div class="maplibre-map-frame__stage">
      <div ref="mapRoot" class="maplibre-map-frame__map"></div>

      <aside class="maplibre-map-frame__panel maplibre-map-frame__panel--left">
        <section class="map-card map-card--panel">
          <div class="map-card__head">
            <div>
              <h3>图层</h3>
              <p>{{ visibleDatasetCount }} / {{ datasets.length }} 个数据集显示中</p>
            </div>
            <button class="map-toolbar-btn" type="button" @click="loadDatasets">刷新</button>
          </div>

          <div class="map-panel-block">
            <strong>底图模式</strong>
            <div class="map-base-mode-grid">
              <button
                v-for="mode in layerModes"
                :key="mode.key"
                class="map-base-mode-btn"
                :class="{ 'map-base-mode-btn--active': selectedModeKey === mode.key }"
                type="button"
                @click="setSelectedMode(mode.key)"
              >
                <span>{{ mode.label }}</span>
                <small>{{ mode.description }}</small>
              </button>
            </div>
          </div>

          <div class="map-panel-block">
            <strong>业务图层</strong>
            <div v-if="datasetError" class="map-feedback map-feedback--error">{{ datasetError }}</div>
            <div v-if="!datasets.length" class="map-feedback">暂无矢量数据，请先去“矢量数据”页导入。</div>
            <ul v-else class="map-dataset-list">
              <li v-for="dataset in datasets" :key="dataset.public_id">
                <article class="map-dataset-card" :class="{ 'map-dataset-card--active': selectedDatasetPublicId === dataset.public_id }">
                  <button class="map-dataset-card__main" type="button" @click="selectDataset(dataset.public_id)">
                    <span class="map-dataset-card__title">{{ dataset.title }}</span>
                    <span class="map-dataset-card__meta">{{ dataset.geometry_type || '未知' }} / {{ dataset.parsed_feature_count || 0 }} 要素</span>
                  </button>
                  <div class="map-dataset-card__actions">
                    <button class="map-mini-btn" type="button" @click.stop="toggleDatasetVisibility(dataset.public_id)">
                      {{ isDatasetVisible(dataset.public_id) ? '隐藏' : '显示' }}
                    </button>
                    <button class="map-mini-btn" type="button" @click.stop="zoomToDataset(dataset.public_id)">定位</button>
                  </div>
                </article>
              </li>
            </ul>
          </div>
        </section>
      </aside>

      <div class="maplibre-map-frame__toolbar">
        <section class="map-card map-card--toolbar">
          <button class="map-toolbar-btn" type="button" @click="zoomOut">－</button>
          <button class="map-toolbar-btn" type="button" @click="zoomIn">＋</button>
          <button class="map-toolbar-btn" type="button" @click="resetView">⟳</button>
          <button class="map-toolbar-btn" type="button" @click="openMapConfig">⚙</button>
        </section>
      </div>

      <aside class="maplibre-map-frame__panel maplibre-map-frame__panel--right">
        <section class="map-card map-card--inspector">
          <div class="map-card__head">
            <div>
              <h3>{{ inspectorTitle }}</h3>
              <p>{{ inspectorSubtitle }}</p>
            </div>
            <span class="map-status-chip" :class="runtime.ready ? 'map-status-chip--ready' : 'map-status-chip--idle'">
              {{ runtime.ready ? '在线' : '待配置' }}
            </span>
          </div>

          <dl class="map-inspector-meta">
            <div>
              <dt>底图</dt>
              <dd>{{ currentModeLabel }}</dd>
            </div>
            <div>
              <dt>默认视图</dt>
              <dd>{{ centerLabel }} / z{{ runtime.defaultZoom }}</dd>
            </div>
            <div>
              <dt>当前视图</dt>
              <dd>{{ currentViewLabel }}</dd>
            </div>
            <div>
              <dt>图层范围</dt>
              <dd>{{ selectedExtentLabel }}</dd>
            </div>
          </dl>

          <p v-if="configError" class="map-feedback map-feedback--error">{{ configError }}</p>
          <p v-if="mapError" class="map-feedback map-feedback--error">{{ mapError }}</p>
        </section>
      </aside>

      <div v-if="configLoading" class="maplibre-map-frame__overlay">
        <span class="map-overlay-tag">加载中</span>
        <h4>正在初始化地图运行时</h4>
        <p>正在恢复天地图配置与矢量图层清单。</p>
      </div>

      <div v-else-if="!runtime.ready" class="maplibre-map-frame__overlay">
        <span class="map-overlay-tag">待配置</span>
        <h4>还没有可用的天地图 Key</h4>
        <p>请先在“设置 → 配置天地图 API”中填写 Key，再返回地图管理页。</p>
        <button class="map-overlay-action" type="button" @click="openMapConfig">去配置</button>
      </div>
    </div>
  </section>
</template>

<script>
/**
 * MapLibre 地图主组件，负责统一接入天地图底图与后端矢量数据接口。
 * 当前版本已替换原 Leaflet 地图容器，可显示导入后的 SHP / CSV 图层，并支持基础样式与缩放到图层。
 * 相关文档：frontend/Frontend_README.md、backend/api_services.md。
 */
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildVectorGeoJsonUrl, listVectorDatasets } from '../../utils/vectorApi'
import {
  MAP_CONFIG_UPDATED_EVENT,
  fetchMapConfig,
  getCachedMapConfig,
} from '../../utils/mapConfig'
import {
  buildTiandituTileTemplate,
  formatTiandituCenter,
  getTiandituLayerModes,
  readTiandituRuntime,
} from '../../utils/map/tianditu'

function createEmptyStyle() {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [],
  }
}

function normalizeDatasetStyle(dataset) {
  const style = dataset?.style_config || {}
  return {
    circleColor: style.circleColor || '#f97316',
    circleRadius: Number(style.circleRadius ?? 6),
    circleStrokeColor: style.circleStrokeColor || '#ffffff',
    circleStrokeWidth: Number(style.circleStrokeWidth ?? 1.2),
    lineColor: style.lineColor || style.fillColor || '#0f766e',
    lineWidth: Number(style.lineWidth ?? 2),
    fillColor: style.fillColor || '#10b981',
    fillOpacity: Number(style.fillOpacity ?? 0.24),
    labelField: style.labelField || 'name',
  }
}

function toBounds(extent) {
  const bbox = Array.isArray(extent?.bbox) ? extent.bbox : null
  if (!bbox || bbox.length !== 4) {
    return null
  }

  const west = Number(bbox[0])
  const south = Number(bbox[1])
  const east = Number(bbox[2])
  const north = Number(bbox[3])
  if (![west, south, east, north].every(value => Number.isFinite(value))) {
    return null
  }
  return [
    [west, south],
    [east, north],
  ]
}

export default {
  name: 'MapLibreMapFrame',
  data() {
    return {
      runtime: readTiandituRuntime(getCachedMapConfig()),
      layerModes: getTiandituLayerModes(),
      selectedModeKey: 'vector',
      mapInstance: null,
      mapReady: false,
      configLoading: true,
      configError: '',
      mapError: '',
      datasetError: '',
      currentViewLabel: '未初始化',
      datasets: [],
      datasetVisibility: {},
      selectedDatasetPublicId: '',
      renderedDatasetIds: {},
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
    visibleDatasetCount() {
      return this.datasets.filter(item => this.isDatasetVisible(item.public_id)).length
    },
    selectedDataset() {
      return this.datasets.find(item => item.public_id === this.selectedDatasetPublicId) || this.datasets[0] || null
    },
    inspectorTitle() {
      return this.selectedDataset ? this.selectedDataset.title : '矢量数据'
    },
    inspectorSubtitle() {
      if (!this.selectedDataset) {
        return '当前还没有已导入的数据集。'
      }
      return `${this.selectedDataset.geometry_type || '未知'} / ${this.selectedDataset.parsed_feature_count || 0} 要素`
    },
    selectedExtentLabel() {
      const bbox = this.selectedDataset?.extent?.bbox
      if (!Array.isArray(bbox) || bbox.length !== 4) {
        return '未记录'
      }
      return bbox.map(value => Number(value).toFixed(5)).join(' / ')
    },
  },
  watch: {
    '$route.query.focus': {
      handler() {
        this.applyRouteFocus()
      },
    },
  },
  mounted() {
    this.initializeRuntime()
    window.addEventListener('resize', this.handleResize)
    window.addEventListener(MAP_CONFIG_UPDATED_EVENT, this.handleRuntimeConfigUpdated)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener(MAP_CONFIG_UPDATED_EVENT, this.handleRuntimeConfigUpdated)
    this.teardownMap()
  },
  methods: {
    buildTiandituTiles(tileCode) {
      const template = buildTiandituTileTemplate(tileCode, this.runtime.tk)
      return String(this.runtime.tileSubdomains || '01234567')
        .split('')
        .map(subdomain => template.replace('{s}', subdomain))
    },
    async initializeRuntime() {
      this.configLoading = true
      this.configError = ''

      try {
        const config = await fetchMapConfig()
        this.runtime = readTiandituRuntime(config)
      } catch (error) {
        this.configError = error instanceof Error ? error.message : '读取地图配置失败'
        this.runtime = readTiandituRuntime(getCachedMapConfig())
      } finally {
        this.configLoading = false
        this.setupMap()
        this.loadDatasets()
      }
    },
    async loadDatasets() {
      this.datasetError = ''
      try {
        const datasets = await listVectorDatasets()
        this.datasetVisibility = datasets.reduce((result, dataset) => {
          result[dataset.public_id] = Object.prototype.hasOwnProperty.call(this.datasetVisibility, dataset.public_id)
            ? this.datasetVisibility[dataset.public_id]
            : true
          return result
        }, {})
        this.datasets = datasets

        if (!datasets.some(item => item.public_id === this.selectedDatasetPublicId)) {
          this.selectedDatasetPublicId = datasets[0]?.public_id || ''
        }

        this.reconcileDatasetLayers()
        this.applyRouteFocus()
      } catch (error) {
        this.datasetError = error instanceof Error ? error.message : '读取矢量图层失败'
      }
    },
    handleRuntimeConfigUpdated(event) {
      this.runtime = readTiandituRuntime(event?.detail || getCachedMapConfig())
      this.configError = ''
      if (!this.mapInstance) {
        return
      }
      this.installBaseLayers()
      this.mapInstance.setCenter([this.runtime.defaultCenter[1], this.runtime.defaultCenter[0]])
      this.mapInstance.setZoom(this.runtime.defaultZoom)
      this.syncViewState()
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

      this.mapInstance = new maplibregl.Map({
        container: mapRoot,
        style: createEmptyStyle(),
        center: [this.runtime.defaultCenter[1], this.runtime.defaultCenter[0]],
        zoom: this.runtime.defaultZoom,
        attributionControl: false,
      })
      this.mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
      this.mapInstance.on('load', () => {
        this.mapReady = true
        this.installBaseLayers()
        this.reconcileDatasetLayers()
        this.syncViewState()
      })
      this.mapInstance.on('moveend', this.syncViewState)
      this.mapInstance.on('zoomend', this.syncViewState)
    },
    teardownMap() {
      if (this.mapInstance) {
        this.mapInstance.off('moveend', this.syncViewState)
        this.mapInstance.off('zoomend', this.syncViewState)
        this.mapInstance.remove()
        this.mapInstance = null
        this.mapReady = false
      }
    },
    handleResize() {
      if (this.mapInstance) {
        this.mapInstance.resize()
      }
    },
    syncViewState() {
      if (!this.mapInstance) {
        this.currentViewLabel = '未初始化'
        return
      }
      const center = this.mapInstance.getCenter()
      this.currentViewLabel = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)} / z${this.mapInstance.getZoom().toFixed(2)}`
    },
    installBaseLayers() {
      if (!this.mapInstance || !this.mapReady || !this.runtime.ready) {
        return
      }

      try {
        this.layerModes.forEach(mode => {
          const baseSourceId = `tianditu-${mode.key}-base`
          const annotationSourceId = `tianditu-${mode.key}-annotation`
          const baseLayerId = `${baseSourceId}-layer`
          const annotationLayerId = `${annotationSourceId}-layer`

          if (!this.mapInstance.getSource(baseSourceId)) {
            this.mapInstance.addSource(baseSourceId, {
              type: 'raster',
              tiles: this.buildTiandituTiles(mode.baseLayerCode),
              tileSize: 256,
            })
            this.mapInstance.addLayer({
              id: baseLayerId,
              type: 'raster',
              source: baseSourceId,
              layout: { visibility: 'none' },
            })
          }

          if (mode.annotationLayerCode && !this.mapInstance.getSource(annotationSourceId)) {
            this.mapInstance.addSource(annotationSourceId, {
              type: 'raster',
              tiles: this.buildTiandituTiles(mode.annotationLayerCode),
              tileSize: 256,
            })
            this.mapInstance.addLayer({
              id: annotationLayerId,
              type: 'raster',
              source: annotationSourceId,
              layout: { visibility: 'none' },
            })
          }
        })
        this.updateBaseLayers()
      } catch (error) {
        this.mapError = error instanceof Error ? error.message : '初始化底图失败'
      }
    },
    updateBaseLayers() {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      this.layerModes.forEach(mode => {
        const visibility = this.selectedModeKey === mode.key ? 'visible' : 'none'
        const baseLayerId = `tianditu-${mode.key}-base-layer`
        const annotationLayerId = `tianditu-${mode.key}-annotation-layer`
        if (this.mapInstance.getLayer(baseLayerId)) {
          this.mapInstance.setLayoutProperty(baseLayerId, 'visibility', visibility)
        }
        if (this.mapInstance.getLayer(annotationLayerId)) {
          this.mapInstance.setLayoutProperty(annotationLayerId, 'visibility', visibility)
        }
      })
    },
    datasetSourceId(publicId) {
      return `vector-source-${publicId}`
    },
    datasetLayerIds(publicId) {
      return {
        fill: `vector-fill-${publicId}`,
        line: `vector-line-${publicId}`,
        circle: `vector-circle-${publicId}`,
        label: `vector-label-${publicId}`,
      }
    },
    ensureDatasetLayers(dataset) {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const sourceId = this.datasetSourceId(dataset.public_id)
      const layerIds = this.datasetLayerIds(dataset.public_id)
      const style = normalizeDatasetStyle(dataset)

      if (!this.mapInstance.getSource(sourceId)) {
        this.mapInstance.addSource(sourceId, {
          type: 'geojson',
          data: buildVectorGeoJsonUrl(dataset.public_id),
        })
      }

      if (!this.mapInstance.getLayer(layerIds.fill)) {
        this.mapInstance.addLayer({
          id: layerIds.fill,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': style.fillColor,
            'fill-opacity': style.fillOpacity,
          },
          layout: { visibility: 'visible' },
        })
      }
      if (!this.mapInstance.getLayer(layerIds.line)) {
        this.mapInstance.addLayer({
          id: layerIds.line,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': style.lineColor,
            'line-width': style.lineWidth,
          },
          layout: { visibility: 'visible' },
        })
      }
      if (!this.mapInstance.getLayer(layerIds.circle)) {
        this.mapInstance.addLayer({
          id: layerIds.circle,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-color': style.circleColor,
            'circle-radius': style.circleRadius,
            'circle-stroke-color': style.circleStrokeColor,
            'circle-stroke-width': style.circleStrokeWidth,
          },
          layout: { visibility: 'visible' },
        })
      }
      if (!this.mapInstance.getLayer(layerIds.label)) {
        this.mapInstance.addLayer({
          id: layerIds.label,
          type: 'symbol',
          source: sourceId,
          layout: {
            'text-field': ['coalesce', ['to-string', ['get', style.labelField]], ''],
            'text-size': 12,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
        })
      }

      this.mapInstance.setPaintProperty(layerIds.fill, 'fill-color', style.fillColor)
      this.mapInstance.setPaintProperty(layerIds.fill, 'fill-opacity', style.fillOpacity)
      this.mapInstance.setPaintProperty(layerIds.line, 'line-color', style.lineColor)
      this.mapInstance.setPaintProperty(layerIds.line, 'line-width', style.lineWidth)
      this.mapInstance.setPaintProperty(layerIds.circle, 'circle-color', style.circleColor)
      this.mapInstance.setPaintProperty(layerIds.circle, 'circle-radius', style.circleRadius)
      this.mapInstance.setPaintProperty(layerIds.circle, 'circle-stroke-color', style.circleStrokeColor)
      this.mapInstance.setPaintProperty(layerIds.circle, 'circle-stroke-width', style.circleStrokeWidth)
      this.mapInstance.setLayoutProperty(layerIds.label, 'text-field', ['coalesce', ['to-string', ['get', style.labelField]], ''])

      const visibility = this.isDatasetVisible(dataset.public_id) ? 'visible' : 'none'
      Object.values(layerIds).forEach(layerId => {
        if (this.mapInstance.getLayer(layerId)) {
          this.mapInstance.setLayoutProperty(layerId, 'visibility', visibility)
        }
      })

      this.renderedDatasetIds = {
        ...this.renderedDatasetIds,
        [dataset.public_id]: true,
      }
    },
    removeDatasetLayers(publicId) {
      if (!this.mapInstance) {
        return
      }

      const layerIds = this.datasetLayerIds(publicId)
      Object.values(layerIds).forEach(layerId => {
        if (this.mapInstance.getLayer(layerId)) {
          this.mapInstance.removeLayer(layerId)
        }
      })
      const sourceId = this.datasetSourceId(publicId)
      if (this.mapInstance.getSource(sourceId)) {
        this.mapInstance.removeSource(sourceId)
      }

      const nextRendered = { ...this.renderedDatasetIds }
      delete nextRendered[publicId]
      this.renderedDatasetIds = nextRendered
    },
    reconcileDatasetLayers() {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const activeIds = new Set(this.datasets.map(dataset => dataset.public_id))
      Object.keys(this.renderedDatasetIds).forEach(publicId => {
        if (!activeIds.has(publicId)) {
          this.removeDatasetLayers(publicId)
        }
      })

      this.datasets.forEach(dataset => {
        this.ensureDatasetLayers(dataset)
      })
    },
    applyRouteFocus() {
      const focusId = typeof this.$route.query?.focus === 'string' ? this.$route.query.focus : ''
      if (!focusId) {
        return
      }

      const dataset = this.datasets.find(item => item.public_id === focusId)
      if (!dataset) {
        return
      }

      this.selectedDatasetPublicId = dataset.public_id
      this.$nextTick(() => {
        this.zoomToDataset(dataset.public_id)
      })
    },
    setSelectedMode(modeKey) {
      if (!this.layerModes.some(mode => mode.key === modeKey)) {
        return
      }
      this.selectedModeKey = modeKey
      this.updateBaseLayers()
    },
    selectDataset(publicId) {
      this.selectedDatasetPublicId = publicId
    },
    isDatasetVisible(publicId) {
      return this.datasetVisibility[publicId] !== false
    },
    toggleDatasetVisibility(publicId) {
      this.datasetVisibility = {
        ...this.datasetVisibility,
        [publicId]: !this.isDatasetVisible(publicId),
      }
      this.reconcileDatasetLayers()
    },
    zoomToDataset(publicId) {
      const dataset = this.datasets.find(item => item.public_id === publicId)
      if (!dataset || !this.mapInstance) {
        return
      }

      const bounds = toBounds(dataset.extent)
      if (!bounds) {
        return
      }

      const [southWest, northEast] = bounds
      if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
        this.mapInstance.flyTo({ center: southWest, zoom: 14 })
        return
      }
      this.mapInstance.fitBounds(bounds, { padding: 72, maxZoom: 15 })
    },
    resetView() {
      if (!this.mapInstance) {
        return
      }

      this.mapInstance.flyTo({
        center: [this.runtime.defaultCenter[1], this.runtime.defaultCenter[0]],
        zoom: this.runtime.defaultZoom,
      })
    },
    zoomIn() {
      this.mapInstance?.zoomIn()
    },
    zoomOut() {
      this.mapInstance?.zoomOut()
    },
    openMapConfig() {
      this.$router.push('/settings/map-config')
    },
  },
}
</script>

<style scoped lang="css">
.maplibre-map-frame {
  height: 100%;
  min-height: 100%;
}

.maplibre-map-frame__stage {
  position: relative;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(186, 230, 253, 0.42), transparent 30%),
    linear-gradient(180deg, rgba(241, 245, 249, 0.92), rgba(226, 232, 240, 0.82));
}

.maplibre-map-frame__map {
  width: 100%;
  height: 100%;
}

.maplibre-map-frame__panel,
.maplibre-map-frame__toolbar {
  position: absolute;
  z-index: 20;
}

.maplibre-map-frame__panel--left {
  top: 1rem;
  left: 1rem;
  bottom: 1rem;
  width: min(24rem, calc(100vw - 2rem));
}

.maplibre-map-frame__panel--right {
  top: 1rem;
  right: 1rem;
  width: min(19rem, calc(100vw - 2rem));
}

.maplibre-map-frame__toolbar {
  right: 1rem;
  top: calc(1rem + 17.5rem);
}

.map-card {
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px);
  @apply rounded-[24px];
}

.map-card--panel {
  height: 100%;
  overflow: auto;
  @apply p-4;
}

.map-card--toolbar,
.map-card--inspector {
  @apply p-3;
}

.map-card__head {
  @apply flex items-start justify-between gap-3;
}

.map-card__head h3 {
  @apply m-0 text-base font-semibold text-slate-900;
}

.map-card__head p {
  @apply mt-1 text-xs text-slate-500;
}

.map-panel-block {
  @apply mt-4 space-y-3;
}

.map-panel-block > strong {
  @apply block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400;
}

.map-base-mode-grid {
  @apply grid gap-2;
}

.map-base-mode-btn {
  @apply flex flex-col items-start rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left transition;
}

.map-base-mode-btn span {
  @apply text-sm font-semibold text-slate-900;
}

.map-base-mode-btn small {
  @apply mt-1 text-xs leading-5 text-slate-500;
}

.map-base-mode-btn--active {
  @apply border-sky-300 bg-sky-50;
}

.map-dataset-list {
  @apply space-y-2;
}

.map-dataset-card {
  @apply rounded-[18px] border border-slate-200 bg-white/95 p-3;
}

.map-dataset-card--active {
  @apply border-sky-300 bg-sky-50/80;
}

.map-dataset-card__main {
  @apply flex w-full flex-col items-start text-left;
}

.map-dataset-card__title {
  @apply text-sm font-semibold text-slate-900;
}

.map-dataset-card__meta {
  @apply mt-1 text-xs text-slate-500;
}

.map-dataset-card__actions {
  @apply mt-3 flex gap-2;
}

.map-toolbar-btn,
.map-mini-btn {
  @apply inline-flex items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition;
}

.map-toolbar-btn:hover,
.map-mini-btn:hover {
  @apply border-sky-300 bg-sky-50 text-slate-900;
}

.map-card--toolbar {
  @apply flex flex-col gap-2;
}

.map-status-chip {
  @apply inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em];
}

.map-status-chip--ready {
  @apply bg-emerald-50 text-emerald-700;
}

.map-status-chip--idle {
  @apply bg-amber-50 text-amber-700;
}

.map-inspector-meta {
  @apply mt-4 grid gap-3;
}

.map-inspector-meta dt {
  @apply text-xs font-semibold uppercase tracking-[0.16em] text-slate-400;
}

.map-inspector-meta dd {
  @apply m-0 text-sm text-slate-700;
}

.map-feedback {
  @apply rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600;
}

.map-feedback--error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.maplibre-map-frame__overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  text-align: center;
  background: rgba(248, 250, 252, 0.76);
  backdrop-filter: blur(8px);
}

.map-overlay-tag {
  @apply inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700;
}

.maplibre-map-frame__overlay h4 {
  @apply m-0 text-xl font-semibold text-slate-900;
}

.maplibre-map-frame__overlay p {
  @apply m-0 max-w-md text-sm leading-7 text-slate-600;
}

.map-overlay-action {
  @apply inline-flex items-center justify-center rounded-[18px] border border-transparent bg-slate-900 px-5 py-3 text-sm font-semibold text-white;
}

:deep(.maplibregl-ctrl-group) {
  box-shadow: none;
}

@media (max-width: 1080px) {
  .maplibre-map-frame__panel--right,
  .maplibre-map-frame__toolbar {
    display: none;
  }

  .maplibre-map-frame__panel--left {
    width: min(22rem, calc(100vw - 2rem));
  }
}

@media (max-width: 720px) {
  .maplibre-map-frame__panel--left {
    top: auto;
    width: calc(100vw - 2rem);
    height: 42vh;
  }
}
</style>