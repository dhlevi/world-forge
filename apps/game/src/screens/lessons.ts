/**
 * Lessons in town (actors/learning.ts): the skills a place teaches, from a teacher whose own level
 * comes from the size of the town, an hour at a time for a fee. Lessons take a skill only so far
 * (10 below the teacher, and journeyman at most); beyond that, practice.
 */
import { reactive } from 'vue';
import { Screen } from '../engine/screens';
import type { PlayScreen } from './play';
import type { SiteInfo, SitePlace } from '../worker/protocol';
import { moneyText, Skills } from '../actors/components';
import { Inventory } from '../actors/items/inventory';
import { SKILL, skillWord } from '../actors/data/skills';
import { lesson, lessonLimit, lessonPrice, taughtAt, teacherLevel } from '../actors/learning';
import LessonsView from './views/LessonsView.vue';

export interface Course {
  skill: string;
  name: string;
  /** The teacher's level, and how far they can take this pupil. */
  teacher: number;
  limit: number;
  price: number;
}

export class LessonsScreen extends Screen {
  readonly view = LessonsView;
  popup = true;
  readonly state = reactive({ message: '', version: 0 });
  readonly courses: Course[];

  constructor(readonly play: PlayScreen, readonly place: SitePlace, readonly site: SiteInfo) {
    super();
    this.courses = taughtAt(place.kind, place.role).map((id) => {
      const teacher = teacherLevel(site.tier, place.id, id);
      const def = SKILL.get(id)!;
      return { skill: id, name: def.name, teacher, limit: lessonLimit(teacher), price: lessonPrice(teacher, !!def.trained) };
    });
  }

  get skills(): Skills | undefined {
    return this.play.player?.get(Skills);
  }

  /** The pupil's level at a skill. */
  level(c: Course): number {
    return this.skills?.level(c.skill) ?? 0;
  }

  /** Why lessons in this cannot be had now (or null). */
  why(c: Course, hours = 1): string | null {
    const s = this.skills, inv = this.play.player?.get(Inventory);
    if (!s || !inv) return 'There is no one to teach.';
    const limit = Math.min(c.limit, s.cap(c.skill));
    if (s.level(c.skill) >= limit - 0.05) return s.level(c.skill) >= s.cap(c.skill) - 0.05 ? 'You have gone as far as you can at it.' : 'They have nothing more to teach you.';
    if (inv.d.copper < c.price * hours) return `You have ${moneyText(inv.d.copper)}.`;
    return null;
  }

  teacherWord(c: Course): string {
    return skillWord(c.teacher);
  }

  /** Hours of lessons: each paid for, an hour passing, and something learnt. */
  learn(c: Course, hours: number): void {
    const a = this.play.player, inv = a?.get(Inventory), s = this.skills;
    if (!a || !inv || !s) return;
    const before = s.level(c.skill);
    let done = 0, stop = '';
    for (let h = 0; h < hours; h++) {
      const why = this.why(c);
      if (why) {
        stop = why;
        break;
      }
      inv.d.copper -= c.price;
      this.play.advance(3600);
      lesson(a, c.skill, c.teacher, this.play.now());
      done++;
    }
    if (done) {
      const gained = s.level(c.skill) - before;
      const how = gained >= 1.5 ? 'and learn a good deal' : gained >= 0.5 ? 'and learn something' : 'but it is slow going today';
      this.play.say(`You spend ${done === 1 ? 'an hour' : `${done} hours`} at ${c.name.toLowerCase()} with a teacher, ${how}.`);
      for (const n of s.takeNotes()) this.play.say(n.text);
    }
    this.state.message = stop || (done ? `${done === 1 ? 'An hour' : `${done} hours`} of ${c.name.toLowerCase()}: ${s.level(c.skill).toFixed(1)} (${skillWord(s.level(c.skill))}).` : '');
    this.state.version++;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code !== 'Escape') return false;
    this.close();
    return true;
  }
}
