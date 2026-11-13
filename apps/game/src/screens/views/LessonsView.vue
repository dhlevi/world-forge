<script setup lang="ts">
/** Lessons at a place in town: the skills taught, how far the teacher can take you, and the fee. */
import { computed } from 'vue';
import type { LessonsScreen } from '../lessons';
import { moneyText } from '../../actors/components';
import { skillWord } from '../../actors/data/skills';
import { Inventory } from '../../actors/items/inventory';

const props = defineProps<{ screen: LessonsScreen }>();
const screen = props.screen;
const ui = screen.state;
const rows = computed(() => {
  void ui.version;
  return screen.courses.map((c) => ({ c, level: screen.level(c), why: screen.why(c), why3: screen.why(c, 3) }));
});
const purse = computed(() => {
  void ui.version;
  return screen.play.player?.get(Inventory)?.d.copper ?? 0;
});
</script>

<template>
  <div class="lessons card">
    <header class="row">
      <div>
        <h2>Lessons at {{ screen.place.name }}</h2>
        <div class="dim">A teacher can take you only so far; beyond that, practice teaches.</div>
      </div>
      <span class="grow" />
      <div class="dim">You have {{ moneyText(purse) }}</div>
      <button @click="screen.close()">Done (Esc)</button>
    </header>
    <div class="list">
      <div class="les head dim"><span>Skill</span><span>You</span><span>The teacher</span><span>Takes you to</span><span>An hour</span><span /></div>
      <div v-for="r in rows" :key="r.c.skill" class="les">
        <span>{{ r.c.name }}</span>
        <span>{{ r.level.toFixed(1) }} <span class="dim">{{ skillWord(r.level) }}</span></span>
        <span class="dim">{{ skillWord(r.c.teacher) }}</span>
        <span>{{ r.c.limit }}</span>
        <span>{{ moneyText(r.c.price) }}</span>
        <span class="btns">
          <button :disabled="!!r.why" :title="r.why ?? ''" @click="screen.learn(r.c, 1)">1 hour</button>
          <button :disabled="!!r.why3" :title="r.why3 ?? ''" @click="screen.learn(r.c, 3)">3 hours</button>
        </span>
      </div>
    </div>
    <footer class="msg">{{ ui.message }}</footer>
  </div>
</template>

<style scoped>
.lessons { width: min(860px, 94vw); max-height: 86vh; display: flex; flex-direction: column; gap: 8px; }
.lessons h2 { margin: 0; font-weight: 500; color: var(--accent); }
.list { overflow: auto; }
.les { display: grid; grid-template-columns: 1.4fr 1.3fr 1fr 0.8fr 0.9fr 11em; gap: 8px; align-items: center; padding: 3px 4px; border-bottom: 1px solid #1c2130; font-size: 0.94em; }
.les.head { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; }
.btns { display: flex; gap: 4px; justify-content: flex-end; }
.btns button { padding: 2px 8px; }
.msg { color: var(--accent); min-height: 1.2em; font-size: 0.92em; }
</style>
