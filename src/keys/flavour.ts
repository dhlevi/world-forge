import type { Rng } from '../gen/rng';

/**
 * Flavour for the written keys of dungeons, caves and groves: what lives in a room, what guards
 * it, what lies hidden there, and a detail for the senses, by kind of site. Shared by
 * `dungeons/key.ts` and `lairs/lair.ts`. Every table is plain data, so it is easy to extend.
 */
export type SiteKind = 'mine' | 'tower' | 'crypt' | 'ruin' | 'catacomb' | 'sewer' | 'cave' | 'grove';

export interface KeyNote {
  /** "Creature", "Trap", "Treasure" or "Hazard". */
  label: string;
  text: string;
}

const pick = <T>(rnd: Rng, a: T[]): T => a[Math.floor(rnd() * a.length)];

const CREATURES: Record<SiteKind, string[]> = {
  mine: [
    'Four kobolds are prising ore from the wall. They flee at the first sign of a fight and return with more.',
    'A rust monster gnaws on an abandoned pick, drawn by the smell of iron.',
    'Two miners, trapped for days, huddle by a guttering lamp. One is no longer quite human.',
    'A carrion crawler clings to the roof timbers above the rails.',
    'The ghost of a foreman walks the drift, counting carts that never come.',
    'A family of giant centipedes nests in a heap of spoil.',
    'Duergar prospectors have claimed this working and do not welcome visitors.',
    'An earth elemental, woken by the blasting, moves slowly through the rock.',
  ],
  tower: [
    'An animated suit of armour stands guard and attacks anyone who does not speak the password.',
    "The tower's last apprentice hides here, half mad, clutching a book she will not give up.",
    'A homunculus watches from a high shelf and reports every intruder to its master.',
    'Three bandits have made a camp here, playing dice by a stolen lantern.',
    'A gargoyle on the window ledge is not a carving.',
    'A swarm of bats bursts from the rafters at any light.',
    'An imp bound into a brass lamp offers bargains in a sweet, reasonable voice.',
    'A flameskull circles slowly, reciting the names of those who wronged its creator.',
  ],
  crypt: [
    'Three skeletons in rusted mail rise as the door opens.',
    'A ghoul crouches among the opened coffins, gnawing on something best not examined.',
    'A wight in the dress of an old lord waits on a stone seat, patient as the grave.',
    'Giant rats scatter from the tombs, then turn and come back in a tide.',
    'A shadow detaches itself from the wall behind the lamp-bearer.',
    'The weeping ghost of a young bride asks visitors whether her husband has come.',
    'Grave robbers are halfway through prising open a sarcophagus.',
    'A gelatinous cube glides along the passage, scoured clean of dust behind it.',
  ],
  ruin: [
    'A pack of wolves dens among the fallen stones.',
    'Goblin scouts watch the road from a broken window.',
    'An owlbear has made a nest of branches and bones in the corner.',
    'A hermit lives here and claims to be the last lord of the house.',
    'Stirges roost under the remaining roof beams.',
    'A band of outlaws shares out its takings around a smoky fire.',
    'A will-o\'-wisp drifts through the empty doorways after dark.',
    'Twig blights have taken root among the weeds and creep closer when no one is looking.',
  ],
  catacomb: [
    'Zombies in burial shrouds shuffle between the niches, drawn by warmth.',
    'A necromancer\'s acolyte is collecting skulls into a sack, muttering their names.',
    'A swarm of beetles pours from the bone piles.',
    'A ghast lurks in a niche, its stench enough to turn the stomach.',
    'The bones of the walls rattle and assemble into a single, many-armed horror.',
    'A lost pilgrim, out of candles, begs to be led back to the light.',
    'Ghouls hunt in a pack through the galleries, calling to each other in whispers.',
    'A spectre of a gravedigger still tends the dead and resents interruption.',
  ],
  sewer: [
    'Wererats in human form are counting stolen coin. They change at the first threat.',
    'An otyugh wallows in the sludge, waiting for scraps.',
    'A giant crocodile, once someone\'s pet, lies motionless in the channel.',
    'Thieves\' guild lookouts loiter on the walkway with a shuttered lantern.',
    'A swarm of rats boils out of a drain.',
    'A grey ooze has spread across the floor, looking like a puddle of dirty water.',
    'A runaway apprentice hides here from his master, who is not a kind man.',
    'Kenku smugglers have stacked crates here and mimic the voices of the watch to scare off trespassers.',
  ],
  cave: [
    'A cave bear sleeps in the deepest corner, surrounded by gnawed bones.',
    'Goblins have a camp here, with a cookpot over a smoky fire.',
    'A troll lairs here, and the floor is littered with the belongings of travellers.',
    'Giant spiders have webbed the roof; wrapped bundles hang from the strands.',
    'A cloaker hangs among the stalactites, indistinguishable from the rock.',
    'A colony of bats fills the air when disturbed.',
    'A darkmantle drops from the ceiling onto the first light it sees.',
    'A hermit druid lives here and does not want to be found.',
  ],
  grove: [
    'A dryad watches from her tree and will speak only to those who come unarmed.',
    'A pair of wolves rests in the long grass, wary but not hostile.',
    'A satyr plays pipes on a stump and challenges visitors to a contest.',
    'Pixies flit between the flowers, stealing anything that glitters.',
    'A great stag with silver-tipped antlers stands still as stone, then is gone.',
    'Bandits use the clearing as a meeting place; one waits here now.',
    'An awakened shrub, recently pruned, holds a grudge against anyone with a blade.',
    'A sprite guards the place and demands a riddle before letting anyone pass.',
  ],
};

