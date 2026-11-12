<script setup lang="ts">
/**
 * The inventory: on the left the person (the load, hands, back, belt and what is worn on each
 * part of the body, layer by layer), in the middle every container carried and what is in it,
 * and on the right what lies nearby and the chosen thing with what can be done with it.
 * Things are dragged between places, or chosen and given an action (with keys too).
 */
import { computed } from 'vue';
import type { InventoryScreen, Ref, Target, Spot } from '../inventory';
import { REGIONS, REGION_NAMES, JEWEL_SLOTS, JEWEL_NAMES, LAYERS, type JewelSlot } from '../../actors/items/defs';
import { defOf, itemName, conditionWord, itemValue, QUALITY_WORD, type Item } from '../../actors/items/item';
import { SIZE_WORD } from '../../actors/items/inventory';
import { moneyText } from '../../actors/components';

const props = defineProps<{ screen: InventoryScreen }>();
const screen = props.screen;
const ui = screen.state;

const v = <T,>(f: () => T) => computed(() => {
  void ui.version;
  return f();
});
const inv = computed(() => {
  void ui.version;
  return screen.inv;
});
const load = v(() => screen.inv.loadInfo());
const hands = v(() => screen.inv.hands());
const backs = v(() => screen.inv.backItems());
const belt = v(() => screen.inv.belt());
const beltItems = v(() => screen.inv.onBelt());
const worn = v(() => screen.inv.worn());
const wornAt = (r: string) => worn.value.filter((i) => defOf(i).wear?.regions?.includes(r as never)).sort((a, b) => LAYERS.indexOf(defOf(b).wear!.layer!) - LAYERS.indexOf(defOf(a).wear!.layer!));
const jewels = (j: JewelSlot) => worn.value.filter((i) => defOf(i).wear?.jewel === j);
const containers = v(() => screen.inv.containers());
const spots = v(() => screen.spots());
const chosen = v(() => screen.item(ui.selected));
const actions = v(() => screen.actions());

const isSel = (r: Ref) => ui.selected?.uid === r.uid;
const refInv = (i: Item): Ref => ({ from: 'inv', uid: i.uid });
const refGround = (s: Spot, i: Item): Ref => ({ from: 'ground', x: s.x, y: s.y, uid: i.uid });

function info(i: Item): string {
  const d = defOf(i);
  const bits: string[] = [];
  if (d.uses && i.uses !== undefined) bits.push(`${i.uses}/${d.uses} ${d.useWord ?? 'uses'}`);
  if (d.durable !== false && i.condition < 95) bits.push(conditionWord(i.condition));
  if (i.quality !== 'common') bits.push(QUALITY_WORD[i.quality]);
  return bits.join(', ');
}

