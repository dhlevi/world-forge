<script setup lang="ts">
/** The wanderer's health: blood, pain, the capacities, the wounds and their treatment. */
import { computed } from 'vue';
import type { HealthScreen } from '../health';
import { CAPACITIES, CAPACITY_NAMES, CONDITION_NAMES, woundWords, type ConditionId } from '../../actors/health';
import { PART } from '../../actors/components';

const props = defineProps<{ screen: HealthScreen }>();
const screen = props.screen;
const st = screen.state;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Everything shown, worked out again whenever something is done. */
const view = computed(() => {
  void st.rev;
  const h = screen.health;
  if (!h) return null;
  const caps = h.capacities();
  return {
    blood: h.bloodShare(),
    bloodWord: h.bloodWord(),
    bleeding: Math.round(h.bleeding()),
    pain: h.pain(),
    painWord: h.painWord() || 'No pain',
    caps: CAPACITIES.map((c) => ({ id: c, name: CAPACITY_NAMES[c], v: caps[c] })),
    conds: (Object.entries(h.d.cond) as [ConditionId, number][]).map(([id, v]) => ({ id, name: CONDITION_NAMES[id], v })),
    wounds: [...h.d.wounds]
      .sort((a, b) => h.bleedOf(b) - h.bleedOf(a) || b.sev - a.sev)
      .map((w) => {
        const done = [
          w.bandaged !== undefined ? 'bandaged' : '',
          w.cleaned !== undefined ? 'cleaned' : '',
          w.stitched !== undefined ? 'stitched' : '',
          w.splinted !== undefined ? 'splinted' : '',
          w.poultice !== undefined ? 'poultice on' : '',
        ].filter(Boolean);
        const bleed = Math.round(h.bleedOf(w));
        return {
          id: w.id,
          part: PART.get(w.part)?.name ?? w.part,
          what: woundWords(w),
          cause: w.cause,
          bleed,
          done: done.join(', '),
          fester: w.infection !== undefined ? `festering ${pct(w.infection)}, the body fighting it ${pct(w.immunity ?? 0)}` : '',
          acts: screen.options(w.id),
        };
      }),
    lost: h.d.lost.map((id) => PART.get(id)?.name ?? id),
    lasting: h.d.lasting.map((l) => l.text),
  };
});
</script>

<template>
  <div class="health card">
    <header class="row">
      <h2>Health</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div v-if="view" class="body">
      <div class="summary">
        <div class="stat" :class="{ bad: view.blood < 0.75, warn: view.blood < 0.9 }">
          <span class="lbl">Blood</span>
          <span class="nb"><span :style="{ width: pct(view.blood) }" /></span>
          <span class="val">{{ pct(view.blood) }}<span v-if="view.bloodWord">: {{ view.bloodWord.toLowerCase() }}</span><span v-if="view.bleeding">; losing {{ view.bleeding }} ml an hour</span></span>
        </div>
        <div class="stat" :class="{ bad: view.pain >= 0.55, warn: view.pain >= 0.3 }">
          <span class="lbl">Pain</span>
          <span class="nb"><span :style="{ width: pct(view.pain) }" /></span>
          <span class="val">{{ view.painWord }}</span>
        </div>
        <div v-for="c in view.conds" :key="c.id" class="stat bad">
          <span class="lbl">{{ c.name }}</span>
          <span class="nb"><span :style="{ width: pct(c.v) }" /></span>
          <span class="val">{{ pct(c.v) }}</span>
        </div>
      </div>

      <div class="cc-label">What you can do</div>
      <div class="caps">
        <div v-for="c in view.caps" :key="c.id" class="cap" :class="{ bad: c.v < 0.5, warn: c.v < 0.9 }">
          <span class="lbl">{{ c.name }}</span>
          <span class="val">{{ pct(c.v) }}</span>
        </div>
      </div>

      <div class="cc-label">Wounds</div>
      <p v-if="!view.wounds.length" class="dim">You have no wounds.</p>
      <div v-for="w in view.wounds" :key="w.id" class="wound">
        <div>
          <b>{{ w.what }}</b> on the {{ w.part }} <span class="dim">(from {{ w.cause }})</span>
          <span v-if="w.bleed" class="bleed"> bleeding {{ w.bleed }} ml an hour</span>
          <span v-if="w.done" class="dim">; {{ w.done }}</span>
          <span v-if="w.fester" class="bleed">; {{ w.fester }}</span>
        </div>
        <div class="acts">
          <button v-for="a in w.acts" :key="a.t" :disabled="!!a.missing" :title="a.missing ?? ''" @click="screen.treat(w.id, a.t)">{{ a.name }}</button>
          <span v-if="!w.acts.length" class="dim">Nothing to do for it but rest.</span>
        </div>
      </div>
      <p v-if="view.lost.length" class="dim">Lost or ruined: {{ view.lost.join(', ') }}.</p>
      <p v-if="view.lasting.length" class="dim">Lasting harm: {{ view.lasting.join('; ') }}.</p>
      <div class="row foot">
        <button v-if="screen.hasRemedy()" @click="screen.remedy()">Take a remedy for the pain</button>
        <span class="grow" />
      </div>
      <p v-if="st.message" class="msg">{{ st.message }}</p>
      <p class="dim small">First aid uses Medicine: bandages slow bleeding, clean water keeps a wound from festering, a needle and thread close it, a splint lets a broken bone knit straight, and healing herbs help the body fight festering. Rest, food and water heal.</p>
    </div>
  </div>
</template>

<style scoped>
.health { width: min(640px, 94vw); max-height: 88vh; overflow-y: auto; }
.health h2 { margin: 0; font-weight: 500; color: var(--accent); }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.summary { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.stat { display: grid; grid-template-columns: 7em 120px 1fr; gap: 8px; align-items: center; }
.nb { display: inline-block; height: 6px; background: rgba(127, 127, 127, 0.25); border-radius: 3px; overflow: hidden; }
.nb > span { display: block; height: 100%; background: var(--accent); }
.warn .nb > span { background: #c9a227; }
.bad .nb > span { background: #c0392b; }
.caps { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px 12px; margin: 4px 0 8px; }
.cap { display: flex; justify-content: space-between; }
.cap.warn .val { color: #c9a227; }
.cap.bad .val { color: #c0392b; }
.wound { padding: 4px 0; border-top: 1px solid rgba(127, 127, 127, 0.2); }
.wound .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.bleed { color: #c0392b; }
.msg { margin: 6px 0; }
.small { font-size: 0.85em; }
.foot { margin-top: 6px; }
</style>
