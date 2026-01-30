import React, { useState, useRef } from 'react';
import { Languages, Book, Settings, Palette, LucideIcon } from 'lucide-react';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import HotkeyHandler from './HotkeyHandler';
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
const TabbedInterface: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('translator');
  const dictionarySearchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = (tab: TabId): void => {
    setActiveTab(tab);
  };

  const handleFocusSearch = (): void => {
    if (dictionarySearchRef.current) {
      dictionarySearchRef.current.focus();
    }
  };

  return (
    <div className={styles.container}>
      <HotkeyHandler
        onTabSwitch={handleTabChange}
        onFocusSearch={handleFocusSearch}
        activeTab={activeTab}
      />

      {/* Navigation Bar */}
      <nav className={styles.nav}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
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
          className={`${styles.componentWrapper} ${activeTab === 'translator' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <ErrorBoundary>
            <Translator isActive={activeTab === 'translator'} />
          </ErrorBoundary>
        </div>
        <div
          className={`${styles.componentWrapper} ${activeTab === 'dictionary' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <DictionaryManager
            searchRef={dictionarySearchRef as React.RefObject<HTMLInputElement>}
            isActive={activeTab === 'dictionary'}
          />
        </div>
        <div
          className={`${styles.componentWrapper} ${activeTab === 'configuration' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <ConfigurationManager />
        </div>
        <div
          className={`${styles.componentWrapper} ${styles.componentWrapperScroll} ${activeTab === 'appearance' ? styles.componentWrapperVisible : styles.componentWrapperHidden}`}
        >
          <AppearanceManager />
        </div>
      </div>
    </div>
  );
};

export default TabbedInterface;
