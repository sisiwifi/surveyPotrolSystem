/**
 * BrowsePage 视图计算集合。
 * 统一托管页面契约、分页窗口、详情面板以及选择态衍生数据，避免页面壳继续堆叠 computed。
 */
import { getCommonBrowsePageContract } from '../../../utils/commonBrowsePage'
import {
  DEFAULT_PAGE_CONFIG,
  SELECTION_LANDSCAPE_COLS,
  SELECTION_PORTRAIT_COLS,
  SELECTION_LANDSCAPE_GAP,
  SELECTION_PORTRAIT_GAP,
  PAGED_GRID_BOTTOM_RESERVE_PX,
  PAGED_LIST_BOTTOM_RESERVE_PX,
  PAGE_SECTION_GAP_PX,
  LIST_PAGE_SIZE_OPTIONS,
  hasBrowseFilterValue,
  extractItemFileExtension,
} from './shared'

export default {
  computed: {
    pageContractName() {
      return this.$route.meta?.browseContract || 'calendar'
    },
    pageContract() {
      return getCommonBrowsePageContract(this.pageContractName)
    },
    isTrashMode() {
      return this.pageContractName === 'trash'
    },
    isCollectionMode() {
      return this.pageContractName === 'collection'
    },
    isTagMode() {
      return this.pageContractName === 'tag'
    },
    dateGroup() {
      return this.$route.params.group || ''
    },
    collectionPublicId() {
      return this.$route.params.collectionId || ''
    },
    currentBrowseTagId() {
      const raw = this.$route.params.tagId
      const value = Number.parseInt(Array.isArray(raw) ? raw[0] : raw, 10)
      return Number.isInteger(value) ? value : null
    },
    albumPath() {
      const raw = this.$route.params.albumPath
      if (!raw) return ''
      return Array.isArray(raw) ? raw.join('/') : raw
    },
    isAlbumMode() {
      return this.albumPath.length > 0
    },
    fullAlbumPath() {
      if (!this.albumPath) return ''
      return `${this.dateGroup}/${this.albumPath}`
    },
    headerCrumbs() {
      return this.pageContract.buildCrumbs(this)
    },
    pageHeaderActions() {
      return this.pageContract.buildHeaderActions(this)
    },
    hasActiveBrowseFilter() {
      return hasBrowseFilterValue(this.appliedBrowseFilter)
    },
    availableBrowseFilterTags() {
      const tagIds = []
      const seen = new Set()
      for (const item of this.sourceItems) {
        if (item?.type !== 'image' || !Array.isArray(item?.tags)) continue
        for (const tagId of item.tags) {
          if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue
          seen.add(tagId)
          tagIds.push(tagId)
        }
      }
      return this.buildTagItemsByIds(tagIds)
    },
    availableBrowseFilterCategories() {
      const categories = []
      const seen = new Set()
      for (const item of this.sourceItems) {
        if (item?.type !== 'image') continue
        const categoryId = Number(item?.category_id)
        if (!Number.isInteger(categoryId) || categoryId <= 0 || seen.has(categoryId)) continue
        seen.add(categoryId)
        categories.push({
          id: categoryId,
          label: this.categoryDisplayMap[categoryId] || `主分类 ${categoryId}`,
        })
      }
      return categories.sort((left, right) => left.label.localeCompare(right.label, 'zh-CN', { sensitivity: 'base', numeric: true }))
    },
    availableBrowseFilterFileTypes() {
      const nextTypes = new Set()
      for (const item of this.sourceItems) {
        if (item?.type !== 'image') continue
        const extension = extractItemFileExtension(item)
        if (extension) {
          nextTypes.add(extension)
        }
      }
      return Array.from(nextTypes).sort((left, right) => left.localeCompare(right))
    },
    emptyStateIcon() {
      if (this.hasActiveBrowseFilter && !this.items.length && this.sourceItems.length) {
        return '筛'
      }
      return this.pageContract.emptyState?.icon || '📂'
    },
    emptyStateText() {
      if (this.hasActiveBrowseFilter && !this.items.length && this.sourceItems.length) {
        return '当前筛选条件下没有匹配内容。'
      }
      return this.pageContract.emptyState?.text || '此页面尚无内容。'
    },
    totalCount() {
      return this.items.length
    },
    cachePageToken() {
      return this.pageContract.buildCachePageToken(this)
    },
    cacheSortSignature() {
      return `${this.sortBy}:${this.sortDir}:${this.items.length}`
    },
    currentRouteFocusSignature() {
      const rawFocusId = Array.isArray(this.$route.query.focus) ? this.$route.query.focus[0] : this.$route.query.focus
      const rawFocusPath = Array.isArray(this.$route.query.focusPath) ? this.$route.query.focusPath[0] : this.$route.query.focusPath
      const focusId = String(rawFocusId || '').trim()
      const focusPath = String(rawFocusPath || '').trim()
      if (!focusId && !focusPath) {
        return ''
      }
      return `${this.$route.path}|${focusId}|${focusPath}`
    },
    scrollWindowRadius() {
      return Math.max(1, Math.floor((this.pageScrollWindowSize || DEFAULT_PAGE_CONFIG.scrollWindowSize) / 2))
    },
    isPhotoGridMode() {
      return this.viewMode === 'grid' && !this.selectionMode
    },
    isSelectionGridMode() {
      return this.selectionMode && this.viewMode === 'grid'
    },
    isPortrait() {
      const width = this.viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
      const height = this.viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 0)
      if (!width || !height) return false
      return height > width
    },
    selectionColumnCount() {
      return this.isPortrait ? SELECTION_PORTRAIT_COLS : SELECTION_LANDSCAPE_COLS
    },
    selectionGridGapPx() {
      return this.selectionColumnCount === SELECTION_LANDSCAPE_COLS
        ? SELECTION_LANDSCAPE_GAP
        : SELECTION_PORTRAIT_GAP
    },
    visibleSelectionEntries() {
      const start = this.isSelectionGridMode ? this.selectionGridPageStartIndex : 0
      const end = this.isSelectionGridMode ? this.selectionGridPageEndIndex : this.items.length
      return this.items.slice(start, end).map((item, offset) => ({ item, index: start + offset }))
    },
    visibleGridEntries() {
      if (this.viewMode !== 'grid') return []
      const start = this.isSelectionGridMode ? this.selectionGridPageStartIndex : this.photoGridPageStartIndex
      const end = this.isSelectionGridMode ? this.selectionGridPageEndIndex : this.photoGridPageEndIndex
      return this.items.slice(start, end).map((item, offset) => ({ item, index: start + offset }))
    },
    mediaGridStyle() {
      if (this.viewMode !== 'grid') return null
      return {
        '--browse-grid-columns': String(this.selectionColumnCount),
        '--browse-grid-gap': `${this.selectionGridGapPx}px`,
      }
    },
    renderedPreviewItems() {
      if (this.viewMode === 'grid') {
        return this.visibleGridEntries.map(entry => entry.item)
      }
      if (this.viewMode === 'list') {
        return this.visibleListEntries.map(entry => entry.item)
      }
      return []
    },
    isPaginationBarVisible() {
      return Boolean(this.items.length && this.activePaginationConfig)
    },
    selectionIslandStyle() {
      if (!this.selectionMode || !this.isPaginationBarVisible) return null
      const hostHeight = this.paginationHostHeight > 0 ? this.paginationHostHeight : 52
      return {
        bottom: `${hostHeight + 10}px`,
      }
    },
    visibleListEntries() {
      const start = this.viewMode === 'list' ? this.listPageStartIndex : 0
      const end = this.viewMode === 'list' ? this.listPageEndIndex : this.items.length
      return this.items.slice(start, end).map((item, offset) => ({ item, index: start + offset }))
    },
    listViewStyle() {
      if (this.viewMode !== 'list') return null
      return {
        minHeight: `${this.pagedListHeightBudget}px`,
        height: `${this.pagedListHeightBudget}px`,
        overflow: 'hidden',
      }
    },
    pagedGridHeightBudget() {
      const hostHeight = this.pageMainHeight > 0 ? this.pageMainHeight : this.viewportHeight
      return Math.max(
        220,
        hostHeight - this.pagedPaginationHostReservePx - PAGED_GRID_BOTTOM_RESERVE_PX,
      )
    },
    pagedListHeightBudget() {
      const hostHeight = this.pageMainHeight > 0 ? this.pageMainHeight : this.viewportHeight
      return Math.max(
        180,
        hostHeight - this.pagedPaginationHostReservePx - PAGED_LIST_BOTTOM_RESERVE_PX,
      )
    },
    photoGridTotalPages() {
      if (!this.isPhotoGridMode) return 1
      return Math.max(1, Math.ceil(this.items.length / this.listPageSize))
    },
    normalizedPhotoPageIndex() {
      return Math.min(Math.max(0, this.photoPageIndex), Math.max(0, this.photoGridTotalPages - 1))
    },
    photoGridPageStartIndex() {
      if (!this.isPhotoGridMode) return 0
      return this.normalizedPhotoPageIndex * this.listPageSize
    },
    photoGridPageEndIndex() {
      if (!this.isPhotoGridMode) return this.items.length
      return Math.min(this.items.length, this.photoGridPageStartIndex + this.listPageSize)
    },
    selectionGridPageSize() {
      if (!this.isSelectionGridMode) return this.items.length || 1
      return Math.max(1, this.listPageSize)
    },
    selectionGridTotalPages() {
      if (!this.isSelectionGridMode) return 1
      return Math.max(1, Math.ceil(this.items.length / this.selectionGridPageSize))
    },
    normalizedSelectionGridPageIndex() {
      return Math.min(Math.max(0, this.selectionGridPageIndex), Math.max(0, this.selectionGridTotalPages - 1))
    },
    selectionGridPageStartIndex() {
      if (!this.isSelectionGridMode) return 0
      return this.normalizedSelectionGridPageIndex * this.selectionGridPageSize
    },
    selectionGridPageEndIndex() {
      if (!this.isSelectionGridMode) return this.items.length
      return Math.min(this.items.length, this.selectionGridPageStartIndex + this.selectionGridPageSize)
    },
    listTotalPages() {
      if (this.viewMode !== 'list') return 1
      return Math.max(1, Math.ceil(this.items.length / this.listPageSize))
    },
    normalizedListPageIndex() {
      return Math.min(Math.max(0, this.listPageIndex), Math.max(0, this.listTotalPages - 1))
    },
    listPageStartIndex() {
      if (this.viewMode !== 'list') return 0
      return this.normalizedListPageIndex * this.listPageSize
    },
    listPageEndIndex() {
      if (this.viewMode !== 'list') return this.items.length
      return Math.min(this.items.length, this.listPageStartIndex + this.listPageSize)
    },
    activePaginationConfig() {
      if (!this.items.length) return null

      if (this.viewMode === 'list') {
        return {
          kind: 'list',
          currentPage: this.normalizedListPageIndex + 1,
          totalPages: this.listTotalPages,
          pageSize: this.listPageSize,
          pageSizeOptions: LIST_PAGE_SIZE_OPTIONS,
        }
      }

      if (this.isSelectionGridMode) {
        return {
          kind: 'selection-grid',
          currentPage: this.normalizedSelectionGridPageIndex + 1,
          totalPages: this.selectionGridTotalPages,
          pageSize: this.listPageSize,
          pageSizeOptions: LIST_PAGE_SIZE_OPTIONS,
        }
      }

      return {
        kind: 'photo-grid',
        currentPage: this.normalizedPhotoPageIndex + 1,
        totalPages: this.photoGridTotalPages,
        pageSize: this.listPageSize,
        pageSizeOptions: LIST_PAGE_SIZE_OPTIONS,
      }
    },
    pagedPaginationHostReservePx() {
      if (this.paginationHostHeight <= 0) return 0
      return this.paginationHostHeight + PAGE_SECTION_GAP_PX
    },
    selectedCount() {
      return Object.keys(this.selectedMap).length
    },
    selectionSummaryText() {
      if (!this.selectedCount) return '已选 0 项'
      if (this.selectionTypeLock === 'album') return `已选 ${this.selectedCount} 个相册`
      if (this.selectionTypeLock === 'image') return `已选 ${this.selectedCount} 张图片`
      return `已选 ${this.selectedCount} 项`
    },
    availableSelectionTypes() {
      const types = new Set()
      for (const item of this.items) {
        if (item?.type === 'album' || item?.type === 'image') {
          types.add(item.type)
        }
      }
      return Array.from(types)
    },
    hasMixedSelectableTypes() {
      return this.availableSelectionTypes.includes('album') && this.availableSelectionTypes.includes('image')
    },
    selectedEntries() {
      const entries = []
      for (let index = 0; index < this.items.length; index++) {
        const item = this.items[index]
        if (this.isItemSelected(item, index)) {
          entries.push({ item, index })
        }
      }
      return entries
    },
    selectionDetailPreviewItems() {
      return this.selectedEntries.map(({ item, index }) => ({
        key: this.itemKey(item, index),
        name: this.detailNameText(item),
        type: item?.type || 'image',
        previewUrl: this.detailPreviewUrl(item),
        aspectRatio: this.detailAspectRatio(item),
        animationLabel: this.animatedBadgeLabel(item),
      }))
    },
    selectionDetailsLayerStyle() {
      return this.selectionDetailsBounds
    },
    selectionDetailsPanelStyle() {
      const hostWidth = this.selectionDetailsHostWidth || (typeof window !== 'undefined' ? window.innerWidth : 0)
      const hostHeight = this.selectionDetailsHostHeight || (typeof window !== 'undefined' ? window.innerHeight : 0)
      if (!hostWidth || !hostHeight) return null

      const availableWidth = Math.max(0, Math.floor(hostWidth - 12))
      const availableHeight = Math.max(0, Math.floor(hostHeight - 12))
      const isPortraitLike = hostWidth <= 960 || hostWidth < hostHeight

      if (isPortraitLike) {
        const panelWidth = Math.min(
          availableWidth,
          Math.max(Math.min(availableWidth, 320), Math.floor(hostWidth * 0.98)),
        )
        const desiredHeight = Math.floor(hostHeight * 0.96)
        const panelHeight = Math.min(
          availableHeight,
          Math.max(Math.min(availableHeight, 360), desiredHeight),
        )
        return {
          width: `${panelWidth}px`,
          maxWidth: `${availableWidth}px`,
          height: `${panelHeight}px`,
          maxHeight: `${availableHeight}px`,
        }
      }

      const panelWidth = Math.min(
        1180,
        availableWidth,
        Math.max(Math.min(availableWidth, 760), Math.floor(hostWidth * 0.8)),
      )
      const panelHeight = Math.min(
        availableHeight,
        Math.max(Math.min(availableHeight, 460), Math.round(panelWidth * 0.58)),
      )
      return {
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        maxWidth: `${availableWidth}px`,
        maxHeight: `${availableHeight}px`,
      }
    },
    selectionDetailNameField() {
      return this.buildDetailField(this.selectedEntries.map(({ item }) => this.detailNameText(item)))
    },
    selectionDetailRawName() {
      const item = this.selectedEntries[0]?.item
      if (item?.type !== 'image') return ''
      return this.detailNameText(item)
    },
    selectionDetailCategoryField() {
      return this.buildDetailField(this.selectedEntries.map(({ item }) => this.detailCategoryText(item)))
    },
    selectionDetailRawCategoryId() {
      const item = this.selectedEntries[0]?.item
      const categoryId = Number(item?.category_id)
      if (item?.type !== 'image' || !Number.isInteger(categoryId) || categoryId <= 0) return null
      return categoryId
    },
    selectionDetailCategoryOptions() {
      return Object.entries(this.categoryDisplayMap)
        .map(([id, label]) => ({
          value: Number(id),
          label: label || `#${id}`,
        }))
        .filter(option => Number.isInteger(option.value) && option.value > 0)
        .sort((left, right) => left.value - right.value)
    },
    selectionDetailTagsField() {
      const imageEntries = this.selectedEntries.filter(({ item }) => item?.type === 'image')
      if (!imageEntries.length) {
        return {
          text: '',
          isVarious: false,
          isEmpty: true,
          items: [],
        }
      }

      const tagIdLists = imageEntries.map(({ item }) => {
        const ids = Array.isArray(item?.tags) ? item.tags.filter(id => Number.isInteger(id)) : []
        return this.sortTagIdsByName([...new Set(ids)])
      })

      const commonTagIds = tagIdLists.reduce((previous, current) => {
        if (!previous.length) return []
        const currentSet = new Set(current)
        return previous.filter(id => currentSet.has(id))
      }, [...(tagIdLists[0] || [])])

      const sortedCommonTagIds = this.sortTagIdsByName([...new Set(commonTagIds)])
      if (sortedCommonTagIds.length) {
        return {
          text: '',
          isVarious: false,
          isEmpty: false,
          items: this.buildTagItemsByIds(sortedCommonTagIds),
        }
      }

      const hasAnyTag = tagIdLists.some(ids => ids.length > 0)
      if (hasAnyTag) {
        return {
          text: 'various',
          isVarious: true,
          isEmpty: false,
          items: [],
        }
      }

      return {
        text: '',
        isVarious: false,
        isEmpty: true,
        items: [],
      }
    },
    selectionDetailSizeField() {
      return this.buildDetailField(this.selectedEntries.map(({ item }) => this.detailSizeText(item)))
    },
    selectionDetailSizeLabel() {
      return this.selectionDetailType === 'album' ? '图片数量' : '尺寸'
    },
    selectionDetailImportedField() {
      return this.buildDetailField(this.selectedEntries.map(({ item }) => this.detailImportedText(item)))
    },
    selectionDetailCreatedField() {
      return this.buildDetailField(this.selectedEntries.map(({ item }) => this.detailCreatedText(item)))
    },
    selectionDetailRawCreatedAt() {
      const item = this.selectedEntries[0]?.item
      if (item?.type !== 'image') return null
      return item?.file_created_at || null
    },
    selectionDetailType() {
      return this.selectedEntries[0]?.item?.type || null
    },
    selectionDetailPrimaryActionLabel() {
      return this.selectionDetailType === 'album' ? '查看相册' : '查看原图'
    },
    selectionDetailPolicy() {
      return this.pageContract.buildDetailPolicy(this)
    },
    canOpenPrimaryActionFromDetails() {
      if (this.selectedEntries.length !== 1) return false
      const entry = this.selectedEntries[0]
      if (entry?.item?.type === 'image') {
        return Number.isInteger(entry?.item?.id)
      }
      return entry?.item?.type === 'album' && typeof entry?.item?.album_path === 'string' && entry.item.album_path.length > 0
    },
    selectedImageIds() {
      return this.selectedEntries
        .map(({ item }) => item)
        .filter(item => item?.type === 'image' && Number.isInteger(item?.id))
        .map(item => item.id)
    },
    canEditSelectionName() {
      if (this.actionBusy || this.metadataEditBusy) return false
      if (this.selectedEntries.length !== 1) return false
      return this.selectedEntries[0]?.item?.type === 'image' && Number.isInteger(this.selectedEntries[0]?.item?.id)
    },
    canEditSelectionCategory() {
      if (this.actionBusy || this.metadataEditBusy) return false
      return this.selectedImageIds.length > 0 && this.selectionDetailCategoryOptions.length > 0
    },
    canEditSelectionCreatedAt() {
      if (this.actionBusy || this.metadataEditBusy) return false
      return this.selectedImageIds.length > 0
    },
    canOpenCollectionMenu() {
      if (this.isTrashMode || this.actionBusy) return false
      return this.selectedImageIds.length > 0
    },
    containerImageItems() {
      return this.items.filter(item => item?.type === 'image' && Number.isInteger(item?.id))
    },
    canPickContainerCover() {
      return this.pageContract.canPickContainerCover(this)
    },
    canOpenTagMenu() {
      return this.selectedImageIds.length > 0
    },
    collectionMenuSelectionItems() {
      return this.selectedEntries
        .map(({ item, index }) => ({ item, index }))
        .filter(({ item }) => item?.type === 'image' && Number.isInteger(item?.id))
        .map(({ item, index }) => ({
          key: this.itemKey(item, index),
          imageId: item.id,
          name: this.detailNameText(item),
          previewUrl: this.detailPreviewUrl(item),
          aspectRatio: this.detailAspectRatio(item),
        }))
    },
    collectionMenuActionItems() {
      const selectedCollection = this.collectionMenuSelectedCollection
      const matchedSet = new Set(selectedCollection?.matched_image_ids || [])
      const isMulti = this.collectionMenuSelectionItems.length > 1
      return this.collectionMenuSelectionItems.map((item) => {
        const existsInCollection = matchedSet.has(item.imageId)
        const defaultAction = existsInCollection
          ? (isMulti ? 'keep' : 'remove')
          : 'add'
        return {
          ...item,
          existsInCollection,
          action: this.collectionMenuActionByImageId[item.imageId] || defaultAction,
          canChangeAction: Boolean(isMulti && existsInCollection && !selectedCollection?.isNew),
        }
      })
    },
    collectionMenuConfirmDisabled() {
      if (this.collectionMenuBusy || !this.canOpenCollectionMenu) return true
      return !this.collectionMenuSelectedCollection
    },
    collectionMenuConfirmLabel() {
      const selectedCollection = this.collectionMenuSelectedCollection
      if (!selectedCollection) return '确定'
      if (selectedCollection.isNew) return '创建并加入'
      if (this.collectionMenuSelectionItems.length === 1) {
        const imageId = this.collectionMenuSelectionItems[0]?.imageId
        const action = imageId != null ? this.collectionMenuActionByImageId[imageId] : ''
        return action === 'remove' ? '移除' : '加入'
      }
      return '应用'
    },
    pageSelectionActions() {
      return this.pageContract.buildSelectionActions(this)
    },
    actionBusyTitleResolved() {
      if (this.actionBusyTitle) return this.actionBusyTitle
      return this.pageContract.actionBusyFallback?.(this)?.title || '处理中'
    },
    actionBusyMessageResolved() {
      if (this.actionBusyText) return this.actionBusyText
      return this.pageContract.actionBusyFallback?.(this)?.message || '正在处理当前操作，请稍候…'
    },
  },
}
