import { describe, it, expect } from 'vitest';
import { formatPrice, formatVolume, formatChange } from './formatters';

describe('formatPrice', () => {
  it('formats small prices with 2 decimals', () => {
    expect(formatPrice(42.5)).toBe('42.50');
  });

  it('formats large prices with locale separators', () => {
    const result = formatPrice(12345.67);
    // toLocaleString('en-US') adds comma separators
    expect(result).toBe('12,345.67');
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('0.00');
  });

  it('formats negative prices', () => {
    expect(formatPrice(-5.5)).toBe('-5.50');
  });
});

describe('formatVolume', () => {
  it('formats billions with B suffix', () => {
    expect(formatVolume(2_500_000_000)).toBe('2.50B');
  });

  it('formats millions with M suffix', () => {
    expect(formatVolume(1_500_000)).toBe('1.50M');
  });

  it('formats thousands with K suffix', () => {
    expect(formatVolume(5_000)).toBe('5.0K');
  });

  it('formats small values as-is', () => {
    expect(formatVolume(42)).toBe('42');
  });

  it('formats zero', () => {
    expect(formatVolume(0)).toBe('0');
  });

  it('formats exactly 1 million', () => {
    expect(formatVolume(1_000_000)).toBe('1.00M');
  });

  it('formats exactly 1 billion', () => {
    expect(formatVolume(1_000_000_000)).toBe('1.00B');
  });
});

describe('formatChange', () => {
  it('handles positive change', () => {
    const result = formatChange(110, 100);
    expect(result.positive).toBe(true);
    expect(result.percent).toContain('+');
    expect(result.percent).toContain('10.00%');
  });

  it('handles negative change', () => {
    const result = formatChange(90, 100);
    expect(result.positive).toBe(false);
    expect(result.percent).toContain('-10.00%');
  });

  it('handles zero previous (division by zero guard)', () => {
    const result = formatChange(10, 0);
    expect(result.percent).toBe('+0.00%');
  });

  it('handles equal values', () => {
    const result = formatChange(100, 100);
    expect(result.positive).toBe(true);
    expect(result.value).toContain('+');
    expect(result.percent).toBe('+0.00%');
  });

  it('returns value with sign prefix', () => {
    const pos = formatChange(105, 100);
    expect(pos.value.startsWith('+')).toBe(true);

    const neg = formatChange(95, 100);
    expect(neg.value.startsWith('-')).toBe(true);
  });
});
