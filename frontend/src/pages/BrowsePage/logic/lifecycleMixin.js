/**
 * BrowsePage 生命周期与观察逻辑。
 * 将路由切换、渲染窗口变化和全局事件注册统一收口，页面壳只负责装配。
 */
import { PAGE_CONFIG_UPDATED_EVENT } from '../../../utils/pageConfig'

export default {
  watch: {
    '$route.fullPath': {
      handler() {
        this.resetBrowseFilterState()
        this.loadData()
      },
    },
    renderedPreviewItems: {
      handler(items) {
        this.enqueueMissingPreviewRepairs(items)
      },
    },
    viewMode() {
      if (this.selectionMode) return
      this.refreshObservedGrid()
    },
    selectionMode(nextValue) {
      if (nextValue) {
        this.coverPickerMode = false
      }
      if (!nextValue) {
        this.closeSelectionDetails()
        this.closeCollectionMenu()
        this.closeSelectAllMenu()
      }
    },
    selectedCount(nextValue) {
      if (!nextValue) {
        this.closeSelectionDetails()
        this.closeCollectionMenu()
        this.closeSelectAllMenu()
      }
    },
    selectionDetailsOpen(nextValue) {
      if (!nextValue) {
        this.closeCollectionMenu()
        this.closeTagMenu()
      }
    },
  },

  created() {
    this.loadData()
    this.fetchPageConfigSetting()
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onWindowKeydown)
    window.addEventListener('pointerdown', this.onWindowPointerDown)
    window.addEventListener(PAGE_CONFIG_UPDATED_EVENT, this.onPageConfigUpdated)
  },

  mounted() {
    this.attachScrollListener()
  },

  beforeUnmount() {
    this.clearCachePlanDebounce()
    this.teardownResizeObserver()
    this.stopPoll()
    this.clearPointerGesture()
    this.unlockPageScroll()
    this.detachScrollListener()
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onWindowKeydown)
    window.removeEventListener('pointerdown', this.onWindowPointerDown)
    window.removeEventListener(PAGE_CONFIG_UPDATED_EVENT, this.onPageConfigUpdated)
    if (this.previewRepairTimer) {
      clearTimeout(this.previewRepairTimer)
      this.previewRepairTimer = null
    }
    if (this.scrollFrameId) {
      cancelAnimationFrame(this.scrollFrameId)
      this.scrollFrameId = null
    }
    if (this.dimensionFlushTimer) {
      clearTimeout(this.dimensionFlushTimer)
      this.dimensionFlushTimer = null
    }
    if (this.tagMenuSearchTimer) {
      clearTimeout(this.tagMenuSearchTimer)
      this.tagMenuSearchTimer = null
    }
    if (this.routeFocusClearTimer) {
      clearTimeout(this.routeFocusClearTimer)
      this.routeFocusClearTimer = null
    }
  },
}
