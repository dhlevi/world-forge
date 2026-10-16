import type { Rng } from '../gen/rng';
import { type DRoom, type Dungeon, KIND_NAME, pick } from './core';
import { hookTail, roomNotes, senseDetail, type SiteKind } from '../keys/flavour';

/**
 * The written key: a hook for the whole site, then a heading and a short description for every
 * numbered room, drawn from what the generator placed there (its tags) and the kind of site.
 */

const EPITAPHS = [
  'What you are, I was; what I am, you will be.',
  'Here lies one who kept faith. Let none disturb her rest.',
  'Gone before. Waiting.',
  'He paid every debt but one.',
  'Sleep, and do not wake until the horn.',
  'Taken by the sea, returned by the sea.',
];

const HOOKS: Record<string, string[]> = {
  crypt: [
    'The family that raised this crypt died out a century ago; lately its door has been found open at dawn.',
    'A ring of the old lord, needed to prove an inheritance, was buried with him below.',
    'Gravediggers refuse to work near the crypt after one of them heard knocking from inside a sealed tomb.',
    "A scholar wants a rubbing of the inscription on the founder's tomb, and will not say why.",
    'Bodies in the village churchyard have been found disturbed, and the trail leads here.',
  ],
  catacomb: [
    'The bone galleries beneath the town are older than its walls, and nobody has mapped the deepest of them.',
    'Smugglers have been using the catacombs to move goods past the gate; one of them never came back up.',
    'A relic stolen from the cathedral was traced to an ossuary somewhere in the galleries.',
    'The bishop wants the bones of a saint moved to the new cathedral, and the gravediggers refuse to go down.',
    'Pilgrims report a new passage opened in the deep galleries after the last earthquake.',
  ],
  mine: [
    'The miners broke into a natural cavern on the lowest level and sealed the drift the same day.',
    'The mine was abandoned after a collapse; its last cart of silver ore was never brought up.',
    'Strange lights are seen at the adit mouth at night, and the mine owner pays well for answers.',
    'The miners struck a vault of worked stone in the deepest working; the foreman wants to know whose it is.',
    'Ore carts have been coming up empty, and the night shift tells stories of small grey men.',
  ],
  tower: [
    'The tower belonged to a scholar who vanished with her apprentice; her books are said to remain.',
    'A signal fire burns on the tower roof some nights, though the garrison left long ago.',
    'The keeper of the tower has stopped sending tithes, and the steward wants to know why.',
    'The tower appeared on the hill a month ago. Nobody saw it built.',
    "A wizard's heir needs the deed kept in the tower study to claim her inheritance.",
  ],
  ruin: [
    'Treasure hunters say the old manor kept its strongroom below ground, beyond the collapsed cellar stair.',
    'Shepherds avoid the ruins after dark; their dogs will not go near the chapel wall.',
    'Bandits have taken over the ruins and raid the road from behind its broken walls.',
    "The ruins were a lord's hall until a single night of fire; the family's fate was never known.",
    'A herb-woman pays for nightcap mushrooms that grow only in the ruined cellars.',
  ],
  well: [
    'The village well has begun to taste of iron and smoke, and a bucket came up with a cut rope.',
    'A child who climbed down the well for a dare came back up speaking of lights and voices below.',
    'Goods vanish from the village and turn up for sale in the next town; the trail ends at the well.',
    'On still nights the well echoes with chanting, though no one in the village admits to hearing it.',
    "An old woman swears her grandfather hid the lord's silver down the well when the raiders came.",
  ],
  sewer: [
    'Something has been taking cats, and lately a child, through the gratings of the lower town.',
    'A thieves\' guild runs its business from the drains; the watch would pay for a map of them.',
    'The sewers have started to back up, and the city engineer suspects a blockage that is not natural.',
    "A noble's daughter fled into the sewers rather than marry; her father wants her back unharmed.",
    'Strange chanting rises through the gratings under the old temple at midnight.',
  ],
};

