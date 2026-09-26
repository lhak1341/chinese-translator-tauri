import React, { createContext, useContext, useMemo, useState } from 'react';
import type { TabId } from '../types/ComponentTypes';

/**
 * Which tab is on screen, for the whole app.
 *
 * Every tab stays mounted (hidden, not unmounted), so "my component is rendered" never
 * means "my tab is showing". Hotkey registrations read this rather than being told by
 * their caller: a caller that passed its own tab unconditionally was how Cmd+Z on the
 * Reader came to undo a dictionary edit. It sits above `TabbedInterface`, which switches
 * tabs, so the tab container reads it the same way every other registration does.
 */
interface VisibleTabContextValue {
  visibleTab: TabId;
  setVisibleTab: (tab: TabId) => void;
}

const VisibleTabContext = createContext<VisibleTabContextValue | undefined>(undefined);

interface VisibleTabProviderProps {
  children: React.ReactNode;
  /** The tab shown on launch. Tests pass the tab they need. */
  initialTab?: TabId;
}

export const VisibleTabProvider: React.FC<VisibleTabProviderProps> = ({
  children,
  initialTab = 'reader',
}) => {
  const [visibleTab, setVisibleTab] = useState<TabId>(initialTab);
  const value = useMemo(() => ({ visibleTab, setVisibleTab }), [visibleTab]);
  return <VisibleTabContext.Provider value={value}>{children}</VisibleTabContext.Provider>;
};

export function useVisibleTab(): VisibleTabContextValue {
  const context = useContext(VisibleTabContext);
  if (!context) throw new Error('useVisibleTab must be used within a VisibleTabProvider');
  return context;
}
