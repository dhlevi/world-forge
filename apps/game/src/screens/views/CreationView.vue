<script setup lang="ts">
/**
 * Character creation: the steps down the left, the step in the middle, and the character as it
 * stands on the right. Everything shown is worked out from the screen's choices.
 */
import { computed } from 'vue';
import { STEPS, type CreationScreen } from '../creation';
import { trackOptions } from '../../actors/creation/resolve';
import { STANDINGS } from '../../actors/data/standing';
import { DECK, CARD, POSITIONS, POSITION_INFO, type Position } from '../../actors/data/cards';
import { TRAIT_GROUPS, TRAIT_INFO, SENSES, traitWord, type TraitId } from '../../actors/data/traits';
import { skillWord, fluencyWord, KNOWLEDGE } from '../../actors/data/skills';
import { moneyText, hairText, beardText } from '../../actors/components';

const props = defineProps<{ screen: CreationScreen }>();
const screen = props.screen;
const ui = screen.state;
const app = screen.app;

const res = computed(() => {
  void ui.choices;
  void screen.names.value;
  return screen.resolved();
});
const ch = computed(() => ui.choices!);
const cultures = computed(() => screen.catalogue.value?.cultures ?? []);
const folks = computed(() => [...new Set(cultures.value.map((c) => c.folk))]);
const homes = computed(() => app.state.starts.filter((s) => s.cultureIndex === ch.value.culture).slice(0, 80));
const options = computed(() => (res.value ? trackOptions(res.value) : []));
const names = computed(() => (ch.value.female ? screen.names.value?.female : screen.names.value?.male)?.slice(0, 8) ?? []);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const a = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

function cardEffect(p: Position, id: string, reversed: boolean): string {
  const c = CARD.get(id)!;
  const st = STANDINGS.find((s) => s.id === c.standing)!;
  if (p === 'birth') return reversed ? `${st.name}, fallen on hard times` : st.name;
  if (p === 'hearth') return reversed ? 'A broken home: a parent lost, a feud. +1 Willpower.' : `A warm home: parents living. +1 ${TRAIT_INFO[c.trait].name}.`;
  if (p === 'path') return reversed ? `${TRACK_NAME(c.track)}, with a hard first term` : `Leans toward ${TRACK_NAME(c.track)}`;
  return reversed ? `${c.omenDown} (luck runs low)` : `${c.omenUp} (+1 ${TRAIT_INFO[c.trait].name}, luck runs high)`;
}
const TRACK_NAME = (t: string) => options.value.find((o) => o.track.id === t)?.track.name ?? t;

const spentLeft = computed(() => (res.value ? res.value.budget - res.value.spent : 0));
const parentTrades = computed(() => res.value?.family.standing.trades ?? []);

function onFather(e: Event): void {
  screen.setTrades((e.target as HTMLSelectElement).value, res.value?.family.mother.trade?.name ?? '');
}
function onMother(e: Event): void {
  screen.setTrades(res.value!.family.father.trade.name, (e.target as HTMLSelectElement).value);
}
function onChooseCard(p: Position, e: Event): void {
  const d = ch.value.spread?.find((x) => x.position === p);
  screen.chooseCard(p, (e.target as HTMLSelectElement).value, d?.reversed ?? false);
}
function flip(p: Position): void {
  const d = ch.value.spread?.find((x) => x.position === p);
  if (d) screen.chooseCard(p, d.card, !d.reversed);
}
</script>

