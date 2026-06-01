import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../../i18n/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 24,
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 16, opacity: 0.5 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}>{i18n.t('errorBoundary.title')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || i18n.t('errorBoundary.hint')}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {i18n.t('errorBoundary.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
