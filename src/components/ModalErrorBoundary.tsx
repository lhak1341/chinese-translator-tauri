import React from 'react';
import { logger } from '../utils/logger';

/**
 * ModalErrorBoundary Component
 *
 * Lightweight error boundary specifically for modal dialogs.
 * Shows a simple error message inline instead of a full-page error screen.
 *
 * Usage:
 * ```tsx
 * <ModalErrorBoundary onClose={closeModal}>
 *   <MyModal />
 * </ModalErrorBoundary>
 * ```
 */

interface ModalErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface ModalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ModalErrorBoundary extends React.Component<ModalErrorBoundaryProps, ModalErrorBoundaryState> {
  constructor(props: ModalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ModalErrorBoundaryState> {
    return {
      hasError: true,
      error: error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('ModalErrorBoundary caught an error:', error);
    logger.error('Component stack:', errorInfo.componentStack);
  }

  handleClose = (): void => {
    this.props.onClose();
    // Reset error state when closing
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Inline error UI for modals
      return (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={this.handleClose}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '2rem',
              maxWidth: '500px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#dc2626', marginTop: 0 }}>❌ Failed to load Quick Add</h2>
            <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>
              An error occurred while opening the Quick Add dialog.
              {this.state.error && (
                <>
                  <br />
                  <br />
                  <strong>Error:</strong> {this.state.error.message}
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleClose}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ModalErrorBoundary;
