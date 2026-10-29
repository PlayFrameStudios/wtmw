import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allCities, buildRegistry, cities, featuredCity, parseCity } from '../../src/lib/cities';

const berkeley = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/cities/us/ca/berkeley/city.json'), 'utf8'));
const exists = () => true;

describe('city registry', () => {
  it('loads Berkeley from data/cities', () => {
    expect(cities.map((c) => c.path)).toEqual(['/us/ca/berkeley/']);
    expect(cities[0].slug).toEqual({ country: 'us', state: 'ca', city: 'berkeley' });
  });

  it('derives the route from the folder, so a second city is data, not code', () => {
    const reg = buildRegistry(
      {
        '/data/cities/us/ca/berkeley/city.json': berkeley,
        '/data/cities/us/ca/oakland/city.json': { ...berkeley, name: 'Oakland', government: 'City of Oakland', featured: false },
      },
      exists,
    );
    expect(reg.map((c) => c.path)).toEqual(['/us/ca/berkeley/', '/us/ca/oakland/']);
  });

  it('rejects a city.json whose codes disagree with its folder', () => {
    expect(() => parseCity('/data/cities/us/ny/berkeley/city.json', berkeley, exists)).toThrow(/stateCode "CA"/);
  });

  it('rejects a missing field', () => {
    const { government: _omit, ...partial } = berkeley;
    void _omit;
    expect(() => parseCity('/data/cities/us/ca/berkeley/city.json', partial, exists)).toThrow(/missing "government"/);
  });

  it('rejects path segments that are not URL-safe', () => {
    expect(() => parseCity('/data/cities/us/ca/San Jose/city.json', berkeley, exists)).toThrow(/path segment/);
  });

  it('features exactly one city, for the landing page', () => {
    expect(featuredCity.path).toBe('/us/ca/berkeley/');
    const two = { '/data/cities/us/ca/berkeley/city.json': berkeley, '/data/cities/us/ca/oakland/city.json': { ...berkeley, name: 'Oakland' } };
    expect(() => buildRegistry(two, exists)).toThrow(/exactly one city.json must say "featured": true; found 2|found 2/);
    expect(() => buildRegistry({ '/data/cities/us/ca/berkeley/city.json': { ...berkeley, featured: false } }, exists)).toThrow(/found 0/);
  });

  it('serves fixture cities under /test/cities/, borrowing data, and lists them nowhere (#42)', () => {
    const fx = allCities.find((c) => c.fixture)!;
    expect(fx.path).toBe('/test/cities/fixtureville/');
    expect(fx.dir).toBe('/data/fixtures/fixtureville/');
    expect(fx.dataDir).toBe('/data/cities/us/ca/berkeley/');
    expect(cities.some((c) => c.fixture)).toBe(false);
  });

  it('rejects a fixture that names no city to borrow data from', () => {
    const { fixture: _omit, ...rest } = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/fixtures/fixtureville/city.json'), 'utf8'));
    void _omit;
    expect(() => parseCity('/data/fixtures/fixtureville/city.json', rest, exists)).toThrow(/a fixture needs "fixture"/);
  });
});
