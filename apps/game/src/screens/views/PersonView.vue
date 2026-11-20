<script setup lang="ts">
/** A person's card: their portrait, who they are, and what is known of them. */
import type { PersonScreen } from '../person';
import Portrait from '../../components/Portrait.vue';

const props = defineProps<{ screen: PersonScreen }>();
const card = props.screen.card;
</script>

<template>
  <div class="person card">
    <header class="row">
      <Portrait v-if="card.portrait" :spec="card.portrait" :scale="4" :class="{ faded: card.faded }" />
      <div class="about">
        <div class="name">{{ card.name }}</div>
        <div v-for="(l, i) in card.lines" :key="i" class="dim">{{ l }}</div>
      </div>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <section v-for="s in card.sections" :key="s.label">
      <h3>{{ s.label }}</h3>
      <p v-for="(l, i) in s.lines" :key="i">{{ l }}</p>
    </section>
  </div>
</template>

<style scoped>
.person { width: min(520px, 94vw); max-height: 88vh; overflow: auto; }
header { align-items: flex-start; flex-wrap: nowrap; }
header button { flex: none; white-space: nowrap; }
.about { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-size: 1.3em; color: var(--accent); }
.faded { filter: grayscale(1); opacity: 0.6; }
h3 { margin: 0 0 2px; color: var(--dim); font-size: 0.8em; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
p { margin: 2px 0; }
</style>
