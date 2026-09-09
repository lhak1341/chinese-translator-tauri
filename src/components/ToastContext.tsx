import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import styles from '../styles/Toast.module.css';
import { TOAST_DURATIONS } from '../constants/toastConfig';

/**
 * Toast notification type
 */
type ToastType = 'default' | 'success' | 'error' | 'warning';

/**
 * Individual toast configuration
 */
interface Toast {
  id: string;
  customId?: string; // Optional custom ID for deduplication
  message: string;
  type: ToastType;
  duration: number;
  visible: boolean;
  exiting: boolean;
}

/**
 * Toast context type
 */
interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number, customId?: string) => void;
  success: (message: string, duration?: number, customId?: string) => void;
  error: (message: string, duration?: number, customId?: string) => void;
  warning: (message: string, duration?: number, customId?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Hook to access toast functions
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

/**
 * Toast icons using simple SVG - matching react-hot-toast style
 */
const ToastIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  const iconClass = `${styles.toastIcon} ${
    {
      success: styles.iconSuccess,
      error: styles.iconError,
      warning: styles.iconWarning,
      default: styles.iconDefault,
    }[type]
  }`;

  if (type === 'success') {
    return (
      <div className={iconClass}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M10 3L4.5 8.5L2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className={iconClass}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M9 3L3 9M3 3L9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (type === 'warning') {
    return (
      <div className={iconClass}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 4V6.5M6 8.5H6.005M11 6C11 8.76142 8.76142 11 6 11C3.23858 11 1 8.76142 1 6C1 3.23858 3.23858 1 6 1C8.76142 1 11 3.23858 11 6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={iconClass}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M6 4V6.5M6 8.5H6.005M11 6C11 8.76142 8.76142 11 6 11C3.23858 11 1 8.76142 1 6C1 3.23858 3.23858 1 6 1C8.76142 1 11 3.23858 11 6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

/**
 * Individual toast component
 */
const ToastItem: React.FC<{
  toast: Toast;
  onRemove: (id: string) => void;
}> = ({ toast, onRemove }) => {
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef(Date.now());

  React.useEffect(() => {
    // Return empty cleanup function for infinite duration toasts
    if (toast.duration === 0) return () => {};

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);
      // Don't self-clear interval - let cleanup function handle it
    }, 50);

    const timeout = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [toast.id, toast.duration, onRemove]);

  const toastClass = [
    styles.toast,
    toast.visible ? styles.toastVisible : '',
    toast.exiting ? styles.toastExiting : '',
    {
      success: styles.toastSuccess,
      error: styles.toastError,
      warning: styles.toastWarning,
      default: styles.toastDefault,
    }[toast.type],
  ]
    .filter(Boolean)
    .join(' ');

  const progressClass = {
    success: styles.progressSuccess,
    error: styles.progressError,
    warning: styles.progressWarning,
    default: '',
  }[toast.type];

  return (
    <div className={toastClass}>
      <ToastIcon type={toast.type} />
      <div className={styles.toastMessage}>{toast.message}</div>
      <button
        className={styles.toastClose}
        onClick={() => onRemove(toast.id)}
        aria-label="Close notification"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>
      {toast.duration > 0 && (
        <div
          className={`${styles.toastProgress} ${progressClass}`}
          style={{ width: `${progress}%` }}
        />
      )}
    </div>
  );
};

/**
 * Toast container component
 */
const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastInternal();

  return (
    <div
      className={styles.toastContainer}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

/**
 * Internal hook for managing toast state
 */
const useToastInternal = () => {
  const context = useContext(ToastInternalContext);
  if (!context) {
    throw new Error('useToastInternal must be used within ToastProvider');
  }
  return context;
};

const ToastInternalContext = createContext<
  | {
      toasts: Toast[];
      removeToast: (id: string) => void;
    }
  | undefined
>(undefined);

/**
 * Toast provider component
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounterRef = useRef(0);

  const showToast = useCallback(
    (message: string, type: ToastType = 'default', duration: number = 3000, customId?: string) => {
      // If customId provided, check if toast with same customId already exists
      if (customId) {
        setToasts((prev) => {
          const existing = prev.find((t) => t.customId === customId);
          if (existing) {
            // Remove existing toast with same customId (deduplicate)
            return prev.filter((t) => t.customId !== customId);
          }
          return prev;
        });
      }

      const id = `toast-${++idCounterRef.current}`;
      const newToast: Toast = {
        id,
        customId,
        message,
        type,
        duration,
        visible: false,
        exiting: false,
      };

      setToasts((prev) => [...prev, newToast]);

      // Trigger animation after DOM update
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
      }, 10);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));

    // Remove after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const success = useCallback(
    (message: string, duration: number = TOAST_DURATIONS.SUCCESS, customId?: string) => {
      showToast(message, 'success', duration, customId);
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, duration: number = TOAST_DURATIONS.ERROR, customId?: string) => {
      showToast(message, 'error', duration, customId);
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, duration: number = TOAST_DURATIONS.WARNING, customId?: string) => {
      showToast(message, 'warning', duration, customId);
    },
    [showToast]
  );

  const contextValue: ToastContextType = {
    showToast,
    success,
    error,
    warning,
    removeToast,
  };

  const internalValue = {
    toasts,
    removeToast,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastInternalContext.Provider value={internalValue}>
        {children}
        <ToastContainer />
      </ToastInternalContext.Provider>
    </ToastContext.Provider>
  );
};

/**
 * Export a singleton toast API for use outside React components
 */
let globalToastFn: ToastContextType | null = null;

// Calls made before setGlobalToast wires the real implementation are queued here
// instead of silently no-op'ing, and replayed in order once wiring happens.
let pendingToastCalls: Array<() => void> = [];

export const setGlobalToast = (toastFn: ToastContextType) => {
  globalToastFn = toastFn;
  if (pendingToastCalls.length > 0) {
    const queued = pendingToastCalls;
    pendingToastCalls = [];
    queued.forEach((call) => call());
  }
};

// Calls `invoke` against the wired implementation, or queues it for replay once
// setGlobalToast wires one — the one queue-or-call branch every toast.* method needs.
function queueOrCall(invoke: (fn: ToastContextType) => void) {
  if (globalToastFn) {
    invoke(globalToastFn);
  } else {
    pendingToastCalls.push(() => invoke(globalToastFn!));
  }
}

export const toast = {
  success: (message: string, duration?: number, customId?: string) =>
    queueOrCall((fn) => fn.success(message, duration, customId)),
  error: (message: string, duration?: number, customId?: string) =>
    queueOrCall((fn) => fn.error(message, duration, customId)),
  warning: (message: string, duration?: number, customId?: string) =>
    queueOrCall((fn) => fn.warning(message, duration, customId)),
  show: (message: string, type?: ToastType, duration?: number, customId?: string) =>
    queueOrCall((fn) => fn.showToast(message, type, duration, customId)),
};
