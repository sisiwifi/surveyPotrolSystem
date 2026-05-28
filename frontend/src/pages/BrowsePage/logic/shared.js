/**
 * BrowsePage 共享常量、筛选辅助方法与初始状态工厂。
 * 页面壳和各逻辑 mixin 都从这里拿统一状态定义，避免在 index.vue 中继续堆积细碎初始化代码。
 */
import { buildProtectedAssetUrl } from '../../../utils/auth'
import {
  DEFAULT_PAGE_CONFIG,
  PAGE_SIZE_OPTIONS,
  getCachedPageConfig,
} from '../../../utils/pageConfig'

export { DEFAULT_PAGE_CONFIG }
export { buildProtectedAssetUrl }

export const API_BASE = 'http://127.0.0.1:8000'
export const POLL_MS = 180
export const DEBOUNCE_MS = 300
export const LONG_PRESS_MS = 220
export const TAG_BATCH_SIZE = 120
export const SELECTION_LANDSCAPE_COLS = 5
export const SELECTION_PORTRAIT_COLS = 3
export const SELECTION_LANDSCAPE_GAP = 16
export const SELECTION_PORTRAIT_GAP = 12
export const FIRST_ROW_TOLERANCE_PX = 12
export const RESTORE_ANCHOR_PADDING_PX = 12
export const DIMENSION_CORRECTION_BATCH_MS = 60
export const PAGED_GRID_BOTTOM_RESERVE_PX = 12
export const PAGED_LIST_BOTTOM_RESERVE_PX = 12
export const PAGE_SECTION_GAP_PX = 10
export const DEFAULT_LIST_PAGE_SIZE = DEFAULT_PAGE_CONFIG.pageSize
export const LIST_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS

export function createDialogState() {
  return {
    visible: false,
    title: '请确认操作',
    message: '',
    confirmLabel: '确认',
    cancelLabel: '取消',
    tone: 'danger',
    showCancel: true,
    busy: false,
    busyLabel: '处理中…',
    onConfirm: null,
  }
}

export function createBrowseFilterState() {
  return {
    filenameMode: 'contains',
    filenameQuery: '',
    categoryIds: [],
    fileTypes: [],
    tagIds: [],
    includeUntagged: false,
    importedStartDate: '',
    importedStartTime: '',
    importedEndDate: '',
    importedEndTime: '',
    createdStartDate: '',
    createdStartTime: '',
    createdEndDate: '',
    createdEndTime: '',
    sizeMinMb: '',
    sizeMaxMb: '',
  }
}

export function normalizeFilterStringArray(values) {
  const normalized = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || '').trim().toLowerCase()
    if (!text || seen.has(text)) continue
    seen.add(text)
    normalized.push(text)
  }
  return normalized.sort((left, right) => left.localeCompare(right))
}

export function normalizeFilterIntArray(values) {
  const normalized = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue
    seen.add(parsed)
    normalized.push(parsed)
  }
  return normalized.sort((left, right) => left - right)
}

export function normalizeBrowseFilterState(rawFilter) {
  const nextFilter = createBrowseFilterState()
  const source = rawFilter && typeof rawFilter === 'object' ? rawFilter : {}

  nextFilter.filenameMode = source.filenameMode === 'exact' ? 'exact' : 'contains'
  nextFilter.filenameQuery = String(source.filenameQuery || '').trim()
  nextFilter.categoryIds = normalizeFilterIntArray(source.categoryIds)
  nextFilter.fileTypes = normalizeFilterStringArray(source.fileTypes)
  nextFilter.tagIds = normalizeFilterIntArray(source.tagIds)
  nextFilter.includeUntagged = Boolean(source.includeUntagged)

  for (const field of [
    'importedStartDate',
    'importedStartTime',
    'importedEndDate',
    'importedEndTime',
    'createdStartDate',
    'createdStartTime',
    'createdEndDate',
    'createdEndTime',
    'sizeMinMb',
    'sizeMaxMb',
  ]) {
    nextFilter[field] = String(source[field] || '').trim()
  }

  return nextFilter
}

export function hasBrowseFilterValue(rawFilter) {
  const filter = normalizeBrowseFilterState(rawFilter)
  return Boolean(
    filter.filenameQuery
    || filter.categoryIds.length
    || filter.fileTypes.length
    || filter.tagIds.length
    || filter.includeUntagged
    || filter.importedStartDate
    || filter.importedStartTime
    || filter.importedEndDate
    || filter.importedEndTime
    || filter.createdStartDate
    || filter.createdStartTime
    || filter.createdEndDate
    || filter.createdEndTime
    || filter.sizeMinMb
    || filter.sizeMaxMb
  )
}

