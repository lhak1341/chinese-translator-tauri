import React from 'react';
import type { TabId } from '../types/ComponentTypes';
import { useVisibleTab } from './VisibleTabContext';
import styles from '../styles/TabbedInterface.module.css';

/**
 * The DOM ids that tie a tab's nav button to its panel: the button's `aria-controls` is the
 * panel's id, and the panel's `aria-labelledby` is the button's id. Both sides read them
 * from here, so a tab cannot be renamed on one side only.
 */
export function tabDomIds(id: TabId): { tab: string; panel: string } {
  return { tab: `tab-${id}`, panel: `panel-${id}` };
}

interface TabPanelProps {
  id: TabId;
  /** The panel scrolls itself, for a tab whose content has no scroller of its own. */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * One tab's panel. Every panel stays mounted — leaving the Reader to edit a dictionary entry
 * and coming back must not reload the book — so a hidden tab is hidden by CSS, and this is
 * the one place that decides which class and which ARIA ids that takes.
 */
const TabPanel: React.FC<TabPanelProps> = ({ id, scroll = false, children }) => {
  const { visibleTab } = useVisibleTab();
  const ids = tabDomIds(id);
  const visibility =
    visibleTab === id ? styles.componentWrapperVisible : styles.componentWrapperHidden;
  return (
    <div
      role="tabpanel"
      id={ids.panel}
      aria-labelledby={ids.tab}
      className={`${styles.componentWrapper} ${scroll ? styles.componentWrapperScroll : ''} ${visibility}`}
    >
      {children}
    </div>
  );
};

export default TabPanel;
