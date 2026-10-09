<script setup lang="ts">
const model = defineModel<number>({ required: true });
defineProps<{
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: string;
}>();
const emit = defineEmits<{ commit: [] }>();
</script>

<template>
  <label class="range-field" :title="hint">
    <span class="range-label">
      <span>{{ label }}</span>
      <span class="range-value">{{ format ? format(model) : model }}</span>
    </span>
    <input
      v-model.number="model"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      @change="emit('commit')"
    />
  </label>
</template>

<style scoped>
.range-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.range-label {
  display: flex;
  justify-content: space-between;
}
.range-value {
  color: #9fb3c8;
  font-variant-numeric: tabular-nums;
}
input[type='range'] {
  width: 100%;
  accent-color: #d9a54a;
}
@media (max-width: 768px) {
  input[type='range'] {
    min-height: 44px;
  }
}
</style>
