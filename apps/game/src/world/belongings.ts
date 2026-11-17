/**
 * What a resident wears and carries (docs/design/npcs.md, Belongings): everyday clothes by sex,
 * means and trade, in the colours of their people; a purse of coin by means; a knife and the key to
 * their home; the tools of their trade. From the same item definitions as the player's, made when
 * the person is first placed, the same every time for the same person (but for the items' uids).
 */
import { CULTURES } from '@worldforge/core/names/cultures';
import { hashString, mulberry32 } from '@worldforge/core/gen/rng';
import { Inventory } from '../actors/items/inventory';
import { makeItem } from '../actors/items/item';
import { ITEM, type Quality } from '../actors/items/defs';
import type { PlacedPerson } from '../worker/protocol';

/** Coin carried (copper) by means: the least and the most. */
const PURSE: Record<PlacedPerson['means'], [number, number]> = { destitute: [0, 4], poor: [3, 30], middling: [20, 120], comfortable: [80, 400], rich: [300, 2000] };
const QUALITY: Record<PlacedPerson['means'], Quality> = { destitute: 'poor', poor: 'poor', middling: 'common', comfortable: 'common', rich: 'fine' };

/** Trades that wear a robe (a priest's vestments, a scholar's gown). */
const ROBED = /priest|acolyte|monk|nun|prior|brother of|hermit|scholar|master$|librarian|copyist|archmage|mage|reader/;
/** Trades in armour, and those who lead them. */
const ARMED = /soldier|guard|man-at-arms|woman-at-arms|sergeant|captain|turnkey|warden|bailiff|sellsword/;
const LEADS = /sergeant|captain|warden/;
/** Trades in a work apron. */
const APRON = /smith|baker|butcher|cook|tanner|founder|chandler|brewer|potter|cobbler|tavern|innkeeper|tapster|potboy|potgirl|dyer|fuller|cooper|carpenter|joiner|mason|saddler|glover|cutler/;
/** The tools of a trade (item ids), by a pattern of the trade's name. */
const TOOLS: [RegExp, string[]][] = [
  [/smith|carpenter|joiner|cooper|wheelwright|shipwright|boatwright|mason|saddler|cutler|tinker|thatcher|hedger/, ['tool_roll']],
  [/scribe|clerk|notary|scrivener|copyist|lawyer|librarian|scholar|bookbinder/, ['writing_kit']],
  [/tailor|seamstress|sail|net-mender|weaver|glover/, ['sewing_kit']],
  [/farmer|gardener|cottar|vine|ploughman|ploughwoman/, ['hoe', 'sickle']],
  [/woodcutter|charcoal|sawyer/, ['axe']],
  [/hunter/, ['hunting_bow', 'arrows']],
  [/fisher|fishwife/, ['net']],
  [/beggar|rag-picker/, ['begging_bowl']],
  [/merchant|shopkeeper|pawnbroker|banker|money-lender|reeve|factor|chandler/, ['scales']],
  [/priest|prior|monk|nun|shrine keeper|acolyte/, ['prayer_beads', 'holy_book']],
  [/physician|apothecary|midwife|leech|healer|cunning/, ['herbs', 'bandages']],
  [/locksmith/, ['lockpicks']],
  [/shepherd|drover|swineherd|pilgrim/, ['staff']],
  [/rat-catcher|snare/, ['snares']],
  [/minstrel/, ['lute']],
  [/archmage|mage/, ['spell_book']],
];

/** Trades worked out of doors (in boots). */
const OUTDOOR = /farmer|shepherd|plough|cottar|herd|hedger|thatcher|gardener|woodcutter|sawyer|charcoal|drover|vine|grape|hunter|gatherer|fisher|labourer|porter|carter|dock|stevedore|miner|sailor/;

/**
 * A resident's belongings: worn, on the belt, in hand and in the purse. They do not depend on the
 * hour (the figure leaves off the cloak indoors and dresses for bed, world/population.ts).
 */
