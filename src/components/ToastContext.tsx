import React, { createContext, useContext, useMemo } from 'react';
import {
  createToastManager,
  ToastProvider as KitToastProvider,
  type ToastStatus,
} from '@lhak/style/react';

/**
 * Toast notification type
 */
type ToastType = 'default' | 'success' | 'error' | 'warning';

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

/** The kit status each app toast type shows as; `default` shows no status icon. */
const KIT_STATUS: Record<ToastType, ToastStatus | undefined> = {
  default: undefined,
  success: 'success',
  error: 'error',
  warning: 'warning',
};

/**
 * Toast provider: the kit's stack (@lhak/style, kit issue 13): at most 3 at once, hover
 * expands, swipe right or down dismisses. A toast lasts the kit's 4 s unless the caller
 * passes a duration (0 keeps it); a custom ID replaces the toast it names.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useMemo(() => createToastManager(), []);

  const contextValue = useMemo<ToastContextType>(() => {
    const showToast = (
      message: string,
      type: ToastType = 'default',
      duration?: number,
      customId?: string
    ) => {
      manager.add({ id: customId, title: message, type: KIT_STATUS[type], timeout: duration });
    };
    return {
      showToast,
      success: (message, duration, customId) => showToast(message, 'success', duration, customId),
      error: (message, duration, customId) => showToast(message, 'error', duration, customId),
      warning: (message, duration, customId) => showToast(message, 'warning', duration, customId),
      removeToast: (id) => manager.close(id),
    };
  }, [manager]);

  return (
    <ToastContext.Provider value={contextValue}>
      <KitToastProvider toastManager={manager}>{children}</KitToastProvider>
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
