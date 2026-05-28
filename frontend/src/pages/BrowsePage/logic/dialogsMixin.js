/**
 * BrowsePage 标签、收藏、确认对话框与回收站动作逻辑。
 * 这一层承接页面壳最容易膨胀的业务动作，保持 index.vue 只保留视图装配职责。
 */
import { normalizeTagColors } from '../../../utils/tagColors'
import {
  API_BASE,
  TAG_BATCH_SIZE,
  createDialogState,
  normalizeFilterIntArray,
} from './shared'

export default {
  methods: {
    buildTagLookupEntry(rawTag) {
      if (!Number.isInteger(rawTag?.id)) return null
      const metadata = rawTag?.metadata && typeof rawTag.metadata === 'object' ? rawTag.metadata : {}
      const { color, borderColor, backgroundColor } = normalizeTagColors(rawTag)
      return {
        id: rawTag.id,
        publicId: String(rawTag?.public_id || ''),
        name: String(rawTag?.name || ''),
        displayName: String(rawTag?.display_name || rawTag?.name || `#${rawTag.id}`),
        type: String(rawTag?.type || 'normal'),
        description: String(rawTag?.description || ''),
        metadata,
        color: String(color || ''),
        borderColor: String(borderColor || ''),
        backgroundColor: String(backgroundColor || ''),
      }
    },

    sortTagIdsByName(tagIds) {
      return [...tagIds].sort((leftId, rightId) => {
        const leftName = String(this.tagLookupMap[leftId]?.name || '')
        const rightName = String(this.tagLookupMap[rightId]?.name || '')
        if (leftName && rightName && leftName !== rightName) {
          return leftName.localeCompare(rightName)
        }
        if (leftName && !rightName) return -1
        if (!leftName && rightName) return 1
        return leftId - rightId
      })
    },

    buildTagItemsByIds(tagIds) {
      const sortedIds = this.sortTagIdsByName(tagIds)
      return sortedIds.map((id) => {
        const tag = this.tagLookupMap[id]
        if (!tag) {
          return {
            id,
            public_id: '',
            name: `#${id}`,
            display_name: `#${id}`,
            type: 'normal',
            description: '',
            metadata: {},
            color: '',
            border_color: '',
            background_color: '',
          }
        }
        return {
          id,
          public_id: tag.publicId || '',
          name: tag.name || `#${id}`,
          display_name: tag.displayName || tag.name || `#${id}`,
          type: tag.type || 'normal',
          description: tag.description || '',
          metadata: tag.metadata || {},
          color: tag.color || '',
          border_color: tag.borderColor || '',
          background_color: tag.backgroundColor || '',
        }
      })
    },

    tagIdsForImage(imageId) {
      const item = this.items.find(candidate => candidate?.type === 'image' && candidate?.id === imageId)
      const ids = Array.isArray(item?.tags) ? item.tags.filter(id => Number.isInteger(id)) : []
      return this.sortTagIdsByName([...new Set(ids)])
    },

    collectCommonTagIdsFromMap(imageIds, tagMap) {
      if (!imageIds.length) return []
      const tagIdLists = imageIds.map((imageId) => {
        const ids = Array.isArray(tagMap?.[imageId]) ? tagMap[imageId].filter(id => Number.isInteger(id)) : []
        return this.sortTagIdsByName([...new Set(ids)])
      })

      const commonTagIds = tagIdLists.reduce((previous, current) => {
        if (!previous.length) return []
        const currentSet = new Set(current)
        return previous.filter(id => currentSet.has(id))
      }, [...(tagIdLists[0] || [])])

      return this.sortTagIdsByName([...new Set(commonTagIds)])
    },

    normalizeCollectionMenuItems(rawItems) {
      return (rawItems || [])
        .filter(item => Number.isInteger(item?.id))
        .map(item => ({
          id: item.id,
          public_id: item.public_id || '',
          title: item.title || '',
          description: item.description || '',
          collection_path: item.collection_path || '',
          photo_count: Number(item.photo_count || 0) || 0,
          matched_image_ids: Array.isArray(item.matched_image_ids) ? item.matched_image_ids.filter(id => Number.isInteger(id)) : [],
          selected_match_count: Number(item.selected_match_count || 0) || 0,
          contains_all_selected: Boolean(item.contains_all_selected),
        }))
    },

    initializeCollectionMenuActions(selectedCollection) {
      const matchedSet = new Set(selectedCollection?.matched_image_ids || [])
      const isMulti = this.collectionMenuSelectionItems.length > 1
      const nextActions = {}
      for (const item of this.collectionMenuSelectionItems) {
        if (matchedSet.has(item.imageId)) {
          nextActions[item.imageId] = isMulti ? 'keep' : 'remove'
        } else {
          nextActions[item.imageId] = 'add'
        }
      }
      this.collectionMenuActionByImageId = nextActions
    },

    async openCollectionMenu() {
      if (!this.canOpenCollectionMenu || this.collectionMenuBusy) return
      if (this.tagMenuVisible) {
        this.closeTagMenu()
      }
      this.collectionMenuVisible = true
      this.collectionMenuBusy = false
      this.collectionMenuSearchBusy = false
      this.collectionMenuError = ''
      this.collectionMenuQuery = ''
      this.collectionMenuSuggestions = []
      this.collectionMenuSelectedCollection = null
      this.collectionMenuActionByImageId = {}
      await this.fetchCollectionMenuSuggestions('')
    },

    closeCollectionMenu() {
      this.collectionMenuVisible = false
      this.collectionMenuBusy = false
      this.collectionMenuSearchBusy = false
      this.collectionMenuError = ''
      this.collectionMenuQuery = ''
      this.collectionMenuSuggestions = []
      this.collectionMenuSelectedCollection = null
      this.collectionMenuActionByImageId = {}
      if (this.collectionMenuSearchTimer) {
        clearTimeout(this.collectionMenuSearchTimer)
        this.collectionMenuSearchTimer = null
      }
    },

    onCollectionMenuQueryChange(nextQuery) {
      this.collectionMenuError = ''
      this.collectionMenuQuery = String(nextQuery || '')
      this.collectionMenuSelectedCollection = null
      this.collectionMenuActionByImageId = {}
      if (this.collectionMenuSearchTimer) {
        clearTimeout(this.collectionMenuSearchTimer)
      }
      this.collectionMenuSearchTimer = setTimeout(() => {
        this.collectionMenuSearchTimer = null
        this.fetchCollectionMenuSuggestions(this.collectionMenuQuery)
      }, 180)
    },

    async fetchCollectionMenuSuggestions(rawQuery) {
      if (!this.collectionMenuVisible) return
      this.collectionMenuSearchBusy = true
      this.collectionMenuError = ''

      try {
        const res = await fetch(`${API_BASE}/api/collections/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: String(rawQuery || '').trim(),
            image_ids: this.selectedImageIds,
            limit: 12,
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload.detail || `HTTP ${res.status}`)
        }

        const data = await res.json()
        this.collectionMenuSuggestions = this.normalizeCollectionMenuItems(data.items || [])
      } catch (err) {
        this.collectionMenuSuggestions = []
        this.collectionMenuError = `收藏搜索失败：${err?.message || '未知错误'}`
      } finally {
        this.collectionMenuSearchBusy = false
      }
    },

    handleCollectionMenuSelect(collectionItem) {
      if (!collectionItem) return
      const normalizedItem = collectionItem.isNew
        ? {
            id: null,
            isNew: true,
            title: String(collectionItem.title || '').trim(),
            description: '',
            collection_path: '',
            photo_count: 0,
            matched_image_ids: [],
            selected_match_count: 0,
            contains_all_selected: false,
          }
        : {
            ...collectionItem,
            isNew: false,
            title: String(collectionItem.title || '').trim(),
          }
      if (!normalizedItem.title) return
      this.collectionMenuSelectedCollection = normalizedItem
      this.initializeCollectionMenuActions(normalizedItem)
    },

    setCollectionMenuImageAction(payload) {
      const imageId = Number(payload?.imageId)
      const action = String(payload?.action || '').trim().toLowerCase()
      if (!Number.isInteger(imageId) || !['keep', 'remove', 'add'].includes(action)) return
      this.collectionMenuActionByImageId = {
        ...this.collectionMenuActionByImageId,
        [imageId]: action,
      }
    },

    async confirmCollectionMenuChanges() {
      if (!this.collectionMenuSelectedCollection || this.collectionMenuBusy) return
      this.collectionMenuBusy = true
      this.collectionMenuError = ''

      try {
        const imageActions = this.collectionMenuSelectionItems.map((item) => ({
          image_id: item.imageId,
          action: this.collectionMenuActionByImageId[item.imageId] || 'add',
        }))

        const selectedCollection = this.collectionMenuSelectedCollection
        const res = await fetch(`${API_BASE}/api/collections/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection_id: Number.isInteger(selectedCollection.id) ? selectedCollection.id : null,
            title: selectedCollection.isNew ? selectedCollection.title : '',
            image_actions: imageActions,
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload.detail || `HTTP ${res.status}`)
        }

        const payload = await res.json()
        const label = payload.title || selectedCollection.title || '收藏'
        if (this.collectionMenuSelectionItems.length === 1) {
          const action = imageActions[0]?.action
          this.showMessage('success', action === 'remove' ? `已从“${label}”移除。` : `已加入“${label}”。`)
        } else {
          const addedCount = Number(payload.added_count || 0) || 0
          const removedCount = Number(payload.removed_count || 0) || 0
          this.showMessage('success', `收藏已更新：新增 ${addedCount} 张，移除 ${removedCount} 张。`)
        }

        if (typeof this.pageContract.afterCollectionMenuApply === 'function') {
          await this.pageContract.afterCollectionMenuApply(this, selectedCollection, payload)
        }

        this.closeCollectionMenu()
      } catch (err) {
        this.collectionMenuError = `收藏更新失败：${err?.message || '未知错误'}`
      } finally {
        this.collectionMenuBusy = false
      }
    },

    updateTagMenuDirty() {
      const imageIds = this.selectedImageIds
      this.tagMenuDirty = imageIds.some((imageId) => {
        const beforeIds = this.sortTagIdsByName([...(this.tagMenuOriginalByImageId[imageId] || [])])
        const afterIds = this.sortTagIdsByName([...(this.tagMenuDraftByImageId[imageId] || [])])
        if (beforeIds.length !== afterIds.length) return true
        for (let index = 0; index < beforeIds.length; index++) {
          if (beforeIds[index] !== afterIds[index]) return true
        }
        return false
      })
    },

    refreshTagMenuExistingTags() {
      const commonTagIds = this.collectCommonTagIdsFromMap(this.selectedImageIds, this.tagMenuDraftByImageId)
      this.tagMenuExistingTags = this.buildTagItemsByIds(commonTagIds)
      this.updateTagMenuDirty()
    },

    normalizeTagMenuItems(rawItems) {
      const nextTagMap = { ...this.tagLookupMap }
      const normalizedItems = []
      for (const rawTag of (rawItems || [])) {
        const normalizedTag = this.buildTagLookupEntry(rawTag)
        if (!normalizedTag) continue
        nextTagMap[normalizedTag.id] = normalizedTag
        normalizedItems.push({
          id: normalizedTag.id,
          public_id: normalizedTag.publicId,
          name: normalizedTag.name,
          display_name: normalizedTag.displayName,
          type: normalizedTag.type,
          description: normalizedTag.description,
          metadata: normalizedTag.metadata,
          color: normalizedTag.color,
          border_color: normalizedTag.borderColor,
          background_color: normalizedTag.backgroundColor,
          last_used_at: String(rawTag?.last_used_at || ''),
        })
      }
      this.tagLookupMap = nextTagMap
      return normalizedItems
    },

    async openTagMenu() {
      if (!this.canOpenTagMenu || this.tagMenuBusy) return
      this.tagMenuVisible = true
      this.tagMenuError = ''
      this.tagMenuQuery = ''
      this.tagMenuSuggestions = []
      this.tagMenuRecentTags = []
      this.tagMenuDraftByImageId = {}
      this.tagMenuOriginalByImageId = {}
      this.tagMenuDirty = false

      for (const imageId of this.selectedImageIds) {
        const ids = this.tagIdsForImage(imageId)
        this.tagMenuDraftByImageId[imageId] = [...ids]
        this.tagMenuOriginalByImageId[imageId] = [...ids]
      }

      await this.ensureTagLabelsLoaded(true)
      this.refreshTagMenuExistingTags()
      this.fetchTagMenuSuggestions('')
    },

    closeTagMenu() {
      if (this.tagFormVisible) {
        void this.closeTagForm()
      }
      this.tagMenuVisible = false
      this.tagMenuBusy = false
      this.tagMenuSearchBusy = false
      this.tagMenuError = ''
      this.tagMenuQuery = ''
      this.tagMenuSuggestions = []
      this.tagMenuRecentTags = []
      this.tagMenuExistingTags = []
      this.tagMenuDraftByImageId = {}
      this.tagMenuOriginalByImageId = {}
      this.tagMenuDirty = false
      if (this.tagMenuSearchTimer) {
        clearTimeout(this.tagMenuSearchTimer)
        this.tagMenuSearchTimer = null
      }
    },

    async fetchTagFormExistingNames() {
      const fallbackNames = Object.values(this.tagLookupMap)
        .map(tag => String(tag?.name || '').trim())
        .filter(Boolean)

      try {
        const res = await fetch(`${API_BASE}/api/tags?offset=0&limit=1000`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        return [...new Set((data.items || []).map(item => String(item?.name || '').trim()).filter(Boolean))].sort()
      } catch {
        return [...new Set(fallbackNames)].sort()
      }
    },

    async fetchTagDetail(tagId) {
      const res = await fetch(`${API_BASE}/api/tags/${tagId}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || `HTTP ${res.status}`)
      }
      return res.json()
    },

    async reserveTagDraft() {
      const res = await fetch(`${API_BASE}/api/tags/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.detail || `HTTP ${res.status}`)
      }
      return res.json()
    },

    resetTagFormState() {
      this.tagFormVisible = false
      this.tagFormMode = 'create'
      this.tagFormSaving = false
      this.tagFormError = ''
      this.tagFormTag = null
      this.tagFormExistingNames = []
    },

    async closeTagForm() {
      if (this.tagFormSaving) return
      const shouldDeleteDraft = this.tagFormMode === 'create' && Number.isInteger(this.tagFormTag?.id)
      const draftId = shouldDeleteDraft ? this.tagFormTag.id : null
      this.resetTagFormState()

      if (!draftId) return
      try {
        await fetch(`${API_BASE}/api/tags/${draftId}`, { method: 'DELETE' })
      } catch {
        // ignore draft cleanup failure and keep UI responsive
      }
    },

    async refreshTagCollectionsAfterSave(savedTag, options = {}) {
      const { attachToSelection = false } = options
      const normalizedTag = this.buildTagLookupEntry(savedTag)
      if (normalizedTag) {
        this.tagLookupMap = {
          ...this.tagLookupMap,
          [normalizedTag.id]: normalizedTag,
        }
      }

      if (typeof this.pageContract.afterTagSaved === 'function') {
        this.pageContract.afterTagSaved(this, normalizedTag, savedTag)
      }

      if (attachToSelection) {
        await this.addTagFromMenu(savedTag)
      } else {
        this.refreshTagMenuExistingTags()
      }

      if (this.tagMenuVisible) {
        await this.fetchTagMenuSuggestions(this.tagMenuQuery)
      }
    },

    async editCurrentBrowseTag() {
      const tagId = this.currentBrowseTagId
      if (!Number.isInteger(tagId) || this.tagMenuBusy || this.tagFormSaving) return

      this.tagMenuBusy = true
      this.tagFormError = ''
      this.tagMenuError = ''
      try {
        const [detail, existingNames] = await Promise.all([
          this.fetchTagDetail(tagId),
          this.fetchTagFormExistingNames(),
        ])
        this.tagFormMode = 'edit'
        this.tagFormTag = detail
        this.tagFormExistingNames = existingNames
        this.tagFormVisible = true
      } catch (err) {
        this.showMessage('error', `标签详情读取失败：${err?.message || '未知错误'}`)
      } finally {
        this.tagMenuBusy = false
      }
    },

    onTagMenuQueryChange(nextQuery) {
      this.tagMenuError = ''
      this.tagMenuQuery = String(nextQuery || '')
      if (this.tagMenuSearchTimer) {
        clearTimeout(this.tagMenuSearchTimer)
      }
      this.tagMenuSearchTimer = setTimeout(() => {
        this.tagMenuSearchTimer = null
        this.fetchTagMenuSuggestions(this.tagMenuQuery)
      }, 180)
    },

    async fetchTagMenuSuggestions(rawQuery) {
      if (!this.tagMenuVisible) return
      const query = String(rawQuery || '').trim()
      this.tagMenuSearchBusy = true
      this.tagMenuError = ''

      try {
        if (!query) {
          const res = await fetch(`${API_BASE}/api/tags?offset=0&limit=5&sort_by=last_used_desc`)
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = await res.json()
          this.tagMenuRecentTags = this.normalizeTagMenuItems(data.items || [])
          this.tagMenuSuggestions = []
          return
        }

        const q = `&q=${encodeURIComponent(query)}`
        const res = await fetch(`${API_BASE}/api/tags?offset=0&limit=24${q}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        this.tagMenuSuggestions = this.normalizeTagMenuItems(data.items || [])
        this.tagMenuRecentTags = []
      } catch (err) {
        this.tagMenuSuggestions = []
        this.tagMenuRecentTags = []
        this.tagMenuError = `标签搜索失败：${err?.message || '未知错误'}`
      } finally {
        this.tagMenuSearchBusy = false
      }
    },

    async addTagFromMenu(tagItem) {
      const tagId = Number(tagItem?.id)
      if (!this.canOpenTagMenu || !Number.isInteger(tagId) || this.tagMenuBusy) return

      this.tagMenuError = ''
      for (const imageId of this.selectedImageIds) {
        const nextIds = this.sortTagIdsByName([...(this.tagMenuDraftByImageId[imageId] || [])])
        if (!nextIds.includes(tagId)) {
          nextIds.push(tagId)
        }
        this.tagMenuDraftByImageId[imageId] = this.sortTagIdsByName(nextIds)
      }

      const normalizedTag = this.buildTagLookupEntry(tagItem)
      if (normalizedTag) {
        this.tagLookupMap = {
          ...this.tagLookupMap,
          [normalizedTag.id]: normalizedTag,
        }
      }
      this.refreshTagMenuExistingTags()
    },

    async removeTagFromMenu(tagItem) {
      const tagId = Number(tagItem?.id)
      if (!this.canOpenTagMenu || !Number.isInteger(tagId) || this.tagMenuBusy) return

      this.tagMenuError = ''
      for (const imageId of this.selectedImageIds) {
        const nextIds = (this.tagMenuDraftByImageId[imageId] || []).filter(id => id !== tagId)
        this.tagMenuDraftByImageId[imageId] = this.sortTagIdsByName(nextIds)
      }
      this.refreshTagMenuExistingTags()
    },

    async applyAutoTagFromMenu() {
      if (!this.canOpenTagMenu || this.tagMenuBusy) return
      this.tagMenuBusy = true
      this.tagMenuError = ''

      try {
        const res = await fetch(`${API_BASE}/api/images/tags/filename-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_ids: this.selectedImageIds,
            apply: false,
            merge_mode: 'append_unique',
            include_tokens: false,
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload.detail || `HTTP ${res.status}`)
        }

        const payload = await res.json()
        const nextTagMap = { ...this.tagLookupMap }
        for (const row of (payload?.items || [])) {
          if (Number.isInteger(row?.image_id) && Array.isArray(row?.matched_tag_ids)) {
            const imageId = row.image_id
            const beforeIds = this.sortTagIdsByName([...(this.tagMenuDraftByImageId[imageId] || [])])
            const mergedSet = new Set(beforeIds)
            for (const tagId of row.matched_tag_ids) {
              if (Number.isInteger(tagId)) mergedSet.add(tagId)
            }
            this.tagMenuDraftByImageId[imageId] = this.sortTagIdsByName(Array.from(mergedSet))
          }
          for (const tag of (row?.matched_tags || [])) {
            const normalizedTag = this.buildTagLookupEntry(tag)
            if (!normalizedTag) continue
            nextTagMap[normalizedTag.id] = normalizedTag
          }
        }
        this.tagLookupMap = nextTagMap
        this.refreshTagMenuExistingTags()
      } catch (err) {
        this.tagMenuError = `自动标签失败：${err?.message || '未知错误'}`
      } finally {
        this.tagMenuBusy = false
      }
    },

    async confirmTagMenuChanges() {
      if (!this.canOpenTagMenu || !this.tagMenuDirty || this.tagMenuBusy) return

      this.tagMenuBusy = true
      this.tagMenuError = ''
      try {
        const changedImageIds = this.selectedImageIds.filter((imageId) => {
          const beforeIds = this.sortTagIdsByName([...(this.tagMenuOriginalByImageId[imageId] || [])])
          const afterIds = this.sortTagIdsByName([...(this.tagMenuDraftByImageId[imageId] || [])])
          if (beforeIds.length !== afterIds.length) return true
          for (let index = 0; index < beforeIds.length; index++) {
            if (beforeIds[index] !== afterIds[index]) return true
          }
          return false
        })

        const changedTagIds = new Set()
        for (const imageId of changedImageIds) {
          for (const tagId of (this.tagMenuDraftByImageId[imageId] || [])) {
            if (Number.isInteger(tagId) && tagId > 0) {
              changedTagIds.add(tagId)
            }
          }
        }

        for (const imageId of changedImageIds) {
          const res = await fetch(`${API_BASE}/api/images/tags/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_ids: [imageId],
              tag_ids: this.sortTagIdsByName([...(this.tagMenuDraftByImageId[imageId] || [])]),
              merge_mode: 'replace',
            }),
          })
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}))
            throw new Error(payload.detail || `HTTP ${res.status}`)
          }
        }

        if (changedImageIds.length) {
          const changedIdSet = new Set(changedImageIds)
          const nextItems = this.sourceItems.map((item) => {
            if (item?.type !== 'image' || !Number.isInteger(item?.id)) return item
            if (!changedIdSet.has(item.id)) return item
            return {
              ...item,
              tags: this.sortTagIdsByName([...(this.tagMenuDraftByImageId[item.id] || [])]),
            }
          })
          this.applySourceItems(nextItems)
        }

        await this.ensureTagLabelsLoaded(true, this.sourceItems, Array.from(changedTagIds))
        this.closeTagMenu()
      } catch (err) {
        this.tagMenuError = `标签回写失败：${err?.message || '未知错误'}`
      } finally {
        this.tagMenuBusy = false
      }
    },

    async editTagMetadataFromMenu(tagItem) {
      const tagId = Number(tagItem?.id)
      if (!this.canOpenTagMenu || !Number.isInteger(tagId) || this.tagMenuBusy) return

      this.tagMenuBusy = true
      this.tagFormError = ''
      this.tagMenuError = ''
      try {
        const [detail, existingNames] = await Promise.all([
          this.fetchTagDetail(tagId),
          this.fetchTagFormExistingNames(),
        ])
        this.tagFormMode = 'edit'
        this.tagFormTag = detail
        this.tagFormExistingNames = existingNames
        this.tagFormVisible = true
      } catch (err) {
        this.tagMenuError = `标签详情读取失败：${err?.message || '未知错误'}`
      } finally {
        this.tagMenuBusy = false
      }
    },

    async addNewTagFromMenu() {
      if (!this.canOpenTagMenu || this.tagMenuBusy) return

      this.tagMenuBusy = true
      this.tagFormError = ''
      this.tagMenuError = ''
      try {
        const [draftTag, existingNames] = await Promise.all([
          this.reserveTagDraft(),
          this.fetchTagFormExistingNames(),
        ])
        this.tagFormMode = 'create'
        this.tagFormTag = draftTag
        this.tagFormExistingNames = existingNames
        this.tagFormVisible = true
      } catch (err) {
        this.tagMenuError = `新建标签初始化失败：${err?.message || '未知错误'}`
      } finally {
        this.tagMenuBusy = false
      }
    },

    async submitTagForm(payload) {
      const mode = this.tagFormMode
      const tagId = mode === 'create'
        ? Number(this.tagFormTag?.id)
        : Number(payload?.id || this.tagFormTag?.id)
      if (!Number.isInteger(tagId) || this.tagFormSaving) return

      this.tagFormSaving = true
      this.tagFormError = ''
      try {
        const requestBody = mode === 'create'
          ? { ...payload, created_by: 'admin' }
          : payload
        const res = await fetch(`${API_BASE}/api/tags/${tagId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        if (!res.ok) {
          const responsePayload = await res.json().catch(() => ({}))
          throw new Error(responsePayload.detail || `HTTP ${res.status}`)
        }

        const savedTag = await res.json()
        this.resetTagFormState()
        await this.refreshTagCollectionsAfterSave(savedTag, { attachToSelection: mode === 'create' })
      } catch (err) {
        this.tagFormError = `标签保存失败：${err?.message || '未知错误'}`
      } finally {
        this.tagFormSaving = false
      }
    },

    tagTextForItem(item) {
      const ids = Array.isArray(item?.tags)
        ? item.tags.filter(id => Number.isInteger(id))
        : []
      if (!ids.length) return '无标签'

      const names = []
      let allResolved = true
      for (const id of ids) {
        if (!Object.prototype.hasOwnProperty.call(this.tagLookupMap, id)) {
          allResolved = false
          continue
        }
        const label = this.tagLookupMap[id]?.displayName || ''
        if (label) names.push(label)
      }

      if (names.length) return names.join(' · ')
      if (!allResolved && this.tagsLoading) return '加载标签中...'
      return '无标签'
    },

    detailTagTextForItem(item) {
      if (item?.type !== 'image') return ''
      const ids = Array.isArray(item?.tags)
        ? item.tags.filter(id => Number.isInteger(id))
        : []
      if (!ids.length) return ''

      const sortedIds = this.sortTagIdsByName(ids)
      const names = []
      let allResolved = true
      for (const id of sortedIds) {
        if (!Object.prototype.hasOwnProperty.call(this.tagLookupMap, id)) {
          allResolved = false
          continue
        }
        const label = this.tagLookupMap[id]?.displayName || ''
        if (label) names.push(label)
      }

      if (names.length) return names.join(' · ')
      if (!allResolved && this.tagsLoading) return '加载标签中...'
      return ''
    },

    collectMissingTagIds(items = this.items) {
      const result = []
      const seen = new Set()
      for (const item of (Array.isArray(items) ? items : [])) {
        if (item?.type !== 'image' || !Array.isArray(item.tags)) continue
        for (const id of item.tags) {
          if (!Number.isInteger(id)) continue
          if (seen.has(id)) continue
          seen.add(id)
          if (!Object.prototype.hasOwnProperty.call(this.tagLookupMap, id)) {
            result.push(id)
          }
        }
      }
      return result
    },

    async ensureTagLabelsLoaded(force = false, items = null, refreshTagIds = []) {
      if (!force && this.selectionInfoMode !== 'tags') return
      const missingIds = this.collectMissingTagIds(items || this.items)
      const explicitRefreshIds = normalizeFilterIntArray(refreshTagIds)
      const requestIds = normalizeFilterIntArray([...missingIds, ...explicitRefreshIds])
      if (!requestIds.length) return

      const requestSerial = ++this.tagFetchSerial
      const nextMap = { ...this.tagLookupMap }
      this.tagsLoading = true

      try {
        for (let i = 0; i < requestIds.length; i += TAG_BATCH_SIZE) {
          const chunk = requestIds.slice(i, i + TAG_BATCH_SIZE)
          const res = await fetch(`${API_BASE}/api/tags?ids=${chunk.join(',')}&limit=${chunk.length}`)
          if (!res.ok) continue
          const data = await res.json()
          const returnedIds = new Set()
          for (const tag of (data.items || [])) {
            const normalizedTag = this.buildTagLookupEntry(tag)
            if (!normalizedTag) continue
            returnedIds.add(tag.id)
            nextMap[tag.id] = normalizedTag
          }
          for (const id of chunk) {
            if (!returnedIds.has(id) && !Object.prototype.hasOwnProperty.call(nextMap, id)) {
              nextMap[id] = {
                id,
                name: '',
                displayName: '',
                color: '',
                borderColor: '',
                backgroundColor: '',
              }
            }
          }
        }

        if (requestSerial === this.tagFetchSerial) {
          this.tagLookupMap = nextMap
        }
      } catch {
        // ignore tag fetch failures and keep filename mode available
      } finally {
        if (requestSerial === this.tagFetchSerial) {
          this.tagsLoading = false
        }
      }
    },

    openConfirmDialog(options = {}) {
      this.confirmDialog = {
        ...createDialogState(),
        ...options,
        visible: true,
      }
    },

    showMessage(type, text) {
      this.messageType = type
      this.messageText = text
    },

    closeConfirmDialog() {
      if (this.confirmDialog.busy) return
      this.confirmDialog = createDialogState()
    },

    async handleConfirmDialogConfirm() {
      if (this.confirmDialog.busy) return
      const onConfirm = this.confirmDialog.onConfirm
      if (typeof onConfirm !== 'function') {
        this.closeConfirmDialog()
        return
      }

      this.confirmDialog = {
        ...this.confirmDialog,
        busy: true,
      }

      let followupDialog = null
      try {
        followupDialog = await onConfirm()
      } finally {
        this.confirmDialog = createDialogState()
      }

      if (followupDialog) {
        this.openConfirmDialog(followupDialog)
      }
    },

    moveSelectedToTrash() {
      if (!this.selectedCount || this.actionBusy) return
      const label = this.selectionTypeLock === 'album'
        ? `确认删除已选中的 ${this.selectedCount} 个相册吗？`
        : `确认删除已选中的 ${this.selectedCount} 张图片吗？`
      this.openConfirmDialog({
        title: '移入回收站',
        message: `${label}\n原始文件会从 media 中移走，之后可在回收站中还原。`,
        confirmLabel: '移入回收站',
        cancelLabel: '取消',
        tone: 'danger',
        busyLabel: '删除中…',
        onConfirm: () => this.executeMoveSelectedToTrash(),
      })
    },

    async executeMoveSelectedToTrash() {
      if (!this.selectedCount || this.actionBusy) return null

      this.actionBusy = true
      this.actionBusyTitle = '删除中'
      this.actionBusyText = '正在移动所选内容到回收站，请稍候…'

      const payload = {
        items: this.selectedEntries.map(({ item }) => (
          item.type === 'album'
            ? { type: 'album', album_path: item.album_path }
            : { type: 'image', image_id: item.id, media_rel_path: item.media_rel_path }
        ))
      }

      try {
        const res = await fetch(`${API_BASE}/api/trash/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          return {
            title: '移入回收站失败',
            message: `请求未成功完成，服务器返回 HTTP ${res.status}。`,
            confirmLabel: '知道了',
            tone: 'danger',
            showCancel: false,
          }
        }

        const data = await res.json()
        await this.loadData()
        if (Array.isArray(data.errors) && data.errors.length) {
          return {
            title: '移入回收站失败',
            message: data.errors.join('；'),
            confirmLabel: '知道了',
            tone: 'danger',
            showCancel: false,
          }
        }
        return null
      } catch (err) {
        return {
          title: '移入回收站失败',
          message: err?.message || '删除失败，请稍后重试。',
          confirmLabel: '知道了',
          tone: 'danger',
          showCancel: false,
        }
      } finally {
        this.actionBusy = false
        this.actionBusyTitle = ''
        this.actionBusyText = ''
      }
    },

    onReservedDeleteClick() {
      this.onSelectionDetailSecondaryAction()
    },

    restoreSelection() {
      if (!this.selectedCount || this.actionBusy) return
      this.closeSelectAllMenu()
      this.openConfirmDialog({
        title: '确认还原',
        message: `确认还原已选中的 ${this.selectedCount} 项吗？\n若目标位置已存在同名项目，系统会自动补编号避免覆盖。`,
        confirmLabel: '还原',
        cancelLabel: '取消',
        tone: 'accent',
        busyLabel: '还原中…',
        onConfirm: () => this.executeRestoreSelection(),
      })
    },

    async executeRestoreSelection() {
      if (!this.selectedCount || this.actionBusy) return null
      this.actionBusy = true
      this.actionBusyTitle = '还原中'
      this.actionBusyText = '正在还原所选内容，请稍候…'
      try {
        const res = await fetch(`${API_BASE}/api/trash/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry_ids: this.selectedEntries.map(({ item }) => item.id) }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.errors?.length) {
          this.showMessage('error', data.errors.join('；'))
        } else {
          this.showMessage('success', `已还原 ${data.restored} 项。`)
        }
        await this.loadData()
        return null
      } catch (err) {
        this.showMessage('error', err?.message || '还原失败')
        return null
      } finally {
        this.actionBusy = false
        this.actionBusyTitle = ''
        this.actionBusyText = ''
      }
    },

    hardDeleteSelection() {
      if (!this.selectedCount || this.actionBusy) return
      this.closeSelectAllMenu()
      this.openConfirmDialog({
        title: '确认彻底删除',
        message: `确认彻底删除已选中的 ${this.selectedCount} 项吗？\n此操作会直接移除 trash 中的文件，且无法恢复。`,
        confirmLabel: '彻底删除',
        cancelLabel: '取消',
        tone: 'danger',
        busyLabel: '删除中…',
        onConfirm: () => this.executeHardDeleteSelection(),
      })
    },

    async executeHardDeleteSelection() {
      if (!this.selectedCount || this.actionBusy) return null
      this.actionBusy = true
      this.actionBusyTitle = '删除中'
      this.actionBusyText = '正在彻底删除所选内容，请稍候…'
      try {
        const res = await fetch(`${API_BASE}/api/trash/hard-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry_ids: this.selectedEntries.map(({ item }) => item.id) }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.errors?.length) {
          this.showMessage('error', data.errors.join('；'))
        } else {
          this.showMessage('success', `已删除 ${data.deleted} 项。`)
        }
        await this.loadData()
        return null
      } catch (err) {
        this.showMessage('error', err?.message || '删除失败')
        return null
      } finally {
        this.actionBusy = false
        this.actionBusyTitle = ''
        this.actionBusyText = ''
      }
    },

    clearTrash() {
      if (!this.totalCount || this.actionBusy) return
      this.closeSelectAllMenu()
      this.openConfirmDialog({
        title: '确认清空回收站',
        message: '确认清空回收站吗？\n此操作会物理删除 trash 中的全部文件和目录，且无法恢复。',
        confirmLabel: '清空回收站',
        cancelLabel: '取消',
        tone: 'danger',
        busyLabel: '清空中…',
        onConfirm: () => this.executeClearTrash(),
      })
    },

    async executeClearTrash() {
      if (!this.totalCount || this.actionBusy) return null
      this.actionBusy = true
      this.actionBusyTitle = '清空中'
      this.actionBusyText = '正在清空回收站，请稍候…'
      try {
        const res = await fetch(`${API_BASE}/api/trash`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.errors?.length) {
          this.showMessage('error', data.errors.join('；'))
        } else {
          this.showMessage('success', `已清空回收站，共删除 ${data.deleted} 项。`)
        }
        await this.loadData()
        return null
      } catch (err) {
        this.showMessage('error', err?.message || '清空回收站失败')
        return null
      } finally {
        this.actionBusy = false
        this.actionBusyTitle = ''
        this.actionBusyText = ''
      }
    },

    async reloadContractItemsPreservingAnchor({ preserveSelection = true, reopenDetails = false, runAfterLoad = true } = {}) {
      const anchor = this.captureViewportAnchor()
      const selectionSnapshot = preserveSelection ? this.captureSelectionSnapshot() : null

      try {
        const payload = await this.pageContract.loadItems(this)
        this.albumInfo = payload?.album || null
        this.applyFetchedItems(payload?.items || [])
        this.lastPreviewRepairSignature = ''
        if (preserveSelection) {
          this.restoreSelectionSnapshot(selectionSnapshot)
        }
        if (anchor) {
          this.pendingViewAnchor = anchor
        }
        this.$nextTick(() => {
          this.refreshObservedGrid()
          if (runAfterLoad) {
            this.pageContract.afterLoad(this)
          }
          if (reopenDetails && this.selectedCount) {
            this.openSelectionDetails()
          }
        })
        return true
      } catch {
        return false
      }
    },

    async triggerSilentRepair() {
      if (!this.isTrashMode || this.reconcileInFlight) return
      this.reconcileInFlight = true
      try {
        const res = await fetch(`${API_BASE}/api/trash/reconcile`, { method: 'POST' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (data?.changed) {
          await this.reloadContractItemsPreservingAnchor({
            preserveSelection: true,
            reopenDetails: this.selectionDetailsOpen,
            runAfterLoad: false,
          })
        }
      } catch {
        // ignore silent reconcile failures
      } finally {
        this.reconcileInFlight = false
      }
    },
  },
}