type Entry = [name: string, text: string[]];
const ROOMS: Record<string, Entry> = {
  hall: ['Hall', ['Pillars hold up a vaulted ceiling. Dust lies thick, broken by recent footprints.', 'A wide hall with a cracked flagstone floor and faded paintings on the walls.', 'Banners hang in rags from the beams; the device on them has been slashed through.', 'Stone benches line the walls, worn hollow by generations of the faithful.', 'The floor is a mosaic of a ship on a black sea, half its tiles prised away.']],
  vault: ['Burial vault', ['Stone sarcophagi rest here, their lids carved with effigies. One lid lies askew.', 'The tombs of a noble line; the names have been chiselled out of every lid.', 'Niches in the walls hold urns of ashes, each sealed with wax.', "A single great tomb stands here, its effigy's face worn away by many hands.", 'The coffins here are wooden and have mostly rotted, spilling their contents.', 'Iron bands hold the lids of these sarcophagi shut. Someone wanted them to stay closed.']],
  ossuary: ['Ossuary', ['Skulls are stacked along the walls in neat rows; long bones fill the alcoves below.', 'Bones are arranged in patterns on the walls. Some patterns look newer than others.', 'Thigh bones are stacked like firewood to the roof, skulls set among them in crosses.', 'A chandelier made of bones hangs from the ceiling.', 'Bones are sorted by kind into bins along the walls, each bin labelled in a faded hand.']],
  chapel: ['Chapel', ['An altar stands before a defaced icon. Old wax pools around two braziers.', 'A small shrine with a cold altar. Offerings left here have not rotted.', 'Prayer cards and dried flowers lie heaped before a small altar.', 'A bell with no clapper hangs above the altar.']],
  treasury: ['Treasury', ['A heavy chest sits on a plinth, guarded by an urn of ashes.', 'Grave goods are stored here: a chest bound in iron and funeral urns.']],
  guard: ['Guard room', ['A table, overturned stools and an empty barrel. Graffiti covers one wall.', 'A guard post. The weapons rack is empty and the table is set for a meal never eaten.', 'Weapon racks stand empty except for a broken halberd.', 'A rough table holds a game of dice abandoned mid-throw.']],
  shrine: ['Shrine', ['A statue of a forgotten saint watches the doorway, its face worn smooth.', 'A niche shrine with a weathered statue and coins pressed into the mortar.', 'Votive candles are still burning. Someone was here today.']],
  stope: ['Worked stope', ['A worked-out chamber; tool marks score the walls and a seam of ore still shows.', 'Timbers prop up the roof of this stope; fresh dust trickles from a crack above.', 'The roof of this stope is low and braced with fresh-cut props.', 'Picks and shovels lie where they were dropped, rusted to the stone.']],
  ore: ['Ore face', ['A rich seam glitters in the lamplight. Someone has been working it recently.', 'The vein widens here. Abandoned picks lie where they were dropped.']],
  flooded: ['Flooded chamber', ['Black water fills the chamber to the knee and drips from the roof.', 'The pumps failed long ago; the chamber is flooded and cold.']],
  camp: ['Miners\' camp', ['Crates and barrels of supplies, a cold hearth and bedrolls.', 'A resting place with crates of tallow candles and a barrel of stale water.']],
  collapse: ['Collapse', ['Rubble chokes half the chamber. A hand protrudes from beneath a slab.', 'The roof has come down here; a narrow gap leads over the fall.']],
  collapsed: ['Collapsed tunnel', ['Fallen masonry blocks most of the way. The air smells of damp earth.', 'The vault has fallen in; daylight shows through a crack in the street above.']],
  store: ['Storeroom', ['Barrels and crates, most broken open and empty.', 'Shelves of rotting sacks; rats scatter from the light.', 'Sacks of grain have burst and sprouted pale shoots in the dark.', 'Broken crockery and empty bottles cover the floor.']],
  library: ['Library', ['Bookcases line the walls; a reading table holds an open ledger.', 'Shelves of mouldering books, and a few that are curiously well kept.', 'One shelf has been emptied in haste; the dust shows the outlines of the missing books.']],
  study: ['Study', ['A writing table under the window, ink long dried, a locked chest beside it.', 'Papers are scattered as if someone searched the room in a hurry.', 'An astrolabe on the desk is set to a date some years in the future.']],
  bedchamber: ['Bedchamber', ['A curtained bed and a travelling chest.', 'A narrow bed and a chest with a broken lock.']],
  laboratory: ['Laboratory', ['A long bench of glassware, a brazier and a barrel of something that smells of vinegar.', 'Burn marks scar the floor around a workbench of alembics.']],
  armoury: ['Armoury', ['Crates of spearheads and a barrel of arrows.', 'Racks and crates; most of the weapons are rusted through.']],
  cistern: ['Cistern', ['A deep tank of still water fills the room; steps lead down into it.', 'The cistern is full. Something moves beneath the surface.', 'Stone steps lead down into still water of unknown depth.', 'The water is clear, and coins glint on the bottom.']],
  dungeon: ['Cell', ['Chains hang from the wall above a heap of bones.', 'A cell with a rusted grille and scratched tallies on every wall.']],
  roof: ['Roof', ['A crenellated parapet and a beacon brazier. The view reaches for miles.', 'The roof is open to the sky; birds nest in the merlons.']],
  chamber: ['Chamber', ['Roofless walls enclose a room choked with weeds.', 'A ruined room; a hearth survives in one wall.', 'Bird droppings whiten the floor below a gap in the wall.', 'A collapsed fireplace still holds the ashes of a last fire.']],
  kitchen: ['Kitchen', ['A well and a collapsed hearth. Broken pottery crunches underfoot.', 'The old kitchen, with a well still holding water.']],
  court: ['Courtyard', ['An open court overgrown with brambles.', 'A paved court with a dry fountain basin.']],
  cell: ['Cell', ['A locked cell with straw on the floor.', 'A cramped cell; the door has a hatch for food.', 'Manacles hang from the wall, one pair still closed.', 'A cot, a bucket and a name scratched over and over into the door.']],
  den: ['Den', ['Bedrolls, a stolen cask and a cold fire: someone lives here.', 'A hideout with crates of stolen goods.', 'A nest of rags and straw, and the remains of many meals.', 'Someone has hung curtains and laid a rug: a home, of sorts.']],
  junction: ['Junction', ['Tunnels meet at a vaulted chamber where the channels join with a roar.', 'A brick junction chamber; old chalk marks point the way.', 'Three tunnels meet here; the current is strong where they join.', 'A vaulted chamber where the channels mingle in a slow, foul whirlpool.']],
  'thieves-hall': ['Thieves\' guildhall', ['Behind the false wall, a lamplit hall: a long table, a map of the city above pinned with daggers, and a chair at its head no one else sits in.', 'The guild meets here. Chalk marks on the wall tally debts and the names of marks; a bell on a cord rings if the secret door is opened.', 'A warm, dry hall that smells of pipe smoke and wine, strange after the sewer. Cards and coin lie where a game was left.']],
  'thieves-vault': ['Guild vault', ['Chests of coin and stolen plate, a strongbox of letters useful for blackmail, and a ledger in a cipher.', 'The guild\'s takings, sorted and tagged for the fences: silverware, rings, a reliquary that will be missed.', 'Locked chests and a trapped strongbox. A list of the city watch and the price of each of them is nailed to the wall.']],
  'thieves-dorm': ['Thieves\' quarters', ['Bunks for the guild\'s apprentices, picks and dark cloaks hung on pegs.', 'Bedrolls and a practice lock bolted to a table, its brass worn bright by many hands.']],
  wellpool: ['Bottom of the well', ['The shaft opens into a grotto; the rope hangs down into a cold, clear pool, and a ledge runs round it.', 'Daylight falls in a pale column from the well mouth far above onto black water and a shelf of wet stone.', 'A dropped bucket floats in the pool beneath the shaft; scratches on the rock show where others have climbed down.']],
  grotto: ['Grotto', ['A low natural cave; water drips from pale stone teeth into small pools.', 'A cavern of flowstone, its walls slick and shining in the lamplight.', 'A dry grotto where the passages meet; something has scraped a sleeping hollow in the floor.']],
  pooled: ['Pool cave', ['Still water fills most of this cave; a narrow shelf runs along one wall.', 'The floor drops away into a pool so clear the bottom looks close enough to touch. It is not.']],
  smugglers: ["Smugglers' cache", ['Behind the hidden door, a dry room of worked stone stacked with casks and bales that never paid a toll.', 'Crates marked with the stamps of three different ports; a tally board on the wall lists names from the village.']],
  'hidden-shrine': ['Hidden shrine', ['A shrine to a god the village claims to have forgotten: an altar, fresh offerings and a ring of burnt candles.', 'The walls are painted with eyes and spirals; the altar stone is stained dark and still tacky.']],
  hoard: ['Forgotten hoard', ['A sealed chamber, its door hidden for generations; an iron-bound chest waits beneath the dust.', 'Funeral urns and a rotted chest of coin: someone hid their wealth here long ago and never came back for it.']],
  outfall: ['Outfall', ['Iron bars close the outfall where the sewer empties toward the water.', 'The outfall: a rusted grille, one bar bent wide enough to squeeze through.']],
};

