/**
 * Tests for ErrorBoundary Component
 *
 * Tests React error boundary functionality:
 * - Error catching and fallback UI
 * - Error logging and display
 * - Recovery mechanisms (reset and reload)
 * - Children rendering when no errors
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error for testing
const ThrowError: React.FC<{ shouldThrow?: boolean; error?: Error }> = ({
  shouldThrow = false,
  error = new Error('Test error'),
}) => {
  if (shouldThrow) {
    throw error;
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress error logging during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('normal rendering', () => {
    test('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    test('should render multiple children', () => {
      render(
        <ErrorBoundary>
          <div>First Child</div>
          <div>Second Child</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('First Child')).toBeInTheDocument();
      expect(screen.getByText('Second Child')).toBeInTheDocument();
    });

    test('should render nested components', () => {
      const NestedComponent = () => <div>Nested Content</div>;

      render(
        <ErrorBoundary>
          <div>
            Parent
            <NestedComponent />
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });
  });

  describe('error catching', () => {
    test('should catch errors from children', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should show error UI instead of children
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
      expect(screen.queryByText('No error')).not.toBeInTheDocument();
    });

    test('should display error message', () => {
      const errorMessage = 'Custom error message';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={new Error(errorMessage)} />
        </ErrorBoundary>
      );

      // Open details to see error message
      const details = screen.getByText('Error Details');
      fireEvent.click(details);

      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });

    test('should log error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      // Logger adds timestamp prefix, so check that the error message is included in the call
      const errorCalls = consoleErrorSpy.mock.calls;
      const hasErrorMessage = errorCalls.some((call: any[]) =>
        call.some(
          (arg: any) => typeof arg === 'string' && arg.includes('ErrorBoundary caught an error:')
        )
      );
      expect(hasErrorMessage).toBe(true);
    });

    test('should catch errors from nested components', () => {
      const NestedThrow = () => <ThrowError shouldThrow={true} />;

      render(
        <ErrorBoundary>
          <div>
            <div>
              <NestedThrow />
            </div>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    test('should handle errors with stack traces', () => {
      const error = new Error('Error with stack');
      error.stack = 'Error: Error with stack\n  at Component\n  at ErrorBoundary';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={error} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Error Details');
      fireEvent.click(details);

      expect(screen.getByText(/Error with stack/)).toBeInTheDocument();
    });
  });

  describe('fallback UI', () => {
    test('should display error title', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    test('should display user-friendly message', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText(/The application encountered an unexpected error/i)
      ).toBeInTheDocument();
    });

    test('should show "Try Again" button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });

    test('should show "Reload Application" button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /Reload Application/i })).toBeInTheDocument();
    });

    test('should show troubleshooting tips', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Troubleshooting tips/i)).toBeInTheDocument();
    });

    test('never suggests Reload Dictionary: the fallback has replaced every key handler', () => {
      // Why: see the comment above the troubleshooting list in ErrorBoundary.tsx.
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText(/Reload Dictionary/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cmd\/Ctrl\+R/i)).not.toBeInTheDocument();
    });

    test('a description replaces the generic one, for a boundary that knows its failure', () => {
      render(
        <ErrorBoundary description="Every tab is down until the application reloads.">
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText('Every tab is down until the application reloads.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/likely a bug/i)).not.toBeInTheDocument();
    });

    test('should show error details in collapsed state by default', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={new Error('Hidden error')} />
        </ErrorBoundary>
      );

      // Error details should be in DOM but not visible (collapsed)
      const details = screen.getByText('Error Details');
      expect(details).toBeInTheDocument();
    });
  });

  describe('recovery mechanisms', () => {
    test('should reset error state when "Try Again" is clicked', () => {
      // Use a wrapper component with state to properly test reset
      const TestWrapper = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);

        return (
          <div>
            <button onClick={() => setShouldThrow(false)}>Fix Error</button>
            <ErrorBoundary>
              <ThrowError shouldThrow={shouldThrow} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestWrapper />);

      // Error state
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

      // Fix the error condition
      const fixButton = screen.getByRole('button', { name: /Fix Error/i });
      fireEvent.click(fixButton);

      // Click Try Again to reset error boundary
      const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
      fireEvent.click(tryAgainButton);

      // Should show children again
      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    test('should reload window when "Reload Application" is clicked', () => {
      // Mock window.location.reload
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadSpy },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByRole('button', { name: /Reload Application/i });
      fireEvent.click(reloadButton);

      expect(reloadSpy).toHaveBeenCalled();
    });

    test('should handle multiple reset attempts', () => {
      // Use a wrapper with state to test multiple error/reset cycles
      const TestWrapper = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);

        return (
          <div>
            <button onClick={() => setShouldThrow(!shouldThrow)}>Toggle Error</button>
            <ErrorBoundary>
              <ThrowError shouldThrow={shouldThrow} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestWrapper />);

      // Initial error state
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

      // First reset - fix error and click Try Again
      const toggleButton = screen.getByRole('button', { name: /Toggle Error/i });
      fireEvent.click(toggleButton); // Sets shouldThrow to false

      const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
      fireEvent.click(tryAgainButton);

      // Should show children
      expect(screen.getByText('No error')).toBeInTheDocument();

      // Cause error again
      fireEvent.click(toggleButton); // Sets shouldThrow back to true

      // Should show error UI again
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

      // Second reset - fix error and click Try Again
      fireEvent.click(screen.getByRole('button', { name: /Toggle Error/i }));
      fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

      // Should show children again
      expect(screen.getByText('No error')).toBeInTheDocument();
    });
  });

  describe('error information display', () => {
    test('should display error message in details', () => {
      const errorMessage = 'Database connection failed';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={new Error(errorMessage)} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Error Details');
      fireEvent.click(details);

      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });

    test('should display stack trace in details', () => {
      const error = new Error('Stack trace test');
      error.stack = 'Error: Stack trace test\n  at TestComponent\n  at ErrorBoundary';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={error} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Error Details');
      fireEvent.click(details);

      expect(screen.getByText(/TestComponent/)).toBeInTheDocument();
    });

    test('should show component stack in development mode', () => {
      // Set development mode
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Component stack is shown via componentDidCatch
      // Logger adds timestamp prefix, so check that the component stack message is included
      const errorCalls = consoleErrorSpy.mock.calls;
      const hasComponentStack = errorCalls.some((call: any[]) =>
        call.some((arg: any) => typeof arg === 'string' && arg.includes('Component stack:'))
      );
      expect(hasComponentStack).toBe(true);

      // Restore
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('edge cases', () => {
    test('should handle errors without messages', () => {
      const error = new Error();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} error={error} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    test('should handle non-Error objects thrown', () => {
      const StringThrow = () => {
        throw 'String error';
      };

      render(
        <ErrorBoundary>
          <StringThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    test('should not catch errors from event handlers (documented limitation)', () => {
      // Note: Error boundaries don't catch errors in event handlers
      // This test documents this React limitation
      // See: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary

      const ButtonWithError = () => {
        const handleClick = () => {
          throw new Error('Event handler error');
        };

        return <button onClick={handleClick}>Click me</button>;
      };

      // Suppress console errors for this test
      const originalError = console.error;
      console.error = vi.fn();

      render(
        <ErrorBoundary>
          <ButtonWithError />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /Click me/i });

      // Event handler errors are NOT caught by error boundaries
      // The button should render normally (not error fallback UI)
      expect(button).toBeInTheDocument();
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();

      // Restore console.error
      console.error = originalError;
    });

    test('should handle empty children', () => {
      render(<ErrorBoundary>{null}</ErrorBoundary>);

      // Should render nothing without errors
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });

    test('should handle React fragments as children', () => {
      render(
        <ErrorBoundary>
          <>
            <div>Fragment Child 1</div>
            <div>Fragment Child 2</div>
          </>
        </ErrorBoundary>
      );

      expect(screen.getByText('Fragment Child 1')).toBeInTheDocument();
      expect(screen.getByText('Fragment Child 2')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    test('should have accessible buttons', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const tryAgainButton = screen.getByRole('button', { name: /Try Again/i });
      const reloadButton = screen.getByRole('button', { name: /Reload Application/i });

      expect(tryAgainButton).toBeInTheDocument();
      expect(reloadButton).toBeInTheDocument();
    });

    test('should have expandable error details', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Error Details').closest('details');
      expect(details).toBeInTheDocument();
    });
  });
});
