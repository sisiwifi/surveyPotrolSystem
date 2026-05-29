/**
 * 矢量数据前端 API 封装。
 * 统一提供列表、导入、样式更新、删除和受鉴权保护的 GeoJSON 访问地址。
 */
import { API_BASE, buildProtectedAssetUrl } from './auth'

async function readError(response) {
  const payload = await response.json().catch(() => ({}))
  return payload.detail || `HTTP ${response.status}`
}

export async function listVectorDatasets() {
  const response = await fetch(`${API_BASE}/api/vectors/datasets`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return Array.isArray(payload?.items) ? payload.items : []
}

export async function importVectorDataset(files, title = '') {
  const formData = new FormData()
  files.forEach(fileItem => {
    formData.append('files', fileItem)
  })
  if (title) {
    formData.append('title', title)
  }

  const response = await fetch(`${API_BASE}/api/vectors/import`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const payload = await response.json()
  return payload.dataset
}

export async function updateVectorDatasetStyle(publicId, styleConfig) {
  const response = await fetch(`${API_BASE}/api/vectors/datasets/${publicId}/style`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style_config: styleConfig }),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export async function deleteVectorDataset(publicId) {
  const response = await fetch(`${API_BASE}/api/vectors/datasets/${publicId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return response.json()
}

export function buildVectorGeoJsonUrl(publicId) {
  return buildProtectedAssetUrl(`/api/vectors/datasets/${publicId}/geojson`)
}