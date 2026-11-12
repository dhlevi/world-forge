<script setup lang="ts">
/** The saved games: continue, export, delete, or import one from a file. */
import { exportSave, loadSave } from '../../game/save';
import type { LoadScreen } from '../menus';

const props = defineProps<{ screen: LoadScreen }>();
const app = props.screen.app;
const st = app.state;
const when = (iso: string) => new Date(iso).toLocaleString();
const gameDay = (t: number) => `day ${Math.floor(t / 86400) + 1}`;

async function exportOne(id: string): Promise<void> {
  const s = await loadSave(id);
  if (s) exportSave(s);
}

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
            <span><b>{{ s.place }}</b> <span>{{ s.title }}, {{ gameDay(s.time) }}; saved {{ when(s.savedAt) }}</span></span>
            <span class="btns">
              <button class="primary" @click="app.continueGame(s.id)">Continue</button>
              <button @click="exportOne(s.id)">Export</button>
              <button @click="app.removeSave(s)">Delete</button>
            </span>
          </div>
        </li>
      </ul>
      <p v-if="!st.saves.length" class="hint">No saved games yet.</p>
      <div class="row">
        <label class="file">Import a saved game<input type="file" accept=".json,application/json" @change="importFile" /></label>
        <button @click="screen.close()">Back</button>
      </div>
    </section>
    <p v-if="st.error" class="error">{{ st.error }}</p>
  </div>
</template>
