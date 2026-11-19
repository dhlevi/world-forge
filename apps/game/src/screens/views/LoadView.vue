<script setup lang="ts">
/** The saved games: continue, export, delete, or import one from a file. */
import { exportSave, loadSave } from '../../game/save';
import type { LoadScreen } from '../menus';
import { computed, ref } from 'vue';

const props = defineProps<{ screen: LoadScreen }>();
const app = props.screen.app;
const st = app.state;
const when = (iso: string) => new Date(iso).toLocaleString();
const gameDay = (t: number) => `day ${Math.floor(t / 86400) + 1}`;

async function exportOne(id: string): Promise<void> {
  const s = await loadSave(id);
  if (s) exportSave(s);
}

/**
 * The developer's escape from permadeath (game/save.ts, reviveSave): carry on a dead wanderer's
 * game, mended. Remembered in this browser.
 */
const KEY = 'wf-dev-revive';
const revive = ref(false);
try {
  revive.value = localStorage.getItem(KEY) === '1';
} catch {
  // No storage: off.
}
function setRevive(on: boolean): void {
  revive.value = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Not remembered.
  }
}
const anyDead = computed(() => st.saves.some((s) => s.dead));

async function importFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) await app.importSave(await f.text());
}
</script>

<template>
  <div class="start">
    <h2 class="screen-title">Load game</h2>
    <section class="card saves">
      <ul class="sites">
        <li v-for="s in st.saves" :key="s.id">
          <div class="save-row">
            <span><b>{{ s.place }}</b> <span>{{ s.title }}, {{ gameDay(s.time) }}; saved {{ when(s.savedAt) }}</span><span v-if="s.dead" class="dead">; dead, of {{ s.dead.cause }}</span></span>
            <span class="btns">
              <button v-if="!s.dead" class="primary" @click="app.continueGame(s.id)">Continue</button>
              <button v-else-if="revive" title="Developer: carry on, the death undone" @click="app.continueGame(s.id, true)">Revive</button>
              <button @click="exportOne(s.id)">Export</button>
              <button @click="app.removeSave(s)">Delete</button>
            </span>
          </div>
        </li>
      </ul>
      <p v-if="!st.saves.length" class="hint">No saved games yet.</p>
      <label v-if="anyDead" class="hint dev"><input type="checkbox" :checked="revive" @change="setRevive(($event.target as HTMLInputElement).checked)" /> Developer: allow reviving the dead (undoes permadeath; for testing)</label>
      <div class="row">
        <label class="file">Import a saved game<input type="file" accept=".json,application/json" @change="importFile" /></label>
        <button @click="screen.close()">Back</button>
      </div>
    </section>
    <p v-if="st.error" class="error">{{ st.error }}</p>
  </div>
</template>

<style scoped>
.dead { color: #c0392b; }
.dev { display: block; margin: 6px 0; }
</style>
