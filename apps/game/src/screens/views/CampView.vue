<script setup lang="ts">
/** The camp: choosing a site, then the camp's state, what can be done there, and the night. */
import { computed } from 'vue';
import type { CampScreen } from '../camp';
import { siteWords } from '../../game/camp';
import { campWords } from '../../game/camping';

const props = defineProps<{ screen: CampScreen }>();
const screen = props.screen;
const ui = screen.state;
const camp = computed(() => {
  void ui.version;
  return screen.camp;
});
const actions = computed(() => {
  void ui.version;
  return screen.actions();
});
const opts = computed(() => {
  void ui.version;
  return screen.nightOptions();
});
const early = computed(() => {
  void ui.version;
  return screen.tooEarly();
});
const away = computed(() => {
  void ui.version;
  return screen.away;
});
</script>

<template>
  <div class="camp card">
    <header class="row">
      <h2>{{ camp ? 'Your camp' : 'Make camp' }}</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>

    <template v-if="!camp">
      <p v-if="ui.loading" class="dim">You look about for a place to camp...</p>
      <p v-if="away">
        Your camp is {{ away.m >= 1000 ? `${(away.m / 1000).toFixed(1)} km` : `${away.m} m` }} away.
        <button @click="screen.goBack()">Go back to it</button>
      </p>
      <div v-for="(s, i) in ui.choices" :key="i" class="site">
        <div>
          <div><b>{{ s.why[0].toUpperCase() + s.why.slice(1) }}</b><span class="dim">{{ s.m > 10 ? `, ${s.m} m off` : '' }}</span></div>
          <div class="dim">{{ siteWords(s.rating) }}</div>
        </div>
        <button class="primary" @click="screen.choose(s)">Camp here</button>
      </div>
    </template>

    <template v-else>
      <div class="cols">
        <div>
          <div class="cc-label">The camp</div>
          <div class="dim">{{ siteWords(camp.site) }}.</div>
          <div v-for="(l, i) in campWords(camp)" :key="i">{{ l }}</div>
          <div class="cc-label">Things to do</div>
          <div class="acts">
            <button v-for="a in actions" :key="a.id" :disabled="!!a.why" :title="a.why ?? ''" @click="screen.act(a.id)">{{ a.label }}</button>
          </div>
        </div>
        <div>
          <div class="cc-label">The night</div>
          <label :class="{ off: opts.cook }" :title="opts.cook ?? ''"><input v-model="ui.plan.cook" type="checkbox" :disabled="!!opts.cook" /> Cook a meal at the fire</label>
          <label :class="{ off: opts.mend }" :title="opts.mend ?? ''"><input v-model="ui.plan.mend" type="checkbox" :disabled="!!opts.mend" /> Mend something worn</label>
          <label :class="{ off: opts.tend }" :title="opts.tend ?? ''"><input v-model="ui.plan.tend" type="checkbox" :disabled="!!opts.tend" /> Keep the fire in through the night</label>
          <label>
            Keep watch
            <select v-model.number="ui.plan.watch">
              <option :value="0">not at all</option>
              <option :value="1">an hour</option>
              <option :value="2">two hours</option>
              <option :value="3">three hours</option>
              <option :value="4">four hours</option>
            </select>
          </label>
          <p class="dim small">You sleep until morning. A watch, a fire, a shelter and a hidden site each help against what the night may bring.</p>
          <button class="primary" :disabled="!!early" :title="early ?? ''" @click="screen.night()">Settle for the night</button>
          <p v-if="early" class="dim small">{{ early }}</p>
        </div>
      </div>
    </template>
    <footer class="msg">{{ ui.message }}</footer>
  </div>
</template>

<style scoped>
.camp { width: min(860px, 94vw); max-height: 86vh; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.camp h2 { margin: 0; font-weight: 500; color: var(--accent); }
.site { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 4px; border-bottom: 1px solid #1c2130; }
.cols { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
.acts { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
.acts button { text-align: left; }
label { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
label input[type='checkbox'] { width: auto; margin: 0; flex: none; }
label select { width: auto; }
label.off { opacity: 0.5; }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; }
.small { font-size: 0.85em; }
.msg { color: var(--accent); min-height: 1.2em; font-size: 0.92em; }
@media (max-width: 640px) { .cols { grid-template-columns: 1fr; } }
</style>
