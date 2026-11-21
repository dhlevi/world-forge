<script setup lang="ts">
/** The fight menu: the beast, the aim, the blow and the stance, with the chance of each. */
import { computed } from 'vue';
import type { FightScreen } from '../fight';
import { foeId } from '../../game/foes';
import { STANCES, STANCE_MODS } from '../../rules/combat';

const props = defineProps<{ screen: FightScreen }>();
const screen = props.screen;
const st = screen.state;

const view = computed(() => {
  void st.rev;
  const b = screen.beast;
  if (!b) return null;
  const blows = screen.blows();
  const chosen = screen.blowId();
  const cur = blows.find((x) => x.blow.id === chosen);
  return {
    name: screen.play.session.fights.foeName(b),
    drawn: screen.play.session.fights.armsReady()?.drawn ?? null,
    lines: screen.play.session.fights.foeLines(b),
    aims: screen.aims(),
    blows,
    chosen,
    chance: cur?.chance ?? 0,
    tip: cur ? cur.mods.map((m) => `${m.why} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ') : '',
  };
});
const word = (c: number) => (c >= 80 ? 'very likely' : c >= 60 ? 'a good chance' : c >= 40 ? 'an even chance' : c >= 20 ? 'a poor chance' : 'hardly a chance');
</script>

<template>
  <div class="fight card">
    <header class="row">
      <h2>Strike</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div v-if="view" class="body">
      <div v-if="screen.targets.length > 1" class="row targets">
        <button v-for="(t, i) in screen.targets" :key="foeId(t)" :class="{ on: st.target === i }" @click="st.target = i; st.aim = null">{{ screen.play.session.fights.foeName(t) }}</button>
        <span class="dim">(Tab)</span>
      </div>
      <p class="dim">{{ view.lines.join(' ') }}</p>
      <p v-if="view.drawn && view.chosen !== 'punch' && view.chosen !== 'kick'" class="note">Your {{ view.drawn }} is not in hand: striking draws it first, which takes this turn.</p>
      <div class="cols">
        <div>
          <div class="cc-label">Aim (Up, Down)</div>
          <div class="list">
            <button v-for="a in view.aims" :key="a.id ?? 'any'" :class="{ on: st.aim === a.id }" @click="st.aim = a.id">
              {{ a.name }} <span class="dim">{{ a.mod ? a.mod : '' }}</span>
            </button>
          </div>
        </div>
        <div>
          <div class="cc-label">Blow (Left, Right)</div>
          <div class="list">
            <button v-for="b in view.blows" :key="b.blow.id" :class="{ on: view.chosen === b.blow.id }" :disabled="!b.reach" :title="b.mods.map((m) => `${m.why} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ')" @click="st.blow = b.blow.id">
              {{ b.blow.name }} <span class="dim">{{ b.reach ? `${b.chance}%` : 'out of reach' }}</span>
            </button>
          </div>
          <div class="cc-label">Stance (1, 2, 3)</div>
          <div class="list">
            <button v-for="(s, i) in STANCES" :key="s" :class="{ on: st.stance === s }" @click="st.stance = s">
              {{ i + 1 }}. {{ s[0].toUpperCase() + s.slice(1) }} <span class="dim">{{ STANCE_MODS[s].strike >= 0 ? '+' : '' }}{{ STANCE_MODS[s].strike }} to strike, {{ STANCE_MODS[s].defend >= 0 ? '+' : '' }}{{ STANCE_MODS[s].defend }} to defend</span>
            </button>
          </div>
        </div>
      </div>
      <p class="chance" :title="view.tip">{{ word(view.chance) }} to hit ({{ view.chance }}%)</p>
      <div class="row acts">
        <button class="primary" :disabled="!view.chosen" @click="screen.strike()">Strike (Enter)</button>
        <button @click="screen.keep()">Keep as my standing choices (K)</button>
        <button @click="screen.yieldUp()">Yield (Y)</button>
      </div>
      <p v-if="st.message" class="dim">{{ st.message }}</p>
      <p class="dim small">Walking into a beast or person fighting you strikes with your standing choices. Yielding hands robbers your purse, and gives you up to the watch.</p>
    </div>
  </div>
</template>

<style scoped>
.fight { width: min(620px, 94vw); max-height: 88vh; overflow-y: auto; }
.fight h2 { margin: 0; font-weight: 500; color: var(--accent); }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.cols { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; }
.list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; }
.list button { text-align: left; }
.on { outline: 1px solid var(--accent); }
.targets { gap: 4px; flex-wrap: wrap; }
.chance { margin: 8px 0 4px; }
.acts { gap: 8px; }
.small { font-size: 0.85em; }
.note { color: var(--accent); margin: 2px 0; }
</style>
