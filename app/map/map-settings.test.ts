import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS, parseMapSettings } from './map-settings';

describe('map settings from a link', () => {
  it('reads on, off and the ground choice', () => {
    expect(parseMapSettings('ground:shaded,trails:off,sun:on')).toEqual({ ground: 'shaded', trails: false, sun: true });
    expect(parseMapSettings('ground:satellite')).toEqual({ ground: 'satellite' });
  });

  it('reads the old Plain choice as Terrain', () => {
    expect(parseMapSettings('ground:plain')).toEqual({ ground: 'shaded' });
  });

  it('ignores names and values it does not know', () => {
    expect(parseMapSettings('ground:hologram,nonsense:on,peaks:maybe,huts:off')).toEqual({ huts: false });
  });

  it('opens with trails, huts, camps and peaks on, and sun and ski lifts off', () => {
    expect(DEFAULT_MAP_SETTINGS).toMatchObject({ ground: 'shaded', trails: true, huts: true, camps: true, peaks: true, sun: false, skiLifts: false });
  });
});
