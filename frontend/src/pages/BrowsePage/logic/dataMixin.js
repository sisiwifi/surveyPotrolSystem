/**
 * BrowsePage 数据加载、筛选、预览恢复与元数据编辑逻辑。
 * 这里负责把契约返回的数据整理成可渲染状态，并统一管理筛选、缩略图恢复和图片元数据回写。
 */
import { normalizeAnimatedFields, resolveAnimatedBadgeLabel } from '../../../utils/animatedMedia'
import {
  API_BASE,
  buildProtectedAssetUrl,
  createBrowseFilterState,
  normalizeBrowseFilterState,
  hasBrowseFilterValue,
  extractItemFileExtension,
  normalizeFileNameForFilter,
  parseFilterDateTime,
  parseFilterSizeMb,
} from './shared'

export default {
  methods: {
    resetBrowseFilterState() {
      this.appliedBrowseFilter = createBrowseFilterState()
      this.closeFilterMenu()
    },

    applySourceItems(nextSourceItems) {
      const normalizedSourceItems = Array.isArray(nextSourceItems) ? [...nextSourceItems] : []
      const nextItems = this.buildFilteredItems(normalizedSourceItems, this.appliedBrowseFilter)
      this.sourceItems = normalizedSourceItems
      this.items = nextItems
      this.normalizePaginationState()
      this.lastCacheRequestSignature = ''
      return nextItems
    },

    buildFilteredItems(sourceItems, rawFilter = this.appliedBrowseFilter) {
      const filterState = normalizeBrowseFilterState(rawFilter)
      if (!hasBrowseFilterValue(filterState)) {
        return Array.isArray(sourceItems) ? [...sourceItems] : []
      }

      const selectedCategoryIds = new Set(filterState.categoryIds)
      const selectedFileTypes = new Set(filterState.fileTypes)
      const selectedTagIds = new Set(filterState.tagIds)
      return (Array.isArray(sourceItems) ? sourceItems : []).filter((item) => {
        if (item?.type === 'album') {
          return true
        }
        return this.itemMatchesBrowseFilter(item, filterState, selectedCategoryIds, selectedFileTypes, selectedTagIds)
      })
    },

    itemMatchesBrowseFilter(item, filterState, selectedCategoryIds = new Set(), selectedFileTypes = new Set(), selectedTagIds = new Set()) {
      if (item?.type !== 'image') return true

      if (selectedCategoryIds.size) {
        const categoryId = Number(item?.category_id)
        if (!Number.isInteger(categoryId) || !selectedCategoryIds.has(categoryId)) {
          return false
        }
      }

      if (filterState.filenameQuery) {
        const candidateName = normalizeFileNameForFilter(item)
        const expectedName = filterState.filenameQuery.toLowerCase()
        if (filterState.filenameMode === 'exact') {
          if (candidateName !== expectedName) return false
        } else if (!candidateName.includes(expectedName)) {
          return false
        }
      }

      if (selectedFileTypes.size) {
        const extension = extractItemFileExtension(item)
        if (!extension || !selectedFileTypes.has(extension)) {
          return false
        }
      }

      if (!this.itemMatchesDateTimeFilter(
        item?.imported_at,
        filterState.importedStartDate,
        filterState.importedStartTime,
        filterState.importedEndDate,
        filterState.importedEndTime,
      )) {
        return false
      }

      if (!this.itemMatchesDateTimeFilter(
        item?.file_created_at,
        filterState.createdStartDate,
        filterState.createdStartTime,
        filterState.createdEndDate,
        filterState.createdEndTime,
      )) {
        return false
      }

      if (!this.itemMatchesSizeFilter(item, filterState.sizeMinMb, filterState.sizeMaxMb)) {
        return false
      }

      if (selectedTagIds.size || filterState.includeUntagged) {
        const itemTagIds = Array.isArray(item?.tags)
          ? item.tags.filter(tagId => Number.isInteger(tagId) && tagId > 0)
          : []
        const matchesSelectedTag = itemTagIds.some(tagId => selectedTagIds.has(tagId))
        const matchesUntagged = filterState.includeUntagged && !itemTagIds.length
        if (!matchesSelectedTag && !matchesUntagged) {
          return false
        }
      }

      return true
    },

    itemMatchesDateTimeFilter(value, startDate, startTime, endDate, endTime) {
      const startTs = parseFilterDateTime(startDate, startTime, 'start')
      const endTs = parseFilterDateTime(endDate, endTime, 'end')
      if (startTs == null && endTs == null) return true

      const itemDate = new Date(value)
      const itemTs = itemDate.getTime()
      if (!Number.isFinite(itemTs)) return false
      if (startTs != null && itemTs < startTs) return false
      if (endTs != null && itemTs > endTs) return false
      return true
    },

    itemMatchesSizeFilter(item, minMb, maxMb) {
      const minBytes = parseFilterSizeMb(minMb)
      const maxBytes = parseFilterSizeMb(maxMb)
      if (minBytes == null && maxBytes == null) return true

      const fileSize = Number(item?.file_size)
      if (!Number.isFinite(fileSize) || fileSize < 0) return false
      if (minBytes != null && fileSize < minBytes) return false
      if (maxBytes != null && fileSize > maxBytes) return false
      return true
    },

    updateFilterMenuAnchor() {
      const button = this.$refs.filterMenuButton
      if (!button || typeof button.getBoundingClientRect !== 'function') {
        this.filterMenuAnchorRect = null
        return
      }

      const rect = button.getBoundingClientRect()
      this.filterMenuAnchorRect = {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    },

    async openFilterMenu() {
      if (this.filterMenuVisible) return
      this.closeCollectionMenu()
      this.closeTagMenu()
      this.closeSelectionDetails()
      this.closeSelectAllMenu()
      this.coverPickerMode = false
      await Promise.all([
        this.ensureTagLabelsLoaded(true, this.sourceItems),
        this.ensureCategoryLabelsLoaded(true),
      ])
      this.filterMenuVisible = true
      this.$nextTick(() => {
        this.updateFilterMenuAnchor()
        this.lockPageScroll()
      })
    },

    closeFilterMenu() {
      this.filterMenuVisible = false
      this.filterMenuAnchorRect = null
      if (!this.selectionDetailsOpen) {
        this.unlockPageScroll()
      }
    },

    toggleFilterMenu() {
      if (this.filterMenuVisible) {
        this.closeFilterMenu()
        return
      }
      this.openFilterMenu()
    },

    applyBrowseFilter(nextFilter) {
      this.appliedBrowseFilter = normalizeBrowseFilterState(nextFilter)
      this.closeFilterMenu()
      this.closeCollectionMenu()
      this.closeTagMenu()
      this.closeSelectionDetails()
      this.closeSelectAllMenu()
      this.clearSelection()
      this.photoPageIndex = 0
      this.selectionGridPageIndex = 0
      this.listPageIndex = 0
      this.applySourceItems(this.sourceItems)
      this.pendingViewAnchor = null
      if (!this.loading) {
        this.scrollHostTo(0)
        this.refreshObservedGrid()
      }
    },

    async loadData(options = {}) {
      const preserveSelection = Boolean(options?.preserveSelection)
      const preserveView = Object.prototype.hasOwnProperty.call(options || {}, 'preserveView')
        ? Boolean(options.preserveView)
        : preserveSelection
      const selectionSnapshot = preserveSelection ? this.captureSelectionSnapshot() : null

      this.loading = true
      this.messageText = ''
      const defaultSort = this.pageContract.defaultSort(this)
      this.sortBy = defaultSort.sortBy
      this.sortDir = defaultSort.sortDir
      this.cacheUrls = {}
      this.imgDimensions = {}
      this.lastCenter = -1
      this.lastScrollDirection = 'none'
      this.lastObservedScrollTop = this.readScrollTop()
      this.cacheRequestGeneration = 0
      this.cacheStatusCursor = 0
      this.lastCacheRequestSignature = ''
      this.previewFailureTokens = {}
      this.cardOriginalFailureTokens = {}
      this.detailOriginalFailureTokens = {}
      this.missingPreviewRepairTokens = {}
      this.originalFallbackReadyTokens = {}
      this.previewRepairQueue = []
      this.previewRepairInFlight = false
      this.lastPreviewRepairSignature = ''
      this.albumInfo = null
      this.coverPickerMode = false
      this.pendingViewAnchor = null
      this.pendingDimensionCorrections = {}
      if (this.dimensionFlushTimer) {
        clearTimeout(this.dimensionFlushTimer)
        this.dimensionFlushTimer = null
      }
      if (this.previewRepairTimer) {
        clearTimeout(this.previewRepairTimer)
        this.previewRepairTimer = null
      }
      if (preserveSelection) {
        this.closeSelectAllMenu()
      } else {
        this.closeSelectionDetails()
        this.closeSelectAllMenu()
        this.clearSelection()
      }
      this.clearPointerGesture()
      this.tagFetchSerial += 1
      this.tagsLoading = false
      if (!preserveView) {
        this.photoPageIndex = 0
        this.selectionGridPageIndex = 0
        this.listPageIndex = 0
      }
      this.viewportHeight = typeof window !== 'undefined' ? window.innerHeight : this.viewportHeight
      this.clearCachePlanDebounce()
      this.teardownResizeObserver()
      this.stopPoll()

      if (!this.selectionMode) {
        this.viewMode = 'grid'
      }

      try {
        const payload = await this.pageContract.loadItems(this)
        this.albumInfo = payload?.album || null
        this.applyFetchedItems(payload?.items || [])
      } catch (err) {
        this.applySourceItems([])
        this.albumInfo = null
        const loadErrorText = this.pageContract.getLoadErrorText?.(this, err)
        if (loadErrorText) {
          this.showMessage('error', loadErrorText)
        }
      } finally {
        this.loading = false
      }

      if (preserveSelection) {
        this.restoreSelectionSnapshot(selectionSnapshot)
      }
      const consumedRouteFocus = this.applyRouteFocusAnchor()
      if (!preserveView && !consumedRouteFocus) {
        this.scrollHostTo(0)
      }
      this.refreshObservedGrid()
      this.pageContract.afterLoad(this)
    },

    async fetchDateGroup() {
      const res = await fetch(`${API_BASE}/api/dates/${this.dateGroup}/items`)
      if (!res.ok) {
        this.applySourceItems([])
        return
      }
      const data = await res.json()
      this.applyFetchedItems(data.items)
    },

    async fetchAlbum() {
      const res = await fetch(`${API_BASE}/api/albums/by-path/${encodeURI(this.fullAlbumPath)}`)
      if (!res.ok) {
        this.applySourceItems([])
        return
      }
      const data = await res.json()
      this.albumInfo = data.album || null
      this.applyFetchedItems(data.items)
    },

    applyFetchedItems(rawItems) {
      const normalizedItems = this.pageContract.normalizeItems(rawItems || [], this)
      const nextSourceItems = this.sortItems(normalizedItems || [])
      const nextCacheUrls = {}
      const nextDimensions = {}

      for (const item of nextSourceItems) {
        if (item.id && item.cache_thumb_url) {
          nextCacheUrls[item.id] = item.cache_thumb_url
        }

        const key = item.layout_key || item.id || item.public_id
        const width = Number(item?.width)
        const height = Number(item?.height)
        if (key && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          nextDimensions[key] = { w: width, h: height }
        }
      }

      this.cacheUrls = nextCacheUrls
      this.imgDimensions = nextDimensions
      this.applySourceItems(nextSourceItems)
    },

    getAncestorTitle(segIndex, fallback) {
      const ancestors = this.albumInfo?.ancestors || []
      if (segIndex < ancestors.length) return ancestors[segIndex].title
      return fallback
    },

    previewStateKey(item) {
      if (!item) return ''
      if (item.stable_key) return String(item.stable_key)
      if (Number.isInteger(item?.id)) return `${item?.type || 'item'}:${item.id}`
      if (item?.public_id) return `${item?.type || 'item'}:${item.public_id}`
      if (item?.album_path) return `${item?.type || 'item'}:${item.album_path}`
      if (item?.media_rel_path) return `${item?.type || 'item'}:${item.media_rel_path}`
      return ''
    },

    primaryPreviewPath(item) {
      if (!item) return ''
      if (item.id) {
        const cached = this.cacheUrls[item.id]
        if (cached) return cached
      }
      if (item.cache_thumb_url) return item.cache_thumb_url
      if (item.thumb_url) return item.thumb_url
      return ''
    },

    missingPreviewRepairStateKey(item) {
      return this.previewStateKey(item) || ''
    },

    missingPreviewRepairToken(item) {
      return `${item?.cache_thumb_url || ''}|${item?.thumb_url || ''}`
    },

    originalFallbackReadyToken(item) {
      const previewPath = this.primaryPreviewPath(item)
      if (previewPath) return `primary:${previewPath}`
      return `missing:${this.missingPreviewRepairToken(item)}`
    },

    isOriginalFallbackReady(item) {
      const key = this.previewStateKey(item)
      const token = this.originalFallbackReadyToken(item)
      if (!key || !token) return false
      return this.originalFallbackReadyTokens[key] === token
    },

    isCardOriginalPreviewSuppressed(item) {
      const key = this.previewStateKey(item)
      const token = this.originalPreviewPath(item)
      if (!key || !token) return false
      return this.cardOriginalFailureTokens[key] === token
    },

    shouldUseOriginalPreviewFallback(item) {
      if (!this.pageContract?.allowOriginalPreviewFallback) return false
      if (item?.type !== 'image') return false
      if (!this.isOriginalFallbackReady(item)) return false

      const originalPath = this.originalPreviewPath(item)
      if (!originalPath || this.isCardOriginalPreviewSuppressed(item)) return false
      return true
    },

    hasTerminalPreviewState(item) {
      if (!this.pageContract?.allowOriginalPreviewFallback) return false
      if (item?.type !== 'image') return false
      if (this.resolvedUrl(item)) return false
      if (!this.isOriginalFallbackReady(item)) return false

      const originalPath = this.originalPreviewPath(item)
      if (!originalPath) return true
      return this.isCardOriginalPreviewSuppressed(item)
    },

    shouldShowPreviewSkeleton(item) {
      return !this.resolvedUrl(item) && !this.hasTerminalPreviewState(item)
    },

    enqueueMissingPreviewRepairs(items) {
      if (!this.pageContract?.autoRepairMissingPreview || !Array.isArray(items) || !items.length) return

      let didQueue = false
      const nextTokens = { ...this.missingPreviewRepairTokens }
      const nextQueue = [...this.previewRepairQueue]

      for (const item of items) {
        if (item?.type !== 'image') continue
        if (!Number.isInteger(item?.id) || item.id <= 0) continue
        if (this.primaryPreviewPath(item)) continue

        const stateKey = this.missingPreviewRepairStateKey(item)
        const token = this.missingPreviewRepairToken(item)
        if (!stateKey || nextTokens[stateKey] === token) continue

        nextTokens[stateKey] = token
        if (!nextQueue.includes(item.id)) {
          nextQueue.push(item.id)
          didQueue = true
        }
      }

      if (!didQueue) return
      this.missingPreviewRepairTokens = nextTokens
      this.previewRepairQueue = nextQueue
      if (this.previewRepairTimer) {
        clearTimeout(this.previewRepairTimer)
      }
      this.previewRepairTimer = setTimeout(() => {
        this.previewRepairTimer = null
        this.flushPreviewRepairQueue()
      }, 90)
    },

    originalPreviewPath(item) {
      if (item?.preview_original_url) return item.preview_original_url
      if (!item || item.type !== 'image' || !item.media_rel_path) return ''
      return `/media/${String(item.media_rel_path).replace(/\\/g, '/')}`
    },

    isPrimaryPreviewSuppressed(item) {
      const key = this.previewStateKey(item)
      const token = this.primaryPreviewPath(item)
      if (!key || !token) return false
      return this.previewFailureTokens[key] === token
    },

    clearPreviewFailureState(item, includeDetail = true) {
      const key = this.previewStateKey(item)
      if (!key) return

      if (Object.prototype.hasOwnProperty.call(this.previewFailureTokens, key)) {
        const nextFailures = { ...this.previewFailureTokens }
        delete nextFailures[key]
        this.previewFailureTokens = nextFailures
      }

      if (!includeDetail) return
      if (Object.prototype.hasOwnProperty.call(this.detailOriginalFailureTokens, key)) {
        const nextDetailFailures = { ...this.detailOriginalFailureTokens }
        delete nextDetailFailures[key]
        this.detailOriginalFailureTokens = nextDetailFailures
      }
    },

    markPrimaryPreviewFailure(item) {
      const key = this.previewStateKey(item)
      const token = this.primaryPreviewPath(item)
      if (!key || !token) return false
      if (this.previewFailureTokens[key] === token) return false
      this.previewFailureTokens = {
        ...this.previewFailureTokens,
        [key]: token,
      }
      return true
    },

    markDetailOriginalFailure(item) {
      const key = this.previewStateKey(item)
      const token = this.originalPreviewPath(item)
      if (!key || !token) return false
      if (this.detailOriginalFailureTokens[key] === token) return false
      this.detailOriginalFailureTokens = {
        ...this.detailOriginalFailureTokens,
        [key]: token,
      }
      return true
    },

    markCardOriginalFailure(item) {
      const key = this.previewStateKey(item)
      const token = this.originalPreviewPath(item)
      if (!key || !token) return false
      if (this.cardOriginalFailureTokens[key] === token) return false
      this.cardOriginalFailureTokens = {
        ...this.cardOriginalFailureTokens,
        [key]: token,
      }
      return true
    },

    resolvedUrl(item) {
      const previewPath = this.primaryPreviewPath(item)
      if (this.shouldUseOriginalPreviewFallback(item)) {
        return buildProtectedAssetUrl(this.originalPreviewPath(item))
      }
      if (!previewPath || this.isPrimaryPreviewSuppressed(item)) return ''
      return buildProtectedAssetUrl(previewPath)
    },

    detailAspectRatio(item) {
      const width = Number(item?.width)
      const height = Number(item?.height)
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return '4 / 3'
      }
      return `${width} / ${height}`
    },

    itemHasDetailMetadata(item) {
      if (!item || item.type !== 'image') return true
      return ['file_size', 'imported_at', 'file_created_at'].every(field => (
        Object.prototype.hasOwnProperty.call(item, field)
      ))
    },

    async fetchSelectionDetailMetadata() {
      if (this.pageContract.shouldHydrateSelectionDetailMetadata?.(this) === false) return
      const imageIds = this.selectedEntries
        .map(({ item }) => item)
        .filter(item => item?.type === 'image' && Number.isInteger(item?.id) && !this.itemHasDetailMetadata(item))
        .map(item => item.id)

      if (!imageIds.length) return

      const requestSerial = ++this.selectionDetailFetchSerial

      try {
        const res = await fetch(`${API_BASE}/api/images/meta?ids=${imageIds.join(',')}`)
        if (!res.ok) return

        const data = await res.json()
        if (requestSerial !== this.selectionDetailFetchSerial) return

        const metaMap = new Map(
          (data.items || []).map(meta => [meta.id, meta])
        )
        if (!metaMap.size) return

        const nextItems = this.sourceItems.map(item => {
          if (item?.type !== 'image' || !Number.isInteger(item?.id)) return item
          const meta = metaMap.get(item.id)
          if (!meta) return item
          return {
            ...item,
            ...meta,
            tags: Array.isArray(meta.tags) ? meta.tags : (item.tags || []),
            name: meta.name || item.name,
          }
        })
        this.applySourceItems(nextItems)
        this.ensureCategoryLabelsLoaded()
      } catch {
        // ignore metadata hydration failures and keep current values visible
      }
    },

    async ensureCategoryLabelsLoaded(force = false) {
      if (!force && Object.keys(this.categoryDisplayMap).length) return
      try {
        const res = await fetch(`${API_BASE}/api/categories`)
        if (!res.ok) return
        const data = await res.json()
        const nextMap = {}
        for (const category of (data.items || [])) {
          if (!Number.isInteger(category?.id)) continue
          nextMap[category.id] = category.display_name || category.name || `#${category.id}`
        }
        this.categoryDisplayMap = nextMap
      } catch {
        // ignore category label load failures in overlay
      }
    },

    selectedImageMetadataTargets() {
      const seen = new Set()
      return this.selectedEntries
        .map(({ item }) => item)
        .filter(item => item?.type === 'image' && Number.isInteger(item?.id))
        .map(item => ({
          image_id: item.id,
          media_rel_path: item.media_rel_path || null,
        }))
        .filter((target) => {
          const key = `${target.image_id}:${target.media_rel_path || ''}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
    },

    openMetadataEditErrorDialog(message, title = '修改失败') {
      this.openConfirmDialog({
        title,
        message: message || '修改失败，请稍后重试。',
        confirmLabel: '知道了',
        tone: 'danger',
        showCancel: false,
      })
    },

    buildSortTimestamp(value) {
      if (!value) return null
      const parsed = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(parsed.getTime())) return null
      return Math.floor(parsed.getTime() / 1000)
    },

    deriveImageSortTimestamp(item, nextFileCreatedAt = undefined) {
      const createdCandidate = nextFileCreatedAt !== undefined ? nextFileCreatedAt : item?.file_created_at
      return this.buildSortTimestamp(createdCandidate)
        ?? this.buildSortTimestamp(item?.imported_at)
        ?? this.buildSortTimestamp(item?.created_at)
        ?? (Number.isFinite(Number(item?.sort_ts)) ? Number(item.sort_ts) : null)
    },

    matchesCurrentBrowseContextMediaPath(mediaRelPath) {
      const normalizedPath = String(mediaRelPath || '').replace(/\\/g, '/')
      if (!normalizedPath) return false

      if (this.isAlbumMode) {
        return normalizedPath.startsWith(`media/${this.fullAlbumPath}/`)
      }

      const prefix = `media/${this.dateGroup}/`
      if (!normalizedPath.startsWith(prefix)) return false
      const remaining = normalizedPath.slice(prefix.length)
      return remaining.length > 0 && !remaining.includes('/')
    },

    applySelectionImageMetadataResponse(responseItems, payload = {}) {
      const updates = Array.isArray(responseItems) ? responseItems : []
      if (!updates.length) return

      const selectionSnapshot = this.captureSelectionSnapshot()
      const updatesBySourcePath = new Map()
      const updatesByImageId = new Map()
      let shouldRefreshCategoryLabels = false

      for (const update of updates) {
        const sourcePath = String(update?.source_media_rel_path || '').trim()
        if (sourcePath) {
          updatesBySourcePath.set(sourcePath, update)
        }

        const imageId = Number(update?.image_id)
        if (Number.isInteger(imageId) && imageId > 0) {
          updatesByImageId.set(imageId, update)
        }

        const categoryId = Number(update?.category_id)
        if (
          Number.isInteger(categoryId)
          && categoryId > 0
          && !Object.prototype.hasOwnProperty.call(this.categoryDisplayMap, categoryId)
        ) {
          shouldRefreshCategoryLabels = true
        }
      }

      const shouldReorder = typeof payload?.name === 'string'
        || Object.prototype.hasOwnProperty.call(payload, 'file_created_at')
        || updates.some(update => Boolean(update?.moved))

      let changed = false
      let nextItems = []
      for (const item of this.sourceItems) {
        if (item?.type !== 'image' || !Number.isInteger(item?.id)) {
          nextItems.push(item)
          continue
        }

        const currentPath = String(item.media_rel_path || '').trim()
        const update = (currentPath && updatesBySourcePath.get(currentPath)) || updatesByImageId.get(item.id)
        if (!update) {
          nextItems.push(item)
          continue
        }

        changed = true
        const hasCreatedAt = Object.prototype.hasOwnProperty.call(update, 'file_created_at')
        const nextFileCreatedAt = hasCreatedAt ? (update.file_created_at || null) : item.file_created_at
        const nextCategoryId = Number(update?.category_id)
        const nextItem = {
          ...item,
          name: update?.name || item.name,
          media_rel_path: update?.media_rel_path || item.media_rel_path,
          category_id: Number.isInteger(nextCategoryId) && nextCategoryId > 0 ? nextCategoryId : item.category_id,
          file_created_at: nextFileCreatedAt,
        }

        const nextSortTs = this.deriveImageSortTimestamp(nextItem, nextFileCreatedAt)
        if (nextSortTs != null) {
          nextItem.sort_ts = nextSortTs
        }

        if (!this.matchesCurrentBrowseContextMediaPath(nextItem.media_rel_path)) {
          continue
        }

        nextItems.push(nextItem)
      }

      if (!changed) return

      if (shouldReorder) {
        nextItems = this.sortItems(nextItems)
      }

      this.applySourceItems(nextItems)
      this.restoreSelectionSnapshot(selectionSnapshot)
      this.refreshObservedGrid()

      if (shouldRefreshCategoryLabels) {
        this.ensureCategoryLabelsLoaded(true)
      }
    },

    async applySelectionImageMetadata(payload) {
      if (this.metadataEditBusy) return

      const targets = this.selectedImageMetadataTargets()
      if (!targets.length) return

      this.metadataEditBusy = true
      try {
        const res = await fetch(`${API_BASE}/api/images/metadata`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: targets,
            ...payload,
          }),
        })

        const data = await res.json().catch(() => null)
        if (!res.ok) {
          this.openMetadataEditErrorDialog(
            data?.detail || `请求未成功完成，服务器返回 HTTP ${res.status}。`
          )
          return
        }

        this.applySelectionImageMetadataResponse(data?.items, payload)
      } catch (err) {
        this.openMetadataEditErrorDialog(err?.message || '修改失败，请稍后重试。')
      } finally {
        this.metadataEditBusy = false
      }
    },

    async submitSelectionNameEdit(name) {
      const normalizedName = String(name || '').trim()
      if (!normalizedName) return
      await this.applySelectionImageMetadata({ name: normalizedName })
    },

    async submitSelectionCategoryEdit(categoryId) {
      const normalizedCategoryId = Number(categoryId)
      if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) return
      await this.applySelectionImageMetadata({ category_id: normalizedCategoryId })
    },

    async submitSelectionCreatedEdit(localDateTime) {
      const normalizedValue = String(localDateTime || '').trim()
      if (!normalizedValue) return
      await this.applySelectionImageMetadata({ file_created_at: normalizedValue })
    },

    buildDetailField(values, options = {}) {
      const emptyText = Object.prototype.hasOwnProperty.call(options, 'emptyText')
        ? options.emptyText
        : '—'
      const normalized = Array.isArray(values)
        ? values.map(value => (value == null ? '' : String(value).trim()))
        : []

      if (!normalized.length) {
        return {
          text: emptyText,
          isVarious: false,
          isEmpty: !emptyText,
        }
      }

      const first = normalized[0]
      const allSame = normalized.every(value => value === first)
      if (!allSame) {
        return {
          text: 'various',
          isVarious: true,
          isEmpty: false,
        }
      }

      const isEmpty = first.length === 0
      return {
        text: isEmpty ? emptyText : first,
        isVarious: false,
        isEmpty,
      }
    },

    formatDateTime(value) {
      if (!value) return ''
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return ''

      const pad = segment => String(segment).padStart(2, '0')
      return [
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      ].join(' ')
    },

    formatFileSizeMb(bytesValue) {
      const bytes = Number(bytesValue)
      if (!Number.isFinite(bytes) || bytes < 0) return ''
      const megaBytes = bytes / (1024 * 1024)
      if (!Number.isFinite(megaBytes)) return ''
      const formatted = megaBytes >= 100
        ? megaBytes.toFixed(1)
        : megaBytes.toFixed(2)
      return formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
    },

    detailSizeText(item) {
      if (!item) return ''

      if (item.type === 'album') {
        const photoCount = Number(item?.photo_count)
        if (Number.isFinite(photoCount) && photoCount >= 0) {
          return `${photoCount} 张`
        }

        const fallbackCount = Number(item?.count)
        if (Number.isFinite(fallbackCount) && fallbackCount >= 0) {
          return `${fallbackCount} 张`
        }
        return ''
      }

      if (item.type !== 'image') return ''

      const width = Number(item?.width)
      const height = Number(item?.height)
      const parts = []
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        parts.push(`${width} × ${height} px`)
      }

      const fileSizeMb = this.formatFileSizeMb(item?.file_size)
      if (fileSizeMb) {
        parts.push(`${fileSizeMb} MB`)
      }

      return parts.join(' · ')
    },

    detailImportedText(item) {
      if (!item || item.type !== 'image') return ''
      return this.formatDateTime(item.imported_at)
    },

    detailCreatedText(item) {
      if (!item) return ''
      if (item.type === 'album') {
        return this.formatDateTime(item.created_at)
      }
      if (item.type !== 'image') return ''
      return this.formatDateTime(item.file_created_at)
    },

    onPageBack() {
      this.pageContract.back(this)
    },

    runConfiguredHandler(handlerName) {
      if (!handlerName || typeof this[handlerName] !== 'function') return
      this[handlerName]()
    },

    async refreshPreviewMetadata(imageIds) {
      if (!Array.isArray(imageIds) || !imageIds.length) return
      try {
        const res = await fetch(`${API_BASE}/api/images/meta?ids=${imageIds.join(',')}`)
        if (!res.ok) return

        const data = await res.json()
        const metaMap = new Map((data.items || []).map(meta => [meta.id, meta]))
        if (!metaMap.size) return

        const nextCacheUrls = { ...this.cacheUrls }
        const nextDimensions = { ...this.imgDimensions }
        const nextMissingTokens = { ...this.missingPreviewRepairTokens }
        const nextOriginalFallbackReadyTokens = { ...this.originalFallbackReadyTokens }
        const nextCardOriginalFailureTokens = { ...this.cardOriginalFailureTokens }
        const nextItems = this.sourceItems.map((item) => {
          if (!Number.isInteger(item?.id)) return item
          const meta = metaMap.get(item.id)
          if (!meta) return item

          if (meta.cache_thumb_url) {
            nextCacheUrls[item.id] = meta.cache_thumb_url
          } else {
            delete nextCacheUrls[item.id]
          }

          const width = Number(meta.width)
          const height = Number(meta.height)
          if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
            nextDimensions[item.id] = { w: width, h: height }
          }

          return {
            ...item,
            cache_thumb_url: meta.cache_thumb_url || '',
            thumb_url: meta.thumb_url || item.thumb_url,
            width: Number.isFinite(width) && width > 0 ? width : item.width,
            height: Number.isFinite(height) && height > 0 ? height : item.height,
            ...normalizeAnimatedFields({
              ...item,
              is_animated: Boolean(meta.is_animated),
              animation_meta: meta.animation_meta ?? item.animation_meta ?? null,
            }),
            animated_badge_label: resolveAnimatedBadgeLabel({
              is_animated: Boolean(meta.is_animated),
              animation_meta: meta.animation_meta ?? item.animation_meta ?? null,
            }),
          }
        })

        this.cacheUrls = nextCacheUrls
        this.imgDimensions = nextDimensions
        this.applySourceItems(nextItems)
        imageIds.forEach((imageId) => {
          const matched = nextItems.find(item => item?.id === imageId)
          if (matched) {
            const stateKey = this.previewStateKey(matched)
            const currentPreviewToken = this.primaryPreviewPath(matched)
            const fallbackReadyToken = this.originalFallbackReadyToken(matched)
            const token = this.missingPreviewRepairToken(matched)
            if (stateKey && nextMissingTokens[stateKey] !== token) {
              delete nextMissingTokens[stateKey]
            }
            if (stateKey) {
              if (!currentPreviewToken) {
                nextOriginalFallbackReadyTokens[stateKey] = fallbackReadyToken
              } else if (this.previewFailureTokens[stateKey] === currentPreviewToken) {
                nextOriginalFallbackReadyTokens[stateKey] = fallbackReadyToken
              } else {
                delete nextOriginalFallbackReadyTokens[stateKey]
                delete nextCardOriginalFailureTokens[stateKey]
              }
            }
            this.clearPreviewFailureState(matched)
          }
        })
        this.missingPreviewRepairTokens = nextMissingTokens
        this.originalFallbackReadyTokens = nextOriginalFallbackReadyTokens
        this.cardOriginalFailureTokens = nextCardOriginalFailureTokens
      } catch {
        // ignore preview metadata refresh failures
      }
    },
  },
}
