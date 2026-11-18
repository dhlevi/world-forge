<script setup lang="ts">
/** The keys, over the map. */
import type { KeysScreen } from '../play';

defineProps<{ screen: KeysScreen }>();

const GROUPS: { name: string; keys: [string, string][] }[] = [
  {
    name: 'Getting about',
    keys: [
      ['Move', 'arrows, number pad, or h j k l y u b n'],
      ['Run', 'Shift + direction'],
      ['Wait', '. or 5'],
      ['Doors', 'walk into one to open it; o / c then a direction'],
      ['Stairs', '< and > on stairs or a ladder go up and down (and down a cave mouth, a dungeon\'s steps, a grate, or a well beside you)'],
      ['Climb', 'walk into a rock face twice to climb it'],
      ['Travel map', 'T (and T or Z to come back)'],
    ],
  },
  {
    name: 'Looking',
    keys: [
      ['Look', 'x, then move the cursor; or point at a tile'],
      ['Levels', '< and > elsewhere look up and down'],
      ['Zoom', '+ and -'],
      ['Roofs', 'Shift+R: shown unless you are inside, always, or never'],
      ['Town view', 'V, in a town or city'],
    ],
  },
  {
    name: 'Doing',
    keys: [
      ['Talk', 'E: to the one beside you (then a direction, if there are more)'],
      ['Sneak', 'Shift+S: move quietly and slowly (Sneak); animals see and hear you less'],
      ['Snare', 'P: set a snare wire here for small game, or lift one; walk onto it to take a catch'],
      ['Cut brush', 'A, then a direction: clear a bush or scrub with a machete, axe, hatchet, sword or knife (Survival)'],
      ['Light', 'F: light a lantern, torch or candle from your pack, or put it out'],
      ['Drink', 'Q at water or a well (fills waterskins too)'],
      ['Sleep or rest', 'Shift+Z'],
      ['Camp', 'Shift+C: choose a site, fire, shelter, food, the night'],
      ['Read the sky', 'Shift+W: what weather is coming (Survival)'],
    ],
  },
  {
    name: 'Yourself and the game',
    keys: [
      ['Character', '@'],
      ['Inventory', 'I (G to pick up; eat and drink from it)'],
      ['Save', 'Ctrl+S (also saved every few minutes and on leaving)'],
      ['These keys', '?'],
    ],
  },
  {
    name: 'On the travel map',
    keys: [
      ['Travel or stop', 'Space or Enter (Esc stops)'],
      ['Find the party', 'F'],
      ['Scale', '+ and -'],
      ['Zoom in', 'Z: to the local map'],
    ],
  },
];
</script>

<template>
  <div class="help card">
    <header class="row">
      <h2>Keys</h2>
      <span class="grow" />
      <button @click="screen.close()">Close (Esc)</button>
    </header>
    <div class="groups">
      <section v-for="g in GROUPS" :key="g.name">
        <h3>{{ g.name }}</h3>
        <dl>
          <template v-for="[name, how] in g.keys" :key="name">
            <dt>{{ name }}</dt>
            <dd>{{ how }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.help { width: min(880px, 94vw); max-height: 88vh; overflow: auto; }
.help h2 { margin: 0; font-weight: 500; color: var(--accent); }
.groups { columns: 2 340px; column-gap: 28px; }
section { break-inside: avoid; margin-bottom: 12px; }
h3 { margin: 0 0 4px; color: var(--dim); font-size: 0.8em; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
dl { margin: 0; display: grid; grid-template-columns: 7.5em 1fr; gap: 3px 10px; font-size: 0.94em; }
dt { color: var(--accent); }
dd { margin: 0; }
</style>
