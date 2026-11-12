<script setup lang="ts">
/** Sleeping or resting: where, how well, and for how long. */
import type { SleepScreen } from '../sleep';

const props = defineProps<{ screen: SleepScreen }>();
const screen = props.screen;
const n = screen.needs;
const q = screen.bedding.quality;
</script>

<template>
  <div class="sleep card">
    <h2>Sleep</h2>
    <p>You would sleep {{ screen.bedding.where }}<span v-if="q < 1">: not so restful as a bed</span>.</p>
    <p v-if="n" class="dim">
      {{ n.words().sleep || 'You are not tired' }}<span v-if="n.d.debt >= 1">, and short of sleep from nights before</span>.
      It is {{ Math.round(n.d.airC) }}°C.
    </p>
    <div class="acts">
      <button class="primary" @click="screen.sleep(screen.hoursToRest(), true)">Sleep until rested (about {{ screen.hoursToRest() }} h)</button>
      <button @click="screen.sleep(2)">Sleep 2 hours</button>
      <button @click="screen.rest(1)">Rest an hour, awake</button>
      <button @click="screen.close()">Not now</button>
    </div>
    <p class="dim">Sleep refills the day's stamina and pays off fatigue; a poor bed does it more slowly, and the cold ground is no pleasure.</p>
  </div>
</template>

<style scoped>
.sleep { width: min(460px, 92vw); }
.sleep h2 { margin: 0; font-weight: 500; color: var(--accent); }
.sleep p { margin: 2px 0; }
.acts { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
.acts button { text-align: left; }
</style>
