import { useEffect, useRef } from 'react';
import type { TabId } from '../types/ComponentTypes';
import { matchHotkey } from '../utils/ui/HotkeyDispatchTable';
import type { HotkeyAction } from '../utils/ui/HotkeyDispatchTable';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import toast from '../utils/toast';

/**
 * Tabs on which the add-entry shortcut family means "add a dictionary entry".
 *
 * `matchHotkey` only knows that Cmd-1..6 mean something else on the Dictionary tab; this
 * is what keeps them from firing on Rules/Configuration/Appearance, where the modal would
 * open behind a `visibility: hidden` panel. The Reader is on the list because its
 * floating add-entry bar is the same family reused — see `AddEntryBar`.
 */
const QUICK_ADD_TABS: readonly TabId[] = ['translator', 'reader'];

/** Cmd-7 opens the Rules tab's new-rule form, which the Reader has no equivalent of. */
const NEW_RULE_TABS: readonly TabId[] = ['translator'];

/** A background tab passes no id at all, which is never allowed anywhere. */
function isAllowedTab(tab: TabId | undefined, allowed: readonly TabId[]): boolean {
  return tab !== undefined && allowed.includes(tab);
}

export interface HotkeyHandlerOptions {
  onTranslateFromClipboard?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onQuickAdd?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onTabSwitch?: (tab: TabId) => void;
  onQuickAddCharacter?: (text?: string) => void;
  onQuickAddPhrase?: (text?: string) => void;
  onQuickAddProperNoun?: (text?: string) => void;
  onQuickAddPattern?: (text?: string) => void;
  onQuickAddCustomProperNoun?: (text?: string) => Promise<void>;
  onQuickAddCustomStructuralPattern?: (text?: string) => Promise<void>;
  onReloadDictionary?: () => void;
  onBindDictionaries?: () => void;
  onFocusSearch?: () => void;
  onDictionaryTabHotkey?: (key: string) => Promise<void>;
  onOpenNewRule?: (text?: string) => void;
  activeTab?: TabId;
}

/**
 * Hook that registers global keyboard shortcuts for the application.
 *
 * Keyboard Shortcuts:
 * - Option/Alt+1-5: Switch tabs (Translator/Dictionary/Rules/Configuration/Appearance)
 * - Cmd/Ctrl+1-5: Quick add to different dictionaries (Translator and Reader tabs) / Switch dictionary (Dictionary tab)
 * - Cmd/Ctrl+7: Switch to Rules tab and open the new-rule form, prefilled with the
 *   clipboard/selection text as the Key (Translator tab only, like the quick-add keys)
 * - Cmd/Ctrl+R: Reload dictionary (Translator and Reader tabs — one shared action)
 * - Cmd/Ctrl+B: Bind dictionaries for the open book (Reader tab only)
 * - Cmd/Ctrl+L: Focus search (Dictionary tab only)
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+Shift+V: Translate from clipboard
 * - Cmd/Ctrl+Shift+N: Quick add entry
 *
 * Dispatch logic lives in HotkeyDispatchTable.matchHotkey — testable as a pure function.
 */
export function useHotkeyHandler(options: HotkeyHandlerOptions): void {
  // Mirror the whole options object into a ref so frequently-updating props don't force
  // the keydown listener to be torn down and re-registered on every change (stale-dep
  // anti-pattern). Read at key-press time, so capturing via ref at render time suffices.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const copySelectedText = async (): Promise<boolean> => {
      try {
        const selectedText = window.getSelection()?.toString();
        if (selectedText && selectedText.trim()) {
          await navigator.clipboard.writeText(selectedText);
          return true;
        }
      } catch (error) {
        logger.warn('Failed to copy selected text to clipboard:', error);
      }
      return false;
    };

    const handleQuickAdd = async (
      event: KeyboardEvent,
      callback: ((text?: string) => void | Promise<void>) | undefined,
      label: string,
      allowedTabs: readonly TabId[] = QUICK_ADD_TABS
    ): Promise<void> => {
      if (!isAllowedTab(optionsRef.current.activeTab, allowedTabs)) return;
      // Several handlers are registered at once (the tab container, the Translator, the
      // Reader) and only one of them wires any given action. Without this, the others
      // still run the clipboard round-trip below to feed a callback that isn't there.
      if (!callback) return;
      event.preventDefault();
      try {
        const copied = await copySelectedText();
        const text = copied ? await navigator.clipboard.readText() : '';
        await callback?.(text);
      } catch (error) {
        const errorMsg = extractErrorMessage(error);
        toast.error(`Failed to open ${label}: ${errorMsg}`);
        logger.error(`${label} error:`, error);
      }
    };

    const dispatch = async (action: HotkeyAction, event: KeyboardEvent): Promise<void> => {
      const opts = optionsRef.current;
      switch (action.type) {
        case 'tabSwitch':
          opts.onTabSwitch?.(action.tab);
          break;
        case 'quickAdd':
          // Gated like the rest of the family. `matchHotkey` returns this for every tab,
          // so without the check Cmd+Shift+N on Rules/Configuration opens the
          // Translator's modal behind a hidden panel — and, now that the Reader
          // registers the family too, would open both at once.
          if (isAllowedTab(opts.activeTab, QUICK_ADD_TABS)) opts.onQuickAdd?.();
          break;
        case 'translateFromClipboard':
          opts.onTranslateFromClipboard?.();
          break;
        case 'dictionaryTabHotkey':
          await opts.onDictionaryTabHotkey?.(action.key);
          break;
        case 'quickAddCharacter':
          await handleQuickAdd(event, opts.onQuickAddCharacter, 'Add Character');
          break;
        case 'quickAddPhrase':
          await handleQuickAdd(event, opts.onQuickAddPhrase, 'Add Phrase');
          break;
        case 'quickAddProperNoun':
          await handleQuickAdd(event, opts.onQuickAddProperNoun, 'Add Proper Noun');
          break;
        case 'quickAddPattern':
          await handleQuickAdd(event, opts.onQuickAddPattern, 'Add Pattern');
          break;
        case 'quickAddCustomProperNoun':
          await handleQuickAdd(event, opts.onQuickAddCustomProperNoun, 'Add Custom Proper Noun');
          break;
        case 'quickAddCustomStructuralPattern':
          await handleQuickAdd(
            event,
            opts.onQuickAddCustomStructuralPattern,
            'Add Structural Pattern'
          );
          break;
        case 'focusSearch':
          opts.onFocusSearch?.();
          break;
        case 'undo':
          opts.onUndo?.();
          break;
        case 'redo':
          opts.onRedo?.();
          break;
        case 'reloadDictionary':
          opts.onReloadDictionary?.();
          break;
        case 'bindDictionaries':
          opts.onBindDictionaries?.();
          break;
        case 'openNewRule':
          await handleQuickAdd(event, opts.onOpenNewRule, 'Add Rule', NEW_RULE_TABS);
          break;
      }
    };

    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      // addEventListener ignores the returned Promise — wrap in try-catch so any
      // synchronous throw from optional-chained callbacks doesn't become an
      // unhandled rejection. handleQuickAdd catches its own async errors.
      try {
        const target = event.target as HTMLElement;
        const isInputFocused =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable;

        const action = matchHotkey(event, {
          activeTab: optionsRef.current.activeTab,
          canUndo: optionsRef.current.canUndo,
          canRedo: optionsRef.current.canRedo,
          isInputFocused,
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
