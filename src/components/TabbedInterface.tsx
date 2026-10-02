import React, { useRef, useCallback } from 'react';
import { Languages, Book, Settings, Palette, Wand2, BookOpen, LucideIcon } from 'lucide-react';
import ReaderTab from './reader/ReaderTab';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import RulesManager from './rules/RulesManager';
import type { RulesManagerHandle } from './rules/RulesManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import TabPanel, { tabDomIds } from './TabPanel';
import { useHotkeyHandler } from '../hooks/useHotkeyHandler';
import { useVisibleTab } from './VisibleTabContext';
import { TAB_ORDER, tabShortcutDigit } from '../constants/tabs';
import type { TabId } from '../types/ComponentTypes';
import { useDictionary } from './dictionary/DictionaryContext';
import { dictionaryTabNavigation } from '../utils/dictionary/DictionaryTabNavigation';
import toast from '../utils/toast';
import { useBookBinding } from './BookBindingContext';
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
const TabbedInterface: React.FC = () => {
  const { visibleTab: activeTab, setVisibleTab: setActiveTab } = useVisibleTab();
  const dictionarySearchRef = useRef<HTMLInputElement>(null);
  const rulesManagerRef = useRef<RulesManagerHandle>(null);
  const { setSelectedDictionary, dictionaries, unreadDictionaryIds } = useDictionary();
  const { loadQuickAddView } = useBookBinding();

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
  // navigating away. The Rules tab's always-mounted RulesManager owns the one
  // `useTransformRuleEditor()` — the only writer of Transform Rules — so the new rule goes
  // through its pending overlay and shows up in its list at once; the modal itself portals
  // to document.body (see RulesManager.tsx) so it's visible despite its real ancestor
  // (the Rules tab panel) staying `visibility: hidden` while Translator is active.
  const handleOpenNewRule = useCallback((text?: string): void => {
    rulesManagerRef.current?.openNew(text);
  }, []);

  // Which dictionary a digit means, and when Cmd-6 has nowhere to go, is
  // `dictionaryTabNavigation`'s; this only applies the answer.
  const handleDictionaryTabHotkey = useCallback(
    async (key: string): Promise<void> => {
      const navigation = await dictionaryTabNavigation(key, {
        loadView: loadQuickAddView,
        dictionaries,
        unreadDictionaryIds,
      });
      if (navigation?.kind === 'select') setSelectedDictionary(navigation.dictionaryId);
      else if (navigation?.kind === 'refused') toast.error(navigation.message);
    },
    [setSelectedDictionary, dictionaries, unreadDictionaryIds, loadQuickAddView]
  );

  useHotkeyHandler({
    handlers: {
      tabSwitch: handleTabChange,
      focusSearch: handleFocusSearch,
      dictionaryTabHotkey: handleDictionaryTabHotkey,
      openNewRule: handleOpenNewRule,
    },
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
              aria-controls={tabDomIds(tab.id).panel}
              id={tabDomIds(tab.id).tab}
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
        <TabPanel id="reader">
          <ReaderTab isActive={activeTab === 'reader'} />
        </TabPanel>
        <TabPanel id="translator">
          <Translator isActive={activeTab === 'translator'} />
        </TabPanel>
        <TabPanel id="dictionary">
          <DictionaryManager
            searchRef={dictionarySearchRef as React.RefObject<HTMLInputElement>}
            isActive={activeTab === 'dictionary'}
          />
        </TabPanel>
        <TabPanel id="rules">
          <RulesManager ref={rulesManagerRef} />
        </TabPanel>
        <TabPanel id="configuration">
          <ConfigurationManager />
        </TabPanel>
        <TabPanel id="appearance" scroll>
          <AppearanceManager />
        </TabPanel>
      </div>
    </div>
  );
};

export default TabbedInterface;
