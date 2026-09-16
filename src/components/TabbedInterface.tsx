import React, { useState, useRef, useCallback } from 'react';
import { Languages, Book, Settings, Palette, Wand2, LucideIcon } from 'lucide-react';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import RulesManager from './rules/RulesManager';
import type { RulesManagerHandle } from './rules/RulesManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import { useHotkeyHandler } from '../hooks/useHotkeyHandler';
import { useDictionary } from './dictionary/DictionaryContext';
import { loadAppConfig } from '../utils/appConfig';
import {
  resolveDefaultProperNounTarget,
  resolveAndVerifyStructuralPatternTarget,
} from '../utils/dictionary';
import styles from '../styles/TabbedInterface.module.css';

/**
 * Valid tab identifiers for the application
 */
type TabId = 'translator' | 'dictionary' | 'rules' | 'configuration' | 'appearance';

/**
 * Tab configuration
 */
const TABS: { id: TabId; label: string; shortcut: string; icon: LucideIcon }[] = [
  { id: 'translator', label: 'Translator', shortcut: '1', icon: Languages },
  { id: 'dictionary', label: 'Dictionary', shortcut: '2', icon: Book },
  { id: 'rules', label: 'Rules', shortcut: '3', icon: Wand2 },
  { id: 'configuration', label: 'Configuration', shortcut: '4', icon: Settings },
  { id: 'appearance', label: 'Appearance', shortcut: '5', icon: Palette },
];

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
  const [activeTab, setActiveTab] = useState<TabId>('translator');
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
      if (key === '5') {
        try {
          const config = await loadAppConfig();
          const target = resolveDefaultProperNounTarget(
            config.ui.defaultQuickAddDictionary,
            config.engine.activeProperNouns
          );
          if (target) setSelectedDictionary(target);
        } catch {
          // no-op if config unavailable
        }
      }
      if (key === '6') {
        try {
          const config = await loadAppConfig();
          const target = resolveAndVerifyStructuralPatternTarget(
            config.ui.defaultQuickAddDictionary,
            config.engine.activeProperNouns,
            dictionaries
          );
          if (target) {
            setSelectedDictionary(target);
          } else {
            const { default: toast } = await import('../utils/toast');
            toast.error('No structural patterns dictionary for active fiction');
          }
        } catch {
          // no-op if config unavailable
        }
        return;
      }
    },
    [setSelectedDictionary, dictionaries]
  );

  useHotkeyHandler({
    onTabSwitch: handleTabChange,
    onFocusSearch: handleFocusSearch,
    onDictionaryTabHotkey: handleDictionaryTabHotkey,
    onOpenNewRule: handleOpenNewRule,
    activeTab,
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
