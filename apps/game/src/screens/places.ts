/**
 * The kinds of place of note in a town or city, by name and in the order the city view lists them
 * (screens/city.ts, views/CityView.vue).
 */
import type { SitePlace } from '../worker/protocol';

export const KIND_NAMES: Record<SitePlace['kind'], string> = {
  gate: 'Gates and ways in', market: 'Markets', inn: 'Inns', tavern: 'Taverns', temple: 'Temples and shrines', keep: 'The keep',
  civic: 'Halls and buildings of the town', guild: 'Guilds and orders', shop: 'Workshops and shops', dock: 'The waterfront', district: 'Districts',
};
export const KIND_ORDER: SitePlace['kind'][] = ['gate', 'market', 'inn', 'tavern', 'temple', 'keep', 'guild', 'civic', 'shop', 'dock', 'district'];
