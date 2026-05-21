<template>
  <section class="map-management-page">
    <TianDiTuMapFrame />
  </section>
</template>

<script>
import TianDiTuMapFrame from '../components/map/TianDiTuMapFrame.vue'

export default {
  name: 'MapManagementPage',
  components: {
    TianDiTuMapFrame,
  },
}
</script>

<style scoped lang="css">
.map-management-page {
  height: 100%;
  min-height: 100%;
}
</style>