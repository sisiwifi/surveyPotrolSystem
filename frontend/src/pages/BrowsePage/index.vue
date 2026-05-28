<template>
  <section class="page page--paged">
    <BreadcrumbHeader
      :show-back="true"
      :crumbs="headerCrumbs"
      :item-count="totalCount"
      :show-sort="true"
      :sort-by="sortBy"
      :sort-dir="sortDir"
      @back="onPageBack"
      @update:sortBy="onSortModeSelect"
      @toggle-sort-dir="toggleSortDir"
    >
      <button
        v-for="action in pageHeaderActions"
        :key="action.key"
        class="browse-header__action"
        :class="action.className"
        type="button"
        :disabled="action.disabled"
        @click="runConfiguredHandler(action.handler)"
      >
        {{ action.label }}
      </button>

      <button
        ref="filterMenuButton"
        class="browse-header__action"
        :class="{ 'browse-header__action--active': filterMenuVisible || hasActiveBrowseFilter }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="filterMenuVisible ? 'true' : 'false'"
        @click="toggleFilterMenu"
      >
        筛选
      </button>

      <div class="vm-btns" role="group" aria-label="视图模式">
        <button
          class="vm-btn"
          :class="{ active: viewMode === 'grid' }"
          title="大缩略图"
          @click="switchViewMode('grid')"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/>
            <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
            <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
            <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/>
          </svg>
        </button>
        <button
          class="vm-btn"
          :class="{ active: viewMode === 'list' }"
          title="列表显示"
          @click="switchViewMode('list')"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/>
            <rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/>
            <rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/>
          </svg>
        </button>
        <button
          class="vm-btn"
          :class="{ active: selectionMode }"
          :title="selectionMode ? '退出选择模式' : '进入选择模式'"
          :aria-pressed="selectionMode ? 'true' : 'false'"
          @click="toggleSelectionMode()"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1L3 11L6 8.5L8 13L9.5 12.3L7.5 7.8L11 7.8Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </BreadcrumbHeader>

    <div ref="pageMain" class="page-main">
      <LoadingSpinner v-if="loading" />

      <div v-else-if="!items.length" class="empty-hint">
        <span class="empty-hint__icon">{{ emptyStateIcon }}</span>
        <p>{{ emptyStateText }}</p>
      </div>

      <div
        v-else-if="viewMode === 'grid'"
        ref="itemGrid"
        class="media-grid"
        :class="{ 'media-grid--selection': selectionMode }"
        :style="mediaGridStyle"
      >
        <div
          v-for="entry in visibleGridEntries"
          :key="itemKey(entry.item, entry.index)"
          class="selection-wrap media-grid__item"
          :class="{
            'selection-wrap--browse': !selectionMode,
            'selection-wrap--cover-picking': coverPickerMode && canPickContainerCoverItem(entry.item),
            'is-selected': isItemSelected(entry.item, entry.index),
            'is-disabled': isItemDisabled(entry.item),
            'is-route-focus': isRouteFocusItem(entry.item, entry.index),
          }"
          :data-index="entry.index"
          :data-select-index="entry.index"
          @pointerdown="onGridPointerDown($event, entry.item, entry.index)"
          @click="onGridItemClick($event, entry.item, entry.index)"
        >
          <MediaItemCard
            :src="shouldShowPreviewSkeleton(entry.item) || hasTerminalPreviewState(entry.item) ? '' : resolvedUrl(entry.item)"
            :alt="entry.item.name || ''"
            :info-text="displayInfoText(entry.item)"
            :info-tags="displayInfoTags(entry.item)"
            :info-title="selectionInfoMode === 'tags' ? '当前显示 Tag，点击切换为文件名' : '当前显示文件名，点击切换为 Tag'"
            :item-type="entry.item.type"
            :selected="isItemSelected(entry.item, entry.index)"
            :disabled="isItemDisabled(entry.item)"
            :show-selection-control="selectionMode"
            :cover-marked="Boolean(entry.item?.is_cover)"
            :media-badge-label="animatedBadgeLabel(entry.item)"
            :unavailable="hasTerminalPreviewState(entry.item)"
            @toggle-select="onItemSelectionButtonClick(entry.item, entry.index)"
            @toggle-info="toggleInfoDisplayMode"
            @details="onReservedDetailsClick(entry.item, entry.index)"
            @img-error="onMediaCardPreviewError(entry.item)"
          />
        </div>
      </div>

      <div v-else ref="itemGrid" class="list-view" :style="listViewStyle">
        <div
          v-for="entry in visibleListEntries"
          :key="entry.item.public_id || entry.item.id || entry.index"
          class="list-row"
          :class="{
            'list-row--selecting': selectionMode,
            'is-selected': isItemSelected(entry.item, entry.index),
            'is-disabled': isItemDisabled(entry.item),
            'is-route-focus': isRouteFocusItem(entry.item, entry.index),
          }"
          :data-index="entry.index"
          :data-select-index="entry.index"
          @pointerdown="onListPointerDown($event, entry.item, entry.index)"
          @click="onListRowClick($event, entry.item, entry.index)"
        >
          <button
            v-if="selectionMode"
            class="list-pick"
            type="button"
            :disabled="isItemDisabled(entry.item)"
            :aria-pressed="isItemSelected(entry.item, entry.index) ? 'true' : 'false'"
            :aria-label="isItemSelected(entry.item, entry.index) ? '取消选择' : '选择项目'"
            @pointerdown.stop
            @click.stop="onItemSelectionButtonClick(entry.item, entry.index)"
          >
            <span v-if="isItemSelected(entry.item, entry.index)" class="list-pick__mark">✓</span>
          </button>
          <div class="list-thumb-wrap" :class="{ 'list-thumb-wrap--cover-picking': coverPickerMode && canPickContainerCoverItem(entry.item) }">
            <div v-if="shouldShowPreviewSkeleton(entry.item)" class="list-thumb-skeleton" />
            <div v-else-if="hasTerminalPreviewState(entry.item)" class="list-thumb-unavailable">
              <span class="list-thumb-unavailable__label">不可用</span>
            </div>
            <img
              v-else
              :src="resolvedUrl(entry.item)"
              class="list-thumb-img"
              :alt="entry.item.name || ''"
              @load="onImgLoad(entry.item, $event)"
              @error="onPrimaryPreviewError(entry.item)"
            />
            <span v-if="animatedBadgeLabel(entry.item)" class="list-motion-badge">{{ animatedBadgeLabel(entry.item) }}</span>
            <span v-if="entry.item.is_cover" class="list-cover-badge" :class="{ 'list-cover-badge--stacked': animatedBadgeLabel(entry.item) }">封面</span>
          </div>
          <div class="list-main">
            <div class="list-title-row">
              <span v-if="entry.item.type === 'album'" class="list-type-pill">ALB</span>
              <span class="list-name">{{ entry.item.name || entry.item.full_filename || '未知文件' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="items.length"
        ref="paginationHost"
        class="page-pagination-host"
        :class="{ 'page-pagination-host--selection': selectionMode }"
      >
        <PagePaginationBar
          :current-page="activePaginationConfig.currentPage"
          :total-pages="activePaginationConfig.totalPages"
          :page-size="activePaginationConfig.pageSize"
          :page-size-options="activePaginationConfig.pageSizeOptions"
          @update:page="onPaginationPageChange"
          @update:pageSize="onPaginationPageSizeChange"
        />
      </div>
    </div>

    <SelectionIsland
      v-if="selectionMode"
      :floating-style="selectionIslandStyle"
      collapse-label="收起选择操作"
      expand-label="展开选择操作"
      @collapsed-change="onSelectionIslandCollapsedChange"
    >
      <span class="selection-island__count">{{ selectionSummaryText }}</span>
      <button
        v-for="action in pageSelectionActions"
        :key="action.key"
        class="selection-island__btn"
        :class="action.className"
        type="button"
        :disabled="action.disabled"
        @click="runConfiguredHandler(action.handler)"
      >{{ action.label }}</button>
      <div
        ref="selectionIslandMenu"
        class="selection-island__menu-wrap"
        :class="{ 'is-open': selectAllMenuOpen }"
      >
        <button
          class="selection-island__btn"
          type="button"
          :disabled="actionBusy"
          :aria-expanded="hasMixedSelectableTypes ? (selectAllMenuOpen ? 'true' : 'false') : 'false'"
          @click="handleSelectAllButtonClick"
        >全选</button>
        <div v-if="hasMixedSelectableTypes" class="selection-island__submenu">
          <button class="selection-island__submenu-btn" type="button" @click="onSelectAllTypeClick('album')">相册</button>
          <button class="selection-island__submenu-btn" type="button" @click="onSelectAllTypeClick('image')">图片</button>
        </div>
      </div>
      <button class="selection-island__btn" type="button" :disabled="actionBusy" @click="clearSelection">取消选择</button>
    </SelectionIsland>

    <SelectionDetailOverlay
      :visible="selectionDetailsOpen"
      :layer-style="selectionDetailsLayerStyle"
      :panel-style="selectionDetailsPanelStyle"
      :preview-items="selectionDetailPreviewItems"
      :is-multi="selectionDetailPreviewItems.length > 1"
      :name-field="selectionDetailNameField"
      :category-field="selectionDetailCategoryField"
      :tags-field="selectionDetailTagsField"
      :size-field="selectionDetailSizeField"
      :size-label="selectionDetailSizeLabel"
      :imported-field="selectionDetailImportedField"
      :created-field="selectionDetailCreatedField"
      :raw-name="selectionDetailRawName"
      :raw-category-id="selectionDetailRawCategoryId"
      :raw-created-at="selectionDetailRawCreatedAt"
      :primary-action-label="selectionDetailPolicy.primaryActionLabel"
      :primary-action-tone="selectionDetailPolicy.primaryActionTone"
      :can-open-primary-action="selectionDetailPolicy.canOpenPrimaryAction"
      :primary-action-disabled="selectionDetailPolicy.primaryActionDisabled"
      :secondary-action-label="selectionDetailPolicy.secondaryActionLabel"
      :secondary-action-tone="selectionDetailPolicy.secondaryActionTone"
      :secondary-action-disabled="selectionDetailPolicy.secondaryActionDisabled"
      :metadata-permissions="selectionDetailPolicy.metadataPermissions"
      :can-open-collection-menu="canOpenCollectionMenu"
      :collection-menu-disabled="collectionMenuBusy || actionBusy"
      :can-edit-tags="canOpenTagMenu"
      :tag-menu-disabled="tagMenuBusy || actionBusy"
      :can-edit-name="canEditSelectionName"
      :can-edit-category="canEditSelectionCategory"
      :can-edit-created-at="canEditSelectionCreatedAt"
      :edit-busy="metadataEditBusy"
      :current-date-group="dateGroup"
      :category-options="selectionDetailCategoryOptions"
      @close="closeSelectionDetails"
      @open-collection-menu="openCollectionMenu"
      @open-tag-menu="openTagMenu"
      @tag-click="openBrowseTagFromSelectionDetails"
      @open-primary="openPrimaryFromDetails"
      @secondary-action="onSelectionDetailSecondaryAction"
      @preview-error="onSelectionDetailPreviewError"
      @submit-name-edit="submitSelectionNameEdit"
      @submit-category-edit="submitSelectionCategoryEdit"
      @submit-created-edit="submitSelectionCreatedEdit"
    />

    <TagMenuDialog
      :visible="tagMenuVisible"
      :busy="tagMenuBusy"
      :search-busy="tagMenuSearchBusy"
      :error-message="tagMenuError"
      :query="tagMenuQuery"
      :existing-tags="tagMenuExistingTags"
      :suggestions="tagMenuSuggestions"
      :recent-tags="tagMenuRecentTags"
      :confirm-disabled="!tagMenuDirty"
      @close="closeTagMenu"
      @cancel="closeTagMenu"
      @confirm="confirmTagMenuChanges"
      @query-change="onTagMenuQueryChange"
      @add-tag="addTagFromMenu"
      @remove-tag="removeTagFromMenu"
      @edit-tag="editTagMetadataFromMenu"
      @add-new-tag="addNewTagFromMenu"
      @auto-tag="applyAutoTagFromMenu"
    />

    <CollectionMenuDialog
      :visible="collectionMenuVisible"
      :busy="collectionMenuBusy"
      :search-busy="collectionMenuSearchBusy"
      :error-message="collectionMenuError"
      :query="collectionMenuQuery"
      :selection-items="collectionMenuSelectionItems"
      :suggestions="collectionMenuSuggestions"
      :selected-collection="collectionMenuSelectedCollection"
      :item-actions="collectionMenuActionItems"
      :confirm-disabled="collectionMenuConfirmDisabled"
      :confirm-label="collectionMenuConfirmLabel"
      @close="closeCollectionMenu"
      @cancel="closeCollectionMenu"
      @confirm="confirmCollectionMenuChanges"
      @query-change="onCollectionMenuQueryChange"
      @select-collection="handleCollectionMenuSelect"
      @item-action-change="setCollectionMenuImageAction"
    />

    <TagFormDialog
      :visible="tagFormVisible"
      :saving="tagFormSaving"
      :mode="tagFormMode"
      :initial-tag="tagFormTag"
      :existing-names="tagFormExistingNames"
      :error-message="tagFormError"
      @close="closeTagForm"
      @submit="submitTagForm"
    />

    <ConfirmationDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-label="confirmDialog.confirmLabel"
      :cancel-label="confirmDialog.cancelLabel"
      :tone="confirmDialog.tone"
      :show-cancel="confirmDialog.showCancel"
      :busy="confirmDialog.busy"
      :busy-label="confirmDialog.busyLabel"
      @cancel="closeConfirmDialog"
      @confirm="handleConfirmDialogConfirm"
    />

    <ActionProgressOverlay
      :visible="actionBusy"
      :title="actionBusyTitleResolved"
      :message="actionBusyMessageResolved"
    />

    <BrowseFilterMenu
      :visible="filterMenuVisible"
      :anchor-rect="filterMenuAnchorRect"
      :filter="appliedBrowseFilter"
      :tags="availableBrowseFilterTags"
      :categories="availableBrowseFilterCategories"
      :file-types="availableBrowseFilterFileTypes"
      :viewport-width="viewportWidth"
      :viewport-height="viewportHeight"
      @close="closeFilterMenu"
      @apply="applyBrowseFilter"
    />
  </section>
</template>

<script>
/**
 * 通用二级浏览壳，负责承接 calendar、search-results、gallery、collection、tag、trash 等详情页。
 * 页面只保留组件装配与样式；共享状态、计算与动作逻辑统一收敛到 pages/BrowsePage/logic 目录。
 * 相关文档：frontend/Frontend_README.md、frontend/commonBrowsePage.md。
 */
import LoadingSpinner from '../../components/LoadingSpinner.vue'
import BreadcrumbHeader from '../../components/BreadcrumbHeader.vue'
import BrowseFilterMenu from './components/BrowseFilterMenu.vue'
import MediaItemCard from './components/MediaItemCard.vue'
import ConfirmationDialog from '../../components/ConfirmationDialog.vue'
import ActionProgressOverlay from '../../components/ActionProgressOverlay.vue'
import PagePaginationBar from '../../components/PagePaginationBar.vue'
import SelectionIsland from '../../components/SelectionIsland.vue'
import SelectionDetailOverlay from '../../components/SelectionDetailOverlay.vue'
import CollectionMenuDialog from './components/CollectionMenuDialog.vue'
import TagMenuDialog from './components/TagMenuDialog.vue'
import TagFormDialog from '../../components/TagFormDialog.vue'
import { resolveAnimatedBadgeLabel } from '../../utils/animatedMedia'
import { createBrowsePageData } from './logic/shared'
import computedMixin from './logic/computedMixin'
import lifecycleMixin from './logic/lifecycleMixin'
import layoutMixin from './logic/layoutMixin'
import dataMixin from './logic/dataMixin'
import selectionMixin from './logic/selectionMixin'
import dialogsMixin from './logic/dialogsMixin'

export default {
  name: 'BrowsePage',
  mixins: [computedMixin, lifecycleMixin, layoutMixin, dataMixin, selectionMixin, dialogsMixin],
  components: {
    LoadingSpinner,
    BreadcrumbHeader,
    BrowseFilterMenu,
    MediaItemCard,
    ConfirmationDialog,
    ActionProgressOverlay,
    PagePaginationBar,
    SelectionIsland,
    SelectionDetailOverlay,
    CollectionMenuDialog,
    TagMenuDialog,
    TagFormDialog,
  },

  data() {
    return createBrowsePageData()
  },

  methods: {
    animatedBadgeLabel: resolveAnimatedBadgeLabel,
  },
}
</script>

<style scoped lang="css">
.page {
  @apply flex flex-col gap-6;
  position: relative;
}

.page-main {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
}

.page--paged {
  height: calc(100dvh - 5rem);
  min-height: calc(100vh - 5rem);
  overflow: hidden;
}

.page--paged .empty-hint,
.page--paged .media-grid,
.page--paged .list-view {
  flex: 1 1 auto;
  min-height: 0;
}

.page--paged .media-grid,
.page--paged .list-view {
  overflow-y: auto !important;
}

.page--paged .selection-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.page--paged .selection-wrap :deep(.media-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page--paged .selection-wrap :deep(.media-card__visual) {
  flex: none;
  min-height: 0;
  aspect-ratio: 4 / 3;
}

.page--paged .empty-hint {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.selection-wrap.is-route-focus,
.list-row.is-route-focus {
  outline: 3px solid rgba(16, 185, 129, 0.9);
  outline-offset: 4px;
  box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.18), 0 20px 38px rgba(16, 185, 129, 0.2);
  border-radius: 18px;
  animation: browse-route-focus-pulse 1.8s ease-out 1;
}

@keyframes browse-route-focus-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.34), 0 14px 28px rgba(16, 185, 129, 0.16);
  }

  100% {
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.18), 0 20px 38px rgba(16, 185, 129, 0.2);
  }
}

