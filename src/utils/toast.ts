/**
 * Toast notification utility
 * CSP-compliant replacement for react-hot-toast
 *
 * This module provides a singleton toast API that can be imported
 * anywhere in the application, matching the react-hot-toast API.
 */

import { toast as toastInstance } from '../components/ToastContext';

/**
 * Toast API object matching react-hot-toast structure
 * Usage: import toast from './toast'; toast.success('message');
 */
const toast = {
  /**
   * Display a success toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration in ms)
   */
  success: (message: string, options?: { duration?: number }): void => {
    toastInstance.success(message, options?.duration);
  },

  /**
   * Display an error toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration in ms)
   */
  error: (message: string, options?: { duration?: number }): void => {
    toastInstance.error(message, options?.duration);
  },

  /**
   * Display a warning toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration in ms)
   */
  warning: (message: string, options?: { duration?: number }): void => {
    toastInstance.warning(message, options?.duration);
  },

  /**
   * Display a default toast notification
   * @param message - Message to display
   * @param options - Optional configuration (duration in ms)
   */
  default: (message: string, options?: { duration?: number }): void => {
    toastInstance.show(message, 'default', options?.duration);
  },
};

export default toast;
