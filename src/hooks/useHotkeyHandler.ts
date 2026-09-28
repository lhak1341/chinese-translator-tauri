import { useEffect, useRef } from 'react';
import { useVisibleTab } from '../components/VisibleTabContext';
import { isEditableTarget } from '../utils/ui/EditableFocus';
import {
  matchHotkey,
  takesSource,
  SOURCE_ACTION_LABELS,
  type HotkeyHandlers,
} from '../utils/ui/HotkeyDispatchTable';
import { resolveQuickAddSource } from '../utils/highlighting/SelectionMapping';
import type { HotkeyAction, HotkeyOwner } from '../utils/ui/HotkeyDispatchTable';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import toast from '../utils/toast';

export interface HotkeyHandlerOptions {
  /** One handler per action this registration answers, keyed by the dispatch table's action
   * type. Source actions (`SOURCE_ACTION_LABELS`) receive the selection as `text` — for a
   * selection in a translation panel, the Chinese it maps to
   * (`utils/highlighting/SelectionMapping.ts`). */
  handlers: HotkeyHandlers;
  canUndo?: boolean;
  canRedo?: boolean;
  /**
   * The tab this registration belongs to, or `'app'` for the tab container's. Not whether
   * it is showing: that comes from `VisibleTabProvider`, so no caller can get it wrong.
   */
  ownTab: HotkeyOwner;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Keyboard Shortcuts:
 * - Option/Alt+1-6: Switch tabs, in `TAB_ORDER` (Reader/Translator/Dictionary/Rules/Configuration/Appearance)
 * - Cmd/Ctrl+1-6: Quick add to different dictionaries (Translator and Reader tabs) / Switch dictionary (Dictionary tab)
 * - Cmd/Ctrl+7: Switch to Rules tab and open the new-rule form, prefilled with the
 *   clipboard/selection text as the Key (Translator and Reader tabs, like the quick-add keys)
 * - Cmd/Ctrl+R: Reload dictionary (Translator and Reader tabs — one shared action)
 * - Cmd/Ctrl+B: Bind dictionaries for the open book (Reader tab only)
 * - Cmd/Ctrl+K: Open the command palette (Reader tab only)
 * - Cmd/Ctrl+G: Open the chapter outline with its search focused (Reader tab only)
 * - `[` / `]`: Previous / next chapter (Reader tab only, no modifier)
 * - Space / Shift+Space: Page the reading panel down / up (Reader tab only, no modifier)
 * - Cmd/Ctrl+L: Focus search (Dictionary tab only)
 * - Cmd/Ctrl+Z: Undo (Dictionary tab only)
 * - Cmd/Ctrl+Shift+Z: Redo (Dictionary tab only)
 * - Cmd/Ctrl+Shift+V: Translate from clipboard (Translator tab only)
 * - Cmd/Ctrl+Shift+N: Quick add a proper noun, like Cmd-3 (Translator and Reader tabs)
 *
 * Every tab rule, and which registration answers a key, lives in
 * HotkeyDispatchTable.matchHotkey — testable as a pure function. This hook only listens,
 * asks `resolveQuickAddSource` what a source action (`SOURCE_ACTION_LABELS`) starts from,
 * and calls the handler keyed by the action's type. Handlers keyed by type are not the
 * registry ADR-012 rejected: no caller states when its keys fire.
 */
export function useHotkeyHandler(options: HotkeyHandlerOptions): void {
  // Mirror the whole options object into a ref so frequently-updating props don't force
  // the keydown listener to be torn down and re-registered on every change (stale-dep
  // anti-pattern). Read at key-press time, so capturing via ref at render time suffices.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { visibleTab } = useVisibleTab();
  const visibleTabRef = useRef(visibleTab);
  visibleTabRef.current = visibleTab;

  useEffect(() => {
    const handleQuickAdd = async (
      event: KeyboardEvent,
      callback: ((text?: string) => void | Promise<void>) | undefined,
      label: string
    ): Promise<void> => {
      // Several handlers are registered at once (the tab container, the Translator, the
      // Reader) and only one of them wires any given action. Without this, the others
      // would still read the selection and clipboard to feed a callback that isn't there.
      if (!callback) return;
      event.preventDefault();
      try {
        // The mapped Chinese of a translation-panel selection, else the selected text, else
        // the clipboard — see `resolveQuickAddSource`.
        const source = await resolveQuickAddSource();
        if (source.kind === 'refused') {
          toast.error(source.reason);
          return;
        }
        await callback(source.text);
      } catch (error) {
        const errorMsg = extractErrorMessage(error);
        toast.error(`Failed to open ${label}: ${errorMsg}`);
        logger.error(`${label} error:`, error);
      }
    };

    const dispatch = async (action: HotkeyAction, event: KeyboardEvent): Promise<void> => {
      const { handlers } = optionsRef.current;
      if (takesSource(action.type)) {
        await handleQuickAdd(event, handlers[action.type], SOURCE_ACTION_LABELS[action.type]);
        return;
      }
      switch (action.type) {
        case 'tabSwitch':
          await handlers.tabSwitch?.(action.tab);
          return;
        case 'dictionaryTabHotkey':
          await handlers.dictionaryTabHotkey?.(action.key);
          return;
        default:
          // Every remaining action takes no argument (`HandlerArgs`).
          await (handlers[action.type] as (() => void | Promise<void>) | undefined)?.();
      }
    };

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // addEventListener ignores the returned Promise — wrap in try-catch so any
      // synchronous throw from optional-chained callbacks doesn't become an
      // unhandled rejection. handleQuickAdd catches its own async errors.
      try {
        const action = matchHotkey(event, {
          visibleTab: visibleTabRef.current,
          ownTab: optionsRef.current.ownTab,
          canUndo: optionsRef.current.canUndo,
          canRedo: optionsRef.current.canRedo,
          isInputFocused: isEditableTarget(event.target),
        });
        if (!action) return;
        event.preventDefault();
        await dispatch(action, event);
      } catch (error) {
        logger.error('Hotkey handler error:', error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // options read via optionsRef — no deps needed, listener is registered once
}
