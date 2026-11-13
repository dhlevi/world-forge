/** The steps of character creation, in order (screens/creation.ts; shown by views/CreationView.vue). */
export const STEPS = [
  { id: 'origin', name: 'Origin' },
  { id: 'fate', name: 'Fate' },
  { id: 'family', name: 'Family' },
  { id: 'traits', name: 'Traits' },
  { id: 'life', name: 'Life' },
  { id: 'finish', name: 'Finish' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];
