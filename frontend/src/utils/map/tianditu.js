const DEFAULT_CENTER_LNG = 104.1954
const DEFAULT_CENTER_LAT = 35.8617
const DEFAULT_ZOOM = 5

const TIANDITU_LAYER_MODES = Object.freeze([
  {
    key: 'vector',
    label: '矢量底图',
    description: '适合照片点位、道路轮廓和行政边界的日常编辑。',
    baseLayerCode: 'vec_w',
    annotationLayerCode: 'cva_w',
  },
  {
    key: 'imagery',
    label: '影像底图',
    description: '适合定位校对、场景比对和实地影像查看。',
    baseLayerCode: 'img_w',
    annotationLayerCode: 'cia_w',
  },
  {
    key: 'terrain',
    label: '地形底图',
    description: '适合山地、道路高程和空间环境判断。',
    baseLayerCode: 'ter_w',
    annotationLayerCode: 'cta_w',
  },
])

function readEnvText(envKey, fallbackValue = '') {
  return String(process.env[envKey] ?? fallbackValue).trim()
}

function readEnvNumber(envKey, fallbackValue) {
  const parsedValue = Number(process.env[envKey])
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue
}

export function readTiandituRuntime() {
  const tk = readEnvText('VUE_APP_TIANDITU_TK')
  const domainHint = readEnvText(
    'VUE_APP_TIANDITU_DOMAIN',
    typeof window !== 'undefined' ? window.location.host : '',
  )

  return {
    appName: readEnvText('VUE_APP_TIANDITU_APP_NAME', 'surveyPotrolSystem'),
    domainHint,
    tk,
    ready: Boolean(tk),
    defaultCenter: [
      readEnvNumber('VUE_APP_TIANDITU_CENTER_LAT', DEFAULT_CENTER_LAT),
      readEnvNumber('VUE_APP_TIANDITU_CENTER_LNG', DEFAULT_CENTER_LNG),
    ],
    defaultZoom: readEnvNumber('VUE_APP_TIANDITU_ZOOM', DEFAULT_ZOOM),
    tileSubdomains: '01234567',
  }
}

export function getTiandituLayerModes() {
  return TIANDITU_LAYER_MODES.map(mode => ({
    key: mode.key,
    label: mode.label,
    description: mode.description,
    baseLayerCode: mode.baseLayerCode,
    annotationLayerCode: mode.annotationLayerCode,
  }))
}

function buildTiandituDataServerUrl(tileCode, tk) {
  return `https://t{s}.tianditu.gov.cn/DataServer?T=${tileCode}&x={x}&y={y}&l={z}&tk=${encodeURIComponent(tk)}`
}

function createTileLayer(L, tileCode, tk) {
  return L.tileLayer(buildTiandituDataServerUrl(tileCode, tk), {
    subdomains: '01234567',
    tileSize: 256,
    minZoom: 3,
    maxZoom: 18,
    updateWhenIdle: true,
    keepBuffer: 4,
  })
}

export function createTiandituLayerBundle(L, modeKey, tk) {
  const selectedMode = TIANDITU_LAYER_MODES.find(mode => mode.key === modeKey) || TIANDITU_LAYER_MODES[0]
  return {
    key: selectedMode.key,
    label: selectedMode.label,
    description: selectedMode.description,
    baseLayer: createTileLayer(L, selectedMode.baseLayerCode, tk),
    annotationLayer: selectedMode.annotationLayerCode
      ? createTileLayer(L, selectedMode.annotationLayerCode, tk)
      : null,
  }
}

export function formatTiandituCenter(center) {
  const [latitude, longitude] = Array.isArray(center) ? center : [null, null]
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '未配置'
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}
