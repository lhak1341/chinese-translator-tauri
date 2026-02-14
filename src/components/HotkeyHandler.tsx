import { useHotkeyHandler, type HotkeyHandlerOptions } from '../hooks/useHotkeyHandler';

/**
 * HotkeyHandler Component
 *
 * Thin wrapper around useHotkeyHandler hook for JSX call sites.
 * Prefer importing useHotkeyHandler directly in new TypeScript components.
 */
const HotkeyHandler: React.FC<HotkeyHandlerOptions> = (props) => {
  useHotkeyHandler(props);
  return null;
};

export default HotkeyHandler;
