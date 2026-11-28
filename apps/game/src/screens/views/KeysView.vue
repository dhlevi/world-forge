<script setup lang="ts">
/** The keys, over the map. */
import type { KeysScreen } from '../play';

defineProps<{ screen: KeysScreen }>();

const GROUPS: { name: string; keys: [string, string][] }[] = [
  {
    name: 'Getting about',
    keys: [
      ['Move', 'arrows, number pad, or h j k l y u b n'],
      ['Run', 'Shift + direction: a step at a time, faster for the nimble; stops when something new comes into sight, and any key stops it'],
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
      ['Look someone over', 'Shift+I: the nearest person in sight (or, while looking, the one under the cursor; Enter does the same); or click on them. Their portrait, and what you know of them'],
      ['Levels', '< and > elsewhere look up and down'],
      ['Zoom', '+ and -'],
      ['Roofs', 'Shift+R: shown unless you are inside, always, or never'],
      ['Town view', 'V, in a town or city; Shift+V uses the place you stand in (a tavern, an inn, a market, a shop, a temple) as from the town view'],
    ],
  },
  {
    name: 'Doing',
    keys: [
      ['Talk', 'E: to the one beside you (then a direction, if there are more)'],
      ['Shoot or throw', 'R: loose an arrow, a bolt or a sling stone, or throw anything you carry, at a beast in sight (Tab: the next; Left and Right: what; Up and Down: the aim). Unaware game is far easier to hit'],
      ['Gather', 'M: stones on stony ground or in a stream bed, sticks under trees (Survival)'],
      ['Fight', 'Shift+F: strike a beast or person within reach (Y in it: yield to robbers or the watch), choosing the aim, the blow and the stance (with the chance of each); walking into a beast or person that is fighting you strikes with your standing choices, and walking into one who has yielded, fallen or been bound gives the choices of mercy (let go, rob, bind, tend, kill, hand to the watch). Your weapon is drawn first if none is in hand'],
      ['Sneak', 'Shift+S: move quietly and slowly (Sneak); animals see and hear you less'],
      ['Snare', 'P: set a snare wire here for small game, or lift one; walk onto it to take a catch'],
      ['Cut brush', 'A, then a direction: clear a bush or scrub with a machete, axe, hatchet, sword or knife (Survival)'],
      ['Light', 'F: light a lantern, torch or candle from your pack, or put it out'],
      ['Drink', 'Q at water or a well (fills waterskins too)'],
      ['Wash', 'W in or beside water, at a well or fountain, or in a bathtub: off with the dirt and the blood (cleaner with soap)'],
      ['Groom', 'Shift+G: cut or dress your hair, shave or trim your beard (a knife; soap and water for a shave)'],
      ['Sleep or rest', 'Shift+Z'],
      ['Camp', 'Shift+C: choose a site, fire, shelter, food, the night'],
      ['Read the sky', 'Shift+W: what weather is coming (Survival)'],
    ],
  },
  {
    name: 'Yourself and the game',
    keys: [
      ['Character', '@'],
      ['Journal', 'Shift+Q: the work you have taken up, and what is left to do'],
      ['Health', 'D: your wounds, blood and pain, and first aid (bandage, clean, stitch, splint, poultice)'],
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