export function belongingsOf(p: PlacedPerson, seed: string): Inventory {
  const r = mulberry32(hashString(`${seed}#belongings#${p.id}`));
  const inv = new Inventory({ copper: 0, items: [], animals: [] });
  const make = CULTURES[p.culture]?.name;
  const q = QUALITY[p.means];
  const t = p.trade.toLowerCase();
  const [body, legs, cloak] = p.look.cloth;
  const wear = (id: string, colour?: string, quality: Quality = q) => {
    if (!ITEM.has(id)) return;
    inv.put(makeItem(id, { quality, make, colour }), { at: 'worn' });
  };
  const child = p.age < 12;

  // Clothes, inside out.
  if (!child) {
    wear('undershirt');
    wear('braies');
  }
  const fine = p.means === 'rich' || (p.means === 'comfortable' && r() < 0.5);
  if (ROBED.test(t)) wear(/priest|prior/.test(t) ? 'vestments' : /scholar|master|librarian/.test(t) ? 'scholar_gown' : 'robe', body);
  else if (p.female) wear('dress', body);
  else if (fine) wear('doublet', body);
  else wear('tunic', body);
  if (!p.female && !ROBED.test(t)) wear(fine ? 'hose' : 'trousers', legs);
  if (!child && p.means !== 'destitute') wear('socks');
  if (p.means === 'destitute' || (child && r() < 0.5)) {
    if (r() < 0.4) wear('sandals');
  } else wear(OUTDOOR.test(t) || ARMED.test(t) ? 'boots' : 'shoes');
  if (!child) wear(LEADS.test(t) ? 'sword_belt' : 'belt');
  if (ARMED.test(t)) {
    wear(LEADS.test(t) ? 'mail_shirt' : 'padded_coat');
    wear(LEADS.test(t) ? 'helm' : 'coif');
  } else if (APRON.test(t) && !child) wear('apron');
  if (!child) wear('cloak', cloak, 'poor');
  const head = p.look.head;
  if (head && !ARMED.test(t) && ITEM.has(head)) wear(head, r() < 0.5 ? legs : cloak);

  // On the belt: a purse and a knife; a key to home in the purse.
  if (!child) {
    const pouch = makeItem('pouch', { make });
    inv.put(pouch, { at: 'belt' });
    inv.put(makeItem('knife', { quality: q, make }), { at: 'belt' });
    const [lo, hi] = PURSE[p.means];
    inv.d.copper = lo + Math.floor(r() * (hi - lo + 1));
    const key = makeItem('key', { make, name: `key to ${p.homeName ?? `the home of ${p.household.replace(/^the household of /, '')}`}` });
    if (inv.put(key, { at: 'in', parent: pouch.uid })) inv.stow(key);
    if (LEADS.test(t)) inv.put(makeItem('sword', { quality: q, make }), { at: 'belt' });
    else if (ARMED.test(t)) inv.put(makeItem('spear', { quality: q, make }), { at: 'hand', hand: 'both' });
    // The tools of the trade.
    for (const [re, ids] of TOOLS) {
      if (!re.test(t)) continue;
      for (const id of ids) if (ITEM.has(id)) inv.stow(makeItem(id, { make, qty: id === 'arrows' ? 12 : 1 }));
      break;
    }
    // Those who do a household's marketing carry a basket.
    if (p.template === 'idle' || (p.template === 'servant' && /cook|maid|scullion|steward|servant|footman/.test(t))) {
      const basket = makeItem('basket', { make });
      if (inv.put(basket, { at: 'hand', hand: 'left' })) inv.stow(basket);
    }
    if (p.means === 'rich') {
      const ring = makeItem(r() < 0.5 ? 'signet_ring' : 'ring', { quality: 'fine', make });
      if (inv.put(ring, { at: 'worn' })) inv.stow(ring);
    }
  }
  return inv;
}
