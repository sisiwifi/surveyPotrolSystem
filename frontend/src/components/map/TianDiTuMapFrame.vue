<template>
  <section class="tianditu-map-frame">
    <header class="tianditu-map-frame__header">
      <div class="tianditu-map-frame__header-copy">
        <span class="tianditu-map-frame__eyebrow">Map shell</span>
        <h3 class="tianditu-map-frame__title">天地图工作框架</h3>
        <p class="tianditu-map-frame__desc">
          这里先把底图切换、配置读取和后续图层挂载点预留好，等你补 TK 和点位数据后就能直接往里接。
        </p>
      </div>

      <div class="tianditu-map-frame__switcher" role="tablist" aria-label="天地图底图切换">
        <button
          v-for="mode in layerModes"
          :key="mode.key"
          class="tianditu-map-frame__switcher-button"
          :class="{ 'tianditu-map-frame__switcher-button--active': selectedModeKey === mode.key }"
          type="button"
          :aria-pressed="selectedModeKey === mode.key"
          @click="setSelectedMode(mode.key)"
        >
          <span class="tianditu-map-frame__switcher-label">{{ mode.label }}</span>
          <span class="tianditu-map-frame__switcher-hint">{{ mode.description }}</span>
        </button>
      </div>
    </header>

    <div class="tianditu-map-frame__body">
      <div class="tianditu-map-frame__stage">
        <div ref="mapRoot" class="tianditu-map-frame__map"></div>

        <div v-if="!runtime.ready" class="tianditu-map-frame__overlay">
          <span class="tianditu-map-frame__overlay-tag">待配置</span>
          <h4 class="tianditu-map-frame__overlay-title">还没有填写天地图 TK</h4>
          <p class="tianditu-map-frame__overlay-text">
            在 frontend/.env.local 中补上 VUE_APP_TIANDITU_TK 之后，这里会自动挂载天地图底图。
          </p>
        </div>

        <div v-else-if="mapError" class="tianditu-map-frame__overlay tianditu-map-frame__overlay--error">
          <span class="tianditu-map-frame__overlay-tag tianditu-map-frame__overlay-tag--error">加载失败</span>
          <h4 class="tianditu-map-frame__overlay-title">天地图底图未能初始化</h4>
          <p class="tianditu-map-frame__overlay-text">{{ mapError }}</p>
        </div>
      </div>

      <aside class="tianditu-map-frame__panel">
        <section class="tianditu-map-frame__card">
          <h4 class="tianditu-map-frame__card-title">当前配置</h4>
          <dl class="tianditu-map-frame__meta-list">
            <div class="tianditu-map-frame__meta-item">
              <dt>TK</dt>
              <dd>{{ runtime.ready ? '已读取' : '未配置' }}</dd>
            </div>
            <div class="tianditu-map-frame__meta-item">
              <dt>默认中心</dt>
              <dd>{{ centerLabel }}</dd>
            </div>
            <div class="tianditu-map-frame__meta-item">
              <dt>默认缩放</dt>
              <dd>{{ runtime.defaultZoom }}</dd>
            </div>
            <div class="tianditu-map-frame__meta-item">
              <dt>当前视图</dt>
              <dd>{{ currentViewLabel }}</dd>
            </div>
          </dl>
        </section>

        <section class="tianditu-map-frame__card">
          <h4 class="tianditu-map-frame__card-title">后续接入点</h4>
          <ul class="tianditu-map-frame__list">
            <li>照片 EXIF GPS 点位渲染</li>
            <li>无坐标照片的补点和拖拽纠偏</li>
            <li>矢量图层与照片联动选中</li>
            <li>空间筛选、圈选和矩形框选</li>
          </ul>
        </section>

        <section class="tianditu-map-frame__card">
          <h4 class="tianditu-map-frame__card-title">接入准备</h4>
          <ul class="tianditu-map-frame__list">
            <li>申请天地图网页服务 TK，并配置允许访问的域名</li>
            <li>约定地图投影和坐标来源，先统一照片点位坐标系</li>
            <li>准备点位数据结构，至少包含经纬度、图层类型和业务 id</li>
            <li>决定底图模式，矢量、影像、地形至少先保留这三类切换</li>
          </ul>
        </section>
      </aside>
    </div>
  </section>
</template>

<script>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createTiandituLayerBundle,
  formatTiandituCenter,
  getTiandituLayerModes,
  readTiandituRuntime,
} from '../../utils/map/tianditu'

