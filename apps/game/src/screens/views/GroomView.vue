<script setup lang="ts">
/** Grooming: the wanderer's portrait as they are, how hair and beard are worn, and the ways they could be. */
import { computed } from 'vue';
import type { GroomScreen } from '../groom';
import { Body, beardText, hairText } from '../../actors/components';
import Portrait from '../../components/Portrait.vue';

const props = defineProps<{ screen: GroomScreen }>();
const screen = props.screen;
const st = screen.state;

/** Everything shown, worked out again whenever something is done. */
const view = computed(() => {
  void st.version;
  const b = screen.actor.get(Body);
  if (!b) return null;
  return {
    portrait: screen.portrait(),
    hair: `${hairText(b.d.hair, b.d.hairStyle)}${b.d.hairStyle === 'bald' ? '' : `, ${b.hairCm < 1 ? 'stubble' : `about ${Math.round(b.hairCm)} cm`}`}`,
    beard: b.beardless ? '' : `${beardText(b.beardShown())}${b.beardCm >= 1 ? `, about ${Math.round(b.beardCm)} cm` : ''}`,
    kempt: b.kempt(),
    hairs: screen.options('hair'),
    beards: screen.options('beard'),
  };
});
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
</script>

<template>
  <div class="groom card">
    <header class="row">
      <h2>{{ screen.barber ? 'The barber' : 'Grooming' }}</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div v-if="view" class="body">
      <Portrait :spec="view.portrait" :scale="4" />
      <div class="ways">
        <p v-if="view.kempt" class="warn">{{ view.kempt === 'Ragged' ? 'Your hair and beard have run wild.' : 'You are unkempt.' }} People think the less of you for it.</p>
        <h3>Hair</h3>
        <p>{{ cap(view.hair) }}.</p>
        <div class="acts">
          <button v-for="o in view.hairs" :key="o.style" :class="{ on: o.current }" :disabled="!!o.why" :title="o.why ?? ''" @click="screen.wear('hair', o.style)">{{ o.label }}</button>
          <span v-if="!view.hairs.length" class="dim">There is nothing to cut.</span>
        </div>
        <template v-if="view.beard">
          <h3>Beard</h3>
          <p>{{ cap(view.beard) }}.</p>
          <div class="acts">
            <button v-for="o in view.beards" :key="o.style" :class="{ on: o.current }" :disabled="!!o.why" :title="o.why ?? ''" @click="screen.wear('beard', o.style)">{{ o.label }}</button>
          </div>
        </template>
        <div class="acts">
          <button @click="screen.tidy()">Comb and put in order</button>
        </div>
      </div>
    </div>
    <p v-if="st.message" class="msg">{{ st.message }}</p>
    <p class="dim small">
      Hair and beards grow, and a cut only shortens them: longer ways open as they grow. Left untended for a fortnight you look unkempt.
      <span v-if="!screen.barber">Cutting and shaving need a knife; a shave is kinder with water, and kinder still with soap.</span>
    </p>
  </div>
</template>

<style scoped>
.groom { width: min(620px, 94vw); max-height: 88vh; overflow-y: auto; }
.groom h2 { margin: 0; font-weight: 500; color: var(--accent); }
.body { display: flex; gap: 16px; align-items: flex-start; }
.ways { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ways p { margin: 0; }
h3 { margin: 4px 0 0; color: var(--dim); font-size: 0.8em; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
.acts { display: flex; flex-wrap: wrap; gap: 4px; }
.acts button { padding: 3px 8px; font-size: 0.92em; }
.acts button.on { border-color: var(--accent); color: var(--accent); }
.warn { color: #d9a441; }
.msg { margin: 8px 0 4px; }
.small { font-size: 0.85em; margin: 6px 0 0; }
</style>
