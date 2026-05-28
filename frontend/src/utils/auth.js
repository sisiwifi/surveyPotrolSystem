import { reactive } from 'vue'

const API_BASE = 'http://127.0.0.1:8000'
const STORAGE_KEY = 'survey-potrol-auth-v1'
const fetchHost = typeof window !== 'undefined'
  ? window
  : (typeof self !== 'undefined' ? self : null)
const nativeFetch = fetchHost && typeof fetchHost.fetch === 'function'
  ? fetchHost.fetch.bind(fetchHost)
  : null

let fetchInterceptorInstalled = false

export const authState = reactive({
  token: '',
  user: null,
  ready: false,
})

function persistAuthState() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    token: authState.token,
    user: authState.user,
  }))
}

function clearPersistedAuthState() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

function isProtectedBackendUrl(url) {
  const text = String(url || '')
  return text.startsWith(API_BASE)
    || text.startsWith('/api')
    || text.startsWith('/media')
    || text.startsWith('/cache')
    || text.startsWith('/thumbnails')
    || text.startsWith('/trash-media')
}

export function restoreAuthState() {
  if (authState.ready) return
  authState.ready = true
  if (typeof window === 'undefined') return

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)
    authState.token = String(parsed?.token || '')
    authState.user = parsed?.user && typeof parsed.user === 'object' ? parsed.user : null
  } catch {
    clearPersistedAuthState()
  }
}

export function setAuthSession(token, user) {
  authState.token = String(token || '')
  authState.user = user && typeof user === 'object' ? user : null
  authState.ready = true
  persistAuthState()
}

export function clearAuthSession() {
  authState.token = ''
  authState.user = null
  authState.ready = true
  clearPersistedAuthState()
}

export function isAuthenticated() {
  restoreAuthState()
  return Boolean(authState.token && authState.user?.username)
}

export function isAdmin() {
  restoreAuthState()
  return authState.user?.role === 'admin'
}

export async function login(username, password) {
  if (!nativeFetch) {
    throw new Error('当前环境不支持 fetch')
  }

  const response = await nativeFetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `HTTP ${response.status}`)
  }

  const payload = await response.json()
  setAuthSession(payload.access_token, payload.user)
  return payload
}

export function logout(options = {}) {
  const redirectToLogin = options.redirectToLogin !== false
  clearAuthSession()
  if (redirectToLogin && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

export function buildProtectedAssetUrl(path) {
  if (!path) return ''
  restoreAuthState()

  const normalized = /^https?:\/\//i.test(String(path || ''))
    ? String(path)
    : `${API_BASE}${String(path).startsWith('/') ? '' : '/'}${String(path)}`

  if (!authState.token) return normalized

  const url = new URL(normalized)
  url.searchParams.set('access_token', authState.token)
  return url.toString()
}

export function installAuthFetchInterceptor() {
  if (fetchInterceptorInstalled || !nativeFetch) return
  fetchInterceptorInstalled = true

  fetchHost.fetch = async (input, init = {}) => {
    restoreAuthState()

    const requestUrl = typeof input === 'string' ? input : input?.url || ''
    const nextInit = { ...init }

    if (isProtectedBackendUrl(requestUrl) && authState.token && !requestUrl.includes('/api/auth/login')) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined) || {})
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${authState.token}`)
      }
      nextInit.headers = headers
    }

    const response = await nativeFetch(input, nextInit)
    if (response.status === 401 && isProtectedBackendUrl(requestUrl) && !requestUrl.includes('/api/auth/login')) {
      logout()
    }
    return response
  }
}