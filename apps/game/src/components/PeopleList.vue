<script setup lang="ts">
/** The people of a character's life, each a small portrait and a line; a click opens their card. */
import type { PersonCard } from '../game/person-card';
import Portrait from './Portrait.vue';

defineProps<{ cards: PersonCard[] }>();
defineEmits<{ open: [card: PersonCard] }>();
</script>

<template>
  <div class="people">
    <button v-for="c in cards" :key="c.name" class="one" :title="`${c.name}: more about them`" @click="$emit('open', c)">
      <Portrait v-if="c.portrait" :spec="c.portrait" :scale="2" :class="{ faded: c.faded }" />
      <span class="text">
        <b>{{ c.name }}</b>
        <span class="dim">{{ c.lines[0] }}{{ c.faded ? ' (dead)' : '' }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.people { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; }
.one { display: flex; align-items: center; gap: 8px; padding: 5px; text-align: left; }
.one:hover { border-color: var(--accent); }
.text { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 0.92em; }
.faded { filter: grayscale(1); opacity: 0.6; }
</style>
