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
  prison: [
    'A prisoner in the cells claims to know where the crown jewels went, and will say so only to someone who gets her out.',
    'The warden has been selling releases to the highest bidder; a family wants proof before the next assize.',
    'An innocent man hangs at the end of the week unless someone finds the real culprit, or gets him out first.',
    'Prisoners have been vanishing from the pit, and the turnkeys swear none of them went out of the gate.',
    'A riot is brewing in the galleries, and the governor wants it stopped before it starts, by any means.',
    'Someone is paying good coin for a message carried to a prisoner in the condemned cell, and no questions asked.',
  ],
  delve: [
    'The clan has closed its gate to the surface folk, and no one will say why; the merchants who trade with it want to know.',
    'The miners of the deeps broke into something old and walled it up again; the king wants it looked at by someone who is not of the clan.',
    'A dwarven heir has gone missing between the gate and the forges, and the clans are close to blows over it.',
    'The great forge has gone cold for the first time in three hundred years.',
    'A surface lord owes the clan more than he can pay, and asks for the ledger to disappear.',
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
  'thieves-fence': ['Fences\' market', ['Trestles of stolen goods under lanterns: plate, cloth, a saddle, a church\'s candlesticks. A fence haggles in whispers with a buyer in a good cloak.', 'A low vaulted room where the guild\'s fences sell what the street brings in; every item bears a chalked price and no name.']],
  'thieves-master': ['Guildmaster\'s rooms', ['Rich hangings over damp stone, a carved bed, a desk with a ledger kept in cipher, and a strongbox chained to the floor.', 'The master\'s private rooms: wine from a good cellar, a shelf of stolen books, and a bolt-hole behind the bed.']],
  'thieves-dorm': ['Thieves\' quarters', ['Bunks for the guild\'s apprentices, picks and dark cloaks hung on pegs.', 'Bedrolls and a practice lock bolted to a table, its brass worn bright by many hands.']],
  'delve-gatehall': ['Gate hall', ['Behind the great gate, a pillared hall of dressed stone where caravans unload and wardens keep watch from a gallery.', 'The first hall inside the mountain: carts, porters, a toll table, and a carved face of the first king looking down on every newcomer.']],
  'delve-hall': ['Great hall', ['A hall of pillars carved as bearded giants holding up the roof; a well of cold water rises in the middle.', 'The heart of the level: a pillared hall where the avenues meet and the clans gather on feast days.']],
  'delve-throne': ['King\'s hall', ['A long hall of polished stone, a throne of black basalt at its head and a table for the clan chiefs before it.', 'Banners of every clan hang between the pillars; the throne is carved from a single block of the mountain.']],
  'delve-district': ['District', ['A district of the delve.']],
  'delve-clanhall': ['Clan hall', ['The clan\'s great hall: a long table under the banners of its founders, and the chief\'s chair at its head.', 'Here the clan feasts, judges its own and counts its kin; a roll of every name since the founding hangs on the wall.']],
  'delve-shrine': ['Ancestor shrine', ['A small shrine where the clan\'s dead are named; candles burn before carved faces of stone.', 'An alcove of the ancestors: a stone face, a lamp, and small offerings of iron and ale.']],
  'delve-tomb': ['Tomb', ['A king\'s tomb: a sarcophagus of black stone carved with his likeness, his axe laid across it.', 'The tomb of a great smith, his hammer set in the wall above him and runes of his works around it.']],
  'delve-moot': ['Moot hall', ['The clan chiefs meet here at a ring of stone seats round a carved hearth; the records of every judgement line the walls.', 'A moot hall where disputes between the clans are heard, under a ceiling painted with the deeds of the founders.']],
  'delve-barracks': ['Wardens\' barracks', ['Bunks for the gate wardens, axes racked by the door, and a roll of names carved on the wall.', 'A barrack of the hearthguard, neat as a forge; mail hangs oiled on its stand.']],
  'delve-brewery': ['Brewery', ['Great barrels of dark ale and a copper still that hisses gently over a banked fire.', 'Mash tuns and barrels; the brewer swears the water of the deep wells is the secret.']],
  'delve-stable': ['Pony stables', ['Stalls for the sure-footed ponies that haul the carts, and a store of feed and harness.', 'Mountain ponies, shaggy and patient, and an ore cart waiting for its team.']],
  'delve-market': ['Market hall', ['Stalls of ironmongery, gems, ale and mushrooms from the farms below; the scales are checked by a warden.', 'A covered market under the mountain, loud with haggling in three tongues.']],
  'delve-temple': ['Hall of the ancestors', ['Statues of the founders line the walls; the altar holds a flame that has not gone out in a thousand years.', 'The clan\'s dead are named here, row upon row of runes, and the living leave small offerings of iron.']],
  'delve-tavern': ['Alehouse', ['Low tables, deep mugs and a fire in a hearth carved like a dragon\'s mouth.', 'A smoky alehouse where miners and smiths drink after the shift, singing songs older than the delve.']],
  'delve-home': ['Clan home', ['A family\'s rooms cut from the rock: a box bed, a table, a chest of heirlooms and a shrine to the ancestors.', 'A snug home with a carved door; a child\'s wooden axe lies on the table.', 'The rooms of an old smith, hung with tools too fine to sell.', 'A crowded home of three generations: bunks cut in the walls, a long table, and a grandmother asleep by the hearth.', 'A neat home with a loom and a rack of bright-dyed wool; the family weaves cloth for the market.', 'A miner\'s home: muddy boots by the door, a lamp on the table, and a jar of uncut stones on the shelf.', 'A home shut up and silent, its door chalked with the rune of mourning.', 'A brewer\'s home that smells of malt; a small cask of the family ale stands by the door for guests.']],
  'delve-forge': ['Forge', ['Twin hearths roar under the bellows; hammers ring on anvils in a rhythm that never stops.', 'A forge of the master smiths: blades cool in oil, and a half-finished helm waits on the anvil.']],
  'delve-smelter': ['Smelter', ['Ore carts tip into a furnace that glows white; slag runs out along a stone channel.', 'Heat and noise: the smelters pour bright metal into ingot moulds.']],
  'delve-vault': ['Clan vault', ['An iron door, a rune-lock, and behind it the clan\'s wealth in ingots and gems.', 'The treasury of the delve, guarded by a door no surface thief has opened.']],
  'delve-sealed': ['Sealed working', ['A wall of fresh masonry closes this working, carved with runes of warning; something scratches beyond it.', 'The dwarves walled this stope up in haste; their tools still lie where they were dropped.']],
  wellpool: ['Bottom of the well', ['The shaft opens into a grotto; the rope hangs down into a cold, clear pool, and a ledge runs round it.', 'Daylight falls in a pale column from the well mouth far above onto black water and a shelf of wet stone.', 'A dropped bucket floats in the pool beneath the shaft; scratches on the rock show where others have climbed down.']],
  grotto: ['Grotto', ['A low natural cave; water drips from pale stone teeth into small pools.', 'A cavern of flowstone, its walls slick and shining in the lamplight.', 'A dry grotto where the passages meet; something has scraped a sleeping hollow in the floor.']],
  pooled: ['Pool cave', ['Still water fills most of this cave; a narrow shelf runs along one wall.', 'The floor drops away into a pool so clear the bottom looks close enough to touch. It is not.']],
  smugglers: ["Smugglers' cache", ['Behind the hidden door, a dry room of worked stone stacked with casks and bales that never paid a toll.', 'Crates marked with the stamps of three different ports; a tally board on the wall lists names from the village.']],
  'hidden-shrine': ['Hidden shrine', ['A shrine to a god the village claims to have forgotten: an altar, fresh offerings and a ring of burnt candles.', 'The walls are painted with eyes and spirals; the altar stone is stained dark and still tacky.']],
  hoard: ['Forgotten hoard', ['A sealed chamber, its door hidden for generations; an iron-bound chest waits beneath the dust.', 'Funeral urns and a rotted chest of coin: someone hid their wealth here long ago and never came back for it.']],
  'prison-yard': ['Exercise yard', ['A bare yard of beaten earth under the high walls, where prisoners walk in a slow ring an hour a day.', 'An open yard with a well in the middle and a gallows against the north wall, its rope taken in.', 'The yard is crowded with prisoners trading, gambling and quarrelling under the eyes of the guards on the walls.']],
  'prison-warden': ["Warden's hall", ["The warden's hall: a long table under a painted ceiling, a ledger of every prisoner, and a good fire.", 'A comfortable room, too comfortable for a prison; the carpets and the plate came from the families of prisoners.', "The warden keeps his accounts here; a strongbox under the table holds the fees the prisoners pay for their keep."]],
  'prison-turnkey': ["Turnkeys' room", ['Rings of keys hang on numbered hooks, and a slate lists who is in which cell; the stair to the cells goes down from the corner.', 'A cramped room where the turnkeys eat and sleep between rounds, by the stair to the galleries below.']],
  'prison-debtors': ["Debtors' ward", ['A long room of bunks for those who owe more than they can pay; families visit by day, and some live here with them.', 'Debtors are kept apart from the felons: the beds are better, and the debts are written on a board by the door.']],
  'prison-infirmary': ['Infirmary', ['A few cots, a table of bandages and bitter herbs, and a prisoner coughing behind a screen.', "Fever is the prison's real hangman; the infirmary is never empty."]],
  'prison-barracks': ['Guards\' barracks', ['Bunks for the guards off watch, their cloaks on pegs and their crossbows racked by the door.', 'The guards sleep here in shifts; a game of dice goes on at the end table at all hours.']],
  'prison-watch': ['Watchtower', ['A corner tower with a brazier and a view over the yard and the country beyond the walls.', 'A tower stair winds up to the wall walk; a guard keeps watch from the arrow slits.']],
  'prison-kitchen': ['Kitchen', ['A smoky kitchen where a cauldron of thin pottage feeds the whole prison; the guards eat better, from a separate pot.', 'Bread for the prisoners is baked here, coarse and grey; the cook sells better to those who can pay.']],
  'prison-store': ['Storeroom', ['Sacks of meal, barrels of small beer and a stack of chains waiting for new prisoners.', 'Bales of straw for the cells, lamp oil and spare manacles, all counted by the warden himself.', 'Prisoners\' belongings in tagged bundles, waiting for release or sale.']],
  'prison-landing': ['Guard post', ['The foot of the stair: a table, a lamp, and a guard who takes the name of everyone who passes.', 'A guard post at the stair foot, with a bench, a slate of names and a bell to ring for the turnkeys.']],
  'prison-held': ['Cell', ['A narrow cell with a plank bed, a bucket and a barred door onto the gallery.', 'Tally marks cover one wall of this cell, many hundreds of them.', 'A cell kept neat as a monk\'s, with a few books and a candle stub.', 'A damp cell where the straw is black with mould.', 'The walls of this cell are covered with drawings in charcoal: ships, faces, a map of somewhere.']],
  'prison-cell': ['Cell', ['A cell.']],
  'prison-common': ['Common cell', ['Thirty prisoners share a room meant for ten; the strongest have the bunks, the rest the floor.', 'A crowded cell where petty thieves, vagrants and drunks wait for the magistrate.']],
  'prison-condemned': ['Condemned cell', ['The cell of those who will hang: a bench, a chain, and a window that looks out on nothing.', 'A small cell apart from the rest, with a chaplain\'s stool by the door.']],
  'prison-pitstair': ['Pit stair', ['A locked room over the stair to the pit; the guards here are the warden\'s own men.', 'Behind an iron door, a stair goes down into the pit; a list of who is below is chalked on the wall, and some names are crossed out.']],
  'prison-question': ['Question room', ['A table with straps, a brazier and a scribe\'s desk: the room where confessions are made.', 'The question room. The tools on the wall are cleaner than anything else in the prison.']],
  'prison-oubliette': ['Oubliette', ['A grate in the floor covers a narrow shaft; whoever is at the bottom is lowered bread once a day, when someone remembers.', 'The oubliette: a bottle-shaped pit under a barred grate, deep enough that a voice from it sounds far away.']],
  'prison-deep': ['Deep cell', ['A cell cut into the rock, without light; the door has no window, only a slot for food.', 'A deep cell for those the warden does not want found. Fresh straw: someone is held here now.', 'An empty deep cell; the chains on the wall have been cut through.']],
  'prison-forgotten': ['Forgotten cell', ['A cell no one has opened in years; the lock is rusted solid and the bones within are long past caring.', 'The door gives onto a cell half filled by a fall of the roof; something lies under the stones.']],
  'prison-tunnel': ['Escape tunnel', ['Behind a loose stone, a narrow tunnel scraped out with a spoon over years; it ends in loose earth, not far from the outer wall.', 'A crawlway dug from the cell, its spoil hidden in the straw; another month and it would have reached the drain.']],
  outfall: ['Outfall', ['Iron bars close the outfall where the sewer empties toward the water.', 'The outfall: a rusted grille, one bar bent wide enough to squeeze through.']],
};

export function writeKey(d: Dungeon, rnd: Rng): void {
  // The caves under a well take their creatures, traps and treasure from the natural caves.
  const kind = (d.site.kind === 'well' ? 'cave' : d.site.kind) as SiteKind;
  d.title = d.site.name;
  d.hook = [pick(rnd, HOOKS[d.site.kind] ?? HOOKS.crypt), hookTail(rnd)].filter(Boolean).join(' ');
  // A place with a story of its own (an abandoned village, a cursed land's heart) tells it first.
  if (d.site.story) d.hook = `${d.site.story} ${d.hook}`;
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
