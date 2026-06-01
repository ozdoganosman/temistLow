import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Disclaimer.css';

export default function Disclaimer() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('disclaimer_seen') === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('disclaimer_seen', '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="disclaimer-bar">
      <span className="disclaimer-text">
        {t('disclaimer.text')}
      </span>
      <button className="disclaimer-close" onClick={handleDismiss} title="Kapat">
        &times;
      </button>
    </div>
  );
}