.vm-btns {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
}

.vm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
}

.vm-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1e293b;
}

.vm-btn.active {
  background: #fff;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,0,0,.12);
}

.vm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.browse-header__action {
  height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 0 0.8rem;
  background: rgba(255, 255, 255, 0.92);
  color: #334155;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease;
}

.browse-header__action:hover:not(:disabled) {
  border-color: rgba(100, 116, 139, 0.34);
  background: #f8fafc;
  color: #0f172a;
}

.browse-header__action--active {
  border-color: rgba(15, 23, 42, 0.9);
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
}

.browse-header__action--active:hover:not(:disabled) {
  border-color: rgba(15, 23, 42, 0.9);
  background: #0f172a;
  color: #ffffff;
}

.browse-header__action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.browse-header__action--danger {
  border-color: rgba(234, 88, 12, 0.22);
  background: rgba(255, 237, 213, 0.86);
  color: #b45309;
}

.browse-header__action--danger:hover:not(:disabled) {
  border-color: rgba(234, 88, 12, 0.3);
  background: rgba(255, 237, 213, 1);
}

.empty-hint {
  @apply border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl py-16 text-center text-slate-400 text-sm;
}

.empty-hint__icon { @apply text-5xl block mb-3; }

.page-note {
  margin: 0.5rem 0 0;
  padding: 0.7rem 0.95rem;
  border-radius: 12px;
  font-size: 0.88rem;
  font-weight: 700;
}

