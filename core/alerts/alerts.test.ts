import { describe, expect, it } from 'vitest';
import { currentAlerts, isFresh, placeFor, type IssuedAlert } from './alerts';

const base: IssuedAlert = {
  id: 'a_1', alertId: 'a', type: 'warning', title: 'snowfall warning', area: 'Area 1', colour: 'yellow', status: 'issued',
  issued: new Date('2026-11-17T00:00:00Z'), expires: new Date('2026-11-17T12:00:00Z'), province: 'BC', link: 'x',
};
const at = (o: Partial<IssuedAlert>): IssuedAlert => ({ ...base, ...o });
const now = new Date('2026-11-17T06:00:00Z');

describe('alerts at the pin', () => {
  it('drops expired and ended alerts', () => {
    const got = currentAlerts([
      at({ id: 'a_1', alertId: 'a' }),
      at({ id: 'b_1', alertId: 'b', expires: new Date('2026-11-17T05:59:00Z') }),
      at({ id: 'c_1', alertId: 'c', status: 'ended' }),
    ], now);
    expect(got.map((a) => a.alertId)).toEqual(['a']);
  });
  it('orders by colour level, then type, then newest issue', () => {
    const got = currentAlerts([
      at({ alertId: 'statement', type: 'statement', colour: null }),
      at({ alertId: 'yellow-old', issued: new Date('2026-11-16T00:00:00Z') }),
      at({ alertId: 'yellow-new', issued: new Date('2026-11-17T01:00:00Z') }),
      at({ alertId: 'orange-watch', type: 'watch', colour: 'orange' }),
      at({ alertId: 'yellow-advisory', type: 'advisory' }),
      at({ alertId: 'red', colour: 'red' }),
    ], now);
    expect(got.map((a) => a.alertId)).toEqual(['red', 'orange-watch', 'yellow-new', 'yellow-old', 'yellow-advisory', 'statement']);
  });
  it('lists one alert once, with each area it covers the pin through', () => {
    const got = currentAlerts([at({ id: 'a_1', area: 'Area 1' }), at({ id: 'a_2', area: 'Area 2' }), at({ id: 'a_3', area: 'Area 1' })], now);
    expect(got).toHaveLength(1);
    expect(got[0]!.area).toBe('Area 1 · Area 2');
  });
  it('does not change the alerts it is given', () => {
    const list = [at({ id: 'a_1', area: 'Area 1' }), at({ id: 'a_2', area: 'Area 2' })];
    currentAlerts(list, now);
    expect(list[0]!.area).toBe('Area 1');
  });
  it('rounds nearby pins to one place', () => {
    expect(placeFor(49.38951, -122.94799).key).toBe(placeFor(49.3895, -122.948).key);
    expect(placeFor(49.3895, -122.948)).toMatchObject({ lat: 49.39, lon: -122.948 });
  });
  it('asks again after five minutes', () => {
    expect(isFresh(new Date('2026-11-17T05:56:00Z'), now)).toBe(true);
    expect(isFresh(new Date('2026-11-17T05:55:00Z'), now)).toBe(false);
  });
});
