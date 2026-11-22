/**
 * People speak their own language (docs/backlog.md, N2; world/speech.ts): a line said in the
 * wanderer's native tongue is plain; in another, fluent, plain with the language named; known a
 * little, the words as said and what is caught; not at all, the words only. Hearing a language
 * teaches a little; a speaker uses the language the wanderer knows best of theirs; the worldly often
 * speak the wanderer's own.
 * npx tsx apps/game/scripts/speech-test.ts (exits non-zero on a failure).
 */
import { generateWorld } from '@worldforge/core/gen/world';
import { CULTURES } from '@worldforge/core/names/cultures';
import { Actor } from '../src/actors/actor';
import { Skills } from '../src/actors/components';
import { speech, tongues } from '../src/world/speech';
import type { Resident } from '../src/world/population';
import '../src/actors/cast';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

generateWorld({ seed: 'forge', landFraction: 0.3, plates: 14, erosion: 0.5, settled: 0.6, drift: 0.3, races: true, resolution: 256 } as never, () => {});
const withLang = CULTURES.map((c, i) => [c, i] as const).filter(([c]) => c.language);
const [home, theirs] = [withLang[0][1], withLang[1][1]];
const them = (trade = 'cooper', id = 'Ana'): Resident => ({ p: { id, name: 'Ana Holt', given: 'Ana', culture: theirs, trade, female: true } } as unknown as Resident);
const wanderer = (level: number) => {
  const a = new Actor('person');
  const sk = a.add(new Skills(Skills.empty()));
  sk.language(String(home), CULTURES[home].name, 95);
  if (level) sk.language(String(theirs), CULTURES[theirs].name, level);
  return sk;
};
const line = 'Good morning, stranger. The iron will not wait while it is hot.';
const tongue = CULTURES[theirs].name;

const none = speech(them(), line, wanderer(0), null);
ok(none.startsWith(`Ana Holt (in ${tongue}): "`) && !none.includes('iron') && !none.includes('You catch'), `not known: the words as said (${none})`);
const some = speech(them(), line, wanderer(40), null);
ok(/You catch: "/.test(some) && some.includes('…'), `known a little: the words, and some caught (${some})`);
const fluent = speech(them(), line, wanderer(80), null);
ok(fluent === `Ana Holt (in ${tongue}): "${line}"`, 'fluent: the line, with the language named');
const own = speech({ p: { ...them().p, culture: home } } as unknown as Resident, line, wanderer(0), null);
ok(own === `Ana Holt: "${line}"`, 'in the wanderer\'s own tongue: just the line');
const sk = wanderer(30);
const before = sk.d.languages[String(theirs)].speak;
for (let i = 0; i < 20; i++) speech(them(), line, sk, null);
ok(sk.d.languages[String(theirs)].speak > before, `hearing it teaches a little (${before} to ${sk.d.languages[String(theirs)].speak.toFixed(1)})`);
// One who lives in a town of the wanderer's people speaks its language with them.
const local = speech(them(), line, wanderer(0), home);
ok(local === `Ana Holt: "${line}"`, 'one living among the wanderer\'s people speaks their language');
let worldly = 0;
for (let i = 0; i < 40; i++) if (tongues(them('merchant', `m${i}`), null, home).includes(home)) worldly++;
ok(worldly >= 8 && worldly <= 30, `many merchants speak the wanderer's own tongue too (${worldly} of 40)`);
ok(!Array.from({ length: 40 }, (_, i) => tongues(them('cooper', `c${i}`), null, home)).some((t) => t.includes(home)), 'a cooper does not');

console.log(failures ? `\n${failures} failed` : '\nall speech tests passed');
process.exit(failures ? 1 : 0);
