import type { Rng } from '../gen/rng';
import { type DRoom, type Dungeon, KIND_NAME, pick } from './core';

/**
 * The written key: a hook for the whole site, then a heading and a short description for every
 * numbered room, drawn from what the generator placed there (its tags) and the kind of site.
 */

const HOOKS: Record<string, string[]> = {
  crypt: [
    'The family that raised this crypt died out a century ago; lately its door has been found open at dawn.',
    'A ring of the old lord, needed to prove an inheritance, was buried with him below.',
    'Gravediggers refuse to work near the crypt after one of them heard knocking from inside a sealed tomb.',
  ],
  catacomb: [
    'The bone galleries beneath the town are older than its walls, and nobody has mapped the deepest of them.',
    'Smugglers have been using the catacombs to move goods past the gate; one of them never came back up.',
    'A relic stolen from the cathedral was traced to an ossuary somewhere in the galleries.',
  ],
  mine: [
    'The miners broke into a natural cavern on the lowest level and sealed the drift the same day.',
    'The mine was abandoned after a collapse; its last cart of silver ore was never brought up.',
    'Strange lights are seen at the adit mouth at night, and the mine owner pays well for answers.',
  ],
  tower: [
    'The tower belonged to a scholar who vanished with her apprentice; her books are said to remain.',
    'A signal fire burns on the tower roof some nights, though the garrison left long ago.',
    'The keeper of the tower has stopped sending tithes, and the steward wants to know why.',
  ],
  ruin: [
    'Treasure hunters say the old manor kept its strongroom below ground, beyond the collapsed cellar stair.',
    'Shepherds avoid the ruins after dark; their dogs will not go near the chapel wall.',
    'Bandits have taken over the ruins and raid the road from behind its broken walls.',
  ],
  sewer: [
    'Something has been taking cats, and lately a child, through the gratings of the lower town.',
    'A thieves\' guild runs its business from the drains; the watch would pay for a map of them.',
    'The sewers have started to back up, and the city engineer suspects a blockage that is not natural.',
  ],
};

