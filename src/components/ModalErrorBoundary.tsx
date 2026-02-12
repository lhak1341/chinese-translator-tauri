import React from 'react';
import { logger } from '../utils/logger';
import styles from '../styles/ModalErrorBoundary.module.css';

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
 *
 * <ModalErrorBoundary onClose={closeModal} title="Failed to load Settings">
 *   <SettingsModal />
 * </ModalErrorBoundary>
 * ```
 */

interface ModalErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
  /** Title shown in the error card. Defaults to a generic message. */
  title?: string;
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
      const title = this.props.title ?? '❌ Failed to load dialog';
      return (
        <div className={styles.overlay} onClick={this.handleClose}>
          <div className={styles.errorCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.description}>
              An error occurred while loading this dialog.
              {this.state.error && (
                <>
                  <br />
                  <br />
                  <strong>Error:</strong> {this.state.error.message}
                </>
              )}
            </p>
            <div className={styles.actions}>
              <button onClick={this.handleRetry} className={styles.tryAgainButton}>
                Try Again
              </button>
              <button onClick={this.handleClose} className={styles.closeButton}>
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
