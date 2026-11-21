<script setup lang="ts">
/** A person at the wanderer's mercy: what can be done with them. */
import { computed } from 'vue';
import type { MercyScreen } from '../mercy';

const props = defineProps<{ screen: MercyScreen }>();
const screen = props.screen;
const st = screen.state;
const s = screen.play.session;
const view = computed(() => {
  void st.rev;
  return { name: s.fights.foeName({ kind: 'person', r: screen.r }), lines: s.fights.foeLines({ kind: 'person', r: screen.r }), options: screen.options() };
});
</script>

<template>
  <div class="mercy card">
    <header class="row">
      <h2>{{ view.name[0].toUpperCase() + view.name.slice(1) }}</h2>
      <span class="grow" />
      <button @click="screen.close()">Leave them (Esc)</button>
    </header>
    <p class="dim">{{ view.lines.join(' ') }}</p>
    <div class="acts">
      <button v-for="(o, i) in view.options" :key="o.act" :disabled="!!o.why" :title="o.why ?? ''" @click="screen.act(o.act)">{{ i + 1 }}. {{ o.label }}</button>
    </div>
    <p v-if="st.message" class="msg">{{ st.message }}</p>
    <p class="dim small">What you do is seen by those about, and remembered. Robbing, binding or killing someone who is no robber is a crime.</p>
  </div>
</template>

<style scoped>
.mercy { width: min(480px, 92vw); }
.mercy h2 { margin: 0; font-weight: 500; color: var(--accent); }
.acts { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
.acts button { text-align: left; }
.msg { margin: 6px 0; }
.small { font-size: 0.85em; }
</style>
