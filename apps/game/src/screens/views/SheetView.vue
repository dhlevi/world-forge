<script setup lang="ts">
/** The character sheet, over the map: who they are, their life, skills and belongings. */
import { computed } from 'vue';
import type { SheetScreen } from '../play';
import { Body, History, Identity, Inventory, Mood, Pools, Skills, Traits, moneyText, hairText, beardText } from '../../actors/components';
import { TRAIT_GROUPS, TRAIT_INFO, SENSES, traitWord } from '../../actors/data/traits';
import { SKILLS, SKILL_GROUPS, KNOWLEDGE, skillWord, fluencyWord } from '../../actors/data/skills';

const props = defineProps<{ screen: SheetScreen }>();
const screen = props.screen;
const a = screen.actor;
const id = a.need(Identity).d;
const body = a.get(Body)?.d;
const traits = a.get(Traits);
const skills = a.get(Skills);
const hist = a.get(History)?.d;
const inv = a.get(Inventory);
const pools = a.get(Pools)?.d;
const mood = a.get(Mood);
const ui = screen.state;
const age = computed(() => a.need(Identity).ageAt(screen.now()));
const bySkillGroup = computed(() => SKILL_GROUPS.map((g) => ({ g, list: SKILLS.filter((s) => s.group === g && (skills?.level(s.id) ?? 0) > 0) })).filter((x) => x.list.length));
</script>

<template>
  <div class="sheet card">
    <header class="row">
      <div>
        <div class="sheet-name">{{ id.full }}</div>
        <div class="dim">{{ id.female ? 'Woman' : 'Man' }} of {{ id.people }} ({{ id.folk.toLowerCase() }}), {{ age }}; from {{ id.homeName }}{{ id.realm ? `, ${id.realm}` : '' }}</div>
      </div>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div class="row tabs">
      <button :class="{ on: ui.tab === 'life' }" @click="ui.tab = 'life'">1. Life</button>
      <button :class="{ on: ui.tab === 'skills' }" @click="ui.tab = 'skills'">2. Traits and skills</button>
      <button :class="{ on: ui.tab === 'gear' }" @click="ui.tab = 'gear'">3. Belongings</button>
    </div>

    <div v-if="ui.tab === 'life'" class="sheet-body">
      <p v-if="body">{{ body.heightCm }} cm, {{ body.weightKg }} kg, {{ body.build }}; {{ body.skin }} skin, {{ hairText(body.hair, body.hairStyle) }}<span v-if="!id.female">, {{ beardText(body.beard) }}</span>.</p>
      <p v-for="(s, i) in (body?.wounds ?? []).filter((w) => w.scar)" :key="'s' + i" class="dim">You bear {{ s.scar }}.</p>
      <p v-if="id.faith" class="dim">You keep {{ id.faith }}.</p>
      <div class="cc-label">Your story</div>
      <p v-for="(l, i) in hist?.lines ?? []" :key="i" class="line">{{ l.text }}</p>
      <div class="cc-label">People in your life</div>
      <ul><li v-for="(t, i) in hist?.ties ?? []" :key="i">{{ t.text }}</li></ul>
      <div v-if="hist?.spread.length" class="dim">The cards: {{ hist.spread.map((s) => `${s.card}${s.reversed ? ' (reversed)' : ''}`).join(', ') }}.</div>
      <div v-if="mood?.moodlets.length" class="cc-label">Mood</div>
      <div v-for="m in mood?.moodlets ?? []" :key="m.id" class="dim">{{ m.text }} ({{ m.value > 0 ? '+' : '' }}{{ m.value }})</div>
    </div>

    <div v-else-if="ui.tab === 'skills'" class="sheet-body cols">
      <div>
        <div v-for="g in TRAIT_GROUPS" :key="g.name">
          <div class="cc-label">{{ g.name }}</div>
          <div v-for="t in g.traits" :key="t" class="kv" :title="TRAIT_INFO[t].about"><span>{{ TRAIT_INFO[t].name }}</span><span>{{ traits?.get(t) }} <span class="dim">{{ traitWord(traits?.get(t) ?? 10) }}</span></span></div>
        </div>
        <div class="cc-label">Senses</div>
        <div v-for="s in SENSES" :key="s" class="kv"><span>{{ TRAIT_INFO[s].name }}</span><span>{{ traits?.get(s) }}</span></div>
        <div v-if="pools" class="cc-label">Stamina</div>
        <div v-if="pools" class="kv"><span>Physical</span><span>{{ Math.round(pools.physBurst.value) }}/{{ pools.physBurst.max }} burst, {{ Math.round(pools.physDay.value) }}/{{ pools.physDay.max }} day</span></div>
        <div v-if="pools" class="kv"><span>Mental</span><span>{{ Math.round(pools.mentBurst.value) }}/{{ pools.mentBurst.max }} burst, {{ Math.round(pools.mentDay.value) }}/{{ pools.mentDay.max }} day</span></div>
      </div>
      <div>
        <div v-for="g in bySkillGroup" :key="g.g">
          <div class="cc-label">{{ g.g }}</div>
          <div v-for="s in g.list" :key="s.id" class="kv"><span>{{ s.name }}</span><span>{{ Math.round(skills!.level(s.id)) }} <span class="dim">{{ skillWord(skills!.level(s.id)) }}, cap {{ skills!.cap(s.id) }}</span></span></div>
        </div>
        <div class="cc-label">Languages</div>
        <div v-for="l in Object.values(skills?.d.languages ?? {})" :key="l.name" class="kv"><span>{{ l.name }}</span><span>{{ fluencyWord(l.speak) }}{{ l.read >= 20 ? `, reads (${Math.round(l.read)})` : ', cannot read' }}</span></div>
        <div class="cc-label">Knowledge</div>
        <div v-for="k in Object.values(skills?.d.knowledge ?? {})" :key="k.kind + k.of" class="kv"><span>{{ KNOWLEDGE[k.kind].name }}: {{ k.of }}</span><span>{{ Math.round(k.level) }}</span></div>
      </div>
    </div>

    <div v-else class="sheet-body">
      <p>{{ moneyText(inv?.d.copper ?? 0) }}; carrying {{ inv?.weight.toFixed(1) }} kg.</p>
      <ul>
        <li v-for="(i, k) in inv?.d.items ?? []" :key="k">{{ i.name }}<span v-if="i.qty > 1"> ({{ i.qty }})</span><span class="dim">{{ i.animal ? ', an animal' : i.worn ? ', worn' : `, ${(i.weight * i.qty).toFixed(1)} kg` }}</span></li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.sheet { width: min(860px, 92vw); max-height: 86vh; overflow: auto; }
.sheet-name { font-size: 1.3em; color: var(--accent); }
.tabs button.on { border-color: var(--accent); color: var(--accent); }
.sheet-body { display: flex; flex-direction: column; gap: 4px; }
.sheet-body.cols { display: grid; grid-template-columns: 1fr 1.3fr; gap: 20px; }
.sheet-body p { margin: 2px 0; }
.sheet-body ul { margin: 0; padding-left: 18px; }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; }
.kv { display: flex; justify-content: space-between; gap: 10px; font-size: 0.94em; }
</style>
