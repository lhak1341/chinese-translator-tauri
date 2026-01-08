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
 * TabbedInterface Component
 *
 * Main application container with tab navigation between:
 * - Translator (main translation interface)
 * - Dictionary (dictionary management)
 * - Configuration (settings)
 * - Appearance (theme and font settings)
 *
 * @returns Tabbed application interface
 */
const TabbedInterface: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('translator');
  const dictionarySearchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = (tab: TabId): void => {
    setActiveTab(tab);
  };

  const handleFocusSearch = (): void => {
    // Focus the search input in the Dictionary tab
    if (dictionarySearchRef.current) {
      dictionarySearchRef.current.focus();
    }
  };

  // Base container styles using CSS variables for theming
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--background-color)', // Using shorthand
    overflow: 'hidden',
  };

  // Navigation bar styles with consistent border handling
  const navStyle: React.CSSProperties = {
    display: 'flex',
    background: 'var(--nav-bg)', // Using shorthand
    padding: '0.5rem 1rem 0',
    flexShrink: 0,
    border: 'none',
    borderBottom: '1px solid var(--border-color)',
  };

  // Content area styles
  const contentStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  };

  // Base tab button styles
  const tabButtonStyle: React.CSSProperties = {
    background: 'transparent', // Using shorthand consistently
    border: '1px solid transparent',
    borderRadius: '6px 6px 0 0',
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    color: 'var(--nav-text)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    opacity: 0.85,
    marginBottom: '-1px',
  };

  // Active tab styles extending base tab styles
  const activeTabStyle: React.CSSProperties = {
    ...tabButtonStyle,
    background: 'var(--nav-active)', // Using shorthand consistently
    color: 'var(--text-color)',
    opacity: 1,
    fontWeight: '500',
    border: '1px solid var(--border-color)',
    borderBottom: '1px solid var(--nav-active)',
  };

  // Component container style for visibility handling
  const componentStyle = (isActive: boolean): React.CSSProperties => ({
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
      <nav style={navStyle}>
        <button
          onClick={() => handleTabChange('translator')}
          style={activeTab === 'translator' ? activeTabStyle : tabButtonStyle}
          title="Switch to Translator (Cmd/Ctrl + Shift + 1)"
        >
          Translator
        </button>
        <button
          onClick={() => handleTabChange('dictionary')}
          style={activeTab === 'dictionary' ? activeTabStyle : tabButtonStyle}
          title="Switch to Dictionary (Cmd/Ctrl + Shift + 2)"
        >
          Dictionary
        </button>
        <button
          onClick={() => handleTabChange('configuration')}
          style={activeTab === 'configuration' ? activeTabStyle : tabButtonStyle}
          title="Switch to Configuration (Cmd/Ctrl + Shift + 3)"
        >
          Configuration
        </button>
        <button
          onClick={() => handleTabChange('appearance')}
          style={activeTab === 'appearance' ? activeTabStyle : tabButtonStyle}
          title="Switch to Appearance (Cmd/Ctrl + Shift + 4)"
        >
          Appearance
        </button>
      </nav>

      <div style={contentStyle}>
        <div style={componentStyle(activeTab === 'translator')}>
          <ErrorBoundary>
            {React.createElement(Translator as any, { isActive: activeTab === 'translator' })}
          </ErrorBoundary>
        </div>
        <div style={componentStyle(activeTab === 'dictionary')}>
          {React.createElement(DictionaryManager as any, {
            searchRef: dictionarySearchRef,
            isActive: activeTab === 'dictionary',
          })}
        </div>
        <div style={componentStyle(activeTab === 'configuration')}>
          {React.createElement(ConfigurationManager as any)}
        </div>
        <div
          style={{
            ...componentStyle(activeTab === 'appearance'),
            overflow: 'auto', // Only the Appearance tab gets scrolling
          }}
        >
          {React.createElement(AppearanceManager as any)}
        </div>
      </div>
    </div>
  );
};

export default TabbedInterface;
