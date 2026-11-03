/**
 * What every city covers (#70): the README's list is the code's, each real city's topics.json names every topic with
 * a status and what that status needs, and `npm run data` fails otherwise. Each rule is also broken on purpose
 * against a real city's file, so a passing test proves the rule runs.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkCities } from '../../src/data/city-check';
import { checkTopics, TOPICS, type TopicsFile } from '../../src/data/topics';
import { allCities } from '../../src/lib/cities';

const root = join(import.meta.dirname, '../..');
const TODAY = '2026-11-03';
const cityOf = (name: string) => allCities.find((c) => c.path === `/us/ca/${name}/`)!;
const fileOf = (name: string): TopicsFile => JSON.parse(readFileSync(join(root, `data/cities/us/ca/${name}/topics.json`), 'utf8'));
/** A city's file with one topic replaced (or removed, with `undefined`). */
const edited = (name: string, id: string, entry: unknown): TopicsFile => {
  const f = structuredClone(fileOf(name));
  if (entry === undefined) delete f.topics[id];
  else (f.topics as Record<string, unknown>)[id] = entry;
  return f;
};
const check = (name: string, file: unknown) => checkTopics(file, cityOf(name), `${name}/topics.json`, TODAY);

describe('the README lists the topics the code checks', () => {
  it('"What every city covers" names each topic, in order', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('### What every city covers'));
    const list = section.slice(0, section.indexOf('\n\n', section.indexOf('\n- ')));
    expect([...list.matchAll(/^- \*\*(.+)\*\*$/gm)].map((m) => m[1])).toEqual(TOPICS.map((t) => t.name));
  });
});

describe.each(['berkeley', 'fremont', 'lafayette'])('%s topics.json', (name) => {
  it('passes, and names every topic once', () => {
    expect(check(name, fileOf(name))).toEqual([]);
    expect(Object.keys(fileOf(name).topics).sort()).toEqual(TOPICS.map((t) => t.id).sort());
  });

  it("points each pending topic at one of EP-5's stories", () => {
    for (const t of Object.values(fileOf(name).topics)) if (t.status === 'pending') expect([63, 64, 65, 66, 67, 68]).toContain(t.story);
  });

  it('fails when a topic is missing', () => {
    expect(check(name, edited(name, 'history', undefined))).toEqual([
      `${name}/topics.json history: missing. Every city says where it stands on "History": covered, not-published, or pending with a story`,
    ]);
  });
});

describe('each status needs what it says', () => {
  it('an unknown topic, or an unknown status', () => {
    expect(check('fremont', edited('fremont', 'parking', { status: 'covered' }))).toEqual([expect.stringMatching(/^fremont\/topics.json: "parking" isn't a topic/)]);
    expect(check('fremont', edited('fremont', 'history', { status: 'done' }))).toEqual(['fremont/topics.json history: status "done" must be covered, not-published, pending']);
  });

  it('pending needs a story number', () => {
    expect(check('fremont', edited('fremont', 'history', { status: 'pending' }))).toEqual(['fremont/topics.json history: pending needs "story", the number of the story that adds it']);
    expect(check('fremont', edited('fremont', 'history', { status: 'pending', story: '#64' }))).toHaveLength(1);
  });

  it('not-published needs what was searched, and a date that has happened', () => {
    expect(check('fremont', edited('fremont', 'history', { status: 'not-published' }))).toEqual(['fremont/topics.json history: needs "checked": { "source", "date" }, what was searched and when']);
    expect(check('fremont', edited('fremont', 'history', { status: 'not-published', checked: { source: 'S1', date: 'Nov 3' } }))).toEqual([
      'fremont/topics.json history: checked.date must be a date, YYYY-MM-DD',
    ]);
    expect(check('fremont', edited('fremont', 'history', { status: 'not-published', checked: { source: 'S1', date: '2026-11-04' } }))).toEqual([
      'fremont/topics.json history: checked.date 2026-11-04 is in the future',
    ]);
    expect(check('fremont', edited('fremont', 'history', { status: 'not-published', checked: { source: ' ', date: TODAY } }))).toHaveLength(1);
    expect(check('fremont', edited('fremont', 'history', { status: 'not-published', checked: { source: 'S1', date: TODAY } }))).toEqual([]);
  });

  it('a field from another status is refused, and a note must say something', () => {
    expect(check('fremont', edited('fremont', 'revenue', { status: 'covered', story: 64 }))).toEqual(['fremont/topics.json revenue: "story" doesn\'t belong on a covered topic']);
    expect(check('fremont', edited('fremont', 'revenue', { status: 'covered', note: '' }))).toEqual(["fremont/topics.json revenue: a note can't be empty"]);
  });

  it('covered needs the topic’s page to be on', () => {
    expect(check('fremont', edited('fremont', 'ballot', { status: 'covered' }))).toEqual(['fremont/topics.json ballot: covered, but the city has no ballot page']);
  });

  it('not-applicable is only for a topic reported when there is one, with its page off', () => {
    const na = fileOf('fremont').topics.ballot;
    expect(check('fremont', edited('fremont', 'history', na))).toEqual([expect.stringMatching(/history: only a topic reported when there is one \(ballot\) can be not-applicable$/)]);
    expect(check('berkeley', edited('berkeley', 'ballot', na))).toEqual(["berkeley/topics.json ballot: not-applicable, but the city's ballot page is on"]);
    expect(check('fremont', edited('fremont', 'ballot', { ...na, reason: '' }))).toEqual(['fremont/topics.json ballot: not-applicable needs a "reason"']);
  });

  it('needs a topics object at all', () => {
    expect(check('fremont', {})).toEqual(['fremont/topics.json: needs "topics": { "<topic id>": { "status": … } }']);
  });
});

describe('npm run data (checkCities)', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const copy = () => {
    tmp = mkdtempSync(join(tmpdir(), 'wtmw-topics-'));
    cpSync(join(root, 'data/cities'), join(tmp, 'data/cities'), { recursive: true });
    cpSync(join(root, 'data/fixtures'), join(tmp, 'data/fixtures'), { recursive: true });
    return tmp;
  };

  it('passes the committed cities; the fixture keeps no list', async () => {
    expect((await checkCities(copy(), TODAY)).errors).toEqual([]);
  });

  it('fails a real city with no topics.json', async () => {
    const dir = copy();
    rmSync(join(dir, 'data/cities/us/ca/lafayette/topics.json'));
    expect((await checkCities(dir, TODAY)).errors).toEqual(['data/cities/us/ca/lafayette/topics.json: missing. Every city lists where it stands on each topic in README "What every city covers"']);
  });
});