<template>
  <div class="creation">
    <header class="cc-head">
      <h2>Make a character</h2>
      <span class="grow" />
      <button :disabled="!ui.ready" title="Draw a whole character at random" @click="screen.quick()">Quick start</button>
      <button @click="screen.close()">Back to the world</button>
    </header>

    <div v-if="!ui.ready" class="cc-wait">
      <p v-if="ui.error" class="error">{{ ui.error }}</p>
      <p v-else>Learning the peoples of this world…</p>
    </div>

    <template v-else-if="res">
      <nav class="cc-steps">
        <button v-for="(s, i) in STEPS" :key="s.id" :class="{ on: ui.step === s.id }" @click="screen.go(s.id)">{{ i + 1 }}. {{ s.name }}</button>
      </nav>

      <main class="cc-main">
        <!-- Origin -->
        <section v-if="ui.step === 'origin'">
          <h3>Origin</h3>
          <p class="hint">Your people and your home. The home town is where the game begins.</p>
          <div class="row">
            <button :class="{ on: !ch.female }" @click="screen.setSex(false)">Man</button>
            <button :class="{ on: ch.female }" @click="screen.setSex(true)">Woman</button>
          </div>
          <div v-for="f in folks" :key="f" class="cc-group">
            <div class="cc-label">{{ f }}</div>
            <div class="cc-cards">
              <button v-for="c in cultures.filter((x) => x.folk === f)" :key="c.index" class="cc-pick" :class="{ on: c.index === ch.culture }" @click="screen.setCulture(c.index)">
                <b>{{ cap(c.people) }}</b>
                <span>{{ c.ethosName }}; {{ c.traditionNames.join(', ') }}</span>
              </button>
            </div>
          </div>
          <div class="cc-about">
            <p><b>{{ cap(res.culture.people) }}</b>, {{ res.culture.folk.toLowerCase() }} of the {{ res.culture.newWorld ? 'New' : 'Old' }} World. They speak {{ res.culture.name }} and keep {{ res.culture.faith ?? 'their own ways' }}.</p>
            <p v-for="(t, i) in res.culture.look.text.slice(0, 2)" :key="i" class="dim">{{ t }}</p>
          </div>
          <label>Home
            <select :value="ch.homeId" @change="screen.setHome(($event.target as HTMLSelectElement).value)">
              <option v-for="s in homes" :key="s.id" :value="s.id">{{ s.name }} ({{ s.tier }}, {{ s.population.toLocaleString() }}{{ s.realm ? `, ${s.realm}` : '' }})</option>
            </select>
          </label>
        </section>

        <!-- Family -->
        <section v-else-if="ui.step === 'family'">
          <h3>Family</h3>
          <p class="hint">Your family's standing sets your money, whether you were taught to read, the skills of home, and which lives are open to you.</p>
          <div class="cc-list">
            <label v-for="s in STANDINGS" :key="s.id" class="cc-radio" :class="{ on: s.id === ch.standing }">
              <input type="radio" :checked="s.id === ch.standing" @change="screen.setStanding(s.id)" />
              <span><b>{{ s.name }}</b> <span class="dim">{{ s.about }}</span></span>
            </label>
          </div>
          <p v-if="res.family.fallen" class="note">The Birth card is reversed: the family has fallen on hard times (less money, and debts).</p>
          <div class="row">
            <label>Father
              <select :value="res.family.father.trade.name" @change="onFather">
                <option v-for="t in parentTrades.filter((x) => x.who !== 'f')" :key="t.name" :value="t.name">{{ cap(t.name) }}</option>
              </select>
            </label>
            <label>Mother
              <select :value="res.family.mother.trade?.name ?? ''" @change="onMother">
                <option value="">Keeps the house</option>
                <option v-for="t in parentTrades.filter((x) => x.who !== 'm')" :key="t.name" :value="t.name">{{ cap(t.name) }}</option>
              </select>
            </label>
            <button @click="screen.rollFamily()">Another family</button>
          </div>
          <ul class="cc-ties">
            <li v-for="(t, i) in res.ties.filter((x) => x.kind === 'parent' || x.kind === 'sibling' || x.kind === 'feud' || (x.kind === 'debt' && !x.name))" :key="i">{{ t.text }}</li>
            <li>{{ res.family.literate ? `You were taught to read ${res.culture.name}.` : 'You were never taught to read.' }}</li>
          </ul>
        </section>

        <!-- Fate -->
        <section v-else-if="ui.step === 'fate'">
          <h3>Fate</h3>
          <p class="hint">Four cards of fate, each upright or reversed: Birth sets your standing, Hearth your family, Path leans your life, and Omen marks your future. They are a choice, not a duty; you can change anything afterwards.</p>
          <div v-if="!ch.spread" class="row">
            <button class="primary" @click="screen.drawCards()">Draw the cards</button>
          </div>
          <template v-else>
            <div class="cc-spread">
              <div v-for="p in POSITIONS" :key="p" class="cc-card" :class="{ rev: ch.spread.find((d) => d.position === p)?.reversed }">
                <template v-for="d in ch.spread.filter((x) => x.position === p)" :key="d.card">
                  <div class="cc-pos">{{ POSITION_INFO[p].name }} <span class="dim">{{ POSITION_INFO[p].about }}</span></div>
                  <div class="cc-cardname">{{ CARD.get(d.card)!.name }}<span v-if="d.reversed"> (reversed)</span></div>
                  <div class="dim">{{ d.reversed ? CARD.get(d.card)!.reversed : CARD.get(d.card)!.upright }}</div>
                  <div class="cc-effect">{{ cardEffect(p, d.card, d.reversed) }}</div>
                  <div class="row small">
                    <button title="Each redraw costs a little luck" @click="screen.redraw(p)">Redraw</button>
                    <button @click="flip(p)">Turn over</button>
                    <select :value="d.card" @change="onChooseCard(p, $event)">
                      <option v-for="c in DECK" :key="c.id" :value="c.id">{{ c.name }}</option>
                    </select>
                  </div>
                </template>
              </div>
            </div>
            <div class="row">
              <button @click="screen.drawCards()">Draw again</button>
              <button @click="screen.clearCards()">Put the cards away</button>
              <span v-if="ch.redraws" class="dim">Redrawn {{ ch.redraws }} time{{ ch.redraws === 1 ? '' : 's' }}: your luck is a little lower.</span>
            </div>
          </template>
        </section>

        <!-- Traits -->
        <section v-else-if="ui.step === 'traits'">
          <h3>Traits</h3>
          <p class="hint">10 is the average person. Spend {{ res.budget }} points; lowering a trait gives a point back. Each may move {{ 4 }} from where your people start.</p>
          <p><b>{{ spentLeft }}</b> point{{ spentLeft === 1 ? '' : 's' }} left <button class="small" @click="screen.resetTraits()">Reset</button></p>
          <div class="cc-traits">
            <div v-for="g in TRAIT_GROUPS" :key="g.name">
              <div class="cc-label">{{ g.name }}</div>
              <div v-for="t in g.traits" :key="t" class="cc-trait" :title="TRAIT_INFO[t].about">
                <span class="nm">{{ TRAIT_INFO[t].name }}</span>
                <button :disabled="(ch.spend[t] ?? 0) <= -4" @click="screen.spend(t as TraitId, -1)">-</button>
                <b>{{ res.start[t] }}</b>
                <button :disabled="spentLeft <= 0 || (ch.spend[t] ?? 0) >= 4" @click="screen.spend(t as TraitId, 1)">+</button>
                <span class="dim">{{ traitWord(res.start[t]) }}</span>
              </div>
            </div>
            <div>
              <div class="cc-label">Senses</div>
              <div v-for="s in SENSES" :key="s" class="cc-trait" :title="TRAIT_INFO[s].about">
                <span class="nm">{{ TRAIT_INFO[s].name }}</span><b>{{ res.traits.senses[s] }}</b><span class="dim">{{ traitWord(res.traits.senses[s]) }}</span>
              </div>
            </div>
          </div>
          <p class="hint">Occupations will train some traits further, and age wears the body down past one's prime.</p>
        </section>

        <!-- Life -->
        <section v-else-if="ui.step === 'life'">
          <h3>Life so far</h3>
          <p class="hint">Each term is {{ res.folk.termYears }} years in an occupation: skills, savings, belongings, and something that happened. More terms make a more skilled but older character.</p>
          <ol class="cc-terms">
            <li v-for="(t, i) in res.terms" :key="i" :class="{ blocked: t.blocked }">
              <b>{{ t.age }} to {{ t.age + res.folk.termYears }}:</b> {{ t.track.name }}, {{ t.track.ranks[t.rank].toLowerCase() }}<span v-if="t.promoted"> (promoted)</span>.
              <span class="dim">{{ t.text.join(' ') }}</span>
              <span v-if="t.traitChanges.length" class="dim"> [{{ t.traitChanges.join(', ') }}]</span>
            </li>
          </ol>
          <p v-if="!res.terms.length" class="dim">No terms yet: you would set out at {{ res.age }}.</p>
          <div class="row"><button :disabled="!ch.terms.length" @click="screen.removeTerm()">Undo the last term</button><span class="dim">Age now {{ res.age }}<span v-if="res.age > res.folk.prime">, past your prime</span>.</span></div>
          <div class="cc-tracks">
            <div v-for="o in options" :key="o.track.id" class="cc-track" :class="{ closed: o.reason }">
              <div><b>{{ o.track.name }}</b> <span class="dim">{{ o.track.about }}</span></div>
              <div class="dim">{{ o.track.ranks.join(', ') }}</div>
              <div v-if="o.reason" class="note">{{ o.reason }}</div>
              <div v-else class="row small">
                <select v-if="o.track.choice && res.ranks[o.track.id] === undefined" :value="ui.nextChoice[o.track.id] ?? o.track.choice.options[0].id" @change="ui.nextChoice[o.track.id] = ($event.target as HTMLSelectElement).value">
                  <option v-for="c in o.track.choice.options" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <button @click="screen.addTerm(o.track.id)">{{ res.ranks[o.track.id] === undefined ? `Enter as ${a(o.track.ranks[0].toLowerCase())}` : 'Another term' }}</button>
                <span v-if="res.ranks[o.track.id] !== undefined" class="dim">now {{ o.track.ranks[o.rank].toLowerCase() }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Finish -->
        <section v-else-if="ui.step === 'finish'">
          <h3>Finish</h3>
          <label>Name</label>
          <div class="cc-names">
            <button v-for="(n, i) in names" :key="i" :class="{ on: !ch.customName && ch.name % Math.max(1, names.length) === i }" @click="screen.setName(i)">{{ n.full }}</button>
          </div>
          <input :value="ch.customName ?? ''" placeholder="Or write a name" @input="screen.setCustomName(($event.target as HTMLInputElement).value)" />
          <label>Looks</label>
          <div class="row small">
            <button @click="screen.cycleLook('skin')">Skin: {{ res.look.skin[1] }}</button>
            <button @click="screen.cycleLook('hair')">Hair: {{ res.look.hair[1] }}</button>
            <button @click="screen.cycleLook('hairStyle')">Style: {{ res.look.hairStyle }}</button>
            <button v-if="!ch.female" @click="screen.cycleLook('beard')">Beard: {{ res.look.beard }}</button>
            <button @click="screen.cycleLook('build')">Height and build</button>
          </div>
          <p>{{ res.look.heightCm }} cm and {{ res.look.weightKg }} kg, {{ res.look.build }}; {{ res.look.skin[1] }} skin, {{ hairText(res.look.hair[1], res.look.hairStyle) }}<span v-if="!ch.female">, {{ beardText(res.look.beard) }}</span>.<span v-if="res.culture.look.marks"> Like all your people: {{ res.culture.look.marks }}.</span></p>
          <h4>Your story</h4>
          <p v-for="(b, i) in res.biography" :key="i" class="cc-bio">{{ b.text }}</p>
          <p v-for="(w, i) in res.wounds" :key="'w' + i" class="dim">You bear {{ w.scar }}.</p>
          <h4>What you know of the world</h4>
          <p class="dim">The country within {{ (res.knowledge.homeRadiusM / 1000).toFixed(0) }} km of {{ res.home.name }}<span v-if="res.knowledge.roads.length">, the roads to {{ res.knowledge.roads.length }} other place{{ res.knowledge.roads.length === 1 ? '' : 's' }}</span><span v-if="res.knowledge.places.length">, and {{ res.knowledge.places.length }} place{{ res.knowledge.places.length === 1 ? '' : 's' }} further off</span>.</p>
          <p v-for="(n, i) in res.knowledge.notes" :key="'n' + i" class="dim">{{ n }}</p>
          <div class="row"><button class="primary" @click="screen.begin()">Begin in {{ res.home.name }}</button></div>
        </section>

        <div class="row cc-nav">
          <button :disabled="ui.step === 'origin'" @click="screen.next(-1)">Previous</button>
          <button v-if="ui.step !== 'finish'" class="primary" @click="screen.next(1)">Next</button>
        </div>
      </main>

      <aside class="cc-side">
        <div class="cc-name">{{ res.name.full }}</div>
        <div class="dim">{{ ch.female ? 'Woman' : 'Man' }} of {{ res.culture.people }}, {{ res.age }}</div>
        <div class="dim">{{ res.family.standing.name }}; from {{ res.home.name }}</div>
        <div class="cc-label">Traits</div>
        <div class="cc-mini">
          <span v-for="(v, t) in res.traits.traits" :key="t">{{ TRAIT_INFO[t].name.slice(0, 3) }} <b>{{ v }}</b></span>
        </div>
        <div class="cc-label">Best skills</div>
        <div v-for="s in res.skills.known().slice(0, 8)" :key="s.id" class="cc-skill"><span>{{ s.name }}</span><span class="dim">{{ Math.round(s.level) }}, {{ skillWord(s.level) }}</span></div>
        <div v-for="l in Object.values(res.skills.d.languages)" :key="l.name" class="cc-skill"><span>{{ l.name }}</span><span class="dim">{{ fluencyWord(l.speak) }}{{ l.read >= 20 ? ', reads' : '' }}</span></div>
        <div v-for="k in Object.values(res.skills.d.knowledge).filter((x) => x.level >= 10)" :key="k.kind + k.of" class="cc-skill"><span>{{ KNOWLEDGE[k.kind].name }}</span><span class="dim">{{ k.of }}, {{ Math.round(k.level) }}</span></div>
        <div class="cc-label">Belongings</div>
        <div class="dim">{{ moneyText(res.copper) }}</div>
        <div class="dim">{{ res.items.map((i) => (i.qty > 1 ? `${i.name} (${i.qty})` : i.name)).join(', ') }}</div>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.creation { position: fixed; inset: 0; display: grid; grid-template-columns: 170px 1fr 300px; grid-template-rows: auto 1fr; }
.cc-head { grid-column: 1 / 4; display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
.cc-head h2 { margin: 0; font-weight: 500; }
.cc-wait { grid-column: 1 / 4; padding: 40px; }
.cc-steps { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-right: 1px solid var(--line); }
.cc-steps button { text-align: left; }
.cc-steps button.on, .row button.on, .cc-names button.on { border-color: var(--accent); color: var(--accent); }
.cc-main { overflow: auto; padding: 16px 22px; display: flex; flex-direction: column; gap: 12px; }
.cc-main section { display: flex; flex-direction: column; gap: 10px; }
.cc-main section p { margin: 0; }
.cc-main h3 { margin: 0; font-weight: 500; color: var(--accent); }
.cc-main h4 { margin: 8px 0 0; font-weight: 500; }
.cc-main label { display: flex; flex-direction: column; gap: 4px; color: var(--dim); }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.cc-cards { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-pick { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; max-width: 260px; text-align: left; }
.cc-pick span { color: var(--dim); font-size: 0.85em; }
.cc-pick.on { border-color: var(--accent); }
.cc-about { border-left: 3px solid var(--line); padding-left: 10px; }
.cc-about p { margin: 4px 0; }
.cc-list { display: flex; flex-direction: column; gap: 4px; }
.cc-radio { flex-direction: row !important; align-items: center; gap: 8px !important; color: var(--text) !important; padding: 4px 6px; border-radius: 6px; }
.cc-radio.on { background: #2b2618; }
.cc-ties { margin: 0; padding-left: 18px; }
.cc-spread { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.cc-card { border: 1px solid var(--line); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 4px; background: var(--panel); }
.cc-card.rev { border-color: #6a3b3b; }
.cc-pos { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
.cc-cardname { font-size: 1.1em; }
.cc-effect { font-size: 0.92em; }
.small button, button.small, .small select { padding: 3px 8px; font-size: 0.9em; }
.cc-traits { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.cc-trait { display: grid; grid-template-columns: 100px 28px 28px 28px 1fr; align-items: center; gap: 4px; padding: 2px 0; }
.cc-trait b { text-align: center; }
.cc-trait button { padding: 1px 0; }
.cc-terms { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.cc-terms li.blocked { opacity: 0.6; }
.cc-tracks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.cc-track { border: 1px solid var(--line); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 0.92em; }
.cc-track.closed { opacity: 0.55; }
.cc-names { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-bio { margin: 2px 0; }
.cc-nav { margin-top: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
.cc-side { border-left: 1px solid var(--line); background: var(--panel); padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.cc-name { font-size: 1.2em; color: var(--accent); }
.cc-mini { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 8px; font-size: 0.92em; }
.cc-skill { display: flex; justify-content: space-between; gap: 8px; font-size: 0.92em; }
</style>