const TRAPS: Record<SiteKind, string[]> = {
  mine: [
    'Rotten timbers: loud noise or a fight here brings down part of the roof.',
    'A pocket of bad air. A flame burns blue a moment before it gutters out.',
    'A loaded cart, held only by a frayed rope, waits at the top of the slope.',
    'A hidden winze, boarded over with planks that will not bear a person\'s weight.',
  ],
  tower: [
    'A glyph on the door flares when touched and seals it for an hour.',
    'One floorboard triggers a scything blade from the wall.',
    'A mirror holds the reflection of whoever looks into it, and keeps it.',
    'The stair turns to a slide when a hidden lever is pulled above.',
  ],
  crypt: [
    'A pressure plate in front of the altar releases poison darts from the eyes of a statue.',
    'The lid of one sarcophagus is weighted to fall and crush anyone reaching inside.',
    'Grave dust here is cursed: whoever disturbs it hears whispering for a week.',
    'A portcullis drops behind the last person through the door.',
  ],
  ruin: [
    'An unstable wall leans over the doorway; a push brings it down.',
    'The floor gives way into the cellar below.',
    'A hunter\'s snare lies hidden in the weeds by the gap in the wall.',
    'A well, covered by rotting boards, drops thirty feet into cold water.',
  ],
  catacomb: [
    'A tripwire across the passage rings bells deep in the galleries, rousing the dead.',
    'The bones in one niche are packed around a jar of green slime.',
    'A false floor tips anyone who steps on it into an ossuary pit below.',
    'Smoke from a lit torch here sets off the stench of a rot grub nest.',
  ],
  sewer: [
    'A sluice gate opens without warning, sending a surge of water down the channel.',
    'Methane collects under the vault; an open flame ignites it.',
    'The walkway here is slick with algae and slopes toward the channel.',
    'Thieves have strung a net with bells across the tunnel.',
  ],
  cave: [
    'Loose scree on the slope slides away underfoot.',
    'A thin crust of rock covers a deep sinkhole.',
    'Russet mold grows on the walls and releases spores when touched.',
    'Webs across the passage are thick enough to hold a careless traveller fast.',
  ],
  grove: [
    'A ring of mushrooms: anyone who steps inside must dance until dawn.',
    'Vines in the trees snare the unwary and hoist them into the canopy.',
    'A sinkhole lies hidden under the moss.',
    'The water here is clear, cold and enchanted: whoever drinks forgets the last day.',
  ],
};

const TREASURE_ANY = [
  'A purse of mixed coin, mostly copper, hidden under a loose stone.',
  'A silver ring set with a moonstone.',
  'A potion of healing in a stoppered clay flask.',
  'A scroll case holding a spell scroll, its seal unbroken.',
  'A dagger with a hilt of carved bone and a blade that never rusts.',
  'A small chest with 80 gold pieces and a deed to a farm no one remembers.',
  'A map, half burnt, showing a site not far from here.',
  'A pair of fine boots, scarcely worn, of elven make.',
];
const TREASURE: Record<SiteKind, string[]> = {
  mine: ['A seam of raw silver, worth 150 gold to anyone with the tools to cut it.', 'A miner\'s lamp that burns without oil.', 'A pouch of uncut garnets.'],
  tower: ['A wand with a few charges left, tucked inside a hollow book.', 'A crystal ball, cracked but still working, poorly.', 'A spellbook with three spells and many angry marginal notes.'],
  crypt: ['Grave goods: a gold torc and a jewelled cup buried with the dead.', 'A signet ring of a family long extinct, worth a great deal to the right claimant.', 'A blessed silver dagger laid on the breast of a knight.'],
  ruin: ['A strongbox under the hearthstone, holding the family silver.', 'A portrait in a gilt frame, its subject still recognisable to an old noble house.', 'A cellar bottle of wine fifty years old.'],
  catacomb: ['A reliquary holding the finger bone of a saint.', 'Coins left as offerings, green with age.', 'A prayer book with a cover of beaten gold.'],
  sewer: ['A thieves\' cache: stolen jewellery wrapped in oilcloth.', 'A lost wedding ring caught in a grate.', 'A ledger of bribes paid to the city watch, priceless to the right buyer.'],
  cave: ['A dead adventurer\'s pack with rope, rations and a magic cloak.', 'Glittering crystals in the rock, worth a little to a jeweller.', 'A troll\'s hoard of mismatched coin and broken armour.'],
  grove: ['Offerings in the roots: copper coins, a silver brooch, a carved wooden bird.', 'Herbs of rare quality, worth 30 gold to an apothecary.', 'A druid\'s staff left leaning against a stone, awaiting its owner.'],
};

