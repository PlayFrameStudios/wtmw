/**
 * What every city covers (#70): the standard topics a city's pages report, and each city's own list of where it
 * stands on them (data/cities/{city}/topics.json). Sourcing a new city searches for every topic; the list records
 * what was found, so a gap is a recorded fact (not published, or a story to fill it) rather than a silent omission.
 * `npm run data` fails if a city's list is missing a topic, names one that isn't here, or leaves a status unexplained.
 */
import { hasPage, type CityPageSlug } from '../lib/city-pages.ts';
import type { CitySettings } from '../lib/city-settings.ts';

export interface Topic {
  id: string;
  /** As the README lists it. */
  name: string;
  /** The page that shows it, where it has one of its own: a city that says it covers the topic must have that page. */
  page?: CityPageSlug;
  /** Reported only when there is one (a ballot measure): the city may say there's nothing to report. */
  conditional?: true;
}

export const TOPICS: readonly Topic[] = [
  { id: 'per-100', name: 'Where every $100 goes' },
  { id: 'departments', name: 'Departments', page: 'departments' },
  { id: 'staff-positions', name: 'Staff positions' },
  { id: 'revenue', name: 'Revenue', page: 'revenue' },
  { id: 'restricted-taxes', name: 'Restricted taxes' },
  { id: 'reserves', name: "Balance & reserves, and the City's own targets" },
  { id: 'history', name: 'History' },
  { id: 'staff-costs', name: 'Staff costs and pensions' },
  { id: 'capital', name: 'Capital', page: 'capital' },
  { id: 'forecast', name: "The City's forecast" },
  { id: 'coverage', name: 'Services provided by other governments' },
  { id: 'schools', name: 'Schools pointer' },
  { id: 'ballot', name: 'Ballot (when there is one)', page: 'ballot', conditional: true },
  { id: 'sources', name: 'Sources & receipts', page: 'sources' },
];

/** Where a city stands on one topic. Any status may carry a `note` ("partly: …"). */
export type TopicStatus =
  | { status: 'covered'; note?: string }
  /** The City doesn't publish it: which document or page was searched, and when. */
  | { status: 'not-published'; checked: Checked; note?: string }
  /** Not on the pages yet: the story that adds it. */
  | { status: 'pending'; story: number; note?: string }
  /** A conditional topic with nothing to report (no ballot measure): why, and what was checked. */
  | { status: 'not-applicable'; reason: string; checked: Checked; note?: string };

/** A source id ("S1") or a URL, and the day it was checked. */
export interface Checked {
  source: string;
  date: string;
}

export interface TopicsFile {
  note?: string;
  topics: Record<string, TopicStatus>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS: Record<TopicStatus['status'], string[]> = {
  covered: ['status', 'note'],
  'not-published': ['status', 'checked', 'note'],
  pending: ['status', 'story', 'note'],
  'not-applicable': ['status', 'reason', 'checked', 'note'],
};

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

function checkChecked(c: unknown, where: string, today: string): string[] {
  if (!c || typeof c !== 'object') return [`${where}: needs "checked": { "source", "date" }, what was searched and when`];
  const { source, date } = c as Record<string, unknown>;
  const errors: string[] = [];
  if (!text(source)) errors.push(`${where}: checked.source must name the document or page searched (a source id or a URL)`);
  if (typeof date !== 'string' || !DATE.test(date) || Number.isNaN(Date.parse(date))) errors.push(`${where}: checked.date must be a date, YYYY-MM-DD`);
  else if (date > today) errors.push(`${where}: checked.date ${date} is in the future`);
  return errors;
}

/**
 * A city's topics.json, checked against TOPICS and the city's pages: every topic once, none unknown, and each status
 * with what it needs. `today` (YYYY-MM-DD) bounds a check's date. Returns errors; an empty list means it passes.
 */
export function checkTopics(raw: unknown, city: Pick<CitySettings, 'fiscalPosition' | 'ballot' | 'schools' | 'faq'>, where: string, today: string): string[] {
  if (!raw || typeof raw !== 'object' || !('topics' in raw) || !raw.topics || typeof raw.topics !== 'object') return [`${where}: needs "topics": { "<topic id>": { "status": … } }`];
  const topics = (raw as TopicsFile).topics as Record<string, unknown>;
  const errors: string[] = [];
  const known = new Map(TOPICS.map((t) => [t.id, t]));
  for (const id of Object.keys(topics)) if (!known.has(id)) errors.push(`${where}: "${id}" isn't a topic (${TOPICS.map((t) => t.id).join(', ')})`);
  for (const t of TOPICS) {
    const at = `${where} ${t.id}`;
    const entry = topics[t.id] as Record<string, unknown> | undefined;
    if (!entry) {
      errors.push(`${at}: missing. Every city says where it stands on "${t.name}": covered, not-published, or pending with a story`);
      continue;
    }
    const status = entry.status as TopicStatus['status'];
    if (!(status in KEYS)) {
      errors.push(`${at}: status "${String(entry.status)}" must be covered, not-published, pending${t.conditional ? ' or not-applicable' : ''}`);
      continue;
    }
    for (const k of Object.keys(entry)) if (!KEYS[status].includes(k)) errors.push(`${at}: "${k}" doesn't belong on a ${status} topic`);
    if ('note' in entry && !text(entry.note)) errors.push(`${at}: a note can't be empty`);
    if (status === 'covered' && t.page && !hasPage(city, t.page)) errors.push(`${at}: covered, but the city has no ${t.page} page`);
    if (status === 'pending' && !(Number.isInteger(entry.story) && (entry.story as number) > 0)) errors.push(`${at}: pending needs "story", the number of the story that adds it`);
    if (status === 'not-published' || status === 'not-applicable') errors.push(...checkChecked(entry.checked, at, today));
    if (status === 'not-applicable') {
      if (!t.conditional) errors.push(`${at}: only a topic reported when there is one (${TOPICS.filter((x) => x.conditional).map((x) => x.id).join(', ')}) can be not-applicable`);
      if (!text(entry.reason)) errors.push(`${at}: not-applicable needs a "reason"`);
      if (t.page && hasPage(city, t.page)) errors.push(`${at}: not-applicable, but the city's ${t.page} page is on`);
    }
  }
  return errors;
}
