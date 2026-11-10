/** The README written into the game-data zip: what each file holds and how to read it. */
export function gameDataReadme(meta: Record<string, unknown>, towns: number): string {
  const m = meta as { width: number; height: number; height_r16: { minM: number; maxM: number }; barony_i32: { width: number; height: number } };
  return `# World Forge game data

This archive holds one generated world as plain data for a game engine. The same world can be
made again in World Forge from the settings in \`world.json\` (or from a saved world file), by the
same generator version (\`generator\` in \`world.json\`): the generator makes the same world from
the same settings in every JavaScript engine.

## Coordinates

- World positions are longitude and latitude in degrees (east and north positive).
- The grids are equirectangular, ${m.width} x ${m.height} cells, rows from north to south and
  columns from west to east. Cell (i, j) spans longitude -180 + i * 360 / ${m.width} to the next
  column and latitude 90 - j * 180 / ${m.height} down to the next row; its index is j * ${m.width} + i.
- Town plans in \`region.json\` are in metres east (x) and north (y) of each town's own lon, lat.
  One degree of latitude is about 111.2 km; one degree of longitude is that times cos(latitude).

## Files

| File | What it holds |
| --- | --- |
| \`world.json\` | The world: settings, year and era, grid description, summary, biome, Köppen and special-ground tables, cultures, realms, settlements, roads, rivers, named places, faiths, wars and cursed lands. |
| \`region.json\` | ${towns} town(s) of the exported map view in full: every building and other plan feature, town statistics and (if chosen) the households of each building. |
| \`grids/height.r16\` | Heights, unsigned 16-bit little-endian, ${m.width} x ${m.height}. Metres = ${m.height_r16.minM} + value / 65535 * (${m.height_r16.maxM} - ${m.height_r16.minM}); sea level is 0 m. Imports as a RAW heightmap in most engines. |
| \`grids/temperature_c.f32\` | Mean temperature (°C, at the ground's height), 32-bit float little-endian. |
| \`grids/precipitation_mm.f32\` | Yearly rain and snow (mm), 32-bit float little-endian. |
| \`grids/biome.u8\` | Biome id per cell (see \`world.json\` biomes). |
| \`grids/koppen.u8\` | Köppen climate class id per cell (see \`world.json\` koppen). |
| \`grids/culture.u8\` | Culture index per cell (see \`world.json\` cultures). |
| \`grids/special.u8\` | Special ground per cell: ash, lava, glacier, mushroom forest, canyon, cliffs, volcanic, geothermal, cursed (see \`world.json\` special). |
| \`grids/barony.i32\` | Barony (realm unit id) per cell, 32-bit signed little-endian, on its own grid of ${m.barony_i32.width} x ${m.barony_i32.height}; -1 for sea and wild land. Follow \`parent\` in realms for the county, duchy, kingdom and empire. |
| \`images/*.png\` | Previews: height (grey), biome colours, temperature and precipitation. |

## world.json

- \`cultures[]\`: index, name, people, endonym, template, folk (Humans, Elves, Dwarves...), ethos,
  traditions, customs (war, marriage, building, dress, food, festivals), hearth [lon, lat],
  faith (faith id), appearance (paragraphs) and words (English to the culture's own word).
- \`realms[]\`: id, level (0 barony to 4 empire), title, name, government, ruler's title, seat
  (settlement id) and seat name, lon, lat, parent (liege id or -1), league, culture, town and total
  people, area, arms (from counties up) and the ruling house of independent realms.
- \`settlements[]\`: cities and towns (villages are made when needed and appear in \`region.json\`):
  id, name, English name, tier, population, lon, lat, radius, culture, barony (-1 where no realm
  claims the land), walls, citadel,
  coastal, river, university, New World, colony, layout, delve and special.
- \`roads[]\`: class (major, minor or track), the two settlement ids it joins, name, line [[lon, lat]...].
- \`rivers[]\`: id, order (log2 of its flow over the smallest river's), flow (rain-weighted drainage area, km²), width (m), name, line.
- \`places[]\`: named seas, lakes, mountains, forests, deserts, islands and more: kind, name,
  English name, rank (0 largest), a point and, for long features, a line.
- \`faiths[]\`, \`wars[]\`, \`cursedLands[]\`: the world's faiths (deities, clergy, beliefs, holy sites,
  sects), its wars past and present, and the hearts of its cursed lands.

## region.json

\`towns[]\`, the largest first: id, name, tier, kind, population, lon, lat, culture, barony, walls,
coastal, river, stats (prosperity, sanitation and crime from 0 to 100 with a word and reasons; the
watch; shares of the folk by means; the peoples living there; notes), then:

- \`buildings[]\`: bid (stable building id), outline [[x, y]...], areaM2, ctx (the quarter: ward,
  rich, slum, harbour, farming...), use (temple, keep, mill...), role (inn, smithy, guildhall...),
  label (its name), tree (home or top, in elven tree towns, with platform height z), and
  households[]: name, means, members[] (name, given name, female, age, culture, people, trade,
  role in the household, traits, note, ties to the neighbours), more (unnamed members).
- \`features[]\`: everything else on the plan (streets, roads, walls, towers, squares, fields,
  gardens, trees, wells, piers, bridges, contours...), each with kind and a point, line or outline.
`;
}
