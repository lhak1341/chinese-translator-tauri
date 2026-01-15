import React, { useState, useRef } from 'react';
import Translator from './Translator';
import DictionaryManager from './dictionary/DictionaryManager';
import ConfigurationManager from './configuration/ConfigurationManager';
import AppearanceManager from './appearance/AppearanceManager';
import HotkeyHandler from './HotkeyHandler';
import ErrorBoundary from './ErrorBoundary';

/**
 * Valid tab identifiers for the application
 */
type TabId = 'translator' | 'dictionary' | 'configuration' | 'appearance';

/**
 * Tab configuration
 */
const TABS: { id: TabId; label: string; shortcut: string }[] = [
  { id: 'translator', label: 'Translator', shortcut: '1' },
  { id: 'dictionary', label: 'Dictionary', shortcut: '2' },
  { id: 'configuration', label: 'Configuration', shortcut: '3' },
  { id: 'appearance', label: 'Appearance', shortcut: '4' },
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

  // Main container
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--background-color)',
    overflow: 'hidden',
  };

  // Navigation bar - clean flat design
  const navStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    background: 'var(--nav-bg-solid)',
    padding: '0',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-color)',
  };

  // Tab button styles
  const getTabStyle = (tabId: TabId): React.CSSProperties => {
    const isActive = activeTab === tabId;

    return {
      position: 'relative',
      background: 'transparent',
      border: 'none',
      borderBottom: isActive ? '2px solid var(--nav-active-border)' : '2px solid transparent',
      padding: '0.875rem 1.25rem',
      fontSize: '0.875rem',
      fontWeight: isActive ? 600 : 500,
      color: isActive ? 'var(--text-color)' : 'var(--nav-text)',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      minHeight: 'auto',
      borderRadius: 0,
    };
  };

  // Content area
  const contentStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--background-color)',
  };

  // Component visibility wrapper - no opacity to avoid virtualization issues
  const getComponentStyle = (isActive: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    visibility: isActive ? 'visible' : 'hidden',
    pointerEvents: isActive ? 'auto' : 'none',
  });

  return (
    <div style={containerStyle}>
      <HotkeyHandler
        onTabSwitch={handleTabChange}
        onFocusSearch={handleFocusSearch}
        activeTab={activeTab}
      />

      {/* Navigation Bar */}
      <nav style={navStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={getTabStyle(tab.id)}
            title={`Switch to ${tab.label} (Cmd/Ctrl + Shift + ${tab.shortcut})`}
          >
            {tab.label}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />
      </nav>

      {/* Content Area */}
      <div style={contentStyle}>
        <div style={getComponentStyle(activeTab === 'translator')}>
          <ErrorBoundary>
            {React.createElement(Translator as any, { isActive: activeTab === 'translator' })}
          </ErrorBoundary>
        </div>
        <div style={getComponentStyle(activeTab === 'dictionary')}>
          {React.createElement(DictionaryManager as any, {
            searchRef: dictionarySearchRef,
            isActive: activeTab === 'dictionary',
          })}
        </div>
        <div style={getComponentStyle(activeTab === 'configuration')}>
          {React.createElement(ConfigurationManager as any)}
        </div>
        <div
          style={{
            ...getComponentStyle(activeTab === 'appearance'),
            overflow: 'auto',
          }}
        >
          {React.createElement(AppearanceManager as any)}
        </div>
      </div>
    </div>
  );
};

export default TabbedInterface;
