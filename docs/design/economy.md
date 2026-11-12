# Economy

Goods, prices, trade and money: how the world's markets work and how the player takes part. Part
of the design vision ([vision.md](vision.md)). Each part is marked **Decided** (the user's design)
or **Proposed** (a suggestion to agree or change). **The proposals below for markets, goods, the
market's condition, trade routes, money, the player's part and simulation have been adopted**
(decided as a whole, details to refine when built), except where marked open.

## Principles

**Decided.**

- The economy can be fairly complex.
- **Prices follow local supply and demand,** shaped by regional trade and events: a city that
  grows much grain has cheap, plentiful grain, and cheaper things made from it.
- **Politics shapes trade,** as the generator sets it out (realms, relations, wars).
- **War** brings, among its other troubles, less farming, so grain grows scarce and dear, while
  demand for iron and weapons booms.
- **Other events** (plague and the like) can shift the economy sharply.
- **A region's basic economy is what it produces.**
- **Trade routes and politics are dynamic:** regions try to balance their needs, all of them
  securing a steady supply of basic goods first and reaching for finer goods as they prosper.
- **A simplifying measure** such as a region's devastation or economic strength may be needed in
  place of a pure supply-and-demand simulation.
- **Currencies differ** between nations and regions, with exchange between them; coins follow
  the classic copper, silver, gold and platinum, under each culture's own names.

## What the generator already gives

The generator already works out each realm's economy (`lore/economy.ts`, `lore/world.ts`):

| Already made | Holds |
|---|---|
| Goods | About 35, each a **staple**, **material** or **luxury**: grain, rice, maize, cattle, salt fish, salt, timber, wool, horses, furs, iron, building stone, marble, wine, olive oil, spices, sugar, cotton, dates, incense, ivory, tea, silk, pearls, amber, whale oil, honey and wax, dyes, cacao, silver, gold, copper, tin, gemstones, cloth, tools and arms |
| Production | What each realm grows, mines and makes, from its biomes, climate, coast and uplands, scaled by its people and its culture's crafts; metals in its mountains |
| Exports and imports | Goods it makes far more of than the world does, and staples and luxuries it lacks |
| Trade partners | Realms whose exports meet its imports, nearer and by sea counting more, allies more, rivals less, enemies at war not at all |
| Coin and revenue | Each culture's coin name (crowns, dinars, ingots, leaves...) and the ruler's yearly revenue |
| Wealth | Each realm's wealth per head and rank; each town's prosperity (`people/town.ts`) |
| Wars and relations | Alliances, rivalries, leagues and wars between realms |
| Roads | The road and track network between settlements, and the sea |

## Markets

**Proposed.** Each settlement is a **market** with, for each good it deals in:

- **Stock** on hand and a **target** (what the place wants to have, from its people and trades);
- **Supply** coming in: its own hinterland's production (the realm's production shared out by
  land and people), and what traders bring;
- **Demand** going out: what its people eat, burn and wear, what its crafts use up, and what
  traders carry away;
- **A price:** the good's base value times how short or long the stock is against the target
  (dear when scarce, cheap when plentiful, within limits), adjusted for the market's condition
  (below) and the local coin.

Villages deal in a few staples and what they grow; towns in more; cities in nearly everything.

## Goods: from staples to finer things

**Decided:** chains of made goods follow crafting (grain to flour to bread), and can be fairly
rich without being needlessly deep.

**Proposed: two or three steps at most,** each step a craft and a place that does it:

| Raw | Made | Finished |
|---|---|---|
| Grain | Flour (a mill) | Bread (a baker); ale (a brewer) |
| Grapes, barley, honey | | Wine, beer, mead |
| Cattle, sheep, pigs | Meat, hides, wool, tallow | Salted and smoked meat; leather; candles |
| Hides | Leather (a tanner) | Shoes, belts, saddles, armour |
| Wool, flax, cotton | Yarn, cloth (a weaver) | Clothes (a tailor) |
| Iron ore | Iron (a smelter) | Tools, nails, arms, armour (smiths) |
| Timber | Planks (a sawmill) | Furniture, carts, barrels, ships |
| Herbs | Dried herbs | Remedies, tinctures (herbalism, alchemy) |
| Clay, stone | Bricks, cut stone | Buildings |

