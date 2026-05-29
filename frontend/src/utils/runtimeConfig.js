import { API_BASE } from './apiBase'

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  configPath: '',
  backendHost: '127.0.0.1',
  backendPort: 8000,
  embeddedPostgresEnabled: true,
  postgresDriver: 'postgresql+psycopg',
  postgresHost: '127.0.0.1',
  postgresPort: 5432,
  postgresUser: 'postgres',
  postgresPassword: 'postgres123',
  postgresDbName: 'survey_potrol_system',
  postgresAdminDbName: 'postgres',
  postgresRuntimeDir: 'runtime/postgresql',
  postgresBinDir: 'runtime/postgresql/bin',
  postgresClusterDir: 'data/postgresql/cluster',
  postgresLogFile: 'data/postgresql/log/postgresql.log',
  resolvedPostgresRuntimeDir: '',
  resolvedPostgresBinDir: '',
  resolvedPostgresClusterDir: '',
  resolvedPostgresLogFile: '',
  restartRequired: true,
})

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizePort(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(normalized)) return fallback
  return Math.max(1, Math.min(65535, normalized))
}

export function normalizeRuntimeConfig(rawConfig) {
  return {
    configPath: normalizeText(rawConfig?.config_path || rawConfig?.configPath, DEFAULT_RUNTIME_CONFIG.configPath),
    backendHost: normalizeText(rawConfig?.backend_host || rawConfig?.backendHost, DEFAULT_RUNTIME_CONFIG.backendHost),
    backendPort: normalizePort(rawConfig?.backend_port ?? rawConfig?.backendPort, DEFAULT_RUNTIME_CONFIG.backendPort),
    embeddedPostgresEnabled: Boolean(rawConfig?.embedded_postgres_enabled ?? rawConfig?.embeddedPostgresEnabled ?? DEFAULT_RUNTIME_CONFIG.embeddedPostgresEnabled),
    postgresDriver: normalizeText(rawConfig?.postgres_driver || rawConfig?.postgresDriver, DEFAULT_RUNTIME_CONFIG.postgresDriver),
    postgresHost: normalizeText(rawConfig?.postgres_host || rawConfig?.postgresHost, DEFAULT_RUNTIME_CONFIG.postgresHost),
    postgresPort: normalizePort(rawConfig?.postgres_port ?? rawConfig?.postgresPort, DEFAULT_RUNTIME_CONFIG.postgresPort),
    postgresUser: normalizeText(rawConfig?.postgres_user || rawConfig?.postgresUser, DEFAULT_RUNTIME_CONFIG.postgresUser),
    postgresPassword: normalizeText(rawConfig?.postgres_password || rawConfig?.postgresPassword, DEFAULT_RUNTIME_CONFIG.postgresPassword),
    postgresDbName: normalizeText(rawConfig?.postgres_db_name || rawConfig?.postgresDbName, DEFAULT_RUNTIME_CONFIG.postgresDbName),
    postgresAdminDbName: normalizeText(rawConfig?.postgres_admin_db_name || rawConfig?.postgresAdminDbName, DEFAULT_RUNTIME_CONFIG.postgresAdminDbName),
    postgresRuntimeDir: normalizeText(rawConfig?.postgres_runtime_dir || rawConfig?.postgresRuntimeDir, DEFAULT_RUNTIME_CONFIG.postgresRuntimeDir),
    postgresBinDir: normalizeText(rawConfig?.postgres_bin_dir || rawConfig?.postgresBinDir, DEFAULT_RUNTIME_CONFIG.postgresBinDir),
    postgresClusterDir: normalizeText(rawConfig?.postgres_cluster_dir || rawConfig?.postgresClusterDir, DEFAULT_RUNTIME_CONFIG.postgresClusterDir),
    postgresLogFile: normalizeText(rawConfig?.postgres_log_file || rawConfig?.postgresLogFile, DEFAULT_RUNTIME_CONFIG.postgresLogFile),
    resolvedPostgresRuntimeDir: normalizeText(rawConfig?.resolved_postgres_runtime_dir || rawConfig?.resolvedPostgresRuntimeDir, DEFAULT_RUNTIME_CONFIG.resolvedPostgresRuntimeDir),
    resolvedPostgresBinDir: normalizeText(rawConfig?.resolved_postgres_bin_dir || rawConfig?.resolvedPostgresBinDir, DEFAULT_RUNTIME_CONFIG.resolvedPostgresBinDir),
    resolvedPostgresClusterDir: normalizeText(rawConfig?.resolved_postgres_cluster_dir || rawConfig?.resolvedPostgresClusterDir, DEFAULT_RUNTIME_CONFIG.resolvedPostgresClusterDir),
    resolvedPostgresLogFile: normalizeText(rawConfig?.resolved_postgres_log_file || rawConfig?.resolvedPostgresLogFile, DEFAULT_RUNTIME_CONFIG.resolvedPostgresLogFile),
    restartRequired: Boolean(rawConfig?.restart_required ?? rawConfig?.restartRequired ?? DEFAULT_RUNTIME_CONFIG.restartRequired),
  }
}

export async function fetchRuntimeConfig() {
  const response = await fetch(`${API_BASE}/api/system/runtime-config`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `HTTP ${response.status}`)
  }
  return normalizeRuntimeConfig(await response.json())
}

export async function saveRuntimeConfig(nextConfig) {
  const normalized = normalizeRuntimeConfig(nextConfig)
  const response = await fetch(`${API_BASE}/api/system/runtime-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backend_host: normalized.backendHost,
      backend_port: normalized.backendPort,
      embedded_postgres_enabled: normalized.embeddedPostgresEnabled,
      postgres_host: normalized.postgresHost,
      postgres_port: normalized.postgresPort,
      postgres_user: normalized.postgresUser,
      postgres_password: normalized.postgresPassword,
      postgres_db_name: normalized.postgresDbName,
      postgres_admin_db_name: normalized.postgresAdminDbName,
      postgres_runtime_dir: normalized.postgresRuntimeDir,
      postgres_bin_dir: normalized.postgresBinDir,
      postgres_cluster_dir: normalized.postgresClusterDir,
      postgres_log_file: normalized.postgresLogFile,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `HTTP ${response.status}`)
  }

  return normalizeRuntimeConfig(await response.json())
}