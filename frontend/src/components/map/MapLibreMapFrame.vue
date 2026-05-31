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
            <button class="map-toolbar-btn" type="button" @click="refreshLayers">刷新</button>
          </div>

          <div class="map-panel-block">
            <div class="map-panel-block__head">
              <button
                class="map-panel-block__toggle"
                type="button"
                :aria-expanded="String(!isBasePanelCollapsed)"
                @click="toggleBasePanel"
              >
                <strong>底图模式</strong>
                <span class="map-panel-block__caret">{{ isBasePanelCollapsed ? '+' : '−' }}</span>
              </button>

              <button
                class="map-panel-block__icon-btn"
                type="button"
                title="添加栅格影像"
                aria-label="添加栅格影像"
                @click="openRasterPicker"
              >
                +
              </button>
            </div>

            <div v-if="!isBasePanelCollapsed" class="map-base-mode-grid">
              <button
                v-for="mode in layerModes"
                :key="mode.key"
                class="map-base-mode-btn"
                :class="{ 'map-base-mode-btn--active': selectedModeKey === mode.key }"
                type="button"
                :title="mode.label"
                @click="setSelectedMode(mode.key)"
              >
                <span>{{ mode.label }}</span>
              </button>
            </div>

            <div v-if="!isBasePanelCollapsed && rasterError" class="map-feedback map-feedback--error">
              {{ rasterError }}
            </div>

            <ul v-if="!isBasePanelCollapsed && loadedRasterDatasets.length" class="map-raster-list">
              <li v-for="raster in loadedRasterDatasets" :key="raster.public_id">
                <article class="map-raster-card" :class="{ 'map-raster-card--active': selectedRasterPublicId === raster.public_id }">
                  <button class="map-raster-card__main" type="button" @click="selectRaster(raster.public_id)">
                    <span class="map-raster-card__title">{{ raster.title }}</span>
                    <span class="map-raster-card__meta">{{ raster.format || '栅格' }} / {{ raster.band_count || 0 }} 波段</span>
                    <span class="map-raster-card__load" :class="rasterLoadClass(raster.public_id)">{{ rasterLoadLabel(raster.public_id) }}</span>
                  </button>
                  <div class="map-raster-card__actions">
                    <button class="map-mini-btn" type="button" @click.stop="toggleRasterVisibility(raster.public_id)">
                      {{ isRasterVisible(raster.public_id) ? '隐藏' : '显示' }}
                    </button>
                    <button class="map-mini-btn" type="button" @click.stop="zoomToRaster(raster.public_id)">定位</button>
                    <button class="map-mini-btn" type="button" @click.stop="removeRaster(raster.public_id)">移除</button>
                  </div>
                </article>
              </li>
            </ul>

            <div v-else-if="!isBasePanelCollapsed" class="map-feedback">
              尚未加载栅格影像。
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
                    <span class="map-dataset-card__copy">
                      <span class="map-dataset-card__title">{{ dataset.title }}</span>
                      <span class="map-dataset-card__meta">{{ dataset.geometry_type || '未知' }} / {{ dataset.parsed_feature_count || 0 }} 要素</span>
                    </span>
                    <span class="map-dataset-card__symbol-wrap">
                      <span
                        class="map-symbol-preview"
                        :class="symbolPreviewClass(dataset)"
                        :style="symbolPreviewStyle(dataset)"
                        aria-hidden="true"
                      ></span>
                    </span>
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

    <Teleport to="body">
      <Transition name="map-dialog-fade">
        <div v-if="isRasterPickerOpen" class="map-dialog-mask" @click.self="closeRasterPicker">
          <section class="map-dialog" role="dialog" aria-modal="true" aria-label="选择栅格影像">
            <header class="map-dialog__head">
              <div>
                <h3>选择栅格影像</h3>
                <p>选择已经在库中的栅格影像，叠加到当前底图模式之上。</p>
              </div>
              <button class="map-dialog__close" type="button" @click="closeRasterPicker">关闭</button>
            </header>

            <div v-if="rasterError" class="map-feedback map-feedback--error map-dialog__feedback">
              {{ rasterError }}
            </div>

            <div v-else-if="rasterPickerLoading" class="map-dialog__empty">
              正在读取栅格数据清单…
            </div>

            <ul v-else-if="rasterDatasets.length" class="map-raster-picker-list">
              <li v-for="raster in rasterDatasets" :key="raster.public_id">
                <article class="map-raster-picker-card" :class="{ 'map-raster-picker-card--active': isRasterLoaded(raster.public_id) }">
                  <button class="map-raster-picker-card__main" type="button" @click="toggleRasterLoad(raster.public_id)">
                    <span class="map-raster-picker-card__title">{{ raster.title }}</span>
                    <span class="map-raster-picker-card__meta">
                      {{ raster.format || '栅格' }} / {{ raster.band_count || 0 }} 波段 / {{ raster.pyramid_mode || 'dynamic' }}
                    </span>
                    <span class="map-raster-picker-card__load" :class="rasterLoadClass(raster.public_id)">{{ rasterLoadLabel(raster.public_id) }}</span>
                  </button>
                  <div class="map-raster-picker-card__actions">
                    <button class="map-mini-btn" type="button" @click.stop="toggleRasterLoad(raster.public_id)">
                      {{ isRasterLoaded(raster.public_id) ? '移除' : '加载' }}
                    </button>
                    <button class="map-mini-btn" type="button" @click.stop="zoomToRaster(raster.public_id)">定位</button>
                  </div>
                </article>
              </li>
            </ul>

            <div v-else class="map-dialog__empty">
              当前还没有可选的栅格影像。
            </div>

            <div class="map-dialog__actions">
              <button class="map-mini-btn" type="button" @click="openRasterPage">前往栅格数据页</button>
              <button class="map-toolbar-btn" type="button" @click="closeRasterPicker">知道了</button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script>
