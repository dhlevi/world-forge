<script setup lang="ts">
/** Progress while a world is made or a game's first place is laid out. */
import type { ProgressScreen } from '../menus';

defineProps<{ screen: ProgressScreen }>();
</script>

<template>
  <div class="start">
    <section class="card">
      <p>{{ screen.state.stage }}…</p>
      <div class="bar"><div :style="{ width: `${Math.round(screen.state.pct * 100)}%` }" /></div>
    </section>
  </div>
</template>
