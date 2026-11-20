/** A person looked over, or one of the character's life: their card (game/person-card.ts), over what was on screen. */
import { Screen } from '../engine/screens';
import type { PersonCard } from '../game/person-card';
import PersonView from './views/PersonView.vue';

export class PersonScreen extends Screen {
  readonly view = PersonView;
  popup = true;
  constructor(readonly card: PersonCard) {
    super();
  }
  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape' || e.code === 'Enter') this.close();
    // Every other key is kept from what lies beneath.
    return true;
  }
}
