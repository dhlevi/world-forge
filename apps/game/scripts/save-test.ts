/**
 * Saved games from every version come out right (game/save.ts, game/migrate.ts): each fixture in
 * scripts/fixtures/ (save-v<version>-<what>.json, a save as an older game wrote it) is read,
 * brought up to date, checked, and its character loaded; damaged and foreign files are refused
 * with a plain message; things of unknown kinds are left out with a note.
 * npx tsx apps/game/scripts/save-test.ts (exits non-zero on a failure).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSave, versionNote, type SaveFile } from '../src/game/save';
import { checkSave, SAVE_VERSION } from '../src/game/migrate';
import { Actor } from '../src/actors/actor';
import '../src/actors/cast';
import { Identity, Skills } from '../src/actors/components';
import { Inventory } from '../src/actors/items/inventory';
import { Needs } from '../src/actors/needs';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};
const refused = (text: string, what: string, says: RegExp) => {
  try {
    readSave(text);
    ok(false, `${what}: refused`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ok(says.test(msg), `${what}: refused ("${msg}")`);
  }
};

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtures = readdirSync(dir).filter((f) => /^save-v\d+-.*\.json$/.test(f)).sort();
const text = (f: string) => readFileSync(dir + f, 'utf8');

// Every older version has at least one fixture, so every upgrade step is run.
for (let v = 1; v < SAVE_VERSION; v++) ok(fixtures.some((f) => f.startsWith(`save-v${v}-`)), `there is a fixture of version ${v}`);

const loaded = new Map<string, SaveFile>();
for (const f of fixtures) {
  console.log(`\n== ${f}`);
  let s: SaveFile;
  try {
    s = readSave(text(f));
  } catch (err) {
    ok(false, `${f}: reads (${err instanceof Error ? err.message : err})`);
    continue;
  }
  loaded.set(f, s);
  ok(s.version === SAVE_VERSION, `${f}: brought up to version ${SAVE_VERSION}`);
  ok(checkSave(s as unknown as Record<string, unknown>).length === 0, `${f}: has the shape this game reads`);
  ok(Array.isArray(s.ground) && Array.isArray(s.camps), `${f}: has its ground and camps (empty if it had none)`);
  // Reading what was read again changes nothing (each step runs once).
  ok(JSON.stringify(readSave(JSON.stringify(s))) === JSON.stringify(s), `${f}: reading it again changes nothing`);
  if (s.character) {
    const a = Actor.fromJSON(s.character);
    const inv = a.get(Inventory), n = a.get(Needs);
    ok(!!a.get(Identity)?.d.full, `${f}: the character loads (${a.get(Identity)?.d.full})`);
    ok(!!inv && inv.d.items.length > 0 && inv.d.items.every((i) => typeof i.uid === 'string'), `${f}: their belongings are items (${inv?.d.items.length})`);
    ok(!!n && Number.isFinite(n.d.fatigue), `${f}: they have needs`);
    ok(JSON.stringify(Actor.fromJSON(a.toJSON()).toJSON()) === JSON.stringify(a.toJSON()), `${f}: the character saves and loads the same`);
  }
}

// What each era's upgrade should have kept or made.
const names = loaded.get('save-v1-names.json');
if (names?.character) {
  const inv = Actor.fromJSON(names.character).need(Inventory);
  ok(inv.d.items.some((i) => i.def === 'knife') && inv.d.items.some((i) => i.def === 'blanket') && inv.d.copper === 160, 'names: the listed belongings and the money come through');
}
const camps = loaded.get('save-v1-camps.json');
if (camps?.character) {
  const a = Actor.fromJSON(camps.character);
  ok(a.need(Needs).d.wet === 35 && a.need(Skills).d.dice === 12345, 'camps: wetness and the dice are kept as they were');
  ok(camps.ground.length === 1 && camps.ground[0][2][0].def === 'bread' && camps.camps.length === 1 && camps.camps[0].wood === 6, 'camps: things on the ground and the camp are kept');
}

// Refused, with a plain message.
console.log('\n== Not saves, or damaged');
const good = JSON.parse(text('save-v1-camps.json'));
refused('this is not json', 'not JSON', /not JSON/);
refused('{"format": "something else"}', 'another kind of file', /not a saved game/);
refused(JSON.stringify({ ...good, version: SAVE_VERSION + 1 }), 'from a newer game', /newer version/);
refused(JSON.stringify({ ...good, player: { x: 'here' } }), 'where the wanderer stands is damaged', /where the wanderer stands/);
refused(JSON.stringify({ ...good, changes: [[1, 2]] }), 'the map changes are damaged', /changes to the map/);
{
  const bad = JSON.parse(JSON.stringify(good));
  bad.character.components.inventory.items.push({ def: 'knife' });
  refused(JSON.stringify(bad), 'a belonging with no id', /belongings are damaged/);
}

// Things of kinds this game does not know are left out, with what was inside them.
console.log('\n== Things of unknown kinds');
{
  const s = JSON.parse(JSON.stringify(good));
  const items = s.character.components.inventory.items;
  items.push({ uid: 'imodbag', def: 'mod_bag', qty: 1, quality: 'common', condition: 100, loc: { at: 'hand', hand: 'left' } });
  items.push({ uid: 'iinbag', def: 'knife', qty: 1, quality: 'common', condition: 100, loc: { at: 'in', parent: 'imodbag' } });
  s.ground.push([1, 1, [{ uid: 'imodrock', def: 'mod_rock', qty: 1, quality: 'common', condition: 100 }]]);
  const r = readSave(JSON.stringify(s));
  const left = r.character!.components.inventory as { items: { uid: string }[] };
  ok(!left.items.some((i) => i.uid === 'imodbag' || i.uid === 'iinbag'), 'an unknown bag is left out, with what was in it');
  ok(r.ground.length === 1, 'an unknown thing on the ground is left out (and its spot with it)');
  ok(versionNote(r).includes('mod_bag') && versionNote(r).includes('mod_rock'), `the player is told: "${r.loadNotes?.[0]}"`);
  ok(!!Actor.fromJSON(r.character!).get(Inventory), 'the character still loads');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
