import React from 'react';
import styles from '../styles/ErrorBoundary.module.css';
import { logger } from '../utils/logger';

/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree, logs those errors,
 * and displays a fallback UI instead of the component tree that crashed.
 *
 * Benefits:
 * - Prevents white screen of death from unhandled errors
 * - Provides user-friendly error UI with recovery options
 * - Logs errors for debugging in development
 * - Graceful degradation in production
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 *
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * Update state so the next render will show the fallback UI
   * @param error - The error that was thrown
   * @returns New state
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error: error,
    };
  }

  /**
   * Log error details for debugging
   * @param error - The error that was thrown
   * @param errorInfo - Additional error information
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console in development
    logger.error('ErrorBoundary caught an error:', error);
    logger.error('Component stack:', errorInfo.componentStack);

    // Store error info in state for display
    this.setState({
      errorInfo: errorInfo,
    });

    // In production, you might want to log to an error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  /**
   * Reset error state to retry rendering
   */
  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * Reload the entire application
   */
  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Fallback UI when error occurs
      return (
        <div className={styles.container}>
          <div className={styles.errorCard}>
            <h1 className={styles.title}>⚠️ Something went wrong</h1>

            <p className={styles.description}>
              The application encountered an unexpected error. This is likely a bug that needs to be
              fixed.
            </p>

            {/* Error details */}
            {this.state.error && (
              <details className={styles.errorDetails}>
                <summary className={styles.errorSummary}>Error Details</summary>
                <div className={styles.errorContent}>
                  <strong>Message:</strong>{' '}
                  {this.state.error.message || this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      <br />
                      <br />
                      <strong>Stack:</strong>
                      <br />
                      {this.state.error.stack}
                    </>
                  )}
                  {this.state.errorInfo?.componentStack &&
                    process.env.NODE_ENV === 'development' && (
                      <>
                        <br />
                        <br />
                        <strong>Component Stack:</strong>
                        <br />
                        {this.state.errorInfo.componentStack}
                      </>
                    )}
                </div>
              </details>
            )}

            {/* Recovery options */}
            <div className={styles.actions}>
              <button onClick={this.handleReset} className={styles.tryAgainButton}>
                Try Again
              </button>

              <button onClick={this.handleReload} className={styles.reloadButton}>
                Reload Application
              </button>
            </div>

            {/* Additional help */}
            <div className={styles.troubleshooting}>
              <strong>💡 Troubleshooting tips:</strong>
              <ul className={styles.troubleshootingList}>
                <li>Try clicking "Reload Dictionary" button (Cmd/Ctrl+R) to clear caches</li>
                <li>Check the developer console (View → Developer Tools) for more detail</li>
                <li>If the error persists, try restarting the application</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;
