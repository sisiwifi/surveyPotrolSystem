import { API_BASE } from './apiBase'

const STORAGE_KEY = 'ptv.mapConfig'

export const MAP_CONFIG_UPDATED_EVENT = 'ptv:map-config-updated'
export const DEFAULT_MAP_CENTER = Object.freeze([35.8617, 104.1954])
export const DEFAULT_MAP_ZOOM = 5
export const MIN_MAP_ZOOM = 3
export const MAX_MAP_ZOOM = 18

export const DEFAULT_MAP_CONFIG = Object.freeze({
  tk: '',
  defaultCenter: [...DEFAULT_MAP_CENTER],
  defaultZoom: DEFAULT_MAP_ZOOM,
})

function normalizeCenter(rawCenter) {
  if (!Array.isArray(rawCenter) || rawCenter.length !== 2) {
    return [...DEFAULT_MAP_CENTER]
  }

  const latitude = Number.parseFloat(String(rawCenter[0]))
  const longitude = Number.parseFloat(String(rawCenter[1]))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [...DEFAULT_MAP_CENTER]
  }

  return [
    Math.min(90, Math.max(-90, latitude)),
    Math.min(180, Math.max(-180, longitude)),
  ]
}

function normalizeZoom(rawZoom) {
  const zoom = Number.parseInt(String(rawZoom ?? ''), 10)
  if (!Number.isFinite(zoom)) {
    return DEFAULT_MAP_ZOOM
  }
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, zoom))
}

export function normalizeMapConfig(rawConfig) {
  return {
    tk: typeof rawConfig?.tk === 'string' ? rawConfig.tk.trim() : '',
    defaultCenter: normalizeCenter(rawConfig?.default_center || rawConfig?.defaultCenter),
    defaultZoom: normalizeZoom(rawConfig?.default_zoom ?? rawConfig?.defaultZoom),
  }
}

function writeCachedMapConfig(config) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore local cache persistence failures
  }
}

function dispatchMapConfigUpdated(config) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(MAP_CONFIG_UPDATED_EVENT, { detail: config }))
}

export function getCachedMapConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      tk: DEFAULT_MAP_CONFIG.tk,
      defaultCenter: [...DEFAULT_MAP_CONFIG.defaultCenter],
      defaultZoom: DEFAULT_MAP_CONFIG.defaultZoom,
    }
  }

  try {
    const rawText = window.localStorage.getItem(STORAGE_KEY)
    if (!rawText) {
      return {
        tk: DEFAULT_MAP_CONFIG.tk,
        defaultCenter: [...DEFAULT_MAP_CONFIG.defaultCenter],
        defaultZoom: DEFAULT_MAP_CONFIG.defaultZoom,
      }
    }
    return normalizeMapConfig(JSON.parse(rawText))
  } catch {
    return {
      tk: DEFAULT_MAP_CONFIG.tk,
      defaultCenter: [...DEFAULT_MAP_CONFIG.defaultCenter],
      defaultZoom: DEFAULT_MAP_CONFIG.defaultZoom,
    }
  }
}

export async function fetchMapConfig() {
  const res = await fetch(`${API_BASE}/api/system/map-config`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const config = normalizeMapConfig(await res.json())
  writeCachedMapConfig(config)
  return config
}

export async function saveMapConfig(nextConfig) {
  const normalized = normalizeMapConfig(nextConfig)
  const res = await fetch(`${API_BASE}/api/system/map-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tk: normalized.tk,
      default_center: normalized.defaultCenter,
      default_zoom: normalized.defaultZoom,
    }),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.detail || `HTTP ${res.status}`)
  }

  const savedConfig = normalizeMapConfig(await res.json())
  writeCachedMapConfig(savedConfig)
  dispatchMapConfigUpdated(savedConfig)
  return savedConfig
}