export function writeKey(d: Dungeon, rnd: Rng): void {
  // The caves under a well take their creatures, traps and treasure from the natural caves.
  const kind = (d.site.kind === 'well' ? 'cave' : d.site.kind) as SiteKind;
  d.title = d.site.name;
  d.hook = [pick(rnd, HOOKS[d.site.kind] ?? HOOKS.crypt), hookTail(rnd)].filter(Boolean).join(' ');
  const used = new Set<string>();
  d.levels.forEach((L, k) => {
    for (const r of L.rooms) {
      if (!r.n) continue;
      const entry = k === 0 || L.entrances.length > 0 ? L.entrances.length > 0 && isNear(r, L.entrances[0]) : false;
      describe(r, kind, rnd, entry, used);
      r.notes = roomNotes(kind, rnd, { tag: r.tags[0], entry, depth: kind === 'tower' ? 0 : k, used });
    }
  });
  void KIND_NAME;
}

function isNear(r: DRoom, e: { x: number; y: number }): boolean {
  return e.x >= r.x - 3 && e.x <= r.x + r.w + 3 && e.y >= r.y - 3 && e.y <= r.y + r.h + 3;
}

function describe(r: DRoom, kind: SiteKind, rnd: Rng, entry: boolean, used: Set<string>): void {
  const tag = r.tags[0] ?? 'chamber';
  const e = ROOMS[tag] ?? ROOMS.chamber;
  r.name = entry && tag !== 'junction' ? `Entrance ${e[0].toLowerCase()}` : e[0];
  // A description not yet used in this site, if one is left.
  const fresh = e[1].filter((t) => !used.has(t));
  const base = pick(rnd, fresh.length ? fresh : e[1]);
  used.add(base);
  const parts = [base];
  const ep = EPITAPHS.filter((t) => !used.has(t));
  if (tag === 'vault' && ep.length && rnd() < 0.4) {
    const t = pick(rnd, ep);
    used.add(t);
    parts.push(`An epitaph reads: "${t}"`);
  }
  const down = r.tags.find((t) => t.startsWith('down:'));
  if (down) {
    const s = down.slice(5);
    parts.push(s === 'shaft' ? 'A winding shaft drops to the level below.' : s === 'ladder' ? 'A ladder leads down into the dark.' : 'Stairs descend to the level below.');
  }
  // A detail for the senses, used at most twice in a site.
  const sense = senseDetail(kind, rnd);
  if (sense && !used.has(`2:${sense}`)) {
    used.add(used.has(`1:${sense}`) ? `2:${sense}` : `1:${sense}`);
    parts.push(sense);
  }
  r.text = parts.join(' ');
}
