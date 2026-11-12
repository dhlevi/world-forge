<script setup lang="ts">
/** The title: new game, continue, load, options, quit. */
import { desktop } from '../../desktop';
import type { TitleScreen } from '../menus';

const props = defineProps<{ screen: TitleScreen }>();
const app = props.screen.app;
const st = app.state;
const gameDay = (t: number) => `day ${Math.floor(t / 86400) + 1}`;
</script>

<template>
  <div class="title-screen">
    <div class="title-card">
      <h1>World Forge</h1>
      <div class="subtitle">Wanderer</div>
      <nav class="menu">
        <button class="primary" @click="app.newGame()">New game</button>
        <button v-if="st.saves.length" @click="app.continueGame(st.saves[0].id)">
          Continue <span class="dim">{{ st.saves[0].place }}, {{ gameDay(st.saves[0].time) }}</span>
        </button>
        <button :disabled="!st.saves.length" @click="app.showSaves()">Load game</button>
        <button disabled title="Not yet">Options</button>
        <button v-if="desktop" @click="app.quit()">Quit</button>
      </nav>
      <p v-if="st.error" class="error">{{ st.error }}</p>
    </div>
    <p v-if="st.info" class="hint desk">
      Desktop {{ st.info.version }} · Electron {{ st.info.electron }} ·
      <a href="#" @click.prevent="desktop!.data.show()">data folder</a>
    </p>
  </div>
</template>
