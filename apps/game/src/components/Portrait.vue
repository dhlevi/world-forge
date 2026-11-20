<script setup lang="ts">
/** A person's portrait (game/portrait.ts) on a canvas, shown in whole pixels at `scale` times its size. */
import { onMounted, ref, watch } from 'vue';
import { PORTRAIT_PX, paintPortrait, type PortraitSpec } from '../game/portrait';

const props = withDefaults(defineProps<{ spec: PortraitSpec; scale?: number }>(), { scale: 2 });
const el = ref<HTMLCanvasElement>();

function draw(): void {
  const g = el.value?.getContext('2d');
  if (!g) return;
  const img = g.createImageData(PORTRAIT_PX, PORTRAIT_PX);
  img.data.set(paintPortrait(props.spec));
  g.putImageData(img, 0, 0);
}

onMounted(draw);
// Painted again only when what it shows has changed.
watch(() => JSON.stringify(props.spec), draw);
</script>

<template>
  <canvas ref="el" class="portrait" :width="PORTRAIT_PX" :height="PORTRAIT_PX" :style="{ width: `${PORTRAIT_PX * scale}px`, height: `${PORTRAIT_PX * scale}px` }" />
</template>

<style scoped>
.portrait { display: block; flex: none; image-rendering: pixelated; border: 1px solid var(--line); border-radius: 4px; }
</style>
