<script setup lang="ts">
/** A town's notice board (screens/notices.ts): what is posted, and the choice to take it up. */
import { computed } from 'vue';
import type { NoticesScreen } from '../notices';

const props = defineProps<{ screen: NoticesScreen }>();
const screen = props.screen;
const ui = screen.state;
const notices = computed(() => (void ui.version, screen.notices));
const reading = computed(() => (void ui.version, screen.reading));
const STATE: Record<string, string> = { active: 'You have taken this up.', done: 'You have done this.', failed: 'You gave this up.', expired: 'The time for this ran out.', overtaken: 'This is no more.' };
</script>

<template>
  <div class="notices card">
    <header class="row">
      <div class="name">The notice board, {{ screen.site.name }}</div>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <p v-if="reading" class="dim">You read the notices...</p>
    <p v-else-if="!notices.length" class="dim">Nothing is posted but old, torn notices.</p>
    <div v-for="(q, i) in notices" :key="q.id" class="notice">
      <div class="title">{{ q.title }}</div>
      <p>{{ q.text }}</p>
      <div class="row">
        <span class="dim">Posted by {{ q.giver.kind === 'place' ? q.giver.name : q.giver.given }}. Pays {{ q.reward.copper }} copper.</span>
        <span class="grow" />
        <button v-if="q.state === 'offered'" @click="screen.take(q)"><kbd v-if="i < 9">{{ i + 1 }}</kbd> Take it up</button>
        <span v-else class="dim">{{ STATE[q.state] }}</span>
      </div>
    </div>
    <p v-if="ui.said" class="said">{{ ui.said }}</p>
  </div>
</template>

<style scoped>
.notices { width: min(600px, 94vw); max-height: 88vh; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.name { font-size: 1.2em; color: var(--accent); }
.notice { border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; }
.notice p { margin: 4px 0; }
.title { font-weight: bold; }
.said { color: var(--accent); }
</style>
