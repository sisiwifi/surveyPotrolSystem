/**
 * BrowsePage 选择态、详情面板、封面选择与预览修复逻辑。
 * 统一管理手势选择、详情面板开关、预览错误回退与交互桥接，避免页面壳承担状态机职责。
 */
import {
  API_BASE,
  LONG_PRESS_MS,
} from './shared'

export default {
  methods: {
    selectionSnapshotToken(item) {
      if (!item) return null

      if (item.type === 'album') {
        const key = item.public_id || item.album_path || item.id
        if (!key) return null
        return {
          type: 'album',
          key: String(key),
        }
      }

      if (item.type === 'image') {
        const imageId = Number(item?.id)
        return {
          type: 'image',
          id: Number.isInteger(imageId) && imageId > 0 ? imageId : null,
          mediaRelPath: item?.media_rel_path ? String(item.media_rel_path) : '',
          name: item?.name ? String(item.name) : '',
        }
      }

      return null
    },

    matchesSelectionSnapshotItem(item, target) {
      if (!item || !target || item.type !== target.type) return false

      if (target.type === 'album') {
        const key = item.public_id || item.album_path || item.id
        return Boolean(target.key) && String(key || '') === String(target.key)
      }

      const imageId = Number(item?.id)
      if (Number.isInteger(target.id) && target.id > 0 && Number.isInteger(imageId) && imageId > 0) {
        return imageId === target.id
      }
      if (target.mediaRelPath) {
        return String(item?.media_rel_path || '') === target.mediaRelPath
      }
      if (target.name) {
        return String(item?.name || '') === target.name
      }
      return false
    },

    findSelectionSnapshotIndex(target) {
      if (!target) return -1
      return this.items.findIndex(item => this.matchesSelectionSnapshotItem(item, target))
    },

    captureSelectionSnapshot() {
      const selectedItems = this.selectedEntries
        .map(({ item }) => this.selectionSnapshotToken(item))
        .filter(Boolean)
      const anchorItem = Number.isInteger(this.selectionAnchorIndex)
        ? this.selectionSnapshotToken(this.items[this.selectionAnchorIndex])
        : null

      return {
        selectedItems,
        anchorItem,
        selectionTypeLock: this.selectionTypeLock,
        detailsOpen: this.selectionDetailsOpen,
      }
    },

    restoreSelectionSnapshot(snapshot) {
      if (!snapshot) return

      const nextSelectedMap = {}
      let firstMatchedIndex = null
      for (const target of (snapshot.selectedItems || [])) {
        const matchedIndex = this.findSelectionSnapshotIndex(target)
        if (matchedIndex < 0) continue
        nextSelectedMap[this.itemKey(this.items[matchedIndex], matchedIndex)] = true
        if (firstMatchedIndex === null) {
          firstMatchedIndex = matchedIndex
        }
      }

      const matchedKeys = Object.keys(nextSelectedMap)
      this.selectedMap = nextSelectedMap
      if (!matchedKeys.length) {
        this.selectionTypeLock = null
        this.selectionAnchorIndex = null
        this.closeSelectionDetails()
        return
      }

      const anchorIndex = this.findSelectionSnapshotIndex(snapshot.anchorItem)
      this.selectionTypeLock = snapshot.selectionTypeLock || this.items[firstMatchedIndex]?.type || null
      this.selectionAnchorIndex = anchorIndex >= 0 ? anchorIndex : firstMatchedIndex

      if (snapshot.detailsOpen) {
        if (this.selectionDetailsOpen) {
          this.$nextTick(() => {
            this.updateSelectionDetailsBounds()
          })
          this.fetchSelectionDetailMetadata()
        } else {
          this.openSelectionDetails()
        }
      } else if (this.selectionDetailsOpen) {
        this.closeSelectionDetails()
      }
    },

    openImageTarget(item) {
      if (!item?.id) return
      const pathSuffix = item.media_rel_path ? `?path=${encodeURIComponent(item.media_rel_path)}` : ''
      fetch(`${API_BASE}/api/images/${item.id}/open${pathSuffix}`).catch(() => {})
    },

    openItem(item) {
      if (this.coverPickerMode) {
        if (this.canPickContainerCoverItem(item)) {
          void this.pickContainerCover(item)
        }
        return
      }
      if (this.selectionMode) return
      this.pageContract.openItem(this, item)
    },

    canPickContainerCoverItem(item) {
      return this.coverPickerMode && item?.type === 'image' && Number.isInteger(item?.id)
    },

    applyContainerCoverLocally(coverPhotoId) {
      const normalizedCoverId = Number(coverPhotoId)
      const nextCoverId = Number.isInteger(normalizedCoverId) && normalizedCoverId > 0
        ? normalizedCoverId
        : null
      const nextItems = this.sourceItems.map(item => {
        if (item?.type !== 'image') return item
        return {
          ...item,
          is_cover: Boolean(nextCoverId && item.id === nextCoverId),
        }
      })

      if (this.albumInfo) {
        this.albumInfo = {
          ...this.albumInfo,
          cover_photo_id: nextCoverId,
        }
      }

      this.applySourceItems(nextItems)
    },

    toggleCoverPicker() {
      if (!this.canPickContainerCover) return

      const nextValue = !this.coverPickerMode
      if (nextValue) {
        this.closeSelectionDetails()
        this.closeCollectionMenu()
        this.closeTagMenu()
        this.closeSelectAllMenu()
        this.showMessage('success', '点击图片将其设为封面。')
      }

      this.coverPickerMode = nextValue
    },

    async pickContainerCover(item) {
      if (!this.canPickContainerCoverItem(item) || this.actionBusy || typeof this.pageContract.updateCover !== 'function') {
        return
      }

      this.actionBusy = true
      this.actionBusyTitle = '设置封面中'
      this.actionBusyText = '正在更新当前页面封面，请稍候…'

      try {
        const payload = await this.pageContract.updateCover(this, item)
        this.applyContainerCoverLocally(payload?.cover_photo_id ?? item.id)
        this.coverPickerMode = false
        this.showMessage('success', '封面已更新。')
      } catch (err) {
        this.showMessage('error', err?.message || '设置封面失败')
      } finally {
        this.actionBusy = false
        this.actionBusyTitle = ''
        this.actionBusyText = ''
      }
    },

    openPrimaryFromDetails() {
      const target = this.selectedEntries[0]?.item
      if (!target) return
      this.pageContract.openPrimary(this, target)
    },

    onSelectionDetailSecondaryAction() {
      this.pageContract.runSecondaryAction(this)
    },

    openBrowseTagFromSelectionDetails(tag) {
      const tagId = Number(tag?.id)
      if (!Number.isInteger(tagId) || tagId <= 0) return

      this.closeSelectionDetails()
      if (this.$route?.name === 'browse-tag' && Number(this.$route?.params?.tagId) === tagId) {
        return
      }

      this.$router.push({
        name: 'browse-tag',
        params: { tagId },
      })
    },

    openSelectionDetailsFromIsland() {
      if (!this.selectedCount) return
      this.openSelectionDetails()
    },

    openSelectionDetails() {
      if (!this.selectedCount) return
      this.updateSelectionDetailsBounds()
      this.selectionDetailsOpen = true
      this.lockPageScroll()
      this.$nextTick(() => {
        this.updateSelectionDetailsBounds()
      })
      this.ensureTagLabelsLoaded(true)
      this.ensureCategoryLabelsLoaded(true)
      this.fetchSelectionDetailMetadata()
    },

    closeSelectionDetails() {
      this.selectionDetailsOpen = false
      this.unlockPageScroll()
    },

    updateSelectionDetailsBounds() {
      if (typeof window === 'undefined') return
      const host = (this.$el && typeof this.$el.closest === 'function')
        ? (this.$el.closest('main') || this.$el)
        : this.$el
      if (!host || typeof host.getBoundingClientRect !== 'function') return

      const rect = host.getBoundingClientRect()
      const visibleTop = Math.max(0, Math.round(rect.top))
      const visibleBottom = Math.max(0, Math.round(window.innerHeight - rect.bottom))
      const visibleLeft = Math.max(0, Math.round(rect.left))
      const visibleRight = Math.max(0, Math.round(window.innerWidth - rect.right))

      const visibleWidth = Math.max(0, window.innerWidth - visibleLeft - visibleRight)
      const visibleHeight = Math.max(0, window.innerHeight - visibleTop - visibleBottom)

      this.selectionDetailsHostWidth = visibleWidth
      this.selectionDetailsHostHeight = visibleHeight
      this.selectionDetailsBounds = {
        top: `${visibleTop}px`,
        right: `${visibleRight}px`,
        bottom: `${visibleBottom}px`,
        left: `${visibleLeft}px`,
      }
    },

    lockPageScroll() {
      if (typeof window === 'undefined' || this.scrollLockState) return

      const root = document.documentElement
      const body = document.body
      const scrollY = window.scrollY || window.pageYOffset || 0
      const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth)

      this.scrollLockState = {
        scrollY,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyLeft: body.style.left,
        bodyRight: body.style.right,
        bodyWidth: body.style.width,
        bodyPaddingRight: body.style.paddingRight,
        rootOverflow: root.style.overflow,
        rootOverscrollBehavior: root.style.overscrollBehavior,
      }

      root.style.overflow = 'hidden'
      root.style.overscrollBehavior = 'none'
      body.style.overflow = 'hidden'
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`
      }
    },

    unlockPageScroll() {
      if (typeof window === 'undefined' || !this.scrollLockState) return

      const root = document.documentElement
      const body = document.body
      const state = this.scrollLockState

      root.style.overflow = state.rootOverflow
      root.style.overscrollBehavior = state.rootOverscrollBehavior
      body.style.overflow = state.bodyOverflow
      body.style.position = state.bodyPosition
      body.style.top = state.bodyTop
      body.style.left = state.bodyLeft
      body.style.right = state.bodyRight
      body.style.width = state.bodyWidth
      body.style.paddingRight = state.bodyPaddingRight

      this.scrollLockState = null
      window.scrollTo({ top: state.scrollY, behavior: 'instant' })
    },

    detailNameText(item) {
      return item?.name || item?.full_filename || '未命名'
    },

    detailCategoryText(item) {
      if (item?.type !== 'image') return ''
      const categoryId = Number(item?.category_id)
      if (!Number.isInteger(categoryId) || categoryId <= 0) return ''
      return this.categoryDisplayMap[categoryId] || ''
    },

    detailPreviewUrl(item) {
      const previewPath = this.primaryPreviewPath(item)
      if (!previewPath) return ''
      if (!this.isPrimaryPreviewSuppressed(item)) {
        return `${API_BASE}${previewPath}`
      }

      const key = this.previewStateKey(item)
      const originalPath = this.originalPreviewPath(item)
      if (key && originalPath && this.detailOriginalFailureTokens[key] !== originalPath) {
        return `${API_BASE}${originalPath}`
      }
      return ''
    },

    onMediaCardPreviewError(item) {
      this.onPrimaryPreviewError(item)
    },

    onPrimaryPreviewError(item) {
      if (!item) return
      if (this.shouldUseOriginalPreviewFallback(item)) {
        this.markCardOriginalFailure(item)
        return
      }
      const didChange = this.markPrimaryPreviewFailure(item)
      if (!didChange && !Number.isInteger(item?.id)) return
      this.enqueuePreviewRepair(item)
    },

    onSelectionDetailPreviewError(preview) {
      const matchedEntry = this.selectedEntries.find(entry => this.itemKey(entry.item, entry.index) === preview?.key)
      const item = matchedEntry?.item
      if (!item) return

      const originalPath = this.originalPreviewPath(item)
      if (originalPath && preview?.previewUrl === `${API_BASE}${originalPath}`) {
        this.markDetailOriginalFailure(item)
        return
      }

      const didChange = this.markPrimaryPreviewFailure(item)
      if (!didChange && !Number.isInteger(item?.id)) return
      this.enqueuePreviewRepair(item)
    },

    enqueuePreviewRepair(item) {
      if (!Number.isInteger(item?.id)) return
      if (this.previewRepairQueue.includes(item.id)) return
      this.previewRepairQueue = [...this.previewRepairQueue, item.id]
      if (this.previewRepairTimer) {
        clearTimeout(this.previewRepairTimer)
      }
      this.previewRepairTimer = setTimeout(() => {
        this.previewRepairTimer = null
        this.flushPreviewRepairQueue()
      }, 90)
    },

    async flushPreviewRepairQueue() {
      const repairIds = [...new Set(this.previewRepairQueue.filter(id => Number.isInteger(id) && id > 0))]
      this.previewRepairQueue = []
      if (!repairIds.length) return

      if (this.previewRepairInFlight) {
        this.previewRepairQueue = [...new Set([...this.previewRepairQueue, ...repairIds])]
        return
      }

      this.previewRepairInFlight = true
      try {
        const repairPayloadKey = this.pageContract.previewRepairPayloadKey || 'image_ids'
        const res = await fetch(`${API_BASE}/api/admin/refresh?mode=quick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repair_cache: true,
            [repairPayloadKey]: repairIds,
          }),
        })
        if (!res.ok) return
        await res.json().catch(() => null)
        await this.pageContract.afterPreviewRepair(this, repairIds)
      } catch {
        // ignore targeted preview repair failures
      } finally {
        this.previewRepairInFlight = false
        if (this.previewRepairQueue.length) {
          this.flushPreviewRepairQueue()
        }
      }
    },

    itemKey(item, index) {
      if (item?.stable_key) {
        return String(item.stable_key)
      }
      if (item?.type === 'album') {
        return `album:${item.public_id || item.album_path || item.id || index}`
      }
      return `image:${item?.media_rel_path || item?.id || item?.name || index}`
    },

    isItemSelected(item, index) {
      return Boolean(this.selectedMap[this.itemKey(item, index)])
    },

    isItemDisabled(item) {
      return Boolean(this.selectionTypeLock && item?.type !== this.selectionTypeLock)
    },

    clearSelection() {
      this.selectedMap = {}
      this.selectionTypeLock = null
      this.selectionAnchorIndex = null
      this.closeSelectionDetails()
      this.closeSelectAllMenu()
    },

    selectOnlyIndex(index) {
      const item = this.items[index]
      if (!item) return
      this.selectionTypeLock = item.type
      this.selectedMap = { [this.itemKey(item, index)]: true }
      this.selectionAnchorIndex = index
    },

    addIndexToSelection(index, useAsAnchor = false) {
      const item = this.items[index]
      if (!item) return
      if (this.selectionTypeLock && this.selectionTypeLock !== item.type) return
      const key = this.itemKey(item, index)
      if (this.selectedMap[key]) {
        if (useAsAnchor) this.selectionAnchorIndex = index
        return
      }
      this.selectionTypeLock = item.type
      this.selectedMap = { ...this.selectedMap, [key]: true }
      if (useAsAnchor || this.selectionAnchorIndex === null) {
        this.selectionAnchorIndex = index
      }
    },

    removeIndexFromSelection(index) {
      const key = this.itemKey(this.items[index], index)
      if (!this.selectedMap[key]) return
      const next = { ...this.selectedMap }
      delete next[key]
      this.selectedMap = next
      if (!Object.keys(next).length) {
        this.selectionTypeLock = null
        this.selectionAnchorIndex = null
      }
    },

    onItemSelectionButtonClick(item, index) {
      if (!item || this.isItemDisabled(item)) return
      if (this.isItemSelected(item, index)) {
        this.removeIndexFromSelection(index)
        return
      }

      if (!this.selectionMode) {
        this.viewModeBeforeSelection = this.viewMode
        this.selectionMode = true
      }

      if (!this.selectedCount) {
        this.selectOnlyIndex(index)
        return
      }

      this.addIndexToSelection(index, true)
    },

    toggleIndexSelection(index) {
      const item = this.items[index]
      if (!item || this.isItemDisabled(item)) return
      const key = this.itemKey(item, index)
      if (this.selectedMap[key]) {
        this.removeIndexFromSelection(index)
      } else {
        this.addIndexToSelection(index, true)
      }
    },

    applyRangeSelection(targetIndex, additive = false) {
      const targetItem = this.items[targetIndex]
      if (!targetItem) return
      const anchorIndex = this.selectionAnchorIndex === null ? targetIndex : this.selectionAnchorIndex
      const anchorItem = this.items[anchorIndex]
      const lockedType = this.selectionTypeLock || targetItem.type || anchorItem?.type
      if (!lockedType) return

      const start = Math.min(anchorIndex, targetIndex)
      const end = Math.max(anchorIndex, targetIndex)
      const next = additive ? { ...this.selectedMap } : {}

      this.selectionTypeLock = lockedType
      for (let i = start; i <= end; i++) {
        const item = this.items[i]
        if (!item || item.type !== lockedType) continue
        next[this.itemKey(item, i)] = true
      }

      this.selectedMap = next
      this.selectionAnchorIndex = targetIndex
      if (!Object.keys(next).length) {
        this.selectionTypeLock = null
      }
    },

    selectAllOfType(type) {
      if (!type) return
      const next = {}
      let anchorIndex = null
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i]
        if (!item || item.type !== type) continue
        next[this.itemKey(item, i)] = true
        if (anchorIndex === null) anchorIndex = i
      }
      this.selectedMap = next
      this.selectionTypeLock = type
      this.selectionAnchorIndex = anchorIndex
      this.closeSelectAllMenu()
    },

    selectAllOfCurrentType() {
      const type = this.selectionTypeLock
        || (this.availableSelectionTypes.length === 1
          ? this.availableSelectionTypes[0]
          : (this.availableSelectionTypes.includes('image') ? 'image' : this.availableSelectionTypes[0]))
      this.selectAllOfType(type)
    },

    handleSelectAllButtonClick() {
      if (!this.hasMixedSelectableTypes) {
        this.selectAllOfCurrentType()
        return
      }

      this.selectAllMenuOpen = !this.selectAllMenuOpen
    },

    onSelectAllTypeClick(type) {
      this.selectAllOfType(type)
    },

    closeSelectAllMenu() {
      this.selectAllMenuOpen = false
    },

    onSelectionIslandCollapsedChange(collapsed) {
      if (!collapsed) return
      this.closeSelectAllMenu()
    },

    onWindowPointerDown(event) {
      if (!this.selectAllMenuOpen) return
      const host = this.$refs.selectionIslandMenu
      if (host && typeof host.contains === 'function' && host.contains(event.target)) {
        return
      }
      this.closeSelectAllMenu()
    },

    onSelectionPointerDown(event, item, index) {
      if (!this.selectionMode) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (this.isItemDisabled(item)) return

      if (this.coverPickerMode) {
        event.preventDefault()
        if (this.canPickContainerCoverItem(item)) {
          void this.pickContainerCover(item)
        }
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        this.applyRangeSelection(index, event.ctrlKey || event.metaKey)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        this.toggleIndexSelection(index)
        return
      }

      this.clearPointerGesture()
      this.pointerSelection = {
        pointerId: event.pointerId,
        startIndex: index,
        type: item.type,
        sweeping: false,
        action: null,
        visitedKeys: {},
      }

      this.longPressTimer = window.setTimeout(() => {
        this.beginSweepSelection(index)
      }, LONG_PRESS_MS)

      window.addEventListener('pointermove', this.onGlobalPointerMove)
      window.addEventListener('pointerup', this.onGlobalPointerUp)
      window.addEventListener('pointercancel', this.onGlobalPointerCancel)
    },

    onGridPointerDown(event, item, index) {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      if (this.selectionMode) {
        this.onSelectionPointerDown(event, item, index)
        return
      }

      if (this.coverPickerMode) return

      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault()
        this.enterGridSelectionMode()
        this.suppressNextGridClick = true
        if (event.shiftKey) {
          this.applyRangeSelection(index, event.ctrlKey || event.metaKey)
        } else {
          this.toggleIndexSelection(index)
        }
        return
      }

      this.clearPointerGesture()
      this.pointerSelection = {
        pointerId: event.pointerId,
        startIndex: index,
        type: item.type,
        sweeping: false,
        action: null,
        visitedKeys: {},
        origin: 'grid-browse',
      }

      this.longPressTimer = window.setTimeout(() => {
        this.activateGridLongPressSelection(index)
      }, LONG_PRESS_MS)

      window.addEventListener('pointermove', this.onGlobalPointerMove)
      window.addEventListener('pointerup', this.onGlobalPointerUp)
      window.addEventListener('pointercancel', this.onGlobalPointerCancel)
    },

    enterListSelectionMode() {
      this.viewModeBeforeSelection = 'list'
      this.selectionMode = true
      this.viewMode = 'list'
    },

    onListPointerDown(event, item, index) {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      if (this.selectionMode) {
        this.onSelectionPointerDown(event, item, index)
        return
      }

      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault()
        this.enterListSelectionMode()
        this.suppressNextListClick = true
        if (event.shiftKey) {
          this.applyRangeSelection(index, event.ctrlKey || event.metaKey)
        } else {
          this.toggleIndexSelection(index)
        }
        return
      }

      this.clearPointerGesture()
      this.pointerSelection = {
        pointerId: event.pointerId,
        startIndex: index,
        type: item.type,
        sweeping: false,
        action: null,
        visitedKeys: {},
        origin: 'list-browse',
      }

      this.longPressTimer = window.setTimeout(() => {
        this.activateListLongPressSelection(index)
      }, LONG_PRESS_MS)

      window.addEventListener('pointermove', this.onGlobalPointerMove)
      window.addEventListener('pointerup', this.onGlobalPointerUp)
      window.addEventListener('pointercancel', this.onGlobalPointerCancel)
    },

    activateListLongPressSelection(index) {
      const session = this.pointerSelection
      const item = this.items[index]
      if (!session || !item || session.sweeping) return

      this.enterListSelectionMode()
      this.suppressNextListClick = true
      this.selectOnlyIndex(index)

      session.origin = 'list-selection'
      session.sweeping = true
      session.action = 'add'
      session.type = item.type
      session.visitedKeys = {}
      this.applySweepToIndex(index)
    },

    activateGridLongPressSelection(index) {
      const session = this.pointerSelection
      const item = this.items[index]
      if (!session || !item || session.sweeping) return

      this.enterGridSelectionMode()
      this.suppressNextGridClick = true
      this.selectOnlyIndex(index)

      session.origin = 'grid-selection'
      session.sweeping = true
      session.action = 'add'
      session.type = item.type
      session.visitedKeys = {}
      this.applySweepToIndex(index)
    },

    onListRowClick(_event, item) {
      if (this.suppressNextListClick) {
        this.suppressNextListClick = false
        return
      }
      if (this.selectionMode) {
        if (this.coverPickerMode && this.canPickContainerCoverItem(item)) {
          void this.pickContainerCover(item)
        }
        return
      }
      this.openItem(item)
    },

    onGridItemClick(_event, item) {
      if (this.suppressNextGridClick) {
        this.suppressNextGridClick = false
        return
      }
      if (this.selectionMode) {
        if (this.coverPickerMode && this.canPickContainerCoverItem(item)) {
          void this.pickContainerCover(item)
        }
        return
      }
      this.openItem(item)
    },

    beginSweepSelection(startIndex) {
      const session = this.pointerSelection
      const item = this.items[startIndex]
      if (!session || session.sweeping || !item || this.isItemDisabled(item)) return

      session.sweeping = true
      session.action = this.isItemSelected(item, startIndex) ? 'remove' : 'add'
      session.type = item.type
      this.applySweepToIndex(startIndex)
    },

    applySweepToIndex(index) {
      const session = this.pointerSelection
      const item = this.items[index]
      if (!session || !session.sweeping || !item) return
      if (item.type !== session.type) return
      if (this.selectionTypeLock && this.selectionTypeLock !== item.type) return

      const key = this.itemKey(item, index)
      if (session.visitedKeys[key]) return
      session.visitedKeys[key] = true

      if (session.action === 'remove') {
        this.removeIndexFromSelection(index)
      } else {
        this.addIndexToSelection(index)
      }
    },

    onGlobalPointerMove(event) {
      const session = this.pointerSelection
      if (!session || event.pointerId !== session.pointerId || !session.sweeping) return
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const wrap = target && target.closest('[data-select-index]')
      if (!wrap) return
      const index = Number(wrap.getAttribute('data-select-index'))
      if (Number.isInteger(index)) {
        this.applySweepToIndex(index)
      }
    },

    onGlobalPointerUp(event) {
      const session = this.pointerSelection
      if (!session || event.pointerId !== session.pointerId) return
      const startIndex = session.startIndex
      const sweeping = session.sweeping
      const origin = session.origin
      this.clearPointerGesture()
      if ((origin === 'list-browse' || origin === 'grid-browse') && !this.selectionMode) {
        return
      }
      if (!sweeping) {
        this.selectOnlyIndex(startIndex)
      }
    },

    onGlobalPointerCancel(event) {
      const session = this.pointerSelection
      if (!session || event.pointerId !== session.pointerId) return
      this.clearPointerGesture()
    },

    clearPointerGesture() {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer)
        this.longPressTimer = null
      }
      window.removeEventListener('pointermove', this.onGlobalPointerMove)
      window.removeEventListener('pointerup', this.onGlobalPointerUp)
      window.removeEventListener('pointercancel', this.onGlobalPointerCancel)
      this.pointerSelection = null
    },

    toggleInfoDisplayMode() {
      this.selectionInfoMode = this.selectionInfoMode === 'name' ? 'tags' : 'name'
      if (this.selectionInfoMode === 'tags') {
        this.ensureTagLabelsLoaded()
      }
    },

    displayInfoText(item) {
      if (this.selectionInfoMode !== 'tags') {
        return item?.name || item?.full_filename || '未命名'
      }
      if (item?.type === 'album') {
        return item?.name || '未命名相册'
      }
      return this.tagTextForItem(item)
    },

    displayInfoTags(item) {
      if (this.selectionInfoMode !== 'tags' || item?.type === 'album') {
        return []
      }

      const ids = Array.isArray(item?.tags)
        ? item.tags.filter(id => Number.isInteger(id))
        : []
      if (!ids.length) return []

      const sortedIds = this.sortTagIdsByName(ids)
      const tags = []
      for (const id of sortedIds) {
        const tag = this.tagLookupMap[id]
        if (!tag) continue
        tags.push({
          id,
          name: tag.name || `#${id}`,
          display_name: tag.displayName || tag.name || `#${id}`,
          color: tag.color || '',
          border_color: tag.borderColor || '',
          background_color: tag.backgroundColor || '',
        })
      }
      return tags
    },

    onReservedDetailsClick(item, index) {
      if (!item) return
      const alreadySelected = this.isItemSelected(item, index)

      if (!this.selectedCount) {
        this.selectOnlyIndex(index)
      } else if (this.selectedCount === 1) {
        if (!alreadySelected) {
          this.selectOnlyIndex(index)
        }
      } else if (!alreadySelected) {
        this.selectOnlyIndex(index)
      }

      this.openSelectionDetails()
    },
  },
}
