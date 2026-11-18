<script setup lang="ts">
/** The last few lines of the log, over the map's corner (the newest last and plainest). */
import { computed } from 'vue';

const props = defineProps<{ log: { t: string; text: string }[] }>();
const LINES = 8;
const last = computed(() => props.log.slice(-LINES));
</script>

<template>
  <div v-if="last.length" class="log">
    <div v-for="(m, i) in last" :key="i" :style="{ opacity: 0.45 + (0.55 * (i + 1)) / last.length }">
      <span class="t">{{ m.t.split(', ')[1] }}</span> {{ m.text }}
    </div>
  </div>
</template>
