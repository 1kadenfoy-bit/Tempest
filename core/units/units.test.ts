import { afterEach, describe, expect, it } from 'vitest';
import {
  cToF, cmToIn, formatCm, formatCmNumber, formatDegrees, formatDistance, formatElevation, formatElevationNumber, formatMm, formatMmNumber,
  formatRate, formatRateNumber, formatRateRange, formatSpeed, formatTemp, formatTempNumber, formatTempSigned, kmhToMph, mToFt, mmToIn,
  formatMinutesAgo, formatSnowRate, formatSnowRateRange, setUnitSystem, speedValue, tempValue, unitLabel, unitSystem,
} from './format';

afterEach(() => setUnitSystem('metric'));

describe('conversions', () => {
  it('uses exact factors', () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(-40)).toBe(-40);
    expect(cToF(100)).toBe(212);
    expect(kmhToMph(1.609344)).toBeCloseTo(1, 12);
    expect(mToFt(0.3048)).toBeCloseTo(1, 12);
    expect(mmToIn(25.4)).toBeCloseTo(1, 12);
    expect(cmToIn(2.54)).toBeCloseTo(1, 12);
  });
  it('gives values in the shown unit for scales', () => {
    expect(tempValue(10, 'metric')).toBe(10);
    expect(tempValue(10, 'imperial')).toBe(50);
    expect(speedValue(100, 'imperial')).toBeCloseTo(62.137, 3);
  });
});

describe('metric (the default)', () => {
  it('is the default system', () => {
    expect(unitSystem()).toBe('metric');
  });
  it('formats every kind as before', () => {
    expect(formatElevation(1180.4)).toBe('1,180 m');
    expect(formatElevationNumber(1150)).toBe('1,150');
    expect(formatTemp(-0.6)).toBe('−1 °C');
    expect(formatTempSigned(2.2)).toBe('+2 °C');
    expect(formatTempNumber(-6.2)).toBe('−6');
    expect(formatDegrees(2.2)).toBe('+2°');
    expect(formatRate(2.44)).toBe('2.4 mm/h');
    expect(formatRateNumber(0.05)).toBe('0.1');
    expect(formatRateRange(0.1, 6)).toBe('0.1 to 6+ mm/h');
    expect(formatMm(12.4)).toBe('12 mm');
    expect(formatMm(0.42)).toBe('0.4 mm');
    expect(formatMmNumber(0.6, 'metric', true)).toBe('1');
    expect(formatCm(21.2)).toBe('21 cm');
    expect(formatCmNumber(0.7)).toBe('0.7');
    expect(formatSpeed(28.4)).toBe('28 km/h');
    expect(formatSpeed(28.4, false)).toBe('28');
    expect(formatDistance(2.5)).toBe('2.5 km');
    expect(formatDistance(35.4)).toBe('35 km');
    expect(unitLabel('speed')).toBe('km/h');
  });
});

describe('imperial', () => {
  it('formats when passed explicitly', () => {
    expect(formatElevation(1180, 'imperial')).toBe('3,871 ft');
    expect(formatTemp(0, 'imperial')).toBe('32 °F');
    expect(formatTemp(-20, 'imperial')).toBe('−4 °F');
    expect(formatTemp(-17.9, 'imperial')).toBe('0 °F');
    expect(formatTempSigned(-10, 'imperial')).toBe('+14 °F');
    expect(formatDegrees(-30, true, 'imperial')).toBe('−22°');
    expect(formatSpeed(28, true, 'imperial')).toBe('17 mph');
    expect(formatRate(2.4, 'imperial')).toBe('0.09 in/h');
    expect(formatRate(0.1, 'imperial')).toBe('0.004 in/h');
    expect(formatRateRange(0.1, 6, 'imperial')).toBe('0.004 to 0.24+ in/h');
    expect(formatMm(12, 'imperial')).toBe('0.47 in');
    expect(formatMm(40, 'imperial')).toBe('1.6 in');
    expect(formatCm(21, 'imperial')).toBe('8 in');
    expect(formatCm(1.5, 'imperial')).toBe('0.6 in');
    expect(formatDistance(2.5, 'imperial')).toBe('1.6 mi');
    expect(unitLabel('rate', 'imperial')).toBe('in/h');
  });
  it('follows the setting everywhere once chosen', () => {
    setUnitSystem('imperial');
    expect(unitSystem()).toBe('imperial');
    expect(formatElevation(1000)).toBe('3,281 ft');
    expect(formatSpeed(60)).toBe('37 mph');
    expect(formatTemp(20)).toBe('68 °F');
    setUnitSystem('metric');
    expect(formatTemp(20)).toBe('20 °C');
  });
});

describe('radar formats', () => {
  it('gives snow rates and minutes ago', () => {
    expect(formatSnowRate(0.69, 'metric')).toBe('0.7 cm/h');
    expect(formatSnowRate(2.54, 'imperial')).toBe('1.00 in/h');
    expect(formatSnowRateRange(0.1, 20, 'metric')).toBe('0.1 to 20+ cm/h');
    expect(formatSnowRateRange(0.1, 20, 'imperial')).toBe('0.04 to 7.9+ in/h');
    const now = new Date('2026-11-17T14:00:00Z');
    expect(formatMinutesAgo(new Date('2026-11-17T13:59:00Z'), now)).toBe('now');
    expect(formatMinutesAgo(new Date('2026-11-17T13:42:00Z'), now)).toBe('18 min ago');
    expect(formatMinutesAgo(new Date('2026-11-17T11:54:00Z'), now)).toBe('2 h 6 min ago');
    expect(formatMinutesAgo(new Date('2026-11-17T12:00:00Z'), now)).toBe('2 h ago');
  });
});
