/**
 * 栅格数据前端 API 封装。
 * 统一提供检查、导入、列表、删除与受鉴权保护的 XYZ 栅格瓦片访问地址。
 */
import { API_BASE } from './apiBase'
import { buildProtectedAssetUrl } from './auth'

async function readError(response) {
  const payload = await response.json().catch(() => ({}))
  return payload.detail || `HTTP ${response.status}`
}

export async function listRasterDatasets() {
  const response = await fetch(`${API_BASE}/api/rasters/datasets`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function inspectRasterFiles(files, maxZoom = 18) {
  const formData = new FormData()
  files.forEach(fileItem => {
    formData.append('files', fileItem)
  })
  formData.append('max_zoom', String(maxZoom))

  const response = await fetch(`${API_BASE}/api/rasters/inspect`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function inspectRasterPath(sourcePath) {
  const response = await fetch(`${API_BASE}/api/rasters/inspect-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_path: sourcePath }),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return Array.isArray(payload?.items) ? payload.items[0] || null : null
}

export async function browseRasterSources(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  const response = await fetch(`${API_BASE}/api/rasters/source-browser${query}`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export async function importRasterDataset(options) {
  const {
    file = null,
    sourceMode = 'import',
    sourcePath = '',
    title = '',
    generatePyramid = false,
    maxZoom = 18,
    transparencyMode = 'auto',
  } = options || {}

  const formData = new FormData()
  if (file) {
    formData.append('file', file, file.name)
  }
  formData.append('source_mode', sourceMode)
  if (sourcePath) {
    formData.append('source_path', sourcePath)
  }
  if (title) {
    formData.append('title', title)
  }
  formData.append('generate_pyramid', String(Boolean(generatePyramid)))
  formData.append('max_zoom', String(maxZoom))
  formData.append('transparency_mode', transparencyMode)

  const response = await fetch(`${API_BASE}/api/rasters/import`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return payload?.dataset || null
}

export async function createRasterImportTask(options) {
  const response = await fetch(`${API_BASE}/api/rasters/import-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_path: options?.sourcePath || '',
      source_mode: options?.sourceMode || 'import',
      title: options?.title || '',
      generate_pyramid: Boolean(options?.generatePyramid),
      max_zoom: Number(options?.maxZoom || 18),
      transparency_mode: options?.transparencyMode || 'auto',
    }),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export async function getRasterImportTask(taskId) {
  const response = await fetch(`${API_BASE}/api/rasters/import-tasks/${encodeURIComponent(taskId)}`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export async function deleteRasterDataset(publicId) {
  const response = await fetch(`${API_BASE}/api/rasters/datasets/${publicId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export function buildRasterTileUrl(publicId) {
  return buildProtectedAssetUrl(`/api/rasters/datasets/${publicId}/tiles/{z}/{x}/{y}.png`)
}