// ---- Dragging ------------------------------------------------------------------------------------
let dragging: Ref | null = null;
function dragStart(e: DragEvent, r: Ref): void {
  dragging = r;
  e.dataTransfer?.setData('text/plain', r.uid);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function drop(e: DragEvent, t: Target): void {
  e.preventDefault();
  if (dragging) screen.move(dragging, t);
  dragging = null;
}
const pct = (a: number, b: number) => `${Math.min(100, Math.round((a / Math.max(0.01, b)) * 100))}%`;
</script>

<template>
  <div class="inv card" @dragend="dragging = null">
    <header class="row inv-head">
      <h2>Belongings</h2>
      <div class="inv-load" :class="load.load">
        <div class="bar"><div :style="{ width: pct(load.kg, load.max) }" /></div>
        <span>{{ load.kg.toFixed(1) }} kg of {{ load.comfortable.toFixed(0) }} kg comfortable ({{ load.max.toFixed(0) }} kg at most): <b>{{ load.load }}</b></span>
      </div>
      <span class="dim">{{ moneyText(inv.d.copper) }}</span>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>

    <div class="inv-cols">
      <!-- The person -->
      <section class="inv-col">
        <div class="cc-label">In hand</div>
        <template v-if="hands.both">
          <div class="slot" @dragover.prevent @drop="drop($event, { at: 'hand', hand: 'both' })">
            <span class="sl">Both hands</span>
            <div class="it" draggable="true" :class="{ on: isSel(refInv(hands.both)) }" @dragstart="dragStart($event, refInv(hands.both))" @click="screen.select(refInv(hands.both))">{{ itemName(hands.both) }}</div>
          </div>
        </template>
        <template v-else>
          <div v-for="h in (['left', 'right'] as const)" :key="h" class="slot" @dragover.prevent @drop="drop($event, { at: 'hand', hand: h })">
            <span class="sl">{{ h === 'left' ? 'Left hand' : 'Right hand' }}</span>
            <div v-if="hands[h]" class="it" draggable="true" :class="{ on: isSel(refInv(hands[h]!)) }" @dragstart="dragStart($event, refInv(hands[h]!))" @click="screen.select(refInv(hands[h]!))">{{ itemName(hands[h]!) }}</div>
            <span v-else class="empty">empty</span>
          </div>
        </template>
        <div class="slot" @dragover.prevent @drop="drop($event, { at: 'back' })">
          <span class="sl">Back</span>
          <div class="its">
            <div v-for="b in backs" :key="b.uid" class="it" draggable="true" :class="{ on: isSel(refInv(b)) }" @dragstart="dragStart($event, refInv(b))" @click="screen.select(refInv(b))">{{ itemName(b) }}</div>
            <span v-if="!backs.length" class="empty">nothing</span>
          </div>
        </div>
        <div class="slot" @dragover.prevent @drop="drop($event, { at: 'belt' })">
          <span class="sl">On the belt <span class="dim" v-if="belt">({{ beltItems.length }}/{{ defOf(belt).loops }})</span></span>
          <div class="its">
            <div v-for="i in beltItems" :key="i.uid" class="it" draggable="true" :class="{ on: isSel(refInv(i)) }" @dragstart="dragStart($event, refInv(i))" @click="screen.select(refInv(i))">{{ itemName(i) }}</div>
            <span v-if="!belt" class="empty">no belt worn</span>
            <span v-else-if="!beltItems.length" class="empty">nothing</span>
          </div>
        </div>
        <div class="cc-label">Worn <span class="dim">(outermost first; drop here to wear)</span></div>
        <div class="worn" @dragover.prevent @drop="drop($event, { at: 'worn' })">
          <div v-for="r in REGIONS" :key="r" class="slot">
            <span class="sl">{{ REGION_NAMES[r] }}</span>
            <div class="its">
              <div v-for="i in wornAt(r)" :key="i.uid" class="it" draggable="true" :class="{ on: isSel(refInv(i)) }" :title="defOf(i).wear?.layer" @dragstart="dragStart($event, refInv(i))" @click="screen.select(refInv(i))">{{ itemName(i) }}</div>
              <span v-if="!wornAt(r).length" class="empty">bare</span>
            </div>
          </div>
          <div v-for="(n, j) in JEWEL_SLOTS" :key="j" v-show="jewels(j).length" class="slot">
            <span class="sl">{{ JEWEL_NAMES[j] }} <span class="dim">({{ jewels(j).length }}/{{ n }})</span></span>
            <div class="its">
              <div v-for="i in jewels(j)" :key="i.uid" class="it" draggable="true" :class="{ on: isSel(refInv(i)) }" @dragstart="dragStart($event, refInv(i))" @click="screen.select(refInv(i))">{{ itemName(i) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Containers -->
      <section class="inv-col">
        <div class="cc-label">Bags and packs <span class="dim">(drop on one to put in)</span></div>
        <div v-for="c in containers" :key="c.uid" class="box" @dragover.prevent @drop.stop="drop($event, { at: 'in', parent: c.uid })">
          <div class="box-head" :class="{ on: isSel(refInv(c)) }" @click="screen.select(refInv(c))">
            <b>{{ itemName(c) }}</b> <span class="dim">{{ inv.where(c.loc) }}</span>
          </div>
          <div class="box-meter">
            <span>{{ inv.contentsBulk(c.uid).toFixed(1) }} / {{ defOf(c).container!.litres }} L</span>
            <span>{{ inv.contentsWeight(c.uid).toFixed(1) }} / {{ defOf(c).container!.maxKg }} kg</span>
            <span class="dim">up to {{ SIZE_WORD(defOf(c).container!.maxSize) }}</span>
          </div>
          <div v-if="defOf(c).container!.straps" class="straps" @dragover.prevent @drop.stop="drop($event, { at: 'strap', parent: c.uid })">
            <span class="sl">Strapped outside ({{ inv.strapped(c.uid).length }}/{{ defOf(c).container!.straps }})</span>
            <div class="its">
              <div v-for="i in inv.strapped(c.uid)" :key="i.uid" class="it" draggable="true" :class="{ on: isSel(refInv(i)) }" @dragstart="dragStart($event, refInv(i))" @click="screen.select(refInv(i))">{{ itemName(i) }}</div>
              <span v-if="!inv.strapped(c.uid).length" class="empty">drop here to strap on</span>
            </div>
          </div>
          <div v-for="i in inv.children(c.uid)" :key="i.uid" class="it row-it" draggable="true" :class="{ on: isSel(refInv(i)) }" @dragstart="dragStart($event, refInv(i))" @click="screen.select(refInv(i))">
            <span>{{ itemName(i) }}</span><span class="dim">{{ info(i) }}</span>
          </div>
          <div v-if="!inv.children(c.uid).length" class="empty">empty</div>
        </div>
        <p v-if="!containers.length" class="dim">You carry no bag or pack: only what your hands and belt can hold.</p>
      </section>

      <!-- Nearby, and the chosen thing -->
      <section class="inv-col">
        <div v-for="s in spots" :key="`${s.x},${s.y}`" class="box" @dragover.prevent @drop="drop($event, { at: 'ground', x: s.x, y: s.y })">
          <div class="box-head"><b>{{ s.label }}</b></div>
          <template v-for="i in screen.groundAt(s)" :key="i.uid">
            <div class="it row-it" draggable="true" :class="{ on: isSel(refGround(s, i)) }" @dragstart="dragStart($event, refGround(s, i))" @click="screen.select(refGround(s, i))">
              <span>{{ itemName(i) }}</span><span class="dim">{{ info(i) }}</span>
            </div>
            <div v-for="j in screen.groundInside(s, i.uid)" :key="j.uid" class="it row-it inner">
              <span>{{ itemName(j) }}</span>
            </div>
          </template>
          <div v-if="!screen.groundAt(s).length" class="empty">nothing</div>
        </div>

        <div v-if="chosen" class="chosen">
          <div class="cc-label">Chosen</div>
          <p><b>{{ itemName(chosen) }}</b><span class="dim"> ({{ ui.selected?.from === 'ground' ? 'nearby' : inv.where(chosen.loc) }})</span></p>
          <p class="dim">
            {{ QUALITY_WORD[chosen.quality] }} {{ defOf(chosen).kind }}<span v-if="chosen.make">, {{ chosen.make }} make</span>;
            {{ (defOf(chosen).weight * chosen.qty).toFixed(2) }} kg, {{ (defOf(chosen).bulk * chosen.qty).toFixed(1) }} L, {{ SIZE_WORD(defOf(chosen).size) }}<span v-if="defOf(chosen).durable !== false">; {{ conditionWord(chosen.condition) }}</span><span v-if="defOf(chosen).uses">; {{ chosen.uses }} of {{ defOf(chosen).uses }} {{ defOf(chosen).useWord }} left</span>; worth about {{ moneyText(itemValue(chosen)) }}.
          </p>
          <p v-if="defOf(chosen).about" class="dim">{{ defOf(chosen).about }}</p>
          <p v-if="defOf(chosen).container" class="dim">Holds {{ defOf(chosen).container!.litres }} L and {{ defOf(chosen).container!.maxKg }} kg, things up to {{ SIZE_WORD(defOf(chosen).container!.maxSize) }}.</p>
          <div class="acts">
            <button v-for="(a, k) in actions" :key="k" :disabled="!!a.why" :title="a.why ?? ''" @click="screen.act(a)">{{ a.label }}</button>
          </div>
        </div>
      </section>
    </div>

    <footer class="inv-foot">
      <span class="msg">{{ ui.message }}</span>
      <span class="dim">Drag things between places, or choose one: W wear or take off, H hold, B back, S strap to a pack, L belt, P put in a bag, D drop, T take; up and down to choose.</span>
    </footer>
  </div>
</template>

<style scoped>
.inv { width: min(1200px, 96vw); height: min(820px, 92vh); display: flex; flex-direction: column; gap: 8px; }
.inv-head { flex-wrap: nowrap; }
.inv-head h2 { margin: 0; font-weight: 500; color: var(--accent); }
.inv-load { display: flex; flex-direction: column; gap: 3px; min-width: 260px; font-size: 0.88em; }
.inv-load .bar { height: 6px; }
.inv-load.burdened .bar div { background: #d9a441; }
.inv-load.heavy .bar div { background: #d9783e; }
.inv-load.overloaded .bar div { background: #c84a3a; }
.inv-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1.1fr 1fr; gap: 12px; }
.inv-col { overflow: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
.cc-label { color: var(--dim); font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
.slot { display: grid; grid-template-columns: 7.5em 1fr; gap: 6px; align-items: start; padding: 4px 6px; border: 1px dashed transparent; border-radius: 6px; }
.slot:hover, .box:hover { border-color: var(--line); }
.sl { color: var(--dim); font-size: 0.9em; }
.its { display: flex; flex-wrap: wrap; gap: 4px; }
.it { background: #232a3a; border: 1px solid var(--line); border-radius: 5px; padding: 2px 7px; cursor: grab; font-size: 0.92em; }
.it.on, .box-head.on { border-color: var(--accent); color: var(--accent); }
.row-it { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
.row-it.inner { margin-left: 16px; opacity: 0.8; cursor: default; }
.empty { color: var(--dim); font-size: 0.88em; font-style: italic; }
.worn { border: 1px solid var(--line); border-radius: 8px; padding: 4px; }
.box { border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
.box-head { cursor: pointer; }
.straps { display: grid; grid-template-columns: 11em 1fr; gap: 6px; padding: 3px 0 5px; border-bottom: 1px dashed var(--line); margin-bottom: 4px; }
.box-meter { display: flex; gap: 10px; font-size: 0.82em; color: var(--dim); margin: 2px 0 4px; }
.chosen { border-top: 1px solid var(--line); padding-top: 6px; }
.chosen p { margin: 3px 0; }
.acts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.acts button { padding: 3px 9px; font-size: 0.9em; }
.inv-foot { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid var(--line); padding-top: 6px; font-size: 0.88em; }
.inv-foot .msg { color: var(--accent); }
@media (max-width: 900px) {
  .inv-cols { grid-template-columns: 1fr; overflow: auto; }
}
</style>
