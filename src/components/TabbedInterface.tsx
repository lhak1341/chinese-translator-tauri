import React, { useState, useRef, useCallback } from 'react';
import { Languages, Book, Settings, Palette, Wand2, LucideIcon } from 'lucide-react';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import RulesManager from './rules/RulesManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import { useHotkeyHandler } from '../hooks/useHotkeyHandler';
import { useDictionary } from './dictionary/DictionaryContext';
import { loadAppConfig } from '../utils/appConfig';
import {
  resolveDefaultProperNounTarget,
  resolveAndVerifyStructuralPatternTarget,
} from '../utils/dictionary';
import ErrorBoundary from './ErrorBoundary';
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
  { id: 'rules', label: 'Rules', shortcut: '5', icon: Wand2 },
  { id: 'configuration', label: 'Configuration', shortcut: '3', icon: Settings },
  { id: 'appearance', label: 'Appearance', shortcut: '4', icon: Palette },
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
  const { setSelectedDictionary, dictionaries } = useDictionary();

  const handleTabChange = (tab: TabId): void => {
    setActiveTab(tab);
  };

  const handleFocusSearch = (): void => {
    if (dictionarySearchRef.current) {
      dictionarySearchRef.current.focus();
    }
  };

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
              title={`Switch to ${tab.label} (Cmd/Ctrl + Shift + ${tab.shortcut})`}
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
          <ErrorBoundary>
            <Translator isActive={activeTab === 'translator'} />
          </ErrorBoundary>
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
          className={`${styles.componentWrapper} ${styles.componentWrapperScroll} ${activeTab === 'rules' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <RulesManager />
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