export function extractItemFileExtension(item) {
  const source = [item?.name, item?.full_filename, item?.media_rel_path].find(value => String(value || '').trim()) || ''
  const basename = String(source).split(/[\\/]/).pop() || ''
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= basename.length - 1) {
    return ''
  }
  return basename.slice(dotIndex + 1).toLowerCase()
}

export function normalizeFileNameForFilter(item) {
  return String(item?.name || item?.full_filename || '').trim().toLowerCase()
}

export function parseFilterDateTime(datePart, timePart, role = 'start') {
  const normalizedDate = String(datePart || '').trim()
  const normalizedTime = String(timePart || '').trim()
  if (!normalizedDate) return null
  let timeText = normalizedTime
  if (!timeText) {
    timeText = role === 'end' ? '23:59:59' : '00:00:00'
  } else if (timeText.length === 5) {
    timeText = `${timeText}:00`
  }
  const parsed = new Date(`${normalizedDate}T${timeText}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

export function parseFilterSizeMb(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed * 1024 * 1024
}

export function createBrowsePageData() {
  const cachedPageConfig = getCachedPageConfig()
  return {
    items: [],
    sourceItems: [],
    loading: true,
    cacheUrls: {},
    previewFailureTokens: {},
    cardOriginalFailureTokens: {},
    detailOriginalFailureTokens: {},
    missingPreviewRepairTokens: {},
    originalFallbackReadyTokens: {},
    previewRepairQueue: [],
    previewRepairTimer: null,
    previewRepairInFlight: false,
    pollTimer: null,
    taskId: null,
    debounceTimer: null,
    resizeObserver: null,
    lastCenter: -1,
    lastScrollDirection: 'none',
    lastObservedScrollTop: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0,
    cacheRequestGeneration: 0,
    cacheStatusCursor: 0,
    lastCacheRequestSignature: '',
    imgDimensions: {},
    pendingViewAnchor: null,
    consumedRouteFocusSignature: '',
    routeFocusItemKey: '',
    routeFocusClearTimer: null,
    pendingDimensionCorrections: {},
    dimensionFlushTimer: null,
    containerWidth: 0,
    itemGridViewportTop: 0,
    paginationHostHeight: 0,
    viewMode: 'grid',
    pageScrollWindowSize: cachedPageConfig.scrollWindowSize || DEFAULT_PAGE_CONFIG.scrollWindowSize,
    sortBy: 'alpha',
    sortDir: 'asc',
    albumInfo: null,
    filterMenuVisible: false,
    filterMenuAnchorRect: null,
    appliedBrowseFilter: createBrowseFilterState(),
    coverPickerMode: false,
    photoPageIndex: 0,
    selectionGridPageIndex: 0,
    listPageIndex: 0,
    listPageSize: cachedPageConfig.pageSize || DEFAULT_PAGE_CONFIG.pageSize,
    selectionMode: false,
    viewModeBeforeSelection: 'grid',
    selectionInfoMode: 'name',
    selectedMap: {},
    selectionTypeLock: null,
    selectionAnchorIndex: null,
    pointerSelection: null,
    longPressTimer: null,
    suppressNextGridClick: false,
    suppressNextListClick: false,
    tagLookupMap: {},
    categoryDisplayMap: {},
    tagsLoading: false,
    tagFetchSerial: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    pageMainHeight: 0,
    scrollFrameId: null,
    scrollHostTarget: null,
    selectionDetailsOpen: false,
    selectionDetailsBounds: {
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
    },
    selectionDetailsHostWidth: 0,
    selectionDetailsHostHeight: 0,
    scrollLockState: null,
    selectionDetailFetchSerial: 0,
    collectionMenuVisible: false,
    collectionMenuBusy: false,
    collectionMenuSearchBusy: false,
    collectionMenuError: '',
    collectionMenuQuery: '',
    collectionMenuSuggestions: [],
    collectionMenuSelectedCollection: null,
    collectionMenuActionByImageId: {},
    collectionMenuSearchTimer: null,
    tagMenuVisible: false,
    tagMenuBusy: false,
    tagMenuSearchBusy: false,
    tagMenuError: '',
    tagMenuQuery: '',
    tagMenuSuggestions: [],
    tagMenuRecentTags: [],
    tagMenuExistingTags: [],
    tagMenuDraftByImageId: {},
    tagMenuOriginalByImageId: {},
    tagMenuDirty: false,
    tagMenuSearchTimer: null,
    tagFormVisible: false,
    tagFormMode: 'create',
    tagFormSaving: false,
    tagFormError: '',
    tagFormTag: null,
    tagFormExistingNames: [],
    selectAllMenuOpen: false,
    metadataEditBusy: false,
    actionBusy: false,
    actionBusyTitle: '',
    actionBusyText: '',
    messageText: '',
    messageType: 'success',
    lastPreviewRepairSignature: '',
    reconcileInFlight: false,
    confirmDialog: createDialogState(),
  }
}
