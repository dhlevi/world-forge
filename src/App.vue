<script setup lang="ts">
import { onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import MapView from './components/MapView.vue';
import DwellingView from './components/DwellingView.vue';
import { regenerate } from './store';

onMounted(regenerate);
</script>

<template>
  <MapView />
  <ControlPanel />
  <DwellingView />
</template>