/**
 * MapLibre 地图主组件，负责统一接入天地图底图与后端矢量数据接口。
 * 当前版本已替换原 Leaflet 地图容器，可显示导入后的 SHP / CSV 图层，并对旧坏范围数据给出重导提示。
 * 相关文档：frontend/Frontend_README.md、backend/api_services.md。
 */
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildRasterTileUrl, listRasterDatasets } from '../../utils/rasterApi'
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

function isPointGeometry(geometryType) {
  return String(geometryType || '').toLowerCase().includes('point')
}

function isLineGeometry(geometryType) {
  return String(geometryType || '').toLowerCase().includes('line')
}

function isPolygonGeometry(geometryType) {
  return !isPointGeometry(geometryType) && !isLineGeometry(geometryType)
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
  if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90) {
    return null
  }
  return [
    [west, south],
    [east, north],
  ]
}

function invalidVectorExtentMessage(dataset) {
  const title = dataset?.title || '该矢量数据'
  return `${title} 的范围超出经纬度范围，通常是旧版错误导入的数据；请删除后重新从服务路径导入。`
}

export default {
  name: 'MapLibreMapFrame',
  data() {
    return {
      runtime: readTiandituRuntime(getCachedMapConfig()),
      layerModes: getTiandituLayerModes(),
      selectedModeKey: 'vector',
      isBasePanelCollapsed: false,
      isRasterPickerOpen: false,
      rasterPickerLoading: false,
      mapInstance: null,
      mapReady: false,
      configLoading: true,
      configError: '',
      mapError: '',
      datasetError: '',
      rasterError: '',
      currentViewLabel: '未初始化',
      datasets: [],
      rasterDatasets: [],
      datasetVisibility: {},
      rasterVisibility: {},
      rasterLoadState: {},
      loadedRasterPublicIds: [],
      selectedDatasetPublicId: '',
      selectedRasterPublicId: '',
      renderedDatasetIds: {},
      renderedRasterIds: {},
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
    loadedRasterDatasets() {
      return this.loadedRasterPublicIds
        .map(publicId => this.rasterDatasets.find(item => item.public_id === publicId))
        .filter(Boolean)
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
    '$route.query.focusRaster': {
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
        this.refreshLayers()
      }
    },
    async refreshLayers() {
      await Promise.allSettled([
        this.loadDatasets(),
        this.loadRasterDatasets(),
      ])
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

        const selectedDataset = datasets.find(item => item.public_id === this.selectedDatasetPublicId) || datasets[0] || null
        if (selectedDataset && !toBounds(selectedDataset.extent)) {
          this.datasetError = invalidVectorExtentMessage(selectedDataset)
        }

        this.reconcileDatasetLayers()
        this.syncRasterLayerOrder()
        this.applyRouteFocus()
      } catch (error) {
        this.datasetError = error instanceof Error ? error.message : '读取矢量图层失败'
      }
    },
    async loadRasterDatasets() {
      this.rasterError = ''
      this.rasterPickerLoading = true
      try {
        const datasets = await listRasterDatasets()
        this.rasterVisibility = datasets.reduce((result, dataset) => {
          result[dataset.public_id] = Object.prototype.hasOwnProperty.call(this.rasterVisibility, dataset.public_id)
            ? this.rasterVisibility[dataset.public_id]
            : true
          return result
        }, {})
        this.rasterDatasets = datasets
        this.rasterLoadState = Object.fromEntries(
          Object.entries(this.rasterLoadState).filter(([publicId]) => datasets.some(item => item.public_id === publicId)),
        )
        this.loadedRasterPublicIds = this.loadedRasterPublicIds.filter(publicId => datasets.some(item => item.public_id === publicId))
        if (!datasets.some(item => item.public_id === this.selectedRasterPublicId)) {
          this.selectedRasterPublicId = datasets[0]?.public_id || ''
        }
        this.reconcileRasterLayers()
        this.applyRouteFocus()
      } catch (error) {
        this.rasterError = error instanceof Error ? error.message : '读取栅格图层失败'
      } finally {
        this.rasterPickerLoading = false
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
      this.syncRasterLayerOrder()
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
        this.reconcileRasterLayers()
        this.syncViewState()
      })
      this.mapInstance.on('sourcedata', this.handleRasterSourceData)
      this.mapInstance.on('error', this.handleMapRuntimeError)
      this.mapInstance.on('moveend', this.syncViewState)
      this.mapInstance.on('zoomend', this.syncViewState)
    },
    teardownMap() {
      if (this.mapInstance) {
        this.mapInstance.off('sourcedata', this.handleRasterSourceData)
        this.mapInstance.off('error', this.handleMapRuntimeError)
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
      this.syncRasterLayerOrder()
    },
    datasetSourceId(publicId) {
      return `vector-source-${publicId}`
    },
    rasterSourceId(publicId) {
      return `raster-source-${publicId}`
    },
    rasterLoadLabel(publicId) {
      const status = String(this.rasterLoadState[publicId]?.status || (this.isRasterLoaded(publicId) ? 'loading' : 'idle'))
      if (status === 'ready') return '已就绪'
      if (status === 'error') return '加载失败'
      if (status === 'hidden') return '已隐藏'
      if (status === 'loading') return '加载中'
      return '未加载'
    },
    rasterLoadClass(publicId) {
      const status = String(this.rasterLoadState[publicId]?.status || (this.isRasterLoaded(publicId) ? 'loading' : 'idle'))
      return `map-raster-load--${status}`
    },
    setRasterLoadState(publicId, status, message = '') {
      this.rasterLoadState = {
        ...this.rasterLoadState,
        [publicId]: {
          status,
          message,
        },
      }
    },
    clearRasterLoadState(publicId) {
      const nextState = { ...this.rasterLoadState }
      delete nextState[publicId]
      this.rasterLoadState = nextState
    },
    handleRasterSourceData(event) {
      const sourceId = String(event?.sourceId || '')
      if (!sourceId.startsWith('raster-source-')) {
        return
      }
      const publicId = sourceId.replace('raster-source-', '')
      if (!this.isRasterLoaded(publicId)) {
        return
      }
      if (event?.isSourceLoaded) {
        this.setRasterLoadState(publicId, 'ready', '栅格瓦片已就绪')
        return
      }
      this.setRasterLoadState(publicId, 'loading', '正在拉取栅格瓦片')
    },
    handleMapRuntimeError(event) {
      const sourceId = String(event?.sourceId || event?.source?.id || '')
      if (!sourceId.startsWith('raster-source-')) {
        return
      }
      const publicId = sourceId.replace('raster-source-', '')
      const message = event?.error?.message || '栅格瓦片加载失败'
      this.setRasterLoadState(publicId, 'error', message)
      this.rasterError = message
    },
    datasetLayerIds(publicId) {
      return {
        fill: `vector-fill-${publicId}`,
        line: `vector-line-${publicId}`,
        circle: `vector-circle-${publicId}`,
        label: `vector-label-${publicId}`,
      }
    },
    rasterLayerId(publicId) {
      return `raster-layer-${publicId}`
    },
    firstVectorLayerId() {
      if (!this.mapInstance) {
        return ''
      }
      for (const dataset of this.datasets) {
        const layerIds = this.datasetLayerIds(dataset.public_id)
        for (const layerId of [layerIds.fill, layerIds.line, layerIds.circle, layerIds.label]) {
          if (this.mapInstance.getLayer(layerId)) {
            return layerId
          }
        }
      }
      return ''
    },
    syncRasterLayerOrder() {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const beforeLayerId = this.firstVectorLayerId()
      this.loadedRasterPublicIds.forEach(publicId => {
        const layerId = this.rasterLayerId(publicId)
        if (!this.mapInstance.getLayer(layerId)) {
          return
        }
        if (beforeLayerId && layerId !== beforeLayerId) {
          this.mapInstance.moveLayer(layerId, beforeLayerId)
          return
        }
        this.mapInstance.moveLayer(layerId)
      })

      const annotationLayerId = `tianditu-${this.selectedModeKey}-annotation-layer`
      if (!this.mapInstance.getLayer(annotationLayerId)) {
        return
      }
      if (beforeLayerId && annotationLayerId !== beforeLayerId) {
        this.mapInstance.moveLayer(annotationLayerId, beforeLayerId)
        return
      }
      this.mapInstance.moveLayer(annotationLayerId)
    },
    ensureDatasetLayers(dataset) {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const sourceId = this.datasetSourceId(dataset.public_id)
      const layerIds = this.datasetLayerIds(dataset.public_id)
      const style = normalizeDatasetStyle(dataset)
      const geometryType = String(dataset?.geometry_type || '')
      const wantsFill = isPolygonGeometry(geometryType)
      const wantsLine = wantsFill || isLineGeometry(geometryType)
      const wantsCircle = isPointGeometry(geometryType)

      if (!this.mapInstance.getSource(sourceId)) {
        this.mapInstance.addSource(sourceId, {
          type: 'geojson',
          data: buildVectorGeoJsonUrl(dataset.public_id),
        })
      }

      if (wantsFill && !this.mapInstance.getLayer(layerIds.fill)) {
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
      } else if (!wantsFill && this.mapInstance.getLayer(layerIds.fill)) {
        this.mapInstance.removeLayer(layerIds.fill)
      }
      if (wantsLine && !this.mapInstance.getLayer(layerIds.line)) {
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
      } else if (!wantsLine && this.mapInstance.getLayer(layerIds.line)) {
        this.mapInstance.removeLayer(layerIds.line)
      }
      if (wantsCircle && !this.mapInstance.getLayer(layerIds.circle)) {
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
      } else if (!wantsCircle && this.mapInstance.getLayer(layerIds.circle)) {
        this.mapInstance.removeLayer(layerIds.circle)
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

      if (this.mapInstance.getLayer(layerIds.fill)) {
        this.mapInstance.setPaintProperty(layerIds.fill, 'fill-color', style.fillColor)
        this.mapInstance.setPaintProperty(layerIds.fill, 'fill-opacity', style.fillOpacity)
      }
      if (this.mapInstance.getLayer(layerIds.line)) {
        this.mapInstance.setPaintProperty(layerIds.line, 'line-color', style.lineColor)
        this.mapInstance.setPaintProperty(layerIds.line, 'line-width', style.lineWidth)
      }
      if (this.mapInstance.getLayer(layerIds.circle)) {
        this.mapInstance.setPaintProperty(layerIds.circle, 'circle-color', style.circleColor)
        this.mapInstance.setPaintProperty(layerIds.circle, 'circle-radius', style.circleRadius)
        this.mapInstance.setPaintProperty(layerIds.circle, 'circle-stroke-color', style.circleStrokeColor)
        this.mapInstance.setPaintProperty(layerIds.circle, 'circle-stroke-width', style.circleStrokeWidth)
      }
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
      this.syncRasterLayerOrder()
    },
    ensureRasterLayer(dataset) {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const sourceId = this.rasterSourceId(dataset.public_id)
      const layerId = this.rasterLayerId(dataset.public_id)
      const isVisible = this.isRasterVisible(dataset.public_id)
      if (!this.mapInstance.getSource(sourceId)) {
        this.mapInstance.addSource(sourceId, {
          type: 'raster',
          tiles: [buildRasterTileUrl(dataset.public_id)],
          tileSize: 256,
        })
        if (isVisible) {
          this.setRasterLoadState(dataset.public_id, 'loading', '正在请求栅格瓦片')
        }
      }

      if (!this.mapInstance.getLayer(layerId)) {
        const beforeLayerId = this.firstVectorLayerId() || undefined
        this.mapInstance.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': isVisible ? 1 : 0,
          },
          layout: {
            visibility: isVisible ? 'visible' : 'none',
          },
        }, beforeLayerId)
      }

      this.mapInstance.setPaintProperty(layerId, 'raster-opacity', isVisible ? 1 : 0)
      this.mapInstance.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
      if (isVisible && this.rasterLoadState[dataset.public_id]?.status !== 'ready') {
        this.setRasterLoadState(dataset.public_id, 'loading', '正在请求栅格瓦片')
      }
      if (!isVisible && this.isRasterLoaded(dataset.public_id)) {
        this.setRasterLoadState(dataset.public_id, 'hidden', '栅格图层已隐藏')
      }
      this.renderedRasterIds = {
        ...this.renderedRasterIds,
        [dataset.public_id]: true,
      }
      this.syncRasterLayerOrder()
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
    removeRasterLayer(publicId) {
      if (!this.mapInstance) {
        return
      }

      const layerId = this.rasterLayerId(publicId)
      if (this.mapInstance.getLayer(layerId)) {
        this.mapInstance.removeLayer(layerId)
      }
      const sourceId = this.rasterSourceId(publicId)
      if (this.mapInstance.getSource(sourceId)) {
        this.mapInstance.removeSource(sourceId)
      }
      this.clearRasterLoadState(publicId)

      const nextRendered = { ...this.renderedRasterIds }
      delete nextRendered[publicId]
      this.renderedRasterIds = nextRendered
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
    reconcileRasterLayers() {
      if (!this.mapInstance || !this.mapReady) {
        return
      }

      const activeIds = new Set(this.loadedRasterPublicIds)
      Object.keys(this.renderedRasterIds).forEach(publicId => {
        if (!activeIds.has(publicId)) {
          this.removeRasterLayer(publicId)
        }
      })

      this.loadedRasterDatasets.forEach(dataset => {
        this.ensureRasterLayer(dataset)
      })
      this.syncRasterLayerOrder()
    },
    applyRouteFocus() {
      const rasterFocusId = typeof this.$route.query?.focusRaster === 'string' ? this.$route.query.focusRaster : ''
      if (rasterFocusId) {
        const raster = this.rasterDatasets.find(item => item.public_id === rasterFocusId)
        if (!raster) {
          return
        }

        if (!this.isRasterLoaded(raster.public_id)) {
          this.loadedRasterPublicIds = [...this.loadedRasterPublicIds, raster.public_id]
          this.rasterVisibility = {
            ...this.rasterVisibility,
            [raster.public_id]: true,
          }
          this.reconcileRasterLayers()
        }

        this.selectedRasterPublicId = raster.public_id
        this.$nextTick(() => {
          this.zoomToRaster(raster.public_id)
        })
        return
      }

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
    toggleBasePanel() {
      this.isBasePanelCollapsed = !this.isBasePanelCollapsed
    },
    openRasterPicker() {
      this.isRasterPickerOpen = true
      this.loadRasterDatasets()
    },
    closeRasterPicker() {
      this.isRasterPickerOpen = false
    },
    setSelectedMode(modeKey) {
      if (!this.layerModes.some(mode => mode.key === modeKey)) {
        return
      }
      this.selectedModeKey = modeKey
      this.updateBaseLayers()
      this.syncRasterLayerOrder()
    },
    selectDataset(publicId) {
      this.selectedDatasetPublicId = publicId
      const dataset = this.datasets.find(item => item.public_id === publicId)
      this.datasetError = dataset && !toBounds(dataset.extent) ? invalidVectorExtentMessage(dataset) : ''
    },
    selectRaster(publicId) {
      this.selectedRasterPublicId = publicId
    },
    isDatasetVisible(publicId) {
      return this.datasetVisibility[publicId] !== false
    },
    isRasterLoaded(publicId) {
      return this.loadedRasterPublicIds.includes(publicId)
    },
    isRasterVisible(publicId) {
      return this.isRasterLoaded(publicId) && this.rasterVisibility[publicId] !== false
    },
    toggleDatasetVisibility(publicId) {
      this.datasetVisibility = {
        ...this.datasetVisibility,
        [publicId]: !this.isDatasetVisible(publicId),
      }
      this.reconcileDatasetLayers()
    },
    toggleRasterLoad(publicId) {
      if (this.isRasterLoaded(publicId)) {
        this.removeRaster(publicId)
        return
      }
      this.loadedRasterPublicIds = [...this.loadedRasterPublicIds, publicId]
      this.setRasterLoadState(publicId, 'loading', '正在请求栅格瓦片')
      this.rasterVisibility = {
        ...this.rasterVisibility,
        [publicId]: true,
      }
      this.selectedRasterPublicId = publicId
      this.reconcileRasterLayers()
    },
    toggleRasterVisibility(publicId) {
      const nextVisibility = !this.isRasterVisible(publicId)
      this.rasterVisibility = {
        ...this.rasterVisibility,
        [publicId]: nextVisibility,
      }
      this.setRasterLoadState(publicId, nextVisibility ? 'loading' : 'hidden', nextVisibility ? '正在请求栅格瓦片' : '栅格图层已隐藏')
      this.reconcileRasterLayers()
    },
    removeRaster(publicId) {
      this.loadedRasterPublicIds = this.loadedRasterPublicIds.filter(item => item !== publicId)
      if (this.selectedRasterPublicId === publicId) {
        this.selectedRasterPublicId = this.loadedRasterPublicIds[0] || ''
      }
      this.clearRasterLoadState(publicId)
      this.reconcileRasterLayers()
    },
    zoomToDataset(publicId) {
      const dataset = this.datasets.find(item => item.public_id === publicId)
      if (!dataset || !this.mapInstance) {
        return
      }

      const bounds = toBounds(dataset.extent)
      if (!bounds) {
        this.datasetError = invalidVectorExtentMessage(dataset)
        return
      }
      this.datasetError = ''

      const [southWest, northEast] = bounds
      if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
        this.mapInstance.flyTo({ center: southWest, zoom: 14 })
        return
      }
      this.mapInstance.fitBounds(bounds, { padding: 72, maxZoom: 15 })
    },
    zoomToRaster(publicId) {
      const dataset = this.rasterDatasets.find(item => item.public_id === publicId)
      if (!dataset || !this.mapInstance) {
        return
      }

      const bounds = toBounds(dataset.extent)
      if (!bounds) {
        return
      }

      this.selectedRasterPublicId = publicId
      this.mapInstance.fitBounds(bounds, { padding: 72, maxZoom: 15 })
    },
    symbolPreviewClass(dataset) {
      if (isPointGeometry(dataset?.geometry_type)) {
        return 'map-symbol-preview--point'
      }
      if (isLineGeometry(dataset?.geometry_type)) {
        return 'map-symbol-preview--line'
      }
      return 'map-symbol-preview--polygon'
    },
    symbolPreviewStyle(dataset) {
      const style = normalizeDatasetStyle(dataset)
      if (isPointGeometry(dataset?.geometry_type)) {
        return {
          '--symbol-fill': style.circleColor,
          '--symbol-stroke': style.circleStrokeColor,
          '--symbol-size': `${Math.max(10, Math.min(18, style.circleRadius * 2))}px`,
        }
      }
      if (isLineGeometry(dataset?.geometry_type)) {
        return {
          '--symbol-fill': style.lineColor,
          '--symbol-stroke': style.lineColor,
          '--symbol-size': `${Math.max(2, Math.min(6, style.lineWidth))}px`,
        }
      }
      return {
        '--symbol-fill': style.fillColor,
        '--symbol-stroke': style.lineColor,
        '--symbol-opacity': String(style.fillOpacity),
        '--symbol-size': `${Math.max(2, Math.min(6, style.lineWidth))}px`,
      }
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
    openRasterPage() {
      this.closeRasterPicker()
      this.$router.push('/rasters')
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

.map-panel-block__head {
  @apply flex items-center justify-between gap-3;
}

.map-panel-block__toggle {
  @apply flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[16px] px-1 py-1 text-left transition;
}

.map-panel-block__toggle:hover {
  @apply bg-slate-100/80;
}

.map-panel-block__toggle strong {
  @apply block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400;
}

.map-panel-block__caret {
  @apply text-sm font-semibold text-slate-500;
}

.map-panel-block__icon-btn {
  @apply inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-700 transition;
}

.map-panel-block__icon-btn:hover {
  @apply border-sky-300 bg-sky-50 text-slate-900;
}

.map-base-mode-grid {
  @apply grid gap-2;
}

.map-base-mode-btn {
  @apply flex items-center rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left transition;
}

.map-base-mode-btn span {
  @apply text-sm font-semibold text-slate-900;
}

.map-base-mode-btn--active {
  @apply border-sky-300 bg-sky-50;
}

.map-raster-list,
.map-raster-picker-list,
.map-dataset-list {
  @apply space-y-2;
}

.map-raster-card,
.map-raster-picker-card {
  @apply rounded-[18px] border border-slate-200 bg-white/95 p-3;
}

.map-raster-card--active,
.map-raster-picker-card--active {
  @apply border-sky-300 bg-sky-50/80;
}

.map-raster-card__main,
.map-raster-picker-card__main {
  @apply flex w-full flex-col items-start text-left;
}

.map-raster-card__title,
.map-raster-picker-card__title {
  @apply text-sm font-semibold text-slate-900;
}

.map-raster-card__meta,
.map-raster-picker-card__meta {
  @apply mt-1 text-xs text-slate-500;
}

.map-raster-card__load,
.map-raster-picker-card__load {
  @apply mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em];
}

.map-raster-load--idle,
.map-raster-load--hidden {
  @apply bg-slate-100 text-slate-500;
}

.map-raster-load--loading {
  @apply bg-sky-50 text-sky-700;
}

.map-raster-load--ready {
  @apply bg-emerald-50 text-emerald-700;
}

.map-raster-load--error {
  @apply bg-rose-50 text-rose-700;
}

.map-raster-card__actions,
.map-raster-picker-card__actions {
  @apply mt-3 flex flex-wrap gap-2;
}

.map-dialog-mask {
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

.map-dialog {
  width: min(100%, 760px);
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 28px;
  padding: 1.25rem;
  background:
    radial-gradient(circle at top left, rgba(186, 230, 253, 0.4), transparent 35%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
}

.map-dialog__head {
  @apply flex items-start justify-between gap-4;
}

.map-dialog__head h3 {
  @apply m-0 text-lg font-semibold text-slate-900;
}

.map-dialog__head p {
  @apply mt-2 text-sm leading-6 text-slate-500;
}

.map-dialog__close {
  @apply rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition;
}

.map-dialog__close:hover {
  @apply border-sky-300 bg-sky-50 text-slate-900;
}

.map-dialog__empty {
  @apply mt-6 rounded-[22px] border border-dashed border-slate-300 bg-white/90 px-5 py-12 text-center text-sm text-slate-500;
}

.map-dialog__feedback {
  @apply mt-5;
}

.map-dialog__actions {
  @apply mt-5 flex flex-wrap justify-end gap-2;
}

.map-dialog-fade-enter-active,
.map-dialog-fade-leave-active {
  transition: opacity 180ms ease;
}

.map-dialog-fade-enter-from,
.map-dialog-fade-leave-to {
  opacity: 0;
}

.map-dataset-card {
  @apply rounded-[18px] border border-slate-200 bg-white/95 p-3;
}

.map-dataset-card--active {
  @apply border-sky-300 bg-sky-50/80;
}

.map-dataset-card__main {
  @apply flex w-full items-center justify-between gap-3 text-left;
}

.map-dataset-card__copy {
  @apply flex min-w-0 flex-1 flex-col items-start;
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

.map-dataset-card__symbol-wrap {
  @apply flex h-12 w-14 items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50;
}

.map-symbol-preview {
  --symbol-fill: #0ea5e9;
  --symbol-stroke: #ffffff;
  --symbol-opacity: 0.24;
  --symbol-size: 3px;
  display: inline-flex;
  flex-shrink: 0;
}

.map-symbol-preview--point {
  width: var(--symbol-size);
  height: var(--symbol-size);
  border: 2px solid var(--symbol-stroke);
  border-radius: 999px;
  background: var(--symbol-fill);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.05);
}

.map-symbol-preview--line {
  width: 2rem;
  height: var(--symbol-size);
  border-radius: 999px;
  background: var(--symbol-fill);
}

.map-symbol-preview--polygon {
  width: 2rem;
  height: 1.35rem;
  border: var(--symbol-size) solid var(--symbol-stroke);
  border-radius: 0.5rem;
  background: var(--symbol-fill);
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