const SENSES: Record<SiteKind, string[]> = {
  mine: ['Water drips steadily from the roof.', 'The air is hot and close.', 'Distant tapping echoes through the rock.', 'The timbers creak.', 'Old soot blackens the roof.'],
  tower: ['Wind moans through the arrow slits.', 'Dust lies thick, broken by small footprints.', 'A faint smell of ozone hangs in the air.', 'Something scratches behind the panelling.', 'A cold draught comes from nowhere.'],
  crypt: ['The air is stale and very cold.', 'Old incense lingers faintly.', 'The silence is complete.', 'Candle stubs line the ledges.', 'Faded frescoes show a funeral procession.'],
  ruin: ['Ivy covers the walls.', 'Birds scatter from the broken walls.', 'Nettles grow waist high.', 'Charred beams lie where the roof fell.', 'Wind hisses through the gaps in the stone.'],
  catacomb: ['Skulls grin from every niche.', 'The air smells of dry bones and dust.', 'Names are scratched into the walls in a dozen hands.', 'Faint chanting seems to come from far away.', 'The floor is worn smooth by centuries of mourners.'],
  sewer: ['The stench is overwhelming.', 'Water roars somewhere close by.', 'Rats watch from the ledges.', 'Light falls through a grate above, with the sound of carts.', 'Slime coats the brickwork.'],
  cave: ['Water drips into unseen pools.', 'The air is cool and smells of wet stone.', 'Bats rustle overhead.', 'Pale fungus glows faintly on the walls.', 'The echo of each step returns a moment too late.'],
  grove: ['Birdsong fills the air.', 'Sunlight falls in shafts through the leaves.', 'The scent of wild garlic is strong.', 'Bees hum among the flowers.', 'It is very quiet; even the birds have stopped.'],
};

const REWARDS = [
  'The local lord offers 100 gold for proof the place is safe.',
  'A merchant will pay well for anything of value brought out.',
  'The temple promises a blessing, and a modest purse, to whoever resolves it.',
  'A rival band of adventurers set out for it two days ago.',
  'An old map of the place is for sale in the nearest inn, for a price.',
  'Several have gone in to look. None have come back.',
];

/** A detail for the senses, about half the time (empty otherwise). */
export function senseDetail(kind: SiteKind, rnd: Rng): string {
  return rnd() < 0.55 ? pick(rnd, SENSES[kind]) : '';
}

/** A hook's second line: a reward or a complication, about two times in three. */
export function hookTail(rnd: Rng): string {
  return rnd() < 0.65 ? pick(rnd, REWARDS) : '';
}

/**
 * Notes for one room: a creature, a trap or a treasure, or nothing, weighted by the room's role.
 * Entrances get fewer; treasuries and vaults always hold something; deep rooms are more dangerous.
 * `used` keeps the same line from appearing twice in one site.
 */
export function roomNotes(kind: SiteKind, rnd: Rng, o: { tag?: string; entry?: boolean; depth?: number; used: Set<string> }): KeyNote[] {
  const out: KeyNote[] = [];
  const fresh = (list: string[]) => {
    for (let t = 0; t < 6; t++) {
      const s = pick(rnd, list);
      if (!o.used.has(s)) {
        o.used.add(s);
        return s;
      }
    }
    return '';
  };
  const depth = o.depth ?? 0;
  const rich = o.tag === 'treasury' || o.tag === 'hollow' || ((o.tag === 'vault' || o.tag === 'ore') && rnd() < 0.45);
  const pCreature = (o.entry ? 0.15 : 0.32) + 0.06 * depth + (o.tag === 'guard' || o.tag === 'den' ? 0.4 : 0);
  const pTrap = o.entry ? 0.08 : 0.16 + 0.04 * depth + (rich ? 0.2 : 0);
  const pTreasure = rich ? 1 : 0.2 + 0.05 * depth;
  if (rnd() < pCreature) {
    const s = fresh(CREATURES[kind]);
    if (s) out.push({ label: 'Creature', text: s });
  }
  if (rnd() < pTrap) {
    const s = fresh(TRAPS[kind]);
    if (s) out.push({ label: kind === 'grove' || kind === 'cave' ? 'Hazard' : 'Trap', text: s });
  }
  if (rnd() < pTreasure) {
    const s = fresh(rnd() < 0.55 ? TREASURE[kind] : TREASURE_ANY);
    if (s) out.push({ label: 'Treasure', text: s });
  }
  return out;
}
