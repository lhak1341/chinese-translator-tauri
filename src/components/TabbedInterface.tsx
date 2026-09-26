import React, { useRef, useCallback } from 'react';
import { Languages, Book, Settings, Palette, Wand2, BookOpen, LucideIcon } from 'lucide-react';
import ReaderTab from './reader/ReaderTab';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import RulesManager from './rules/RulesManager';
import type { RulesManagerHandle } from './rules/RulesManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import { useHotkeyHandler } from '../hooks/useHotkeyHandler';
import { useBookBinding } from './BookBindingContext';
import { useVisibleTab } from './VisibleTabContext';
import { TAB_ORDER, tabShortcutDigit } from '../constants/tabs';
import type { TabId } from '../types/ComponentTypes';
import { useDictionary } from './dictionary/DictionaryContext';
import {
  quickAddTarget,
  quickAddMissMessage,
  loadQuickAddConfig,
} from '../utils/dictionary/QuickAddTarget';
import styles from '../styles/TabbedInterface.module.css';

/**
 * Per-tab presentation. Order and shortcut come from `TAB_ORDER`, which the hotkey
 * dispatch table reads too — so a reordering moves the nav bar and the shortcuts
 * together instead of requiring both to be edited.
 */
const TAB_PRESENTATION: Record<TabId, { label: string; icon: LucideIcon }> = {
  reader: { label: 'Reader', icon: BookOpen },
  translator: { label: 'Translator', icon: Languages },
  dictionary: { label: 'Dictionary', icon: Book },
  rules: { label: 'Rules', icon: Wand2 },
  configuration: { label: 'Configuration', icon: Settings },
  appearance: { label: 'Appearance', icon: Palette },
};

const TABS: { id: TabId; label: string; shortcut: string; icon: LucideIcon }[] = TAB_ORDER.map(
  (id) => ({
    id,
    label: TAB_PRESENTATION[id].label,
    icon: TAB_PRESENTATION[id].icon,
    shortcut: String(tabShortcutDigit(id)),
  })
);

/**
 * TabbedInterface Component
 *
 * Main application container with tab navigation.
 */
const DICTIONARY_HOTKEY_MAP: Record<string, string> = {
  '1': 'characters',
  '2': 'phrases',
  '3': 'properNouns',
  '4': 'patterns',
};

const TabbedInterface: React.FC = () => {
  const { visibleTab: activeTab, setVisibleTab: setActiveTab } = useVisibleTab();
  // The dialog lives in the Reader but its shortcut is registered here, with every other
  // global one — the binding context is what lets the two be in different places.
  const { openDialog: openBindingDialog } = useBookBinding();
  const dictionarySearchRef = useRef<HTMLInputElement>(null);
  const rulesManagerRef = useRef<RulesManagerHandle>(null);
  const { setSelectedDictionary, dictionaries } = useDictionary();

  const handleTabChange = (tab: TabId): void => {
    setActiveTab(tab);
  };

  const handleFocusSearch = (): void => {
    if (dictionarySearchRef.current) {
      dictionarySearchRef.current.focus();
    }
  };

  // Deliberately does NOT switch to the Rules tab — same in-place-overlay UX as the
  // Cmd-1..6 quick-add modals, which open directly on top of Translator without
  // navigating away. RulesManager stays on its own always-mounted `useTransformRules()`
  // instance (not a second one in Translator.jsx) so the rule immediately shows up in
  // the Rules tab's own list with no state-sync/staleness gap; the modal itself portals
  // to document.body (see RulesManager.tsx) so it's visible despite its real ancestor
  // (the Rules tab panel) staying `visibility: hidden` while Translator is active.
  const handleOpenNewRule = useCallback((text?: string): void => {
    rulesManagerRef.current?.openNew(text);
  }, []);

  const handleDictionaryTabHotkey = useCallback(
    async (key: string): Promise<void> => {
      if (key in DICTIONARY_HOTKEY_MAP) {
        setSelectedDictionary(DICTIONARY_HOTKEY_MAP[key]);
        return;
      }
      if (key === '5' || key === '6') {
        const kind = key === '5' ? 'properNoun' : 'structuralPattern';
        const target = quickAddTarget(kind, await loadQuickAddConfig(), dictionaries);
        if (target.kind === 'open') {
          setSelectedDictionary(target.dictionaryId);
        } else {
          const { default: toast } = await import('../utils/toast');
          toast.error(quickAddMissMessage(target));
        }
      }
    },
    [setSelectedDictionary, dictionaries]
  );

  useHotkeyHandler({
    onTabSwitch: handleTabChange,
    onBindDictionaries: openBindingDialog,
    onFocusSearch: handleFocusSearch,
    onDictionaryTabHotkey: handleDictionaryTabHotkey,
    onOpenNewRule: handleOpenNewRule,
    ownTab: 'app',
  });

  return (
    <div className={styles.container}>
      {/* Navigation Bar */}
      <nav className={styles.nav} role="tablist" aria-label="Application tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : styles.tabButtonInactive}`}
              title={`Switch to ${tab.label} (Option/Alt + ${tab.shortcut})`}
            >
              <Icon size={17} className={styles.tabIcon} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Content Area */}
      <div className={styles.content}>
        {/*
          Every panel stays mounted: leaving the Reader to edit a dictionary entry and
          coming back must not reload the book. The Reader's own state — and the decoded
          book in the Rust cache — therefore survives a tab switch.
        */}
        <div
          role="tabpanel"
          id="panel-reader"
          aria-labelledby="tab-reader"
          className={`${styles.componentWrapper} ${activeTab === 'reader' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <ReaderTab isActive={activeTab === 'reader'} />
        </div>
        <div
          role="tabpanel"
          id="panel-translator"
          aria-labelledby="tab-translator"
          className={`${styles.componentWrapper} ${activeTab === 'translator' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <Translator isActive={activeTab === 'translator'} />
        </div>
        <div
          role="tabpanel"
          id="panel-dictionary"
          aria-labelledby="tab-dictionary"
          className={`${styles.componentWrapper} ${activeTab === 'dictionary' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <DictionaryManager
            searchRef={dictionarySearchRef as React.RefObject<HTMLInputElement>}
            isActive={activeTab === 'dictionary'}
          />
        </div>
        <div
          role="tabpanel"
          id="panel-rules"
          aria-labelledby="tab-rules"
          className={`${styles.componentWrapper} ${activeTab === 'rules' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <RulesManager ref={rulesManagerRef} />
        </div>
        <div
          role="tabpanel"
          id="panel-configuration"
          aria-labelledby="tab-configuration"
          className={`${styles.componentWrapper} ${activeTab === 'configuration' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <ConfigurationManager />
        </div>
        <div
          role="tabpanel"
          id="panel-appearance"
          aria-labelledby="tab-appearance"
          className={`${styles.componentWrapper} ${styles.componentWrapperScroll} ${activeTab === 'appearance' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <AppearanceManager />
        </div>
      </div>
    </div>
  );
};

export default TabbedInterface;
