/**
 * Toast notification utility
 * CSP-compliant replacement for react-hot-toast
 *
 * This module provides a singleton toast API that can be imported
 * anywhere in the application, matching the react-hot-toast API.
 */

import { toast as toastInstance } from '../components/ToastContext';

/**
 * Toast options configuration
 */
export interface ToastOptions {
  /** Duration in milliseconds before auto-dismiss */
  duration?: number;
  /** Unique ID for deduplication - toasts with same ID replace each other */
  id?: string;
}

/**
 * Toast API object matching react-hot-toast structure
 * Usage: import toast from './toast'; toast.success('message');
 */
const toast = {
  /**
   * Display a success toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration, id)
   */
  success: (message: string, options?: ToastOptions): void => {
    toastInstance.success(message, options?.duration, options?.id);
  },

  /**
   * Display an error toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration, id)
   */
  error: (message: string, options?: ToastOptions): void => {
    toastInstance.error(message, options?.duration, options?.id);
  },

  /**
   * Display a warning toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration, id)
   */
  warning: (message: string, options?: ToastOptions): void => {
    toastInstance.warning(message, options?.duration, options?.id);
  },

  /**
   * Display a default toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration, id)
   */
  default: (message: string, options?: ToastOptions): void => {
    toastInstance.show(message, 'default', options?.duration, options?.id);
  },
};

export default toast;
