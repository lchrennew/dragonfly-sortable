<script>
</script>
<script setup>
import { inject, ref, } from "vue";

defineProps({
  item: { type: [ String, Object ] },
  tag: { type: [ String, Object ] },
  selected: Boolean
});
const el = ref()

const keyGetter = inject('keyGetter')


</script>

<template>
  <component class="sortable-item" :is="tag" ref="el" :class="{selected}">
    <slot v-bind="{item, selected}"/>
  </component>
</template>

<style scoped>

</style>