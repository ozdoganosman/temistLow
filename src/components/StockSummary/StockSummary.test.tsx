import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '../../i18n/i18n';
import StockSummary from './StockSummary';
import type { OHLCVData } from '../../api/borsaApi';

function makeData(n: number): OHLCVData[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 102 + i,
    volume: 1000000 + i * 10000,
  }));
}

describe('StockSummary', () => {
  it('returns null for empty data', () => {
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test Corp" data={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders symbol and display name', () => {
    const data = makeData(10);
    const { container } = render(
      <StockSummary symbol="THYAO" displayName="Türk Hava Yolları" data={data} />
    );
    expect(container.textContent).toContain('THYAO');
    expect(container.textContent).toContain('Türk Hava Yolları');
  });

  it('shows positive change for rising prices', () => {
    const data = makeData(10); // prices increase each day
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test" data={data} />
    );
    // last.close (111) > prev.close (110) -> positive
    expect(container.querySelector('.positive')).toBeTruthy();
  });

  it('shows negative change for falling prices', () => {
    // Create data where last close < previous close
    const data: OHLCVData[] = [
      { date: '2024-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000000 },
      { date: '2024-01-02', open: 102, high: 103, low: 96, close: 98, volume: 1100000 },
    ];
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test" data={data} />
    );
    // last.close (98) < prev.close (102) -> negative
    expect(container.querySelector('.negative')).toBeTruthy();
  });

  it('renders with single data point', () => {
    const data = makeData(1);
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test" data={data} />
    );
    expect(container.textContent).toContain('TEST');
  });

  it('renders 52-week high/low and average volume', () => {
    const data = makeData(30);
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test" data={data} />
    );
    const text = container.textContent || '';
    // Should have the formatted high52w: max high = 105 + 29 = 134 -> "134.00"
    expect(text).toContain('134.00');
    // Should have the formatted low52w: min low = 95 + 0 = 95 -> "95.00"
    expect(text).toContain('95.00');
  });

  it('displays formatted volume', () => {
    const data = makeData(5);
    const { container } = render(
      <StockSummary symbol="TEST" displayName="Test" data={data} />
    );
    const text = container.textContent || '';
    // last volume = 1000000 + 4*10000 = 1040000 -> "1.04M"
    expect(text).toContain('1.04M');
  });
});
