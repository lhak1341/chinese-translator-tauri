import React, { useState, useRef, useCallback } from 'react';
import { Languages, Book, Settings, Palette, LucideIcon } from 'lucide-react';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import { useHotkeyHandler } from '../hooks/useHotkeyHandler';
import { useDictionary } from './dictionary/DictionaryContext';
import { loadAppConfig } from '../utils/appConfig';
import ErrorBoundary from './ErrorBoundary';
import styles from '../styles/TabbedInterface.module.css';

/**
 * Valid tab identifiers for the application
 */
type TabId = 'translator' | 'dictionary' | 'configuration' | 'appearance';

/**
 * Tab configuration
 */
const TABS: { id: TabId; label: string; shortcut: string; icon: LucideIcon }[] = [
  { id: 'translator', label: 'Translator', shortcut: '1', icon: Languages },
  { id: 'dictionary', label: 'Dictionary', shortcut: '2', icon: Book },
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
          const activeNouns = config.engine.activeProperNouns;
          const defaultDict = config.ui.defaultQuickAddDictionary;
          let target: string | undefined;
          if (defaultDict && activeNouns.includes(defaultDict)) {
            target = defaultDict;
          } else {
            target = activeNouns.filter((id) => id.startsWith('properNouns-')).sort()[0];
          }
          if (target) setSelectedDictionary(target);
        } catch {
          // no-op if config unavailable
        }
      }
      if (key === '6') {
        try {
          const config = await loadAppConfig();
          const defaultDict = config.ui.defaultQuickAddDictionary;
          let target: string | undefined;
          if (defaultDict?.startsWith('properNouns-f_')) {
            target = 'patterns-' + defaultDict.slice('properNouns-'.length);
          } else {
            const firstFiction = config.engine.activeProperNouns
              .filter((id) => id.startsWith('properNouns-f_'))
              .sort()[0];
            if (firstFiction) {
              target = 'patterns-' + firstFiction.slice('properNouns-'.length);
            }
          }
          if (target && dictionaries[target] !== undefined) {
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
