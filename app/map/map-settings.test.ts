import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS, parseMapSettings } from './map-settings';

describe('map settings from a link', () => {
  it('reads on, off and the ground choice', () => {
    expect(parseMapSettings('ground:plain,trails:off,sun:on')).toEqual({ ground: 'plain', trails: false, sun: true });
  });

  it('ignores names and values it does not know', () => {
    expect(parseMapSettings('ground:satellite,nonsense:on,peaks:maybe,huts:off')).toEqual({ huts: false });
  });

  it('opens with trails, huts, camps and peaks on, and sun and ski lifts off', () => {
    expect(DEFAULT_MAP_SETTINGS).toMatchObject({ ground: 'shaded', trails: true, huts: true, camps: true, peaks: true, sun: false, skiLifts: false });
  });
});
