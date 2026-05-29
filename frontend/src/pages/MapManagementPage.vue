<template>
  <section class="map-management-page">
    <MapLibreMapFrame />
  </section>
</template>

<script>
/**
 * 地图主页面，当前主要把全屏 GIS 交互委托给 MapLibreMapFrame。
 * 用户从 /maps 进入；页面本身保持很薄，只负责承接 fullBleed 路由和 MapLibre 地图容器。
 * 如需扩展地图业务，优先下沉到 components/map 目录，避免把渲染、图层和交互都堆在本页。
 * 相关文档：frontend/Frontend_README.md。
 */
import MapLibreMapFrame from '../components/map/MapLibreMapFrame.vue'

export default {
  name: 'MapManagementPage',
  components: {
    MapLibreMapFrame,
  },
}
</script>

<style scoped lang="css">
.map-management-page {
  height: 100%;
  min-height: 100%;
}
</style>