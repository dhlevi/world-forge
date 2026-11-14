/**
 * A game played without a browser (game/session.ts): carried on from a save, with stand-ins for the
 * world worker and the screens. Time passing, sleep, drinking, reading the sky, collapse, saving and
 * loading again, and leaving cleanly.
 * npx tsx apps/game/scripts/session-test.ts (exits non-zero on a failure).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MessageDispatcher } from '../src/engine/messages';
import '../src/actors/cast';
import { Needs } from '../src/actors/needs';
import { Identity } from '../src/actors/components';
import { readSave } from '../src/game/save';
import { PlaySession, type PlayOptions, type SessionHost, type SessionWorld } from '../src/game/session';
import type { StartSite } from '../src/worker/protocol';

let failures = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
};

/** The world worker's stand-in: no map comes, a mild climate, no roads, no towns. */
function world(): SessionWorld {
  return {
    bus: new MessageDispatcher(),
    requestChunk: () => {},
    climate: async () => ({ warm: 18, cold: 2, precipSummer: 700, precipWinter: 700, windU: 0.6, windV: 0 }),
    requestRoute: async () => ({ steps: null, partial: false }),
    site: async () => ({ site: null, gates: [] }),
    starts: () => [],
  };
}
const host = { titles: 0, openCity: async () => {}, toTitle() { this.titles++; } } satisfies SessionHost & { titles: number };

const site = { id: 's12', name: 'Onson', tier: 'city', population: 40000, lon: 10, lat: 50 } as StartSite;
const fixture = readFileSync(fileURLToPath(new URL('./fixtures/save-v1-camps.json', import.meta.url)), 'utf8');
const optionsFrom = (text: string): PlayOptions => {
  const restore = readSave(text);
  return { site, tile: [restore.player.x, restore.player.y], sites: [], gameId: restore.id, settings: restore.settings, restore, character: null };
};
const logText = (s: PlaySession) => s.hud.log.map((l) => l.text).join(' / ');

// ---- Carried on from a save ---------------------------------------------------------------------
const s = new PlaySession(world(), host, optionsFrom(fixture));
s.start();
const n = () => s.player!.need(Needs);
ok(s.player?.get(Identity)?.d.full === 'Asta Ormsdottir', 'the character comes back from the save');
ok(s.now() === 30 * 3600 && s.game.px === 1200, 'the clock and the place come back');
ok(s.game.camps.list.length === 1 && s.game.ground.has(1203, -338), 'the camp and the things on the ground come back');
ok(logText(s).includes('You take up where you left off.'), 'the log says the game is taken up again');
ok(typeof s.game.climb === 'function', 'rock faces can be climbed (by the Climbing skill)');

// ---- Time passing -------------------------------------------------------------------------------
const before = { fatigue: n().d.fatigue, reserve: n().d.reserveKcal };
s.advance(10 * 3600);
ok(n().d.fatigue > before.fatigue && n().d.reserveKcal < before.reserve, 'ten hours awake: more tired, and hungrier');
ok(!!s.state.weather && s.state.needs.length === 6, 'the panel shows the weather and the six needs');

// ---- Sleep --------------------------------------------------------------------------------------
const tired = n().d.fatigue, t0 = s.now();
const slept = s.sleep(8, 0.8);
ok(slept === 8 && s.now() === t0 + 8 * 3600, 'eight hours of sleep pass eight hours');
ok(n().d.fatigue < tired - 30, 'sleep takes off fatigue');
ok(/You wake after 8 hours/.test(logText(s)), 'waking is told');
const t1 = s.now();
s.sleep(12, 1, { untilRested: true });
ok(s.now() < t1 + 12 * 3600, 'sleeping until rested wakes early once rested');

// ---- Drinking and reading the sky -------------------------------------------------------------------
s.drinkHere();
ok(/There is no water here to drink/.test(logText(s)), 'with no water beside, there is nothing to drink (and the land is searched)');
s.readSky();
ok(/sky/.test(s.hud.log[s.hud.log.length - 1].text), `the sky is read: "${s.hud.log[s.hud.log.length - 1].text}"`);
const readAt = s.now();
s.readSky();
ok(s.now() === readAt, 'reading it again within the hour takes no time and tells the same');

// ---- Saving, and carrying on again ------------------------------------------------------------------
s.state.roofs = 'on';
const snap = JSON.stringify(s.snapshot());
const again = new PlaySession(world(), host, optionsFrom(snap));
ok(again.now() === s.now() && again.game.px === s.game.px, 'a save of the session carries on at the same time and place');
ok(JSON.stringify(again.player!.need(Needs).d) === JSON.stringify(n().d), 'and the same needs');
ok(again.game.camps.list.length === 1, 'and the camp');
ok(JSON.parse(snap).roofs === 'on' && again.state.roofs === 'on', 'and how roofs are shown');
ok(JSON.parse(snap).dice === s.game.dice.state, "the game's own dice are saved");
const twin = new PlaySession(world(), host, optionsFrom(snap));
ok([1, 2, 3].map(() => again.game.dice.random()).join() === [1, 2, 3].map(() => twin.game.dice.random()).join(), 'two games carried on from one save roll the same (events on the road replay)');
twin.dispose();

// ---- Collapse -----------------------------------------------------------------------------------
n().d.hydrated = 0;
n().d.hydrationL = 0;
s.advance(600);
await new Promise((r) => setTimeout(r, 10));
ok(/come round hours later/.test(logText(s)) && !n().collapse, 'with no water at all the body gives out, and comes round');

// ---- Leaving ------------------------------------------------------------------------------------
s.dispose();
again.dispose();
ok(true, 'the sessions end, and their timers with them (else this script would not exit)');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
if (failures) process.exitCode = 1;