export default {
  name: 'TianDiTuMapFrame',
  data() {
    return {
      runtime: readTiandituRuntime(),
      layerModes: getTiandituLayerModes(),
      selectedModeKey: 'vector',
      mapInstance: null,
      activeLayerBundle: null,
      mapError: '',
      currentViewLabel: '未初始化',
    }
  },
  computed: {
    centerLabel() {
      return formatTiandituCenter(this.runtime.defaultCenter)
    },
  },
  mounted() {
    this.setupMap()
    window.addEventListener('resize', this.handleWindowResize)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleWindowResize)
    this.teardownMap()
  },
  methods: {
    setupMap() {
      const mapRoot = this.$refs.mapRoot
      if (!mapRoot) {
        this.mapError = '地图容器未找到。'
        return
      }

      this.mapInstance = L.map(mapRoot, {
        center: this.runtime.defaultCenter,
        zoom: this.runtime.defaultZoom,
        zoomControl: true,
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
      this.selectedModeKey = modeKey
      this.syncBaseLayer()
    },
  },
}
</script>

<style scoped lang="css">
.tianditu-map-frame {
  @apply rounded-[30px] border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70;
}

.tianditu-map-frame__header {
  @apply flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between;
}

.tianditu-map-frame__header-copy {
  @apply max-w-4xl space-y-3;
}

.tianditu-map-frame__eyebrow {
  @apply inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700;
}

.tianditu-map-frame__title {
  @apply text-2xl font-semibold text-slate-900;
}

.tianditu-map-frame__desc {
  @apply max-w-3xl text-sm leading-7 text-slate-600;
}

.tianditu-map-frame__switcher {
  @apply grid gap-3 md:grid-cols-3 xl:min-w-[36rem];
}

.tianditu-map-frame__switcher-button {
  @apply rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/70;
}

.tianditu-map-frame__switcher-button--active {
  @apply border-emerald-400 bg-emerald-50 shadow-sm shadow-emerald-100;
}

.tianditu-map-frame__switcher-label {
  @apply block text-sm font-semibold text-slate-900;
}

.tianditu-map-frame__switcher-hint {
  @apply mt-1 block text-xs leading-5 text-slate-500;
}

.tianditu-map-frame__body {
  @apply mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)];
}

.tianditu-map-frame__stage {
  @apply relative min-h-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100;
}

.tianditu-map-frame__map {
  @apply h-full min-h-[620px] w-full;
}

.tianditu-map-frame__overlay {
  @apply absolute inset-4 flex max-w-md flex-col justify-end rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(15,23,42,0.72))] p-5 text-white shadow-lg shadow-slate-900/20 backdrop-blur-sm;
}

.tianditu-map-frame__overlay--error {
  @apply bg-[linear-gradient(180deg,rgba(254,242,242,0.12),rgba(127,29,29,0.82))];
}

.tianditu-map-frame__overlay-tag {
  @apply mb-3 inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white;
}

.tianditu-map-frame__overlay-tag--error {
  @apply bg-rose-100/20 text-rose-50;
}

.tianditu-map-frame__overlay-title {
  @apply text-xl font-semibold text-white;
}

.tianditu-map-frame__overlay-text {
  @apply mt-2 text-sm leading-7 text-white/85;
}

.tianditu-map-frame__panel {
  @apply grid gap-4;
}

.tianditu-map-frame__card {
  @apply rounded-[24px] border border-slate-200 bg-slate-50/80 p-4;
}

.tianditu-map-frame__card-title {
  @apply text-base font-semibold text-slate-900;
}

.tianditu-map-frame__meta-list,
.tianditu-map-frame__list {
  @apply mt-3 grid gap-3;
}

.tianditu-map-frame__meta-item {
  @apply rounded-[18px] border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/60;
}

.tianditu-map-frame__meta-item dt {
  @apply text-xs uppercase tracking-[0.2em] text-slate-500;
}

.tianditu-map-frame__meta-item dd {
  @apply mt-1 text-sm font-medium text-slate-900;
}

.tianditu-map-frame__list {
  @apply text-sm leading-7 text-slate-700;
}

.tianditu-map-frame__list li {
  @apply rounded-[18px] border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/60;
}

@media (max-width: 1279px) {
  .tianditu-map-frame__switcher {
    @apply xl:min-w-0;
  }
}
</style>
