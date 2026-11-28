<script setup lang="ts">
/** The journal (screens/journal.ts): the work in hand and done, and the story of each. */
import { computed } from 'vue';
import type { JournalScreen } from '../journal';

const props = defineProps<{ screen: JournalScreen }>();
const screen = props.screen;
const ui = screen.state;
const active = computed(() => (void ui.version, screen.inHand));
const past = computed(() => (void ui.version, screen.past));
const q = computed(() => (void ui.version, void ui.selected, screen.chosen));
const STATE: Record<string, string> = { active: 'In hand', done: 'Done', failed: 'Given up', expired: 'Run out of time', overtaken: 'No more' };
const day = (t: number) => `day ${Math.floor(t / 86400) + 1}`;
const LEVEL: Record<string, string> = { task: 'a task', job: 'a job', chapter: 'a chapter of a longer matter', story: 'a story', epic: 'an epic' };
const MARK: Record<string, string> = { fast: 'quickly', clean: 'cleanly', thorough: 'thoroughly', secret: 'unseen' };
</script>

<template>
  <div class="journal card">
    <header class="row">
      <div class="name">Your journal</div>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div class="cols">
      <div class="list">
        <h3>In hand</h3>
        <p v-if="!active.length" class="dim">Nothing. Notice boards and the people you meet may have work.</p>
        <button v-for="x in active" :key="x.id" :class="{ on: x.id === ui.selected }" @click="ui.selected = x.id">{{ x.title }}</button>
        <h3 v-if="past.length">Behind you</h3>
        <button v-for="x in past" :key="x.id" :class="{ on: x.id === ui.selected }" class="dim" @click="ui.selected = x.id">{{ x.title }}</button>
      </div>
      <div v-if="q" class="body">
        <div class="title">{{ q.title }} <span class="dim">({{ STATE[q.state] }})</span></div>
        <p>{{ q.text }}</p>
        <p class="dim">For {{ q.giver.kind === 'place' ? `${q.giver.name}, in ${q.giver.siteName}` : q.giver.kind === 'person' ? `${q.giver.given}, the ${q.giver.name}, of ${q.giver.siteName ?? 'the country'}` : q.giver.name }}<template v-if="q.reward.copper">; {{ q.reward.copper }} copper</template>. It is {{ LEVEL[q.level] }}.<template v-if="q.state === 'active' && q.deadline"> Wanted by {{ day(q.deadline) }}.</template></p>
        <p v-if="q.marks?.length" class="dim">Done {{ q.marks.map((m) => MARK[m]).join(', ') }}.</p>
        <template v-if="q.state === 'active'">
          <h3>{{ q.parts[q.parts.length - 1]?.title ?? 'To do' }}</h3>
          <p v-for="(l, i) in screen.todo(q)" :key="i">{{ l }}</p>
          <template v-if="screen.leads(q).length">
            <h3>Leads</h3>
            <p v-for="(l, i) in screen.leads(q)" :key="'l' + i" :class="{ dim: l.found }">{{ l.text }} ({{ l.where }}){{ l.found ? `: ${l.found}.` : '.' }}</p>
          </template>
        </template>
        <h3>What has happened</h3>
        <p v-for="(l, i) in screen.tell(q)" :key="'f' + i" class="fact">{{ l }}</p>
        <button v-if="q.state === 'active'" @click="screen.giveUp(q)">Give it up</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.journal { width: min(820px, 96vw); max-height: 88vh; display: flex; flex-direction: column; gap: 8px; }
.name { font-size: 1.3em; color: var(--accent); }
.cols { display: flex; gap: 12px; min-height: 0; overflow: auto; flex-wrap: wrap; }
.list { flex: 1 1 220px; display: flex; flex-direction: column; gap: 3px; }
.list button { text-align: left; }
.list button.on { border-color: var(--accent); }
.body { flex: 2 1 320px; }
.body p { margin: 4px 0; }
.title { font-weight: bold; }
.fact { color: var(--dim); }
h3 { margin: 8px 0 4px; }
</style>
