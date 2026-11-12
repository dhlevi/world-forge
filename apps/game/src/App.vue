<script setup lang="ts">
/**
 * The game's root: one GameApp (app/app.ts), whose screen stack is drawn here. Every part of the
 * game is a screen (src/screens/), and moving between them is the GameApp's work.
 */
import { onBeforeUnmount } from 'vue';
import ScreenHost from './engine/ScreenHost.vue';
import { GameApp } from './app/app';

const app = new GameApp();
app.start();
// For poking at in the browser console while developing.
if (import.meta.env.DEV) Object.assign(window, { __app: app });
onBeforeUnmount(() => app.screens.stop());
</script>

<template>
  <ScreenHost :manager="app.screens" />
</template>
