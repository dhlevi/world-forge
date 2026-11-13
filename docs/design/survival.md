# Survival

Weather, light, warmth, wetness, shelter, cleanliness, food and drink: what it takes to stay alive
and well in the world. Part of the design vision ([vision.md](vision.md)). Each part is marked
**Decided** (the user's design) or **Proposed** (a suggestion to agree or change).

## What the generator already gives

Each cell of the generated world already holds its climate (`gen/world.ts`), which the weather is
built on:

| Field | Holds |
|---|---|
| `tempWarm`, `tempCold` | Temperature of the warmest and coldest month (°C, at that elevation) |
| `precipSummer`, `precipWinter` | Rain and snow in the summer and winter half-years (mm a year) |
| `precip` | Yearly precipitation |
| `windU`, `windV` | The prevailing wind |
| `currentU`, `currentV`, `tempSea` | Sea currents and sea temperature |
| `koppen`, `biome` | Climate class and biome |
| `height`, `special` | Elevation; glaciers, deserts of ash, geothermal ground |

## Weather

**Decided:** full weather and temperature built on the generator's climate; storms and rain
follow a general path, as the generator's winds would have them.

**Proposed.**

- **The season's baseline:** each day's expected temperature at a place moves between its coldest
  and warmest month along the year (the calendar is the world's own, `lore/world.ts`), with the
  hemispheres opposite. Elevation is already in the generator's figures; the local map adds
  shade, water and slope.
- **The day's swing:** cool before dawn, warmest after noon; small by the sea and under cloud,
  large in deserts and on high ground (hot days, freezing nights).
- **Weather systems:** fronts and storms are made from the world seed and the date, born where
  the climate favours them (wet seasons, warm seas), and carried along the prevailing winds. A
  system brings cloud, wind, rain or snow, and a change of temperature as it passes, so weather
  arrives from upwind and can be seen coming. Their number and strength follow each place's
  seasonal precipitation, so dry lands stay mostly dry and monsoon lands flood in their season.
- **Weather at a place** is the baseline, plus the day's swing, plus whatever system is over it:
  temperature, wind (speed and direction), cloud, precipitation (rain, sleet, snow, hail), fog,
  and in their lands sandstorms and blizzards.
- **Decided: tracked per chunk** (96 m), or per region of the travel map if per chunk proves too
  slow. **Proposed:** because the weather is a function of place and time (the baseline, the day's
  swing and the systems passing over), the weather of any chunk can be worked out on demand
  without storing it, so per chunk should cost little; the regional form is the fallback.
- **Deterministic:** like the rest of the generator, the weather for a place and day comes from
  the seed, so it is the same each time and can be simulated in summary far from the player.
- **Reading the sky:** the Survival skill gives a forecast (and Sailing at sea); the better the
  skill, the further ahead and the more reliable it is.

*Built (a first pass; `packages/core/src/weather/weather.ts`, `apps/game/src/game/weather.ts`;
numbers proposed, tuned with `apps/game/scripts/weather-test.ts`):*

- **Weather systems** are born on a lattice of 500 km and 12 hours, each by chance from the seed,
  more often where the season is wet; each lives 30 to 84 hours, grows and fades, is 200 to 500
  km across, and drifts along the place's prevailing wind (12 to 36 km an hour), so a front
  reaches a place 150 km downwind about four hours later. A system brings cloud, rain or snow
  (snow at or below freezing, sleet just above), wind (gales from the strongest) and a change of
  temperature; thunder from strong systems in warm weather. How much rain they give follows the
  season's rainfall: over a year the test places come within about 40% of their climate's
  figures, from a desert's 60 mm in 2% of hours to a rainforest's 3,100 mm in 23% of hours.
- **The baseline** is the season's temperature between the coldest and warmest month, and the
  day's swing (less under cloud). Fog gathers on still, damp mornings.
- **The ground** is worked out from the last fortnight: snow falls and melts (by degree-hours, and
  rain on it), rain soaks in and dries; frozen ground is not muddy. Deep snow and mud slow walking
  and travel.
- **In play** the weather follows the party (the climate is asked of the worker as it moves). The
  side panel gives the hour, the sky, the wind and the temperature (and what it feels like) in
  words, with the day's sunrise and sunset; the log notes changes (the rain begins, the wind rises
  to a gale, a fog comes down, the sun sets, snow lies on the ground, a new season). A storm,
  heavy snow or a gale stops a journey. Heavy rain puts out an open camp fire. Rain and snow fall
  over the local map.
- **Reading the sky** (Shift+W, Survival): a forecast of rain or snow coming or clearing, and of
  wind and temperature, 24 hours ahead with a fine success, 12 with a success, 6 otherwise; a
  failure gets the timing wrong, a fumble the weather.

## Day, night and light

**Decided:** day and night follow the seasons: long summer days and long winter nights in the
north, little change near the equator.

**Proposed.**

- **Sunrise and sunset** from the latitude and the day of the year (the sun's declination), with
  twilight; polar summers without night and polar winters without day.
- **The moon** has phases on its own cycle; a full moon on snow is bright, a new moon under
  cloud is black.
- **Light sets sight:** the sight radius on the local map shrinks from day through dusk to night,
  and with cloud, fog and falling snow; fires, torches, lanterns and lit windows make light of
  their own (Eyesight and night-adapted races see further in the dark).

*Built (a first pass):* sunrise, sunset and twilight from the latitude and the day of the year,
with polar days and nights; the moon's phases on a 29.5-day cycle; the light out of doors from
the sun (dimmed by cloud, fog and heavy rain) or the moon (dimmed by cloud, brighter on snow). On
the local map the light sets how far the wanderer sees (30 tiles by day, a few by night), and
fires, hearths, forges, ovens, candlestands and a carried torch (7 tiles) or candle (3) light
their surroundings; a torch burns down an hour a use by night. Tiles are tinted by the sky's
colour at dawn, by day, at dusk and by night, and warm where firelight falls. On the travel map
the dark, fog and rain shorten how far the land is seen, and the map dims at night.

## Body heat

*Built (basic, `apps/game/src/actors/needs.ts`, `game/calendar.ts`):* the air's temperature from
the place's warmest and coldest months through the year (a game begins on the 110th day: late
spring in the north) and through the day, milder indoors; the warmth of what is worn sets the
range a person is comfortable in, effort warms; outside it the body drifts toward chilly,
shivering and hypothermic, or warm, hot and overheating, with slowing, moodlets, more food burned
in the cold, more water lost in the heat, and collapse at the extremes. Weather, wetness, wind and
shelter are still to come.

**Decided:** overheating and hypothermia, as moodlets and health effects.

**Proposed.** The body keeps a **core temperature** that moves toward balance between:

- **Heat lost or gained** from the air temperature, wind (wind chill), wetness, sun (and shade),
  the ground (sitting on snow or stone), water (swimming), and nearby fires.
- **Heat made** by effort (running and hard work warm; resting cools) and by food.
- **What is worn** (below), and **where the person is** (inside, in a shelter, by a fire).

States, in steps: comfortable; chilled or warm (moodlets); cold or hot (penalties to work,
fighting and the mental pools); **hypothermia** (shivering, then clumsiness and confusion, then
collapse and death) or **heat exhaustion** and **heatstroke** (thirst, weakness, confusion,
collapse). Exposed or damp **extremities** (fingers, toes, nose, ears) can get **frostbite**, a
wound on that body part ([characters.md](characters.md#health-body-parts-and-wounds)); bare skin
in strong sun can **burn**.

## Clothing

**Decided:** clothing for temperature and weather, with protection in three categories: **Wet,
Cold, Heat**. Heavy, warm clothes in a hot climate cause overheating.

**Proposed.** Each garment has:

| Property | Means |
|---|---|
| Cold | Insulation: furs and wool high, linen low |
| Wet | Keeping rain out (waxed and oiled cloth, leather, felt) and still insulating when wet (wool does, linen and cotton do not) |
| Heat | Keeping cool: loose, light, pale, covering against sun (desert robes, wide hats); heavy, close garments score low or below zero |
| Wind | Blocking wind (leather, tight weaves) |
| Coverage | The body parts it covers, and its layer (see inventory in [characters.md](characters.md#carrying-and-inventory)) |
| Weight and noise | For carrying and sneaking |

Layers add up for Cold and Wet but work against Heat, so dressing is a choice: wool and furs for
the winter road, loose linen and a hat in the desert, and the trouble of carrying both when
travelling between them. Armour is hot.

## Wetness

**Decided:** protection against rain; being soaked lowers warmth and causes general unhappiness.

**Proposed.** The person (and each garment) has a **wetness** from rain and snow by how well
they are covered, wading and swimming, falling in, and sweat. Wet clothes lose much of their Cold
protection (except wool and fur) and weigh more. Drying comes from a fire, sun, wind, or shelter,
faster with the wet things off. Moodlets: damp, soaked, and, after getting warm and dry again, a
small one of relief.

*Built (a first pass; `actors/needs.ts`, the item data):* wetness from 0 to 100, from rain and
snow (by how much the clothes keep off, and any roof or shelter), and swimming; drying faster in
sun and wind, by a fire and indoors, slower in the cold. Damp (-1) and Soaked (-3) as states with
moodlets, and a small one (Warm and dry again) on drying out. Wet clothes lose warmth (wool and fur
much less). The wind chills the unsheltered (less in windproof clothes, behind a windbreak, in a
tent or lean-to, or indoors), and a hot sun warms (less under a hat or a loose robe). Clothing in
the item data now carries `rain`, `wind`, `sun` (0 to 1) and `wool`; an oiled cloak keeps off
most rain.

## Temperature indoors

**Decided:** temperature inside depends on heating, cooling and airflow, as in RimWorld: a
fireplace is needed to heat a house in winter, and a large room will not warm up; a campfire may
do outside until it gets very cold; a cave in the wilderness is better than open air. Getting
inside is how to dry off and warm up.

**Proposed.**

- **Rooms already exist:** every building's ground floor has rooms on the local map
  ([chunk.ts](../../packages/core/src/local/chunk.ts)), each a set of tiles inside walls.
- **Each room has a temperature** that moves toward the outside temperature through its walls (by
  material: stone holds, plank and wattle leak), faster through open doors and windows and with
  wind, and toward its heat sources: hearths, ovens, forges, braziers, and people. A source warms
  in proportion to its heat over the room's size, so a hearth warms a cottage and barely touches a
  great hall.
- **Fires need fuel:** firewood burns down; a fire left unfed goes out, and a house goes cold.
- **Caves and cellars** hold near the year's mean temperature, and keep out wind, rain and snow.
- **Outside,** a campfire warms a small circle, more out of the wind (a windbreak, a hollow, a
  rock face), and less as the cold deepens.

## Shelter

**Decided:** survival includes making basic shelters.

**Proposed.** With the Survival skill (and Carpentry for better ones), from what is to hand: a
**windbreak**, a **lean-to** of branches and bark, a **debris hut**, a **snow hole** or snow
house in deep snow, a **tent** (carried), a **sod or log hut** (days of work, the start of a
homestead). Each blocks some wind, rain and snow, holds some heat (more with a fire at its
mouth), and is a small room for the indoor rules above. Shelters made on the travel map when
camping use the same rules in summary ([navigation.md](navigation.md#camping)).

## Desert and tundra

**Decided:** desert survival and tundra survival should be equally hard but feel very different.

**Proposed.**

| | Desert | Tundra and the far north |
|---|---|---|
| The danger | Heat by day, water, sun | Cold, wind, snow |
| The hidden danger | Freezing nights; flash floods in dry beds | Thin ice; snow blindness; getting wet |
| Water | Scarce; carried, rationed, found by skill (wells, oases, dew) | Everywhere but frozen; melting snow costs fuel |
| Fuel | Scarce scrub and dung | Scarce beyond the tree line |
| Travel | By night and dawn, resting in shade at noon; sand slows | Short days, long nights, deep snow slows; skis and sleds |
| Dress | Loose, light, covering; a head cloth | Layers of wool and fur; mittens, face covered |
| Storms | Sandstorms: blinding, scouring, lose the way | Blizzards: whiteout, wind chill, lose the way |
| Food | Little to hunt or forage | Hunting and fishing; little to forage in winter |

## Cleanliness and grooming

**Decided:** characters get dirty on long stints outdoors, their hair and beards grow, and they
need grooming or suffer penalties.

**Proposed.**

- **Dirt** builds from travel, work, mud, blood and sleeping rough; washing (a stream, a basin,
  the generator's bathhouses in towns) removes it. Very dirty skin raises the risk of infection in
  wounds and of some illnesses.
- **Smell:** dirt, sweat, smoke and blood make a smell that others notice (with the Smell sense),
  animals scent from downwind, and hunters must mind.
- **Hair and beards** grow day by day and show in the character's appearance until cut or
  trimmed (a barber in town, a knife and a steady hand outside).
- **Social effects:** how a person looks and smells changes how others receive them, by the
  culture's expectations (a lord's court expects more than a logging camp), as moodlets for the
  character and as modifiers in conversation and trade.

## The sea

**Decided:** storms reach the sea, so sailing without good weather sense and seamanship is risky.

**Proposed.** Weather systems cross sea and land alike; at sea they bring wind (too much, too
little, the wrong way), waves and rain. A ship's speed and safety depend on the wind, its
handling (Sailing), and reading the weather (Sailing and Survival) to run for shelter or ride a
storm out. Storms can drive a ship off course, damage it, wash crew overboard, or wreck it
([navigation.md](navigation.md#land-and-sea-caravans-and-voyages)).

## Food and drink

**Decided:** thirst and dehydration, nutrition and starvation; eating and drinking are needed to
stay healthy, with penalties otherwise (moodlets, and percentage effects as in RimWorld). Simple
cooked food is enough; more complex food gives more mood and nutrition.

**Proposed,** building on the three layers in [characters.md](characters.md#hunger-thirst-and-sleep):

- **Effects as percentages** on capacities (moving, manipulation, consciousness) and on the pools,
  growing with the deficit, alongside moodlets (hungry, ravenous, thirsty, parched).
- **Food has** nutrition (energy), how well it keeps, and a **quality tier** that sets its mood
  and its nutrition: **raw** (some foods risky raw), **simple** (roasted, boiled, bread and
  cheese), **a meal** (a stew, a pie; cooking skill and several ingredients), **fine** (a feast,
  spiced and varied). Eating the same thing day after day loses its mood bonus.
- **Spoilage** by food, temperature and preservation (smoked, salted, dried, pickled); spoiled food
  risks illness, which Smell and Taste can warn of.
- **Water** has a quality: springs and wells good, rivers fair, ponds and marshes risky, sea
  water undrinkable; boiling makes it safe. Drink (ale, wine) quenches thirst less and brings
  its own effects.
- **Hot climates** raise thirst; **hard work and cold** raise hunger.

## Showing it: numbers, or hardcore realism

**Decided:** by default every factor (body heat, wetness, hunger, thirst, fatigue, dirt and the
rest) shows as a number or a bar. A **hardcore realism** mode hides what a person could not
**know**: trait, skill and stat numbers, how much damage a blow deals, chances to hit, dice
rolls, and other intangibles. The player relies on descriptions instead. It applies to the whole
game, not only to survival.

**Proposed: hidden and shown.**

| Hidden (as numbers) | Shown instead as |
|---|---|
| Traits | Words on a scale: "frail", "strong", "as strong as an ox" |
| Skills | Standing: untrained, a beginner, competent, a journeyman, a master, among the best |
| Body heat, wetness, hunger, thirst, fatigue, dirt | "You are shivering", "Your fingers have gone numb", "Your clothes are soaked through", "You are light-headed with hunger"; and signs on the portrait and map figure |
| Wounds and health | What the wound looks like ("a deep cut that will not stop bleeding"); how bad it really is, as far as Medicine can tell |
| Damage dealt | What the blow did ("the blade bites deep into his arm", "it glances off his mail") |
| Chances and rolls | How it looks before trying ("a long shot", "an easy climb", "you doubt you can force this lock") |
| Moodlets | Feelings without their numbers ("cold", "miserable", "well fed") |
| Luck | Already hidden in both modes ([characters.md](characters.md#traits)) |

| Still shown (a person would know) | Notes |
|---|---|
| Coins in the purse | Counted exactly; worth judged by Trading |
| What is carried | Items as such; weight as "light", "heavy", "more than you can carry far" |
| The time | By the sky and bells: "mid-morning", "after dusk"; the date by the calendar |
| Places and distances | As known and estimated ("half a day's walk"), not to the metre |

- **Skill and senses decide what is known:** a healer can tell how bad a wound is; an untrained
  eye sees only that it bleeds. The same goes for forecasts, judging an opponent, food going off,
  and water fit to drink.
- **Chosen when a game begins** and kept for that game (not switched mid-game), as a game
  option alongside others to come.

## Portraits

**Decided:** hair and beard growth, grooming and cleanliness show on the character's portrait
and elsewhere.

**Proposed.** The generator already draws people of each culture as tinted ink sketches
(`people/sketch.ts`, from `people/appearance.ts`). A character's portrait would be drawn the same
way from their own appearance, then changed by their state: hair and beard length and how well
they are kept, dirt and grime, wet hair and clothes, what they wear, scars and fresh wounds,
bandages, pallor or flush, and age. The same marks would show in how others describe them.

## How it could be built (proposed)

- **Climate and weather in the core** (deterministic, from the seed and the date), so the game,
  the travel map's summary simulation and tests all agree.
- **Body heat, wetness, dirt and needs** as numbers on each actor, updated each turn (and in
  summary while travelling or resting).
- **Room temperatures** worked out per room on the local map when the player is near, and assumed
  from the season and heating when they are not.

## Open questions

- Which other game options belong beside hardcore realism.
