export const DEFAULT_API_BASE = 'http://127.0.0.1:8000'

export function normalizeApiBase(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return DEFAULT_API_BASE
  return normalized.replace(/\/+$/, '')
}

export const API_BASE = normalizeApiBase(process.env.VUE_APP_API_BASE)