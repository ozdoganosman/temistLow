import { useTranslation } from 'react-i18next';
import type { OHLCVData } from '../../api/borsaApi';
import { formatPrice, formatVolume, formatChange } from '../../utils/formatters';
import './StockSummary.css';

interface StockSummaryProps {
  symbol: string;
  displayName: string;
  data: OHLCVData[];
}

export default function StockSummary({ symbol, displayName, data }: StockSummaryProps) {
  const { t } = useTranslation();
  if (data.length === 0) return null;

  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : last;
  const change = formatChange(last.close, prev.close);

  // 52-week high/low (last 252 trading days)
  const yearData = data.slice(-252);
  const high52w = Math.max(...yearData.map((d) => d.high));
  const low52w = Math.min(...yearData.map((d) => d.low));

  // Average volume (20-day)
  const vol20 = data.slice(-20);
  const avgVol20 = vol20.reduce((s, d) => s + d.volume, 0) / vol20.length;

  return (
    <div className="stock-summary">
      <div className="ss-header">
        <span className="ss-symbol">{symbol}</span>
        <span className="ss-name">{displayName}</span>
      </div>
      <div className="ss-grid">
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.lastPrice')}</span>
          <span className={`ss-value ${change.positive ? 'positive' : 'negative'}`}>{formatPrice(last.close)}</span>
        </div>
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.change')}</span>
          <span className={`ss-value ${change.positive ? 'positive' : 'negative'}`}>
            {change.value} ({change.percent})
          </span>
        </div>
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.volume')}</span>
          <span className="ss-value">{formatVolume(last.volume)}</span>
        </div>
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.avgVolume20')}</span>
          <span className="ss-value">{formatVolume(avgVol20)}</span>
        </div>
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.high52w')}</span>
          <span className="ss-value">{formatPrice(high52w)}</span>
        </div>
        <div className="ss-item">
          <span className="ss-label">{t('stockSummary.low52w')}</span>
          <span className="ss-value">{formatPrice(low52w)}</span>
        </div>
      </div>
    </div>
  );
}
