<script setup lang="ts">
/** A notice board (screens/notices.ts): the notices as written, what is read of them, and taking one up. */
import { computed } from 'vue';
import type { NoticesScreen } from '../notices';
import { whoOf } from '../../game/quests';

const props = defineProps<{ screen: NoticesScreen }>();
const screen = props.screen;
const ui = screen.state;
const notices = computed(() => (void ui.version, screen.notices));
const reading = computed(() => (void ui.version, screen.reading));
const STATE: Record<string, string> = { active: 'You have taken this up.', done: 'You have done this.', failed: 'You gave this up.', expired: 'The time for this ran out.', overtaken: 'This is no more.', waived: 'This is settled.' };
</script>

<template>
  <div class="notices card">
    <header class="row">
      <div class="name">The notice board, {{ screen.site.name }}</div>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <p v-if="!screen.literate" class="dim">Notices are pinned to the board, but you cannot read: the marks on them mean nothing to you.</p>
    <p v-else-if="reading" class="dim">You look over the notices...</p>
    <p v-else-if="!notices.length" class="dim">Nothing is posted but old, torn notices.</p>
    <div v-for="(q, i) in notices" :key="q.id" class="notice">
      <div class="written" :title="screen.writing(q).text.tongue ? `Written in ${screen.writing(q).text.tongue}` : ''">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="screen.writing(q).title.svg" class="script" v-html="screen.writing(q).title.svg" />
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="screen.writing(q).text.svg" class="script" v-html="screen.writing(q).text.svg" />
      </div>
      <template v-if="ui.shown[q.id]">
        <template v-if="screen.writing(q).text.reading === 'all'">
          <div class="title">{{ q.title }}</div>
          <p>{{ q.text }}</p>
          <div class="dim">Posted by {{ whoOf(q.giver) }}. Pays {{ q.reward.copper }} copper.</div>
        </template>
        <template v-else>
          <p class="some">You make out: "{{ screen.writing(q).text.read }}"</p>
          <div class="dim">Posted by {{ whoOf(q.giver) }}. You can make out the sum: {{ q.reward.copper }} copper.</div>
        </template>
      </template>
      <div class="row">
        <span v-if="screen.why(q)" class="dim">{{ screen.why(q) }}</span>
        <span class="grow" />
        <button v-if="!ui.shown[q.id]" :disabled="!!screen.why(q)" @click="screen.read(q)"><kbd v-if="i < 9">{{ i + 1 }}</kbd> Read it<template v-if="screen.writing(q).text.tongue"> ({{ screen.writing(q).text.tongue }})</template></button>
        <button v-else-if="q.state === 'offered'" @click="screen.take(q)"><kbd v-if="i < 9">{{ i + 1 }}</kbd> Take it up</button>
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
.written { background: #e8dcc0; border-radius: 3px; padding: 6px 8px; margin-bottom: 4px; overflow-x: auto; }
.script :deep(svg) { max-width: 100%; height: auto; }
.title { font-weight: bold; }
.some { font-style: italic; }
.said { color: var(--accent); }
</style>
