<script setup lang="ts">
/** Shooting and throwing: the beast, what to loose, the aim, the chance and what is in the way. */
import { computed } from 'vue';
import type { ShootScreen } from '../shoot';
import { animalLines } from '../../world/fauna';
import { itemName } from '../../actors/items/item';

const props = defineProps<{ screen: ShootScreen }>();
const screen = props.screen;
const st = screen.state;
const now = () => screen.play.session.now();
const word = (c: number) => (c >= 80 ? 'very likely' : c >= 60 ? 'a good chance' : c >= 40 ? 'an even chance' : c >= 20 ? 'a poor chance' : 'hardly a chance');

const view = computed(() => {
  void st.rev;
  const b = screen.beast, m = screen.missile;
  if (!b) return null;
  const shot = screen.shot();
  const g = screen.play.session.game;
  return {
    lines: animalLines(b, now()),
    dist: Math.max(Math.abs(b.x - g.px), Math.abs(b.y - g.py)),
    shot,
    m,
    ammo: m ? (m.how === 'shoot' ? `${m.item.qty} left` : m.item.qty > 1 ? `${m.item.qty} carried` : '') : '',
    aims: screen.aims(),
    tip: shot ? shot.mods.map((x) => `${x.why} ${x.value > 0 ? '+' : ''}${x.value}`).join(', ') : '',
  };
});
</script>

<template>
  <div class="shoot card">
    <header class="row">
      <h2>Shoot or throw</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div v-if="view" class="body">
      <div class="row targets">
        <button v-for="(t, i) in screen.targets.slice(0, 8)" :key="t.id" :class="{ on: st.target === i }" @click="st.target = i; st.aim = null; st.rev++">{{ t.s.name }}</button>
        <span v-if="screen.targets.length > 1" class="dim">(Tab)</span>
      </div>
      <p class="dim">{{ view.lines.join(' ') }} {{ view.dist }} tiles off.</p>
      <p v-if="!screen.missiles.length" class="warn">You have nothing to shoot or throw: a bow wants arrows, a sling stones (M gathers them).</p>
      <div v-else class="cols">
        <div>
          <div class="cc-label">With (Left, Right)</div>
          <div class="list">
            <button v-for="(m, i) in screen.missiles" :key="i" :class="{ on: st.missile === i }" @click="st.missile = i; st.rev++">
              {{ m.name }} <span class="dim">good to {{ m.range }}, carries {{ m.max }}</span>
            </button>
          </div>
          <p v-if="view.ammo" class="dim">{{ view.ammo }}</p>
        </div>
        <div>
          <div class="cc-label">Aim (Up, Down)</div>
          <div class="list">
            <button v-for="a in view.aims" :key="a.id ?? 'any'" :class="{ on: st.aim === a.id }" @click="st.aim = a.id; st.rev++">{{ a.name }} <span class="dim">{{ a.mod || '' }}</span></button>
          </div>
        </div>
      </div>
      <template v-if="view.shot && view.m">
        <p v-if="view.shot.person" class="warn">{{ view.shot.person }} is in the way.</p>
        <p v-else-if="view.shot.blocked" class="warn">{{ view.shot.blocked[0].toUpperCase() + view.shot.blocked.slice(1) }} is in the way.</p>
        <p v-else-if="!view.shot.inRange" class="warn">Out of reach.</p>
        <p v-else class="chance" :title="view.tip">{{ word(view.shot.chance) }} to hit ({{ view.shot.chance }}%)<span v-if="view.shot.cover.length" class="dim">; in the way, and may take it: {{ view.shot.cover.join(', ') }}</span></p>
        <p v-if="view.m.launcher && view.m.launcher.loc?.at !== 'hand'" class="note">Your {{ itemName(view.m.launcher) }} is not in hand: taking it up takes this turn.</p>
      </template>
      <div class="row acts">
        <button class="primary" :disabled="!view.shot || !view.shot.inRange || !!view.shot.person" @click="screen.fire()">{{ view.m?.how === 'throw' ? 'Throw' : 'Loose' }} (Enter)</button>
      </div>
      <p class="dim small">Beasts that do not know you are there are much easier to hit: stalk them, sneaking and downwind. A miss lands beyond the target, to be picked up.</p>
    </div>
  </div>
</template>

<style scoped>
.shoot { width: min(620px, 94vw); max-height: 88vh; overflow-y: auto; }
.shoot h2 { margin: 0; font-weight: 500; color: var(--accent); }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.cols { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; }
.list { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow-y: auto; }
.list button { text-align: left; }
.on { outline: 1px solid var(--accent); }
.targets { gap: 4px; flex-wrap: wrap; }
.warn { color: #c0392b; }
.note { color: var(--accent); }
.chance { margin: 8px 0 4px; }
.small { font-size: 0.85em; }
</style>
