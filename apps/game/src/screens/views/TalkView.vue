<script setup lang="ts">
/** A conversation (screens/talk.ts): the person, what has been said, and what to ask or try. */
import { computed, nextTick, ref, watch } from 'vue';
import type { TalkScreen } from '../talk';
import Portrait from '../../components/Portrait.vue';

const props = defineProps<{ screen: TalkScreen }>();
const screen = props.screen;
const ui = screen.state;
const talk = screen.talk;
const card = computed(() => (void ui.version, screen.card));
const lines = computed(() => (void ui.version, [...talk.lines]));
const options = computed(() => (void ui.version, talk.options()));
const mood = computed(() => (void ui.version, talk.mood()));
const log = ref<HTMLElement | null>(null);
watch(lines, () => nextTick(() => log.value && (log.value.scrollTop = log.value.scrollHeight)));
</script>

<template>
  <div class="talk card">
    <header class="row">
      <Portrait v-if="card.portrait" :spec="card.portrait" :scale="3" />
      <div class="about">
        <div class="name">{{ card.name }}</div>
        <div v-for="(l, i) in card.lines" :key="i" class="dim">{{ l }}</div>
        <div class="dim">They are {{ mood }}.</div>
      </div>
      <span class="grow" />
      <button @click="screen.ask('bye')">Leave (Esc)</button>
    </header>
    <div ref="log" class="said">
      <p v-for="(l, i) in lines" :key="i" :class="l.who">{{ l.who === 'you' ? `You: "${l.text}"` : l.text }}</p>
    </div>
    <div class="opts">
      <button v-for="(o, i) in options" :key="o.id" :disabled="!!o.why" :title="o.why ?? ''" @click="screen.ask(o.id)"><kbd v-if="i < 9">{{ i + 1 }}</kbd> {{ o.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.talk { width: min(640px, 94vw); max-height: 88vh; display: flex; flex-direction: column; gap: 8px; }
header { align-items: flex-start; flex-wrap: nowrap; }
header button { flex: none; white-space: nowrap; }
.about { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-size: 1.3em; color: var(--accent); }
.said { flex: 1; min-height: 120px; max-height: 40vh; overflow: auto; border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; }
.said p { margin: 3px 0; }
.said .you { color: var(--dim); }
.said .note { color: var(--dim); font-style: italic; }
.opts { display: flex; flex-direction: column; gap: 3px; }
.opts button { text-align: left; }
</style>
