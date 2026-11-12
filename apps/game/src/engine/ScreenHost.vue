<script setup lang="ts">
/**
 * Draws the screen stack: every screen stays mounted while it is on the stack (so a paused game
 * keeps its map), and only those in sight are shown; popups are laid over the screen beneath.
 */
import type { ScreenManager } from './screens';

defineProps<{ manager: ScreenManager }>();
</script>

<template>
  <div class="screens">
    <div
      v-for="s in manager.stack"
      v-show="manager.isVisible(s)"
      :key="s.uid"
      class="screen-layer"
      :class="{ popup: s.popup, active: s.active }"
    >
      <component :is="s.view" :screen="s" />
    </div>
  </div>
</template>

<style scoped>
.screens {
  position: fixed;
  inset: 0;
}
.screen-layer {
  position: absolute;
  inset: 0;
  overflow: auto;
}
.screen-layer.popup {
  background: rgba(10, 10, 14, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