type Entry = [name: string, text: string[]];
const ROOMS: Record<string, Entry> = {
  hall: ['Hall', ['Pillars hold up a vaulted ceiling. Dust lies thick, broken by recent footprints.', 'A wide hall with a cracked flagstone floor and faded paintings on the walls.']],
  vault: ['Burial vault', ['Stone sarcophagi rest here, their lids carved with effigies. One lid lies askew.', 'The tombs of a noble line; the names have been chiselled out of every lid.']],
  ossuary: ['Ossuary', ['Skulls are stacked along the walls in neat rows; long bones fill the alcoves below.', 'Bones are arranged in patterns on the walls. Some patterns look newer than others.']],
  chapel: ['Chapel', ['An altar stands before a defaced icon. Old wax pools around two braziers.', 'A small shrine with a cold altar. Offerings left here have not rotted.']],
  treasury: ['Treasury', ['A heavy chest sits on a plinth, guarded by an urn of ashes.', 'Grave goods are stored here: a chest bound in iron and funeral urns.']],
  guard: ['Guard room', ['A table, overturned stools and an empty barrel. Graffiti covers one wall.', 'A guard post. The weapons rack is empty and the table is set for a meal never eaten.']],
  shrine: ['Shrine', ['A statue of a forgotten saint watches the doorway, its face worn smooth.', 'A niche shrine with a weathered statue and coins pressed into the mortar.']],
  stope: ['Worked stope', ['A worked-out chamber; tool marks score the walls and a seam of ore still shows.', 'Timbers prop up the roof of this stope; fresh dust trickles from a crack above.']],
  ore: ['Ore face', ['A rich seam glitters in the lamplight. Someone has been working it recently.', 'The vein widens here. Abandoned picks lie where they were dropped.']],
  flooded: ['Flooded chamber', ['Black water fills the chamber to the knee and drips from the roof.', 'The pumps failed long ago; the chamber is flooded and cold.']],
  camp: ['Miners\' camp', ['Crates and barrels of supplies, a cold hearth and bedrolls.', 'A resting place with crates of tallow candles and a barrel of stale water.']],
  collapse: ['Collapse', ['Rubble chokes half the chamber. A hand protrudes from beneath a slab.', 'The roof has come down here; a narrow gap leads over the fall.']],
  collapsed: ['Collapsed tunnel', ['Fallen masonry blocks most of the way. The air smells of damp earth.', 'The vault has fallen in; daylight shows through a crack in the street above.']],
  store: ['Storeroom', ['Barrels and crates, most broken open and empty.', 'Shelves of rotting sacks; rats scatter from the light.']],
  library: ['Library', ['Bookcases line the walls; a reading table holds an open ledger.', 'Shelves of mouldering books, and a few that are curiously well kept.']],
  study: ['Study', ['A writing table under the window, ink long dried, a locked chest beside it.', 'Papers are scattered as if someone searched the room in a hurry.']],
  bedchamber: ['Bedchamber', ['A curtained bed and a travelling chest.', 'A narrow bed and a chest with a broken lock.']],
  laboratory: ['Laboratory', ['A long bench of glassware, a brazier and a barrel of something that smells of vinegar.', 'Burn marks scar the floor around a workbench of alembics.']],
  armoury: ['Armoury', ['Crates of spearheads and a barrel of arrows.', 'Racks and crates; most of the weapons are rusted through.']],
  cistern: ['Cistern', ['A deep tank of still water fills the room; steps lead down into it.', 'The cistern is full. Something moves beneath the surface.']],
  dungeon: ['Cell', ['Chains hang from the wall above a heap of bones.', 'A cell with a rusted grille and scratched tallies on every wall.']],
  roof: ['Roof', ['A crenellated parapet and a beacon brazier. The view reaches for miles.', 'The roof is open to the sky; birds nest in the merlons.']],
  chamber: ['Chamber', ['Roofless walls enclose a room choked with weeds.', 'A ruined room; a hearth survives in one wall.']],
  kitchen: ['Kitchen', ['A well and a collapsed hearth. Broken pottery crunches underfoot.', 'The old kitchen, with a well still holding water.']],
  court: ['Courtyard', ['An open court overgrown with brambles.', 'A paved court with a dry fountain basin.']],
  cell: ['Cell', ['A locked cell with straw on the floor.', 'A cramped cell; the door has a hatch for food.']],
  den: ['Den', ['Bedrolls, a stolen cask and a cold fire: someone lives here.', 'A hideout with crates of stolen goods.']],
  junction: ['Junction', ['Tunnels meet at a vaulted chamber where the channels join with a roar.', 'A brick junction chamber; old chalk marks point the way.']],
  outfall: ['Outfall', ['Iron bars close the outfall where the sewer empties toward the water.', 'The outfall: a rusted grille, one bar bent wide enough to squeeze through.']],
};

export function writeKey(d: Dungeon, rnd: Rng): void {
  const kind = d.site.kind;
  d.title = d.site.name;
  d.hook = pick(rnd, HOOKS[kind] ?? HOOKS.crypt);
  d.levels.forEach((L, k) => {
    for (const r of L.rooms) {
      if (!r.n) continue;
      describe(r, kind, rnd, k === 0 ? L.entrances.length > 0 && isNear(r, L.entrances[0]) : false);
    }
  });
  void KIND_NAME;
}

function isNear(r: DRoom, e: { x: number; y: number }): boolean {
  return e.x >= r.x - 3 && e.x <= r.x + r.w + 3 && e.y >= r.y - 3 && e.y <= r.y + r.h + 3;
}

function describe(r: DRoom, kind: string, rnd: Rng, entry: boolean): void {
  const tag = r.tags[0] ?? 'chamber';
  const e = ROOMS[tag] ?? ROOMS.chamber;
  r.name = entry && tag !== 'junction' ? `Entrance ${e[0].toLowerCase()}` : e[0];
  const parts = [pick(rnd, e[1])];
  const down = r.tags.find((t) => t.startsWith('down:'));
  if (down) {
    const s = down.slice(5);
    parts.push(s === 'shaft' ? 'A winding shaft drops to the level below.' : s === 'ladder' ? 'A ladder leads down into the dark.' : 'Stairs descend to the level below.');
  }
  if (kind === 'sewer' && tag !== 'junction' && rnd() < 0.3) parts.push('The stench is overwhelming.');
  if (kind === 'mine' && rnd() < 0.2) parts.push('Water drips steadily from the roof.');
  r.text = parts.join(' ');
}
