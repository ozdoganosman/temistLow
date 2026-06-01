import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '../../i18n/i18n';
import Legend from './Legend';

describe('Legend', () => {
  it('renders symbol name', () => {
    const { container } = render(
      <Legend data={null} symbol="THYAO" lastClose={100} prevClose={95} />
    );
    expect(container.textContent).toContain('THYAO');
  });

  it('shows positive styling when close > prevClose', () => {
    const { container } = render(
      <Legend data={null} symbol="TEST" lastClose={110} prevClose={100} />
    );
    expect(container.querySelector('.positive')).toBeTruthy();
  });

  it('shows negative styling when close < prevClose', () => {
    const { container } = render(
      <Legend data={null} symbol="TEST" lastClose={90} prevClose={100} />
    );
    expect(container.querySelector('.negative')).toBeTruthy();
  });

  it('displays OHLCV labels (Turkish default)', () => {
    const { container } = render(
      <Legend data={null} symbol="TEST" lastClose={100} prevClose={100} />
    );
    const text = container.textContent || '';
    // Default i18n language is Turkish: A (Açılış), Y (Yüksek), D (Düşük), K (Kapanış), Hac (Hacim)
    expect(text).toContain('A');
    expect(text).toContain('Y');
    expect(text).toContain('D');
    expect(text).toContain('K');
    expect(text).toContain('Hac');
  });

  it('uses provided data when available', () => {
    const data = {
      symbol: 'GARAN',
      open: 50,
      high: 55,
      low: 48,
      close: 52,
      volume: 1500000,
      time: '2024-01-15',
      prevClose: 50,
    };
    const { container } = render(
      <Legend data={data} symbol="THYAO" lastClose={100} prevClose={95} />
    );
    // Should show data's symbol, not the prop symbol
    expect(container.textContent).toContain('GARAN');
  });

  it('shows formatted volume when data is provided', () => {
    const data = {
      symbol: 'TEST',
      open: 50,
      high: 55,
      low: 48,
      close: 52,
      volume: 1500000,
      time: '2024-01-15',
      prevClose: 50,
    };
    const { container } = render(
      <Legend data={data} symbol="TEST" lastClose={100} prevClose={95} />
    );
    // 1500000 should be formatted as 1.50M
    expect(container.textContent).toContain('1.50M');
  });

  it('renders positive on close value when close >= open', () => {
    const data = {
      symbol: 'TEST',
      open: 48,
      high: 55,
      low: 46,
      close: 52,
      volume: 1000000,
      time: '2024-01-15',
      prevClose: 48,
    };
    const { container } = render(
      <Legend data={data} symbol="TEST" lastClose={52} prevClose={48} />
    );
    // close (52) >= open (48), so the close legend-value should have .positive
    const positiveValues = container.querySelectorAll('.legend-value.positive');
    expect(positiveValues.length).toBeGreaterThan(0);
  });
});
