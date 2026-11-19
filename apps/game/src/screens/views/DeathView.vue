<script setup lang="ts">
/** The wanderer is dead: who, of what, and how long they lasted (combat.md, permadeath). */
import type { DeathScreen } from '../play';

const props = defineProps<{ screen: DeathScreen }>();
const screen = props.screen;
const d = screen.dead;
const days = Math.floor(d.at / 86400) + 1;
</script>

<template>
  <div class="death card">
    <h2>{{ d.name }} is dead</h2>
    <p>Dead of {{ d.cause }}, on day {{ days }}, at {{ screen.place }}.</p>
    <p v-if="screen.scars.length" class="dim">They bore {{ screen.scars.join('; ') }}.</p>
    <p class="dim">Death ends the game. The world goes on without them.</p>
    <div class="acts">
      <button class="primary" @click="screen.toTitle()">Return to the title</button>
      <button @click="screen.close()">Look at the map a last time</button>
    </div>
  </div>
</template>

<style scoped>
.death { width: min(460px, 92vw); }
.death h2 { margin: 0; font-weight: 500; color: #c0392b; }
.death p { margin: 4px 0; }
.acts { display: flex; gap: 8px; margin-top: 10px; }
</style>
