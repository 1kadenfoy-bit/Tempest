// Contract tests against real answers saved from api.avalanche.ca on Nov 17, 2026.
import { describe, expect, it } from 'vitest';
import { areasUrl, fetchForecasts, parseAreas, parseProducts, productsUrl, source } from './forecasts';
import { MAX_DAYS, fetchSubmissions, parseSubmission, parseSubmissions, photoAt, reportPage, submissionsUrl } from './min';
import { bulletinAt, dayAt, regionAt, shownAt } from '../../core/avalanche/danger';
import areas from './fixtures/areas-2026-11-17.json';
import products from './fixtures/products-2026-11-17.json';
import minList from './fixtures/min-submissions-2026-11-03_2026-11-17.json';
import minOne from './fixtures/min-submission-5dc16163.json';

const BC = '53bb614cadbd487077d867dec6007dfed090d20fbc0cbfe941451b6af2df33ed';
const BYK = 'afe9ffd14c0637d10e2530857f8e7a8cba0277f33351d3b31c8f37f4111c6ecf';

describe('Avalanche Canada forecasts adapter', () => {
  const regions = parseAreas(areas);
  const bulletins = parseProducts(products);

  it('asks the documented paths', () => {
    expect(areasUrl()).toBe('https://api.avalanche.ca/forecasts/en/areas');
    expect(productsUrl()).toBe('https://api.avalanche.ca/forecasts/en/products');
    expect(source.offline).toBe(false);
  });

  it('reads every area outline and every product', () => {
    expect(regions).toHaveLength(8);
    expect(bulletins.size).toBe(8);
    // Every product has an outline.
    for (const id of bulletins.keys()) expect(regions.some((r) => r.id === id), id).toBe(true);
  });

  it('finds the BC early-season product at the North Shore', () => {
    const r = regionAt(regions, -123.08, 49.37);
    expect(r?.id).toBe(BC);
    const b = bulletins.get(BC)!;
    expect(b.owner).toBe('Avalanche Canada');
    expect(b.timeZone).toBe('America/Vancouver');
    expect(b.issued).toEqual(new Date('2026-10-01T23:00:00.000Z'));
    expect(b.validUntil).toEqual(new Date('2026-11-26T00:00:00.000Z'));
    expect(b.days.map((d) => [d.date, d.label])).toEqual([['2026-10-02', 'Friday'], ['2026-10-03', 'Saturday'], ['2026-10-04', 'Sunday']]);
    expect(b.days[0]!.ratings.alp).toEqual({ value: 'earlyseason', display: 'Early Season' });
    expect(b.url).toMatch(/^https:\/\/avalanche\.ca\/forecasts\//);
  });

  it('keeps the issuer’s day names in the issuer’s time zone', () => {
    for (const b of bulletins.values()) {
      for (const d of b.days) {
        const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${d.date}T12:00:00Z`));
        expect(d.label, `${b.title} ${d.date}`).toBe(wd);
      }
    }
  });

  it('shows a valid early-season bulletin as issued, and no forecast after it expires', () => {
    const b = bulletins.get(BC)!;
    const today = new Date('2026-11-17T20:00:00Z');
    expect(dayAt(b, today)).toEqual({ kind: 'seasonal', rating: { value: 'earlyseason', display: 'Early Season' } });
    expect(shownAt(b, today, 'highest')).toEqual({ rating: { value: 'earlyseason', display: 'Early Season' }, band: null });
    expect(dayAt(b, new Date('2026-11-27T20:00:00Z'))).toEqual({ kind: 'none' });
  });

  it('reads problems, confidence, summaries and advice as issued', () => {
    const b = bulletins.get(BYK)!;
    expect(b.owner).toBe('Parks Canada');
    expect(b.problems).toEqual([{
      name: 'Wind Slab',
      elevations: ['Alpine'],
      aspects: ['Northeast', 'East', 'Southeast', 'Northwest', 'West', 'Southwest', 's', 'North'],
      likelihood: 'unlikely',
      size: { min: '1.0', max: '1.5' },
      html: '<p>Isolated small wind slabs are possible in steep alpine lee terrain.</p>',
    }]);
    expect(b.confidence).toEqual({ display: 'Moderate', statements: ['We are uncertain due to a limited number of field observations.'] });
    expect(b.summaries.map((s) => s.title)).toEqual(['Avalanche Summary', 'Snowpack Summary', 'Weather Summary']);
    expect(b.travelAdvice).toEqual(['Be careful with wind-loaded pockets, especially near ridge crests and rollovers.']);
    expect(b.notifications).toHaveLength(1);
    // Banff's days are Mon 16 to Wed 18 in Edmonton time.
    expect(dayAt(b, new Date('2026-11-18T20:00:00Z'))).toMatchObject({ kind: 'day', index: 2 });
  });

  it('skips products without their times', () => {
    expect(parseProducts([{ id: 'x', area: { id: 'a' }, report: {} }]).size).toBe(0);
    expect(parseProducts(null).size).toBe(0);
    expect(parseAreas({ features: [{ id: 'a', geometry: { type: 'Point', coordinates: [0, 0] } }] })).toEqual([]);
  });

  it('fetches areas and products together and fails loudly', async () => {
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const fetchFn = (async (u: string) => ok(u.endsWith('/areas') ? areas : products)) as unknown as typeof fetch;
    const got = await fetchForecasts(fetchFn);
    expect(bulletinAt(-123.08, 49.37, { ...got, fetchedAt: new Date(), source: 'x' })?.bulletin?.areaId).toBe(BC);
    const bad = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchForecasts(bad)).rejects.toThrow(/503/);
  });
});

describe('Mountain Information Network adapter', () => {
  it('asks for a window of at most 31 days, both ends counted, in BC dates', () => {
    const now = new Date('2026-11-17T20:00:00Z');
    const u = new URL(submissionsUrl(7, now));
    expect(u.origin + u.pathname).toBe('https://api.avalanche.ca/min/submissions');
    expect(u.searchParams.get('fromdate')).toBe('2026-11-11');
    expect(u.searchParams.get('todate')).toBe('2026-11-17');
    const far = new URL(submissionsUrl(90, now));
    expect(far.searchParams.get('fromdate')).toBe('2026-10-18');
    expect(MAX_DAYS).toBe(31);
    // Late evening in BC is already the next day in UTC: the BC date is used.
    expect(new URL(submissionsUrl(1, new Date('2026-11-18T06:00:00Z'))).searchParams.get('todate')).toBe('2026-11-17');
  });

  it('reads reports as published', () => {
    const list = parseSubmissions(minList);
    expect(list).toHaveLength(21);
    const r = list[0]!;
    expect(r).toMatchObject({
      id: '5dc16163-4d1e-4e1a-afbf-1b3590ff3c14',
      title: 'Hope you like rocks, cause we’ve got heaps of f*cking rocks',
      date: '2026-11-15',
      author: 'Nathan Britt',
      lat: 51.34044,
      lon: -117.54394,
      region: 'Selkirks',
      activities: ['hiking', 'snowboarding'],
      sawAvalanche: 'no',
      link: 'https://avalanche.ca/mountain-information-network/submissions/5dc16163-4d1e-4e1a-afbf-1b3590ff3c14',
    });
    expect(r.submitted).toEqual(new Date('2026-11-16T13:36:23Z'));
    expect(r.images).toHaveLength(8);
    expect(r.images[0]).toEqual({ url: 'https://res.cloudinary.com/avcan-min/image/upload/v1794836068/min/prod/10147596-26c0-463b-8347-05ac800b0f85.jpg', width: 2000, height: 2667 });
    expect(r.text.startsWith('Went for a trundle up hermit today')).toBe(true);
    expect(r.text).toContain('\n\nTemp at valley bottom(1300m): 4 degrees');
    // Reports without photos have none.
    expect(list.filter((x) => x.images.length === 0).length).toBeGreaterThan(0);
  });

  it('reads the single report the same as its list item', () => {
    expect(parseSubmission(minOne)).toEqual(parseSubmissions(minList)[0]);
    expect(reportPage('a b')).toBe('https://avalanche.ca/mountain-information-network/submissions/a%20b');
  });

  it('asks Cloudinary for a smaller photo', () => {
    expect(photoAt('https://res.cloudinary.com/avcan-min/image/upload/v1/min/prod/x.jpg', 480)).toBe('https://res.cloudinary.com/avcan-min/image/upload/c_limit,w_480,q_auto/v1/min/prod/x.jpg');
    expect(photoAt('https://example.com/x.jpg', 480)).toBe('https://example.com/x.jpg');
  });

  it('fails loudly on an error answer', async () => {
    const bad = (async () => new Response('{"error":"fromdate is required"}', { status: 400 })) as unknown as typeof fetch;
    await expect(fetchSubmissions(7, new Date(), bad)).rejects.toThrow(/400/);
  });
});
