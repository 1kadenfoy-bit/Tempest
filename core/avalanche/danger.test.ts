import { describe, expect, it } from 'vitest';
import { DANGER_COLOURS, LEVELS, dayAt, highest, inkOn, localDate, mapValue, rating, ratingFor, ratingLabel, regionContains, seasonal, shownAt, type Bulletin, type BulletinDay, type ForecastRegion } from './danger';

const day = (date: string, label: string, alp: string, tln: string, btl: string): BulletinDay => ({
  date, label, ratings: { alp: rating(alp), tln: rating(tln), btl: rating(btl) },
});

const bulletin = (days: BulletinDay[], over: Partial<Bulletin> = {}): Bulletin => ({
  id: 'p', areaId: 'a', title: 'Sea To Sky', owner: 'Avalanche Canada', forecaster: 'Avalanche Canada',
  issued: new Date('2026-12-01T00:00:00Z'), validUntil: new Date('2026-12-02T00:00:00Z'), timeZone: 'America/Vancouver',
  url: 'https://avalanche.ca/forecasts/p', highlights: '', confidence: null, summaries: [], problems: [], travelAdvice: [], notifications: [],
  days, ...over,
});

describe('danger scale', () => {
  it('uses the official colours for each level, as Avalanche Canada draws them', () => {
    expect(DANGER_COLOURS).toMatchObject({ low: '#50B848', moderate: '#FFF200', considerable: '#F7941E', high: '#ED1C24', extreme: '#231F20' });
    expect(DANGER_COLOURS.norating).toBe('#FFFFFF');
    expect(DANGER_COLOURS.earlyseason).toBe('#0072C6');
    expect(DANGER_COLOURS.spring).toBe('#0072C6');
    expect(LEVELS).toEqual({ low: 1, moderate: 2, considerable: 3, high: 4, extreme: 5 });
  });

  it('labels a level with its number and keeps the issuer’s words', () => {
    expect(ratingLabel(rating('considerable', 'Considerable'))).toBe('Considerable (3)');
    expect(ratingLabel(rating('earlyseason', 'Early Season'))).toBe('Early Season');
    expect(ratingLabel(rating('HIGH'))).toBe('High (4)');
    // An unknown word is not guessed into a level.
    expect(rating('purple', 'Purple')).toEqual({ value: 'norating', display: 'Purple' });
  });

  it('picks black or white text for legibility on each colour', () => {
    expect(inkOn('moderate')).toBe('#000000');
    expect(inkOn('low')).toBe('#000000');
    expect(inkOn('extreme')).toBe('#FFFFFF');
    expect(inkOn('earlyseason')).toBe('#FFFFFF');
    expect(inkOn('norating')).toBe('#000000');
  });

  it('takes the highest level of the three bands', () => {
    const d = day('2026-12-01', 'Monday', 'moderate', 'considerable', 'low');
    expect(highest(d.ratings)).toEqual({ rating: rating('considerable'), band: 'tln' });
    expect(ratingFor(d.ratings, 'btl')).toEqual({ rating: rating('low'), band: 'btl' });
    // Ties keep the higher band.
    expect(highest(day('x', 'x', 'high', 'high', 'low').ratings).band).toBe('alp');
    // No level at all: alpine as issued.
    expect(highest(day('x', 'x', 'norating', 'norating', 'norating').ratings).rating.value).toBe('norating');
  });
});

describe('which issued day applies', () => {
  const b = bulletin([
    day('2026-12-01', 'Tuesday', 'considerable', 'moderate', 'low'),
    day('2026-12-02', 'Wednesday', 'high', 'considerable', 'moderate'),
    day('2026-12-03', 'Thursday', 'moderate', 'moderate', 'low'),
  ]);

  it('matches the day in the bulletin’s own time zone', () => {
    // Late evening in BC on Dec 1 is Dec 2 in UTC: still Tuesday's rating.
    expect(localDate(new Date('2026-12-02T05:00:00Z'), 'America/Vancouver')).toBe('2026-12-01');
    expect(dayAt(b, new Date('2026-12-02T05:00:00Z'))).toMatchObject({ kind: 'day', index: 0 });
    expect(dayAt(b, new Date('2026-12-02T20:00:00Z'))).toMatchObject({ kind: 'day', index: 1 });
    expect(dayAt(b, new Date('2026-12-03T20:00:00Z'))).toMatchObject({ kind: 'day', index: 2 });
  });

  it('says no forecast beyond the third day and before the first', () => {
    expect(dayAt(b, new Date('2026-12-04T20:00:00Z'))).toEqual({ kind: 'none' });
    expect(dayAt(b, new Date('2026-11-30T20:00:00Z'))).toEqual({ kind: 'none' });
    expect(shownAt(b, new Date('2026-12-04T20:00:00Z'), 'highest')).toBeNull();
    expect(mapValue(b, new Date('2026-12-04T20:00:00Z'), 'highest')).toBe('none');
    expect(mapValue(undefined, new Date(), 'highest')).toBe('none');
  });

  it('colours by the chosen band', () => {
    const t = new Date('2026-12-02T20:00:00Z');
    expect(mapValue(b, t, 'highest')).toBe('high');
    expect(mapValue(b, t, 'tln')).toBe('considerable');
    expect(mapValue(b, t, 'btl')).toBe('moderate');
  });

  it('keeps a seasonal bulletin for as long as it is valid', () => {
    const s = bulletin([day('2026-10-02', 'Friday', 'earlyseason', 'earlyseason', 'earlyseason')], {
      issued: new Date('2026-10-01T23:00:00Z'), validUntil: new Date('2026-11-26T00:00:00Z'),
    });
    expect(seasonal(s)).toEqual(rating('earlyseason'));
    expect(seasonal(b)).toBeNull();
    expect(mapValue(s, new Date('2026-11-17T20:00:00Z'), 'alp')).toBe('earlyseason');
    expect(mapValue(s, new Date('2026-11-27T20:00:00Z'), 'alp')).toBe('none');
  });
});

describe('point in region', () => {
  const square: ForecastRegion = { id: 'r', bbox: [0, 0, 10, 10], geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]] } };
  it('finds points inside, outside and in holes', () => {
    expect(regionContains(square, 2, 2)).toBe(true);
    expect(regionContains(square, 5, 5)).toBe(false);
    expect(regionContains(square, 11, 5)).toBe(false);
  });
});
