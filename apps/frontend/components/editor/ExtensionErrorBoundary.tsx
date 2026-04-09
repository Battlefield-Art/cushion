import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  filePath: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ExtensionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ExtensionErrorBoundary] Extension crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm"
          style={{ color: 'var(--foreground)' }}
        >
          <div className="font-medium" style={{ color: 'var(--accent-red)' }}>
            Extension crashed
          </div>
          <div className="text-center max-w-md" style={{ color: 'var(--muted-foreground)' }}>
            {this.state.error.message}
          </div>
          <div className="text-xs truncate max-w-md" style={{ color: 'var(--muted-foreground)' }}>
            {this.props.filePath}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              backgroundColor: 'var(--muted)',
              color: 'var(--foreground)',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
