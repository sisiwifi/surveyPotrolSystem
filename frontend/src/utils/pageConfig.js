const API_BASE = 'http://127.0.0.1:8000'
const STORAGE_KEY = 'ptv.pageConfig'

export const PAGE_CONFIG_UPDATED_EVENT = 'ptv:page-config-updated'
export const PAGE_BROWSE_MODE_PAGED = 'paged'
export const PAGE_SCROLL_WINDOW_OPTIONS = Object.freeze([40, 60, 80, 100, 120, 140, 160, 180, 200])
export const PAGE_SIZE_OPTIONS = Object.freeze([20, 40, 60, 100, 200])

export const DEFAULT_PAGE_CONFIG = Object.freeze({
  browseMode: PAGE_BROWSE_MODE_PAGED,
  scrollWindowSize: 100,
  pageSize: 20,
})

function normalizeScrollWindowSize(value) {
  const numericValue = Number.parseInt(String(value ?? ''), 10)
  if (PAGE_SCROLL_WINDOW_OPTIONS.includes(numericValue)) {
    return numericValue
  }
  return DEFAULT_PAGE_CONFIG.scrollWindowSize
}

function normalizePageSize(value) {
  const numericValue = Number.parseInt(String(value ?? ''), 10)
  if (PAGE_SIZE_OPTIONS.includes(numericValue)) {
    return numericValue
  }
  return DEFAULT_PAGE_CONFIG.pageSize
}

export function normalizePageConfig(rawConfig) {
  const scrollWindowSize = normalizeScrollWindowSize(
    rawConfig?.scroll_window_size || rawConfig?.scrollWindowSize || DEFAULT_PAGE_CONFIG.scrollWindowSize,
  )
  const pageSize = normalizePageSize(
    rawConfig?.page_size || rawConfig?.pageSize || DEFAULT_PAGE_CONFIG.pageSize,
  )

  return {
    browseMode: PAGE_BROWSE_MODE_PAGED,
    scrollWindowSize,
    pageSize,
  }
}

function writeCachedPageConfig(config) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore local cache persistence failures
  }
}

function dispatchPageConfigUpdated(config) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(PAGE_CONFIG_UPDATED_EVENT, { detail: config }))
}

export function getCachedPageConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PAGE_CONFIG }
  }

  try {
    const rawText = window.localStorage.getItem(STORAGE_KEY)
    if (!rawText) return { ...DEFAULT_PAGE_CONFIG }
    return normalizePageConfig(JSON.parse(rawText))
  } catch {
    return { ...DEFAULT_PAGE_CONFIG }
  }
}

export async function fetchPageConfig() {
  const res = await fetch(`${API_BASE}/api/system/page-config`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const config = normalizePageConfig(await res.json())
  writeCachedPageConfig(config)
  return config
}

export async function savePageConfig(nextConfig) {
  const normalized = normalizePageConfig({
    ...getCachedPageConfig(),
    ...nextConfig,
  })
  const res = await fetch(`${API_BASE}/api/system/page-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      browse_mode: normalized.browseMode,
      scroll_window_size: normalized.scrollWindowSize,
      page_size: normalized.pageSize,
    }),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.detail || `HTTP ${res.status}`)
  }

  const savedConfig = normalizePageConfig(await res.json())
  writeCachedPageConfig(savedConfig)
  dispatchPageConfigUpdated(savedConfig)
  return savedConfig
}
