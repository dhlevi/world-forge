<script setup lang="ts">
import { onMounted } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import MapView from './components/MapView.vue';
import DwellingView from './components/DwellingView.vue';
import LairView from './components/LairView.vue';
import DungeonView from './components/DungeonView.vue';
import SearchBar from './components/SearchBar.vue';
import LocationTitle from './components/LocationTitle.vue';
import RealmView from './components/RealmView.vue';
import CultureView from './components/CultureView.vue';
import FaithView from './components/FaithView.vue';
import FaithLegend from './components/FaithLegend.vue';
import GroupLegend from './components/GroupLegend.vue';
import RelationsLegend from './components/RelationsLegend.vue';
import OldWorldLegend from './components/OldWorldLegend.vue';
import MapKey from './components/MapKey.vue';
import DeepRealmView from './components/DeepRealmView.vue';
import OrderView from './components/OrderView.vue';
import { regenerate } from './store';

onMounted(regenerate);
</script>

<template>
  <MapView />
  <ControlPanel />
  <SearchBar />
  <LocationTitle />
  <FaithLegend />
  <GroupLegend />
  <RelationsLegend />
  <OldWorldLegend />
  <MapKey />
  <RealmView />
  <CultureView />
  <FaithView />
  <DeepRealmView />
  <OrderView />
  <DwellingView />
  <LairView />
  <DungeonView />
</template>