Raw goods are the generator's goods; made and finished goods are what the crafting skills make
([skills.md](skills.md#crafting)), so the player's own work fits the same chains.


- **Needs first:** every market tries to keep staples (grain or its local equivalent, salt,
  fuel, cloth, tools) in stock before anything else, as the generator's realms already import
  their missing staples first.
- **Made goods** come from raw ones by trades: grain to flour to bread and ale; hides to leather;
  wool and flax to cloth to clothes; iron to tools, nails and arms; timber to carts and barrels.
  These are the crafting skills' recipes ([skills.md](skills.md)), so what the player makes enters
  the same markets.
- **Finer goods** follow prosperity: as a market's staples are secure and its condition good, its
  demand for luxuries, fine clothes, books and spices rises; in hard times it falls away.

## The world's events

**Decided:** the world at the start is fixed by the seed, as the generator makes it; from then
on it changes through the simulation: new wars, alliances, plagues and so on arise as the game
goes on.

**Proposed:** the simulation draws on what the generator already knows (relations, claims,
rivalries, a realm's wealth and hunger, sanitation, the weather) to decide what happens next, so
events have causes the player can see coming in rumours: a long rivalry turns to war, a bad
harvest after a hard winter turns to famine, a filthy port takes a plague from a ship. Events are
drawn from the world's seed with the simulation's state, so a game is reproducible until the
player acts.

## The market's condition

The simplifying measure: each market (and region) has a **condition** from 0 to 100, built from
the generator's prosperity, that moves with events and recovers slowly. It scales production,
demand for finer goods and how much money is about, without simulating every cause in detail.

**Events change it, and push particular goods:**

| Event | Condition | Supply | Demand |
|---|---|---|---|
| War in the region | Falls | Food falls (fields untended, men taken); trade cut on hostile routes | Iron, arms, horses, food for armies rise |
| Siege | Collapses in the city | Nothing comes in | Everything that keeps people alive |
| Plague | Falls | Labour short: everything made falls | Medicine and herbs rise; luxuries fall; later, wages rise |
| Famine, drought, a bad harvest (from the weather) | Falls | Food falls | Food rises; people leave |
| Banditry on the roads, piracy | Slips | Trade on those routes falls | |
| A good harvest, peace, a new trade route | Rises | | Finer goods rise |
| A Big Bad (a dragon, a necromancer, [quests.md](quests.md#the-big-bad)) | Falls where it strikes | Routes close | Arms, guards and remedies rise |

## Trade routes

- **Traders are flows, not people,** away from the player: goods move between markets along
  roads, rivers and sea lanes when the price difference beats the cost of carrying them (distance,
  terrain, tolls, risk). Near the player they become real caravans and ships to meet, rob, guard or
  join.
- **Politics sets the costs:** routes across a realm at war are closed; allies and leagues charge
  low tolls; rivals high ones; embargoes stop a good outright. The generator's trade partners are
  the starting routes, and they change as relations do.
- **Regions balance their needs:** a market short of a staple raises its price until traders
  come; a realm cut off from its grain turns to dearer suppliers, or goes hungry.
- **The player moves prices:** selling a cart of grain in one town lowers the price there; buying
  up all the salt raises it. Trading as a way of life ([vision.md](vision.md#freedom-ways-to-live))
  is buying where something is cheap and carrying it to where it is dear, at the risk of the road.

## Money

**Decided:** currencies differ between nations and regions, with exchange; coins are loosely
copper, silver, gold and platinum, named by culture.

**Proposed.**

- **Decided: poor realms mint only copper and silver;** gold and platinum in their markets are
  foreign coin. **Proposed:** "poor" by the generator's wealth ranking of realms
  (`lore/world.ts`).
- **Each realm mints its own coin** in up to four metals, named in its culture's way (the
  generator's coin names: crowns, dinars, ingots, leaves, and so on, with lesser coins named to
  match). Platinum is rare and mostly for great trade.
- **How coins relate** (**decided: 10 to 1**, after weighing the user's suggestion of 5 to 1):

  | Ratio | A copper : silver : gold : platinum | For |
  |---|---|---|
  | 5 to 1 | 1 : 5 : 25 : 125 | Simple sums; but a house costing thousands of copper needs dozens of platinum, and small prices crowd into coppers |
  | 10 to 1 | 1 : 10 : 100 : 1000 | Easy sums with room from a loaf (a copper or two) to a manor (some platinum) |
  | By culture | e.g. 12 pence to the shilling, 20 shillings to the pound | Period flavour, at the cost of harder sums |

  **Decided:** a **10 to 1 baseline** for every realm, so prices read easily; a few cultures may
  name an odd ratio for flavour (shown converted), and the game always shows a price in the coins
  the player carries. Depth comes from each realm's coins being worth their metal, exchange fees
  and debasement (below), not from the ratios.
- **Coin is worth its metal:** within a realm prices are in its own coin; abroad, coins are taken
  at a discount by weight, or changed at a **money changer** in a town (for a fee).
- **Debasement:** a realm at war or short of silver thins its coin, and its exchange value falls.
- **Barter** where coin is scarce: villages, the New World, the wilds.
- **What things cost** keeps to a sense of the period: a day's labour, a loaf, a night at an inn, a
  horse, a sword, a house, each in the coin of the realm.

## The player in the economy

- **Buying and selling** with traders who have limited coin and stock and their own needs;
  **haggling** by Trading and Persuasion; what a thing is worth judged by Trading (in hardcore
  realism the price of a thing is known, its fair value only as well as the skill allows).
- **Earning:** wages for work (a harvest, a shift at the docks, a season with a company), fees
  for skills (healing, performing, scribing), rewards, and later rents and profits.
- **Spending:** food, lodging, tolls, taxes, repairs, tools, animals, property.
- **Owning:** a stall, a shop or a workshop (management), which buys, makes and sells in the same
  markets.

## Simulation and saving

- **Detail where it matters:** markets near the player tick daily; the rest in coarse steps
  (weekly), as in the navigation design's summary of the rest of the world
  ([navigation.md](navigation.md#the-rest-of-the-world)).
- **The baseline comes from the seed:** each market's production, target stocks and starting
  prices come from the generated world, and so do the world's own events as it goes on (wars,
  plagues, harvests, from the seed and the date).
- **A save keeps only what has moved:** markets the player has dealt in, and the changes their
  deeds have caused, laid over that baseline, like the map's changes.

## Open questions

- Which cultures, if any, keep an odd coin ratio for flavour.
- Where the line between poor and richer realms falls.
