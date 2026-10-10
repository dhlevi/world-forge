<script setup lang="ts">
import { onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import MapView from './components/MapView.vue';
import DwellingView from './components/DwellingView.vue';
import LairView from './components/LairView.vue';
import DungeonView from './components/DungeonView.vue';
import SearchBar from './components/SearchBar.vue';
import LocationTitle from './components/LocationTitle.vue';
import { regenerate } from './store';

onMounted(regenerate);
</script>

<template>
  <MapView />
  <ControlPanel />
  <SearchBar />
  <LocationTitle />
  <DwellingView />
  <LairView />
  <DungeonView />
</template>
