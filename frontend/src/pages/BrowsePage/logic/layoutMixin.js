/**
 * BrowsePage 布局、分页、滚动锚点与缩略图缓存逻辑。
 * 这一层负责控制页内可视窗口、滚动宿主、分页状态以及后台缓存任务的触发与轮询。
 */
import {
  fetchPageConfig,
  savePageConfig,
  PAGE_BROWSE_MODE_PAGED,
} from '../../../utils/pageConfig'
import {
  API_BASE,
  DEFAULT_PAGE_CONFIG,
  DEFAULT_LIST_PAGE_SIZE,
  LIST_PAGE_SIZE_OPTIONS,
  DEBOUNCE_MS,
  POLL_MS,
  FIRST_ROW_TOLERANCE_PX,
  RESTORE_ANCHOR_PADDING_PX,
  DIMENSION_CORRECTION_BATCH_MS,
} from './shared'

export default {
  methods: {
    logBrowseDebug(event, payload = {}) {
      console.debug('[BrowsePage]', { event, ...payload })
    },

    resolveScrollHost() {
      if (typeof window === 'undefined') return null
      if (this.$el && typeof this.$el.closest === 'function') {
        const host = this.$el.closest('main')
        if (host) return host
      }
      return window
    },

    attachScrollListener() {
      if (typeof window === 'undefined') return
      const nextHost = this.resolveScrollHost() || window
      if (this.scrollHostTarget === nextHost) return
      this.detachScrollListener()
      nextHost.addEventListener('scroll', this.onWindowScroll, { passive: true })
      this.scrollHostTarget = nextHost
      const nextScrollTop = this.readScrollTop(nextHost)
      this.lastObservedScrollTop = nextScrollTop
    },

    detachScrollListener() {
      if (!this.scrollHostTarget) return
      this.scrollHostTarget.removeEventListener('scroll', this.onWindowScroll)
      this.scrollHostTarget = null
    },

    readScrollTop(host = this.scrollHostTarget || this.resolveScrollHost()) {
      if (typeof window === 'undefined') return 0
      if (!host || host === window) {
        return window.scrollY || window.pageYOffset || 0
      }
      return Number(host.scrollTop) || 0
    },

    readViewportHeight(host = this.scrollHostTarget || this.resolveScrollHost()) {
      if (typeof window === 'undefined') return this.viewportHeight
      if (!host || host === window) {
        return window.innerHeight || this.viewportHeight
      }
      return host.clientHeight || this.viewportHeight || window.innerHeight || 0
    },

    readViewportBounds(host = this.scrollHostTarget || this.resolveScrollHost()) {
      if (typeof window === 'undefined') {
        return { top: 0, bottom: 0 }
      }
      if (!host || host === window || typeof host.getBoundingClientRect !== 'function') {
        return { top: 0, bottom: window.innerHeight || 0 }
      }
      const rect = host.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    },

    resolveScrollOffsetTop(element, host = this.scrollHostTarget || this.resolveScrollHost()) {
      if (!element || typeof element.getBoundingClientRect !== 'function') return 0
      const elementRect = element.getBoundingClientRect()
      if (!host || host === window || typeof host.getBoundingClientRect !== 'function') {
        return elementRect.top + this.readScrollTop(window)
      }
      const hostRect = host.getBoundingClientRect()
      return elementRect.top - hostRect.top + this.readScrollTop(host)
    },

    scrollHostTo(top, host = this.scrollHostTarget || this.resolveScrollHost()) {
      if (typeof window === 'undefined') return
      const nextTop = Math.max(0, Math.round(top))
      if (!host || host === window) {
        window.scrollTo({ top: nextTop, behavior: 'auto' })
        return
      }
      if (typeof host.scrollTo === 'function') {
        host.scrollTo({ top: nextTop, behavior: 'auto' })
      } else {
        host.scrollTop = nextTop
      }
    },

    async fetchPageConfigSetting() {
      try {
        const config = await fetchPageConfig()
        this.applyPageConfig(config, false)
      } catch {
        // keep cached or default page config when settings fetch fails
      }
    },

    onPageConfigUpdated(event) {
      this.applyPageConfig(event?.detail || {}, true)
    },

    applyPageConfig(nextConfig = {}, captureAnchor = true) {
      const numericWindowSize = Number.parseInt(
        String(nextConfig?.scrollWindowSize || DEFAULT_PAGE_CONFIG.scrollWindowSize),
        10,
      )
      const normalizedWindowSize = Number.isFinite(numericWindowSize) && numericWindowSize > 0
        ? numericWindowSize
        : DEFAULT_PAGE_CONFIG.scrollWindowSize
      const numericPageSize = Number.parseInt(
        String(nextConfig?.pageSize || DEFAULT_PAGE_CONFIG.pageSize),
        10,
      )
      const normalizedPageSize = LIST_PAGE_SIZE_OPTIONS.includes(numericPageSize)
        ? numericPageSize
        : DEFAULT_LIST_PAGE_SIZE
      const windowChanged = normalizedWindowSize !== this.pageScrollWindowSize
      const pageSizeChanged = normalizedPageSize !== this.listPageSize
      if (!windowChanged && !pageSizeChanged) return

      const anchor = captureAnchor ? this.captureViewportAnchor() : null
      this.pageScrollWindowSize = normalizedWindowSize
      this.listPageSize = normalizedPageSize
      this.normalizePaginationState()
      this.lastCacheRequestSignature = ''

      if (anchor) {
        this.pendingViewAnchor = anchor
      }

      this.$nextTick(() => {
        this.refreshObservedGrid()
      })
    },

    measureItemGridMetrics() {
      const pageMainRect = this.$refs.pageMain?.getBoundingClientRect?.()
      this.pageMainHeight = pageMainRect ? Math.round(pageMainRect.height) : 0
      if (!this.$refs.itemGrid) return

      const rect = this.$refs.itemGrid.getBoundingClientRect()
      this.containerWidth = this.$refs.itemGrid.offsetWidth
      this.itemGridViewportTop = Math.max(0, Math.round(rect.top))

      const paginationHostRect = this.$refs.paginationHost?.getBoundingClientRect?.()
      this.paginationHostHeight = paginationHostRect ? Math.round(paginationHostRect.height) : 0
    },

    normalizePaginationState() {
      this.photoPageIndex = Math.min(Math.max(0, this.photoPageIndex), Math.max(0, this.photoGridTotalPages - 1))
      this.selectionGridPageIndex = Math.min(Math.max(0, this.selectionGridPageIndex), Math.max(0, this.selectionGridTotalPages - 1))
      this.listPageIndex = Math.min(Math.max(0, this.listPageIndex), Math.max(0, this.listTotalPages - 1))
    },

    restorePagedPageByIndex(targetIndex) {
      if (this.viewMode === 'list') {
        this.listPageIndex = Math.floor(targetIndex / this.listPageSize)
      } else if (this.isSelectionGridMode) {
        this.selectionGridPageIndex = Math.floor(targetIndex / this.listPageSize)
      } else {
        this.photoPageIndex = Math.floor(targetIndex / this.listPageSize)
      }

      this.normalizePaginationState()

      this.$nextTick(() => {
        this.queueCurrentPageCache(true, 'restore-paged')
      })
    },

    clearRouteFocusHighlight() {
      if (this.routeFocusClearTimer) {
        clearTimeout(this.routeFocusClearTimer)
        this.routeFocusClearTimer = null
      }
      this.routeFocusItemKey = ''
    },

    scheduleRouteFocusHighlight(itemKey) {
      this.clearRouteFocusHighlight()
      if (!itemKey) return
      this.routeFocusItemKey = itemKey
      this.routeFocusClearTimer = window.setTimeout(() => {
        this.routeFocusClearTimer = null
        this.routeFocusItemKey = ''
      }, 2800)
    },

    isRouteFocusItem(item, index) {
      if (!this.routeFocusItemKey) return false
      return this.routeFocusItemKey === this.itemKey(item, index)
    },

    buildRouteFocusAnchor() {
      const signature = this.currentRouteFocusSignature
      if (!signature || signature === this.consumedRouteFocusSignature || !this.items.length) {
        return null
      }

      const rawFocusId = Array.isArray(this.$route.query.focus) ? this.$route.query.focus[0] : this.$route.query.focus
      const rawFocusPath = Array.isArray(this.$route.query.focusPath) ? this.$route.query.focusPath[0] : this.$route.query.focusPath
      const focusId = Number.parseInt(String(rawFocusId || ''), 10)
      const focusPath = String(rawFocusPath || '').replace(/\\/g, '/').trim()

      let targetIndex = -1
      if (Number.isInteger(focusId) && focusId > 0) {
        targetIndex = this.items.findIndex(item => Number(item?.id) === focusId)
      }
      if (targetIndex < 0 && focusPath) {
        targetIndex = this.items.findIndex(item => String(item?.media_rel_path || '').replace(/\\/g, '/').trim() === focusPath)
      }
      if (targetIndex < 0) {
        return null
      }

      const targetItem = this.items[targetIndex]
      return {
        signature,
        anchor: {
          index: targetIndex,
          itemKey: this.itemKey(targetItem, targetIndex),
          anchorOffset: 0,
        },
      }
    },

    applyRouteFocusAnchor() {
      const nextFocus = this.buildRouteFocusAnchor()
      if (!nextFocus) {
        return false
      }

      this.pendingViewAnchor = nextFocus.anchor
      this.consumedRouteFocusSignature = nextFocus.signature
      this.scheduleRouteFocusHighlight(nextFocus.anchor.itemKey)
      return true
    },

    currentPageAnchorIndex() {
      if (!this.items.length) return -1
      if (this.viewMode === 'list') return this.listPageStartIndex
      if (this.isSelectionGridMode) return this.selectionGridPageStartIndex
      return this.photoGridPageStartIndex
    },

    queueCurrentPageCache(immediate = false, reason = 'paged-refresh') {
      const anchorIndex = this.currentPageAnchorIndex()
      if (!Number.isInteger(anchorIndex) || anchorIndex < 0) return
      this.queueCachePlan(this.buildVirtualCachePlan(anchorIndex), immediate, reason)
    },

    scrollItemGridIntoView() {
      if (!this.$refs.itemGrid || typeof window === 'undefined') return
      if (typeof this.$refs.itemGrid.scrollTo === 'function') {
        this.$refs.itemGrid.scrollTo({ top: 0, behavior: 'auto' })
      } else {
        this.$refs.itemGrid.scrollTop = 0
      }
      const desiredTop = this.resolveScrollOffsetTop(this.$refs.itemGrid) - RESTORE_ANCHOR_PADDING_PX
      this.scrollHostTo(desiredTop)
    },

    onPaginationPageChange(nextPage) {
      const targetPageIndex = Math.max(0, Number(nextPage || 1) - 1)
      if (this.viewMode === 'list') {
        this.listPageIndex = targetPageIndex
      } else if (this.isSelectionGridMode) {
        this.selectionGridPageIndex = targetPageIndex
      } else {
        this.photoPageIndex = targetPageIndex
      }

      this.normalizePaginationState()
      this.$nextTick(() => {
        this.scrollItemGridIntoView()
        this.queueCurrentPageCache(true, 'pagination-change')
      })
    },

    async onPaginationPageSizeChange(nextPageSize) {
      const normalizedPageSize = LIST_PAGE_SIZE_OPTIONS.includes(nextPageSize)
        ? nextPageSize
        : DEFAULT_LIST_PAGE_SIZE
      if (normalizedPageSize === this.listPageSize) return

      const anchor = this.captureViewportAnchor()
      this.listPageSize = normalizedPageSize
      this.normalizePaginationState()
      if (anchor) {
        this.pendingViewAnchor = anchor
      }

      this.refreshObservedGrid()
      try {
        const savedConfig = await savePageConfig({
          browseMode: PAGE_BROWSE_MODE_PAGED,
          scrollWindowSize: this.pageScrollWindowSize,
          pageSize: normalizedPageSize,
        })
        this.applyPageConfig(savedConfig, false)
      } catch (err) {
        this.showMessage('error', `每页数量保存失败：${err?.message || '未知错误'}`)
      }

      window.requestAnimationFrame(() => {
        this.scrollItemGridIntoView()
      })
    },

    onImgLoad(item, evt) {
      this.clearPreviewFailureState(item)
      const { naturalWidth: width, naturalHeight: height } = evt.target
      if (!width || !height) return
      const key = item.id || item.public_id
      const existing = this.imgDimensions[key]
      if (existing && existing.w > 0 && existing.h > 0) return
      this.pendingDimensionCorrections = {
        ...this.pendingDimensionCorrections,
        [key]: { w: width, h: height },
      }
      if (this.dimensionFlushTimer) {
        clearTimeout(this.dimensionFlushTimer)
      }
      this.dimensionFlushTimer = window.setTimeout(() => {
        this.flushDimensionCorrections()
      }, DIMENSION_CORRECTION_BATCH_MS)
    },

    flushDimensionCorrections() {
      if (this.dimensionFlushTimer) {
        clearTimeout(this.dimensionFlushTimer)
        this.dimensionFlushTimer = null
      }
      const corrections = this.pendingDimensionCorrections
      const keys = Object.keys(corrections)
      if (!keys.length) return

      const nextDimensions = { ...this.imgDimensions }
      for (const key of keys) {
        const correction = corrections[key]
        if (!correction?.w || !correction?.h) continue
        const existing = nextDimensions[key]
        if (existing && existing.w > 0 && existing.h > 0) continue
        nextDimensions[key] = correction
      }

      this.pendingDimensionCorrections = {}
      this.imgDimensions = nextDimensions
      this.logBrowseDebug('layout-dimension-fallback', { count: keys.length })
    },

    onResize() {
      const anchorBeforeReflow = this.$refs.itemGrid ? this.captureViewportAnchor() : null
      this.viewportHeight = typeof window !== 'undefined' ? window.innerHeight : this.viewportHeight
      this.viewportWidth = typeof window !== 'undefined' ? window.innerWidth : this.viewportWidth
      if (this.$refs.itemGrid) {
        if (anchorBeforeReflow) {
          this.pendingViewAnchor = anchorBeforeReflow
        }
        this.refreshObservedGrid()
      }
      if (this.selectionDetailsOpen) {
        this.updateSelectionDetailsBounds()
      }
      if (this.filterMenuVisible) {
        this.updateFilterMenuAnchor()
      }
    },

    onWindowScroll() {
      const nextScrollTop = this.readScrollTop()
      if (nextScrollTop > this.lastObservedScrollTop) {
        this.lastScrollDirection = 'forward'
      } else if (nextScrollTop < this.lastObservedScrollTop) {
        this.lastScrollDirection = 'backward'
      }
      this.lastObservedScrollTop = nextScrollTop

      if (!this.selectionDetailsOpen) return
      if (this.scrollFrameId) return

      this.scrollFrameId = window.requestAnimationFrame(() => {
        this.scrollFrameId = null
        if (this.selectionDetailsOpen) {
          this.updateSelectionDetailsBounds()
        }
      })
    },

    isCacheablePreviewItem(item) {
      return Number.isInteger(item?.id) && (item?.type === 'image' || item?.type === 'album')
    },

    hasCachedThumb(item) {
      if (!item?.id) return false
      return Boolean(this.cacheUrls[item.id] || item.cache_thumb_url)
    },

    collectVisibleDomEntries() {
      if (!this.$refs.itemGrid || typeof window === 'undefined') return []
      const viewportBounds = this.readViewportBounds()
      return Array.from(this.$refs.itemGrid.querySelectorAll('[data-index]'))
        .map((element) => {
          const index = Number(element.getAttribute('data-index'))
          if (!Number.isInteger(index)) return null
          const rect = element.getBoundingClientRect()
          if (rect.bottom <= viewportBounds.top || rect.top >= viewportBounds.bottom) return null
          return {
            index,
            left: rect.left,
            top: rect.top,
          }
        })
        .filter(Boolean)
        .sort((leftEntry, rightEntry) => {
          if (Math.abs(leftEntry.top - rightEntry.top) <= FIRST_ROW_TOLERANCE_PX) {
            return leftEntry.left - rightEntry.left
          }
          return leftEntry.top - rightEntry.top
        })
    },

    captureViewportAnchor() {
      const visibleEntries = this.collectVisibleDomEntries()
      if (visibleEntries.length) {
        const entry = visibleEntries[0]
        const item = this.items[entry.index]
        if (item) {
          const hostRect = this.$refs.itemGrid?.getBoundingClientRect?.() || { left: 0 }
          return {
            index: entry.index,
            itemKey: this.itemKey(item, entry.index),
            anchorOffset: Math.max(0, Math.round(entry.left - hostRect.left)),
          }
        }
      }

      const fallbackIndex = 0
      const item = this.items[fallbackIndex]
      if (!item) return null
      return {
        index: fallbackIndex,
        itemKey: this.itemKey(item, fallbackIndex),
        anchorOffset: 0,
      }
    },

    resolveRestoreAnchorIndex(anchor) {
      if (!anchor || !this.items.length) return -1
      if (Number.isInteger(anchor.index) && anchor.index >= 0 && anchor.index < this.items.length) {
        return anchor.index
      }
      if (anchor.itemKey) {
        const matchedIndex = this.items.findIndex((item, index) => this.itemKey(item, index) === anchor.itemKey)
        if (matchedIndex >= 0) return matchedIndex
      }
      return Math.min(this.items.length - 1, Math.max(0, anchor.index || 0))
    },

    restorePendingViewAnchor() {
      const anchor = this.pendingViewAnchor
      this.pendingViewAnchor = null
      if (!anchor) {
        this.queueCurrentPageCache(true, 'refresh-paged')
        return
      }

      const targetIndex = this.resolveRestoreAnchorIndex(anchor)
      if (!Number.isInteger(targetIndex) || targetIndex < 0) return

      this.restorePagedPageByIndex(targetIndex)
    },

    resolveNearestImageIndex(anchorIndex, preferredIndices = []) {
      for (const index of preferredIndices) {
        if (!Number.isInteger(index)) continue
        const item = this.items[index]
        if (this.isCacheablePreviewItem(item)) return index
      }

      if (!Number.isInteger(anchorIndex) || anchorIndex < 0) return -1
      for (let offset = 0; offset <= this.scrollWindowRadius; offset++) {
        const forwardIndex = anchorIndex + offset
        if (this.isCacheablePreviewItem(this.items[forwardIndex])) return forwardIndex
        const backwardIndex = anchorIndex - offset
        if (offset && this.isCacheablePreviewItem(this.items[backwardIndex])) return backwardIndex
      }
      return -1
    },

    collectVirtualFirstRowIndices(anchorIndex) {
      if (this.viewMode === 'list') {
        return [anchorIndex]
      }
      const rowStart = Math.floor(anchorIndex / this.selectionColumnCount) * this.selectionColumnCount
      return Array.from({ length: this.selectionColumnCount }, (_value, offset) => rowStart + offset)
        .filter(index => index >= 0 && index < this.items.length)
    },

    buildVirtualCachePlan(anchorIndex) {
      if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= this.items.length) return null
      const item = this.items[anchorIndex]
      if (!item) return null
      const firstRowIndices = this.collectVirtualFirstRowIndices(anchorIndex)
      const cacheAnchorIndex = this.resolveNearestImageIndex(anchorIndex, firstRowIndices)
      if (cacheAnchorIndex < 0) return null
      return {
        visualAnchorIndex: anchorIndex,
        cacheAnchorIndex,
        firstRowIndices,
        anchorItemKey: this.itemKey(item, anchorIndex),
        anchorOffset: 0,
        direction: this.lastScrollDirection,
      }
    },

    buildPrioritizedCacheIds(plan) {
      if (!plan) return []
      const orderedIds = []
      const seenIds = new Set()
      const pushIndex = (index) => {
        if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return
        const item = this.items[index]
        if (!this.isCacheablePreviewItem(item) || this.hasCachedThumb(item)) return
        if (seenIds.has(item.id)) return
        seenIds.add(item.id)
        orderedIds.push(item.id)
      }

      pushIndex(plan.cacheAnchorIndex)
      for (const index of plan.firstRowIndices || []) {
        pushIndex(index)
      }
      for (let offset = 1; offset <= this.scrollWindowRadius; offset++) {
        pushIndex(plan.cacheAnchorIndex + offset)
        pushIndex(plan.cacheAnchorIndex - offset)
      }
      return orderedIds
    },

    queueCachePlan(plan, immediate = false, reason = 'unknown') {
      if (!plan) return
      const orderedImageIds = this.buildPrioritizedCacheIds(plan)
      if (!orderedImageIds.length) return

      const requestSignature = [
        this.cachePageToken,
        this.cacheSortSignature,
        plan.visualAnchorIndex,
        plan.cacheAnchorIndex,
        orderedImageIds.join(','),
      ].join('|')

      const dispatch = () => {
        if (requestSignature === this.lastCacheRequestSignature) return
        this.lastCacheRequestSignature = requestSignature
        this.lastCenter = plan.cacheAnchorIndex
        this.triggerCacheForPlan(plan, orderedImageIds, reason)
      }

      clearTimeout(this.debounceTimer)
      if (immediate) {
        dispatch()
        return
      }
      this.debounceTimer = setTimeout(dispatch, DEBOUNCE_MS)
    },

    onWindowKeydown(event) {
      if (this.tagFormVisible && event.key === 'Escape') {
        event.preventDefault()
        this.closeTagForm()
        return
      }
      if (this.filterMenuVisible && event.key === 'Escape') {
        event.preventDefault()
        this.closeFilterMenu()
        return
      }
      if (this.collectionMenuVisible && event.key === 'Escape') {
        event.preventDefault()
        this.closeCollectionMenu()
        return
      }
      if (this.tagMenuVisible && event.key === 'Escape') {
        event.preventDefault()
        this.closeTagMenu()
        return
      }
      if (this.selectionDetailsOpen && event.key === 'Escape') {
        event.preventDefault()
        this.closeSelectionDetails()
        return
      }
      if (this.coverPickerMode && event.key === 'Escape') {
        event.preventDefault()
        this.coverPickerMode = false
        return
      }
      if (!this.selectionMode) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault()
        this.selectAllOfCurrentType()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (this.selectedCount) {
          this.clearSelection()
        } else {
          this.toggleSelectionMode(false)
        }
      }
    },

    bcLabel(str) {
      if (!str) return ''
      return str.length > 20 ? str.slice(0, 20) + '…' : str
    },

    itemDateTs(item) {
      const ts = Number(item?.sort_ts)
      if (Number.isFinite(ts)) return ts
      const fallbackId = Number(item?.id)
      return Number.isFinite(fallbackId) ? fallbackId : 0
    },

    itemAlphaKey(item) {
      return (item?.name || item?.full_filename || '').toString()
    },

    sortItems(items) {
      const arr = Array.isArray(items) ? [...items] : []
      const dir = this.sortDir === 'desc' ? -1 : 1

      const compare = (a, b) => {
        if (this.sortBy === 'date') {
          const ta = this.itemDateTs(a)
          const tb = this.itemDateTs(b)
          if (ta !== tb) return (ta - tb) * dir
        } else {
          const na = this.itemAlphaKey(a)
          const nb = this.itemAlphaKey(b)
          const nc = na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true })
          if (nc !== 0) return nc * dir
        }
        const ta = this.itemDateTs(a)
        const tb = this.itemDateTs(b)
        if (ta !== tb) return (ta - tb) * dir
        const na = this.itemAlphaKey(a)
        const nb = this.itemAlphaKey(b)
        return na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true }) * dir
      }

      const albums = arr.filter(it => it?.type === 'album').sort(compare)
      const images = arr.filter(it => it?.type !== 'album').sort(compare)
      return [...albums, ...images]
    },

    refreshSortResult() {
      this.applySourceItems(this.sortItems(this.sourceItems))
      if (this.loading) return
      this.clearSelection()
      this.refreshObservedGrid()
      if (this.selectionInfoMode === 'tags') {
        this.ensureTagLabelsLoaded()
      }
    },

    onSortModeSelect(mode) {
      if (this.sortBy === mode) return
      this.sortBy = mode
      this.sortDir = 'asc'
      this.refreshSortResult()
    },

    toggleSortDir() {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
      this.refreshSortResult()
    },

    switchViewMode(mode) {
      if (!['grid', 'list'].includes(mode)) return
      const modeChanged = this.viewMode !== mode
      const wasSelecting = this.selectionMode
      const anchor = (modeChanged || wasSelecting) ? this.captureViewportAnchor() : null
      this.closeSelectAllMenu()

      this.viewMode = mode

      if (wasSelecting) {
        this.selectionMode = false
        this.clearSelection()
        this.clearPointerGesture()
        this.suppressNextGridClick = false
        this.suppressNextListClick = false
      }

      if (anchor) {
        this.pendingViewAnchor = anchor
      }

      if (wasSelecting || !modeChanged) {
        this.refreshObservedGrid()
      }
    },

    toggleSelectionMode(forceValue = null) {
      const nextValue = typeof forceValue === 'boolean' ? forceValue : !this.selectionMode
      if (nextValue === this.selectionMode) return
      const anchor = this.captureViewportAnchor()
      this.closeSelectAllMenu()

      if (nextValue) {
        this.viewModeBeforeSelection = this.viewMode
        this.selectionMode = true
        this.viewMode = 'grid'
      } else {
        this.selectionMode = false
        this.viewMode = this.viewModeBeforeSelection || 'grid'
        this.clearSelection()
        this.clearPointerGesture()
        this.suppressNextGridClick = false
        this.suppressNextListClick = false
      }

      if (anchor) {
        this.pendingViewAnchor = anchor
      }

      if (this.selectionInfoMode === 'tags') {
        this.ensureTagLabelsLoaded()
      }
      this.refreshObservedGrid()
    },

    enterGridSelectionMode() {
      this.viewModeBeforeSelection = 'grid'
      this.selectionMode = true
      this.viewMode = 'grid'
    },

    async triggerCacheForPlan(plan, orderedImageIds, reason = 'cache-anchor') {
      if (!plan || !orderedImageIds.length) return
      const anchorItem = this.items[plan.cacheAnchorIndex]
      if (!anchorItem?.id) return

      const generation = ++this.cacheRequestGeneration
      const body = {
        ordered_image_ids: orderedImageIds,
        generation,
        page_token: this.cachePageToken,
        sort_signature: this.cacheSortSignature,
        direction: plan.direction || 'none',
        anchor_image_id: anchorItem.id,
        anchor_item_key: plan.anchorItemKey,
        anchor_offset: plan.anchorOffset || 0,
      }

      this.logBrowseDebug('cache-request', {
        reason,
        generation,
        visualAnchorIndex: plan.visualAnchorIndex,
        cacheAnchorIndex: plan.cacheAnchorIndex,
        orderedCount: orderedImageIds.length,
        firstRowIndices: plan.firstRowIndices,
      })

      try {
        const res = await fetch(`${API_BASE}/api/thumbnails/cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) return
        const data = await res.json()
        if (generation !== this.cacheRequestGeneration) return
        this.taskId = data.task_id
        this.cacheStatusCursor = 0
        this.startPoll(generation)
      } catch {
        // ignore thumbnail trigger failures
      }
    },

    startPoll(expectedGeneration = this.cacheRequestGeneration) {
      this.stopPoll(false)
      const poll = async () => {
        if (!this.taskId || expectedGeneration !== this.cacheRequestGeneration) return
        try {
          const res = await fetch(`${API_BASE}/api/thumbnails/cache/status/${this.taskId}?cursor=${this.cacheStatusCursor}`)
          if (!res.ok) return
          const data = await res.json()
          if (expectedGeneration !== this.cacheRequestGeneration) return
          const newUrls = {}
          for (const item of (data.items || [])) {
            if (item.id && item.cache_thumb_url) newUrls[item.id] = item.cache_thumb_url
          }
          if (Object.keys(newUrls).length > 0) {
            this.cacheUrls = { ...this.cacheUrls, ...newUrls }
          }
          if (Number.isInteger(data.next_cursor)) {
            this.cacheStatusCursor = data.next_cursor
          } else {
            this.cacheStatusCursor += (data.items || []).length
          }
          if (data.status === 'running') {
            this.pollTimer = setTimeout(poll, POLL_MS)
          }
        } catch {
          // ignore polling failures
        }
      }
      this.pollTimer = setTimeout(poll, POLL_MS)
    },

    stopPoll(resetTask = true) {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer)
        this.pollTimer = null
      }
      if (resetTask) {
        this.taskId = null
      }
      this.cacheStatusCursor = 0
    },

    refreshObservedGrid() {
      this.$nextTick(() => {
        this.clearCachePlanDebounce()
        this.teardownResizeObserver()
        if (!this.$refs.itemGrid) return
        this.measureItemGridMetrics()
        this.normalizePaginationState()
        this.setupResizeObserver()
        if (this.pendingViewAnchor) {
          this.restorePendingViewAnchor()
        } else {
          this.queueCurrentPageCache(true, 'refresh-paged')
        }
      })
    },

    clearCachePlanDebounce() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
      }
    },

    setupResizeObserver() {
      if (!this.$refs.itemGrid) return
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }
      this.resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (this.$refs.itemGrid) {
            const anchor = this.captureViewportAnchor()
            if (anchor) {
              this.pendingViewAnchor = anchor
            }
            this.refreshObservedGrid()
          }
        })
      })
      this.resizeObserver.observe(this.$refs.itemGrid)
    },

    teardownResizeObserver() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
        this.resizeObserver = null
      }
    },
  },
}