.page-note--success {
  color: #166534;
  background: rgba(220, 252, 231, 0.88);
  border: 1px solid rgba(34, 197, 94, 0.18);
}

.page-note--error {
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.92);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(var(--browse-grid-columns, 3), minmax(0, 1fr));
  gap: var(--browse-grid-gap, 1rem);
  align-items: start;
  align-content: start;
  padding-right: 0.2rem;
}

.media-grid__item {
  min-width: 0;
}

.selection-wrap {
  min-width: 0;
  cursor: pointer;
  user-select: none;
  touch-action: pan-y;
}

.selection-wrap--cover-picking :deep(.media-card) {
  border-color: rgba(15, 23, 42, 0.82);
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.16), 0 18px 36px rgba(15, 23, 42, 0.16);
}

.selection-wrap.is-disabled {
  cursor: not-allowed;
}

.list-thumb-unavailable {
  @apply w-full h-full rounded-xl overflow-hidden flex items-center justify-center;
  background: linear-gradient(180deg, #cbd5e1 0%, #e2e8f0 100%);
}

.list-thumb-unavailable__label {
  @apply text-slate-600 text-xs font-semibold tracking-wide select-none;
}

@keyframes skeleton-wave {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes skeleton-fade {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

.list-cover-badge,
.list-motion-badge {
  position: absolute;
  top: 10px;
  min-width: 44px;
  height: 24px;
  padding: 0 0.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  color: #ffffff;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  white-space: nowrap;
  word-break: keep-all;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22);
  pointer-events: none;
}

.list-cover-badge {
  right: 10px;
}

.list-motion-badge {
  left: 10px;
  background: rgba(15, 23, 42, 0.84);
}

.list-view {
  display: flex;
  flex-direction: column;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms ease, box-shadow 150ms ease, opacity 150ms ease;
}

.list-row:hover { background: #f1f5f9; }

.list-row.is-selected {
  background: #e8eef8;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.list-row.is-disabled {
  opacity: 0.45;
}

.list-pick {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(15, 23, 42, 0.85);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  padding: 0;
  cursor: pointer;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
}

.list-pick:hover:not(:disabled) {
  transform: scale(1.04);
}

.list-pick:disabled {
  cursor: not-allowed;
}

.list-row.is-selected .list-pick {
  border-color: #0f172a;
  background: #0f172a;
}

.list-pick__mark {
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
}

.list-thumb-wrap {
  position: relative;
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: #e2e8f0;
}

.list-thumb-wrap--cover-picking {
  box-shadow: inset 0 0 0 2px rgba(15, 23, 42, 0.26);
}

.list-cover-badge {
  top: 6px;
  right: 6px;
  min-width: 34px;
  height: 18px;
  padding: 0 0.35rem;
  font-size: 0.54rem;
}

.list-motion-badge {
  top: 6px;
  left: 6px;
  min-width: 34px;
  height: 18px;
  padding: 0 0.35rem;
  font-size: 0.54rem;
}

.list-cover-badge--stacked {
  top: 28px;
}

.list-thumb-skeleton {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: skeleton-wave 1.4s ease-in-out infinite;
}

.list-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.list-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.list-title-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  width: 100%;
}

.list-type-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.4rem;
  height: 1.55rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.list-name {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-pagination-host {
  padding-top: 0.12rem;
}

.page-pagination-host--selection {
  padding-bottom: 0.08rem;
}

@media (orientation: landscape) {
  .selection-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (orientation: portrait) {
  .selection-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.8rem;
  }
}

.page--paged .selection-island {
  position: absolute;
  right: 1.5rem;
  bottom: 4.25rem;
}
</style>

